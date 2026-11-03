// «Переговоры»: daily drill, pitch, meeting preparation and the playbook. Owns its own database object.
import { esc, openSheet, closeSheet, toast, plural } from "../ui.js";
import { isoDate, addDays } from "../plan.js";
import { load, save, cleanDeal } from "./store.js";
import { SCENARIOS, TOPICS } from "./content.js";
import { review, pickDaily, isMastered, streakAfter } from "./srs.js";
import { runDrill } from "./drill.js";
import { STEPS, blankDeal, wizardHtml, dealWarnings, ladderHtml, preciseFor, dealListHtml, whenLabel } from "./prep.js";
import { cheatSheetHtml, rehearsalPrompt, rehearsalSheetHtml, debriefSheetHtml } from "./cheatsheet.js";
import { playbookHtml } from "./playbook.js";
import { fmtMoney } from "./numbers.js";
import { todayHtml } from "./today.js";
import { pitchHtml, onPitchClick } from "./pitch.js";
import { openRescue } from "./rescue.js";
import { PITCH_VERSIONS, pitchText } from "./kit.js";

/**
 * Daily order: situations only (techniques are explained inside the feedback), rescue situations
 * interleaved from the start so «stuck» and «tell about yourself» come in the first days.
 */
const RESCUE_IDS = SCENARIOS.filter((s) => s.topic === "rescue");
const MAIN_IDS = SCENARIOS.filter((s) => s.topic !== "rescue");
const ORDER = MAIN_IDS.flatMap((s, i) => [s, RESCUE_IDS[i]].filter(Boolean)).map((s) => `s:${s.id}`);
const EXTRA_COUNT = 5;
const SOON_DAYS = 14;
const CLAUDE_URL = "https://claude.ai/new";

let db = load();
let tab = "today";
let prep = { deal: null, step: null };
const $ = (id) => document.getElementById(id);
const today = () => isoDate(new Date());

function commit(next, rerender = true) {
  db = next;
  if (!save(db)) toast("Не удалось сохранить. Освободите место на телефоне.");
  if (rerender) renderNeg();
}

const dailyIds = () => pickDaily(ORDER, db.cards, today());
const doneToday = () => db.streak?.last === today();
const mastered = () => ORDER.filter((id) => isMastered(db.cards[id])).length;
const nextDeal = () => db.deals
  .filter((d) => d.date && d.date >= today() && d.date <= addDays(today(), SOON_DAYS) && !d.outcome && !Number.isFinite(d.result))
  .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

/** Weakest situations first, optionally from one topic. */
function extraIds(topic = null, n = EXTRA_COUNT) {
  const box = (s) => db.cards[`s:${s.id}`]?.box ?? -1;
  return SCENARIOS.filter((s) => !topic || s.topic === topic)
    .map((s) => [box(s) + Math.random() * 0.5, s])
    .sort((a, b) => a[0] - b[0])
    .slice(0, n)
    .map(([, s]) => `s:${s.id}`);
}

/** Only the daily warm-up counts for the streak; extra and topic drills are practice on top. */
function startDrill(ids, title, { topic = null, daily = false } = {}) {
  if (!ids.length) { toast("На сегодня всё повторено."); return; }
  runDrill({
    ids, title, cards: db.cards,
    onGrade: (id, right) => commit({ ...db, cards: { ...db.cards, [id]: review(db.cards[id], right, today()) } }, false),
    onFinish: ({ right, total }) => {
      const streak = daily ? streakAfter(db.streak, today()) : db.streak;
      commit({ ...db, streak, log: [...db.log, { date: today(), right, total }] }, false);
      const tomorrow = pickDaily(ORDER, db.cards, addDays(today(), 1)).length;
      const days = doneToday() ? db.streak.days : 0;
      return `<h2 class="dr-title center">Готово!</h2>
        <p class="dr-score"><b>${right}</b> из ${total} верно</p>
        <div class="dr-stats">${days ? `<p><b>${days}</b><span>${plural(days, "день", "дня", "дней")} подряд</span></p>` : `<p><b>${Math.round((right / total) * 100)}%</b><span>верных ответов</span></p>`}
          <p><b>${mastered()}</b><span>из ${SCENARIOS.length} ситуаций освоено</span></p></div>
        <p class="muted center">Завтра ${tomorrow} ${plural(tomorrow, "карточка", "карточки", "карточек")}. Повторение через 1, 3, 7 и 14 дней закрепляет надолго.</p>`;
    },
    onMore: () => startDrill(extraIds(topic), "Ещё ситуации", { topic }),
    onClose: renderNeg,
  });
}

/* ---------- «Сегодня» ---------- */
function pitchStatus() {
  const ready = PITCH_VERSIONS.filter((v) => v.blocks.every((k) => (db.me[k] || "").trim()));
  if (!ready.length) return "30 с · 2 мин · 5 мин";
  const ran = ready.filter((v) => db.me.runs[v.id]?.date === today()).length;
  return ran ? "отрепетирован сегодня ✓" : "отрепетировать";
}

