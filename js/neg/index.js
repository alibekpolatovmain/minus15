// «Переговоры»: daily drill, deal preparation and the playbook. Owns its own database object.
import { esc, openSheet, closeSheet, toast } from "../ui.js";
import { isoDate, addDays } from "../plan.js";
import { load, save, cleanDeal } from "./store.js";
import { SCENARIOS, TECHNIQUES, TOPICS } from "./content.js";
import { review, pickDaily, curriculum, isMastered, streakAfter } from "./srs.js";
import { runDrill } from "./drill.js";
import { STEPS, blankDeal, wizardHtml, dealWarnings, ladderHtml, preciseFor, dealListHtml, whenLabel } from "./prep.js";
import { cheatSheetHtml, rehearsalPrompt, rehearsalSheetHtml, debriefSheetHtml } from "./cheatsheet.js";
import { playbookHtml } from "./playbook.js";
import { fmtMoney } from "./numbers.js";

const ORDER = curriculum(SCENARIOS);
const SECONDS_PER_CARD = 30;
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

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  return b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
const dailyIds = () => pickDaily(ORDER, db.cards, today());
const doneToday = () => db.streak?.last === today();
const mastered = (prefix) => ORDER.filter((id) => id.startsWith(prefix) && isMastered(db.cards[id])).length;
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
          <p><b>${mastered("s:")}</b><span>из ${SCENARIOS.length} ситуаций освоено</span></p></div>
        <p class="muted center">Завтра ${tomorrow} ${plural(tomorrow, "карточка", "карточки", "карточек")}. Повторение через 1, 3, 7 и 14 дней закрепляет надолго.</p>`;
    },
    onMore: () => startDrill(extraIds(topic), "Ещё ситуации", { topic }),
    onClose: renderNeg,
  });
}

/* ---------- «Сегодня» ---------- */
function mainCard() {
  const ids = dailyIds();
  if (doneToday() || !ids.length) {
    return `<article class="card main ok"><h2>Разминка сделана ✓</h2>
      <p class="meta">${doneToday() ? "Новые карточки будут завтра." : "Всё повторено, новые карточки будут завтра."}</p>
      <button type="button" class="btn primary huge" data-extra>Ещё 5 ситуаций</button></article>`;
  }
  const fresh = ids.filter((id) => !db.cards[id]).length;
  const minutes = Math.max(1, Math.round((ids.length * SECONDS_PER_CARD) / 60));
  const parts = [ids.length - fresh ? `${ids.length - fresh} на повторение` : "", fresh ? `${fresh} ${plural(fresh, "новая", "новые", "новых")}` : ""].filter(Boolean).join(", ");
  return `<article class="card main">
    <span class="eyebrow">Разминка дня</span>
    <h2>${ids.length} ${plural(ids.length, "карточка", "карточки", "карточек")} · ≈${minutes} мин</h2>
    <p class="meta">${parts}. Ситуации из переговоров: выбираете ответ, потом говорите его сами.</p>
    <button type="button" class="btn primary huge" data-daily>Начать</button>
  </article>`;
}

function dealCard() {
  const d = nextDeal();
  if (!d) return "";
  return `<article class="card soft"><span class="eyebrow">Встреча ${esc(whenLabel(d.date, today()))}</span>
    <b class="deal-title">${esc(d.title || "Без названия")}</b>
    ${Number.isFinite(d.target) ? `<p class="meta">Цель ${esc(fmtMoney(d.target, d.unit))}${Number.isFinite(d.walk) ? ` · ухожу ниже ${esc(fmtMoney(d.walk, d.unit))}` : ""}</p>` : ""}
    <button type="button" class="btn primary" data-open-deal="${esc(d.id)}">Открыть шпаргалку</button></article>`;
}

function topicRows() {
  return TOPICS.map((t) => {
    const all = SCENARIOS.filter((s) => s.topic === t.id);
    const ok = all.filter((s) => isMastered(db.cards[`s:${s.id}`])).length;
    return `<button type="button" class="btn alt" data-topic="${t.id}"><b>${esc(t.title)}</b><small>освоено ${ok} из ${all.length}</small></button>`;
  }).join("");
}

function renderToday() {
  const s = mastered("s:");
  const t = mastered("t:");
  const streak = db.streak && (doneToday() || db.streak.last === addDays(today(), -1)) ? db.streak.days : 0;
  const pct = Math.round((s / SCENARIOS.length) * 100);
  return `<header class="large-title"><h1>Переговоры</h1><p>${streak ? `Серия ${streak} ${plural(streak, "день", "дня", "дней")}` : "Пять минут в день"}</p></header>
    ${mainCard()}
    ${dealCard() || `<div class="alts"><button type="button" class="btn alt" data-new-deal><b>Подготовиться к встрече</b><small>7 шагов и шпаргалка на один экран</small></button></div>`}
    <div class="progress"><div class="progress-num"><b>${s}</b> из ${SCENARIOS.length} ситуаций</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p class="progress-line">Приёмов освоено: ${t} из ${TECHNIQUES.length}. Освоено — значит верно три раза с перерывами.</p></div>
    <h3 class="section-title">Потренировать тему</h3>
    <div class="alts">${topicRows()}</div>`;
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
  return cheatSheetHtml(deal, today());
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
  if (tab === "learn") main.innerHTML = playbookHtml(db.cards);
  // Inside a deal its own «‹ Все подготовки» leads back, so the section link would be a second back button.
  document.querySelector("#mod-neg > .home-link").hidden = tab === "prep" && Boolean(prep.deal && dealById(prep.deal));
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

function rehearse(deal) {
  const prompt = rehearsalPrompt(deal);
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
  if (t.closest("[data-ai]")) { rehearse(deal); return; }
  if (t.closest("[data-debrief]")) { debrief(deal); return; }
  if (t.closest("[data-delete]") && confirm(`Удалить «${deal.title || "Без названия"}»?`)) {
    prep = { deal: null, step: null };
    commit({ ...db, deals: db.deals.filter((d) => d.id !== deal.id) });
  }
}

function onClick(e) {
  const t = e.target;
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
}

/** One line for the home screen tile. */
export function negSummary() {
  const deal = nextDeal();
  const n = dailyIds().length;
  const drill = doneToday() || !n ? `Разминка сделана ✓${db.streak ? ` · серия ${db.streak.days}` : ""}` : `Разминка: ${n} ${plural(n, "карточка", "карточки", "карточек")}`;
  return { main: drill, extra: deal ? `Встреча ${whenLabel(deal.date, today())}: ${deal.title || "без названия"}` : "", done: doneToday() };
}