function renderToday() {
  const ids = dailyIds();
  const deal = nextDeal();
  return todayHtml({
    ids,
    fresh: ids.filter((id) => !db.cards[id]).length,
    done: doneToday(),
    streak: db.streak && (doneToday() || db.streak.last === addDays(today(), -1)) ? db.streak.days : 0,
    deal,
    when: deal ? whenLabel(deal.date, today()) : "",
    mastered: mastered(),
    total: ORDER.length,
    topics: TOPICS.map((t) => {
      const all = SCENARIOS.filter((x) => x.topic === t.id);
      return { ...t, all: all.length, ok: all.filter((x) => isMastered(db.cards[`s:${x.id}`])).length };
    }),
    pitch: pitchStatus(),
  });
}

/* ---------- «Подготовка» ---------- */
const dealById = (id) => db.deals.find((d) => d.id === id);
function putDeal(deal, rerender = false) {
  const clean = cleanDeal(deal);
  const exists = db.deals.some((d) => d.id === clean.id);
  commit({ ...db, deals: exists ? db.deals.map((d) => (d.id === clean.id ? clean : d)) : [...db.deals, clean] }, rerender);
  return clean;
}

function renderPrep() {
  const deal = prep.deal && dealById(prep.deal);
  if (!deal) return dealListHtml(db.deals, today());
  if (prep.step !== null) return wizardHtml(deal, prep.step);
  return cheatSheetHtml(deal, today(), pitchText(db.me, PITCH_VERSIONS[0]));
}

function openPrep(dealId, step = null) {
  prep = { deal: dealId, step };
  showNegTab("prep");
}

/** Closes the open deal; a deal created and left empty is dropped so the list does not fill with «Без названия». */
function leaveDeal() {
  const deal = prep.deal && dealById(prep.deal);
  prep = { deal: null, step: null };
  const untouched = deal && !deal.title.trim() && !deal.who.trim() && !Number.isFinite(deal.target);
  if (untouched) commit({ ...db, deals: db.deals.filter((d) => d.id !== deal.id) }, false);
}

function newDeal() {
  const d = putDeal({ ...blankDeal(today()), title: "" });
  openPrep(d.id, 0);
}

/* ---------- render & tabs ---------- */
export function renderNeg() {
  const main = $("neg-main");
  if (tab === "today") main.innerHTML = renderToday();
  if (tab === "prep") main.innerHTML = renderPrep();
  if (tab === "pitch") main.innerHTML = pitchHtml(db.me, today());
  if (tab === "learn") main.innerHTML = playbookHtml(db.cards);
  const inDeal = tab === "prep" && Boolean(prep.deal && dealById(prep.deal));
  // Inside a deal its own «‹ Встречи» leads back, so the section link would be a second back button.
  document.querySelector("#mod-neg > .home-link").hidden = inDeal;
  // The wizard has its own Back/Next bar; the tab bar under it would eat a fifth of the screen.
  document.body.classList.toggle("wizard", inDeal && prep.step !== null);
}

function showNegTab(name) {
  tab = name;
  document.querySelectorAll("[data-ntab]").forEach((b) => b.setAttribute("aria-current", b.dataset.ntab === name ? "page" : "false"));
  renderNeg();
  window.scrollTo(0, 0);
}

/* ---------- events ---------- */
function onWizardInput(e) {
  const el = e.target.closest("[data-k]");
  const deal = el && dealById(prep.deal);
  if (!deal) return;
  const saved = putDeal({ ...deal, [el.dataset.k]: el.value || (el.dataset.num !== undefined ? null : "") });
  const live = $("wz-live");
  if (live) live.innerHTML = dealWarnings(saved).map((w) => `<p class="warn-line">${esc(w)}</p>`).join("") + (STEPS[prep.step]?.ladder ? ladderHtml(saved) : "");
}

function onWizardBlur(e) {
  const el = e.target.closest("[data-num]");
  const deal = el && dealById(prep.deal);
  if (deal && Number.isFinite(deal[el.dataset.k])) el.value = fmtMoney(deal[el.dataset.k]);
}

function openPrompt(prompt) {
  const body = openSheet(rehearsalSheetHtml(prompt));
  body.querySelector("[data-ai-go]").addEventListener("click", () => {
    const copied = navigator.clipboard?.writeText(prompt);
    window.open(CLAUDE_URL, "_blank", "noopener");
    if (copied) copied.then(() => toast("Скопировано. Вставьте в чат Claude.")).catch(() => body.querySelector("#ai-prompt").select());
    else body.querySelector("#ai-prompt").select();
  });
}

function debrief(deal) {
  let rating = deal.rating;
  const body = openSheet(debriefSheetHtml(deal));
  body.addEventListener("click", (e) => {
    const r = e.target.closest("[data-rate]");
    if (r) {
      rating = Number(r.dataset.rate);
      body.querySelectorAll("[data-rate]").forEach((b) => b.classList.toggle("on", b === r));
    }
    if (!e.target.closest("[data-debrief-save]")) return;
    const val = (id) => body.querySelector(id).value;
    putDeal({ ...deal, result: val("#db-result") || null, outcome: val("#db-outcome"), worked: val("#db-worked"), change: val("#db-change"), rating });
    closeSheet();
    renderNeg();
    toast("Разбор сохранён.");
  });
}

function onPrepClick(e) {
  const t = e.target;
  const deal = prep.deal && dealById(prep.deal);
  const goStep = t.closest("[data-wz]");
  if (goStep && deal) {
    prep = { ...prep, step: Math.max(0, Math.min(STEPS.length - 1, Number(goStep.dataset.wz))) };
    renderNeg();
    window.scrollTo(0, 0);
    return;
  }
  if (t.closest("[data-wz-done]")) { prep = { ...prep, step: null }; renderNeg(); window.scrollTo(0, 0); return; }
  if (t.closest("[data-wz-exit], [data-cs-exit]")) {
    leaveDeal();
    renderNeg();
    window.scrollTo(0, 0);
    return;
  }
  if (!deal) return;
  const side = t.closest("[data-side]");
  if (side) { putDeal({ ...deal, side: side.dataset.side }); renderNeg(); return; }
  if (t.closest("[data-precise]")) {
    if (!Number.isFinite(deal.anchor)) { toast("Сначала введите якорь."); return; }
    putDeal({ ...deal, anchor: preciseFor(deal, deal.anchor) });
    renderNeg();
    return;
  }
  const chip = t.closest("[data-chip]");
  if (chip) {
    const k = chip.dataset.for;
    const text = [deal[k], chip.dataset.chip].filter((v) => v && v.trim()).join("\n");
    putDeal({ ...deal, [k]: text });
    const area = $(`f-${k}`);
    if (area) area.value = text;
    chip.remove();
    return;
  }
  if (t.closest("[data-edit]")) { prep = { ...prep, step: 0 }; renderNeg(); window.scrollTo(0, 0); return; }
  if (t.closest("[data-ai]")) { openPrompt(rehearsalPrompt(deal)); return; }
  if (t.closest("[data-debrief]")) { debrief(deal); return; }
  if (t.closest("[data-delete]") && confirm(`Удалить «${deal.title || "Без названия"}»?`)) {
    prep = { deal: null, step: null };
    commit({ ...db, deals: db.deals.filter((d) => d.id !== deal.id) });
  }
}

const saveMe = (me) => commit({ ...db, me });

function onClick(e) {
  const t = e.target;
  if (t.closest("[data-sos-open]")) { openRescue(); return; }
  if (tab === "pitch" && onPitchClick(e, { me: db.me, saveMe, openPrompt, todayIso: today() })) return;
  if (t.closest("[data-daily]")) { startDrill(dailyIds(), "Разминка", { daily: true }); return; }
  if (t.closest("[data-extra]")) { startDrill(extraIds(), "Ещё ситуации"); return; }
  const topic = t.closest("[data-topic]") || t.closest("[data-practice]");
  if (topic) {
    const id = topic.dataset.topic || topic.dataset.practice;
    startDrill(extraIds(id), TOPICS.find((x) => x.id === id).title, { topic: id });
    return;
  }
  if (t.closest("[data-new-deal]")) { newDeal(); return; }
  const open = t.closest("[data-open-deal]") || t.closest("[data-deal]");
  if (open) { openPrep(open.dataset.openDeal || open.dataset.deal); return; }
  const go = t.closest("[data-ntab-go]");
  if (go) { leaveDeal(); showNegTab(go.dataset.ntabGo); return; }
  if (tab === "prep") onPrepClick(e);
}

export function initNeg() {
  const main = $("neg-main");
  main.addEventListener("click", onClick);
  main.addEventListener("input", onWizardInput);
  main.addEventListener("change", onWizardInput);
  main.addEventListener("focusout", onWizardBlur);
  document.querySelectorAll("[data-ntab]").forEach((b) => b.addEventListener("click", () => {
    leaveDeal();
    showNegTab(b.dataset.ntab);
  }));
  // Reload from storage when returning to the app: a drill may have finished in another tab.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") db = load(); });
  window.addEventListener("hashchange", () => { if (location.hash !== "#neg") document.body.classList.remove("wizard"); });
}

/** One line for the home screen tile. */
export function negSummary() {
  const deal = nextDeal();
  const n = dailyIds().length;
  const drill = doneToday() || !n ? `Разминка сделана ✓${db.streak ? ` · серия ${db.streak.days}` : ""}` : `Разминка: ${n} ${plural(n, "ситуация", "ситуации", "ситуаций")}`;
  return { main: drill, extra: deal ? `Встреча ${whenLabel(deal.date, today())}: ${deal.title || "без названия"}` : "", done: doneToday() };
}
