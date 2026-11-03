// «Английский»: daily word session, word list and the method page. Owns its own database object.
import { esc, openSheet, closeSheet, toast, plural } from "../ui.js";
import { isoDate, addDays } from "../plan.js";
import { load, save, reset } from "./store.js";
import { WORDS, WORD, ORDER, PACKS, BASE_SIZE } from "./words.js";
import { planDay, coverage, isLearned, isCounted, streakAfter, streakNow, recId, alreadyKnown, KNOWN_BOX } from "./srs.js";
import { runSession, answerHtml } from "./session.js";
import { initVoice, hasEnglishVoice, speakEn, canSpeak } from "./audio.js";
import { methodHtml } from "./method.js";
import { LEVELS, LEVEL_NAMES, courseOrder, isBelow, startFrom, knownEstimate } from "./levels.js";
import { runPlacement, placementResultHtml } from "./placement.js";

// Seconds per card, for the «≈ N мин» estimate: a new word is met and then checked.
const SEC = { review: 8, prod: 10, fresh: 25 };
// A session this long counts for the day, even if closed early.
const DAY_MIN_CARDS = 5;
const EXTRA_NEW = 5;
const WEEK = 7;
const MILESTONES = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000];
const FILTERS = [["all", "Все"], ["learning", "Учу"], ["known", "Знаю"], ["new", "Новые"]];
const SHORT_DAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

let db = load();
let tab = "today";
let words = { q: "", filter: "all" };
const $ = (id) => document.getElementById(id);
const today = () => isoDate(new Date());

function commit(next, rerender = true) {
  db = next;
  if (!save(db)) toast("Не удалось сохранить. Освободите место на телефоне.");
  if (rerender) renderEng();
}

const order = () => courseOrder(WORDS, db.start);
const plan = () => ({ ...planDay(order(), db.cards, today(), db.pace), today: today() });
const doneToday = () => db.streak?.last === today();
const learnedCount = () => ORDER.filter((w) => isLearned(db.cards[recId(w)])).length;
/** Below the start level a word without a card is taken as known (the test or the learner said so). */
const assumed = (w) => !db.cards[recId(w.id)] && isBelow(w.lv, db.start);
const coveragePct = () => Math.round(100 * coverage(WORDS.filter((w) => w.base && (isCounted(db.cards[recId(w.id)]) || assumed(w))).map((w) => w.rank), BASE_SIZE));
const statusOf = (wid) => {
  const c = db.cards[recId(wid)];
  if (!c) return assumed(WORD[wid]) ? "known" : "new";
  return c.box >= KNOWN_BOX ? "known" : "learning";
};
const sizeOf = (p) => p.reviews.length + p.prod.length + p.fresh.length;
const minutesOf = (p) => Math.max(1, Math.round((p.reviews.length * SEC.review + p.prod.length * SEC.prod + p.fresh.length * SEC.fresh) / 60));

/* ---------- session ---------- */
function finishHtml(stats, { daily }) {
  const before = stats.coverageBefore;
  const after = coveragePct();
  const days = streakNow(db.streak, today());
  const phrases = stats.fresh.filter((wid) => isLearned(db.cards[recId(wid)])).slice(0, 3).map((wid) => WORD[wid]);
  const tomorrow = planDay(order(), db.cards, addDays(today(), 1), db.pace);
  return `<h2 class="dr-title center">Готово!</h2>
    <p class="dr-score"><b>${stats.fresh.length ? `+${stats.fresh.length}` : stats.right}</b>${stats.fresh.length ? plural(stats.fresh.length, "новое слово", "новых слова", "новых слов") : `из ${stats.graded} верно`}</p>
    <div class="dr-stats">${daily && days ? `<p><b>${days}</b><span>${plural(days, "день", "дня", "дней")} подряд</span></p>` : `<p><b>${learnedCount()}</b><span>слов изучено</span></p>`}
      <p><b>≈${after}%</b><span>слов в речи${after > before ? ` (+${after - before})` : ""}</span></p></div>
    ${phrases.length ? `<div class="en-say-now"><span class="eyebrow">Теперь вы можете сказать</span>
      ${phrases.map((w) => `<button type="button" class="en-phrase" data-say-text="${esc(w.ex)}"><b lang="en">${esc(w.ex)}</b><small>${esc(w.exRu)}</small></button>`).join("")}</div>` : ""}
    <p class="muted center">Завтра: ${tomorrow.reviews.length + tomorrow.prod.length} на повторение и ${tomorrow.fresh.length} ${plural(tomorrow.fresh.length, "новое", "новых", "новых")}.</p>`;
}

function editNote(wid, after) {
  const w = WORD[wid];
  const body = openSheet(`<h2 class="sheet-title">Своя ассоциация: ${esc(w.en)}</h2>
    <p class="muted">Созвучное русское слово и яркая картинка, где оно связано со значением. Например: «${esc(w.en)}» — ${esc(w.ru)}…</p>
    <label class="sr" for="en-note">Ассоциация</label><textarea id="en-note" class="field" rows="3" maxlength="300">${esc(db.notes[wid] || "")}</textarea>
    <button type="button" class="btn primary big" data-note-save>Сохранить</button>`, { onClose: after });
  body.querySelector("[data-note-save]").addEventListener("click", () => {
    const text = body.querySelector("#en-note").value.trim();
    const notes = { ...db.notes };
    if (text) notes[wid] = text.slice(0, 300);
    else delete notes[wid];
    commit({ ...db, notes }, false);
    closeSheet();
  });
}

function startSession(p, title, { daily = false } = {}) {
  if (!sizeOf(p)) { toast("На сегодня всё повторено. Новые слова — завтра."); return; }
  const coverageBefore = coveragePct();
  runSession({
    plan: p, title, db: () => db,
    onCard: (cid, card) => commit({ ...db, cards: { ...db.cards, [cid]: card } }, false),
    onAudio: (on) => commit({ ...db, audio: on }, false),
    onNote: editNote,
    onEnd: (stats) => {
      if (!stats.graded) return;
      const counts = stats.graded >= Math.min(DAY_MIN_CARDS, sizeOf(p));
      const streak = daily && counts ? streakAfter(db.streak, today()) : db.streak;
      commit({ ...db, streak, log: [...db.log, { date: today(), fresh: stats.fresh.length, reviews: stats.reviews, right: stats.right }] }, false);
    },
    onFinish: (stats) => finishHtml({ ...stats, coverageBefore }, { daily }),
    onMore: () => startExtra(),
    onClose: renderEng,
  });
}

function startExtra() {
  const fresh = order().filter((w) => !db.cards[recId(w)]).slice(0, EXTRA_NEW);
  if (!fresh.length) { toast("Все слова курса уже начаты."); return; }
  startSession({ reviews: [], prod: [], fresh, today: today() }, "Ещё слова");
}

/* ---------- placement test ---------- */
function applyStart(level) {
  commit({ ...db, start: level });
  toast(`Курс начинается с уровня ${level}.`);
}

function startTest() {
  runPlacement({
    audio: db.audio,
    onDone: ({ scores, right }) => {
      const start = startFrom(scores);
      const known = knownEstimate(scores, WORDS);
      // Words answered right at or above the start level skip their first showing and come back in a week.
      const cards = { ...db.cards };
      right.filter((wid) => !isBelow(WORD[wid].lv, start) && !cards[recId(wid)]).forEach((wid) => { cards[recId(wid)] = alreadyKnown(today()); });
      commit({ ...db, cards, start, test: { date: today(), level: start, known } }, false);
      return placementResultHtml({ scores, start, known, total: WORDS.length });
    },
    onPick: applyStart,
    onClose: renderEng,
  });
}

/* ---------- «Сегодня» ---------- */
function testCard() {
  if (db.test || db.start || learnedCount() >= 30) return "";
  return `<article class="card soft"><span class="eyebrow">С какого уровня начать</span>
    <p>Уже знаете английский? Тест на 3 минуты покажет уровень: A1–C1. Знакомые слова в тренировку не попадут.</p>
    <button type="button" class="btn primary big" data-test>Пройти тест уровня</button></article>`;
}

function levelRows() {
  const levels = LEVELS.filter((lv) => !isBelow(lv, db.start) && WORDS.some((w) => w.lv === lv));
  return `<div class="progress en-levels"><div class="progress-num">Уровень <b>${db.start || "A1"}</b> <span class="muted">${LEVEL_NAMES[db.start || "A1"]}</span></div>
    ${levels.map((lv) => {
      const all = WORDS.filter((w) => w.lv === lv);
      const done = all.filter((w) => isLearned(db.cards[recId(w.id)])).length;
      return `<div class="en-lv-row"><b>${lv}</b><div class="bar"><i style="width:${Math.round((done / all.length) * 100)}%"></i></div><span>${done}/${all.length}</span></div>`;
    }).join("")}</div>`;
}

function mainCard() {
  const p = plan();
  // One primary action per screen: while the level test is offered, it is the primary one.
  const primary = testCard() ? "" : "primary ";
  const n = sizeOf(p);
  if (doneToday() || !n) {
    return `<article class="card main ok"><span class="eyebrow">Сегодня</span><h2>Сегодня готово ✓</h2>
      <p class="meta">${n ? `Осталось ${n} ${plural(n, "карточка", "карточки", "карточек")}, можно сделать сейчас или завтра.` : "Новые слова и повторения будут завтра."}</p>
      ${n ? `<button type="button" class="btn primary big" data-daily>Продолжить</button>` : ""}
      <button type="button" class="btn ${n ? "" : "primary "}big" data-extra>Ещё 5 новых слов</button></article>`;
  }
  const old = p.reviews.length + p.prod.length;
  const parts = [old ? `${old} на повторение` : "", p.fresh.length ? `${p.fresh.length} ${plural(p.fresh.length, "новое слово", "новых слова", "новых слов")}` : ""].filter(Boolean).join(", ");
  const comeback = db.streak && !streakNow(db.streak, today()) && p.backlog > 0;
  return `<article class="card main"><span class="eyebrow">Тренировка дня</span>
    <h2>${n} ${plural(n, "слово", "слова", "слов")} · ≈${minutesOf(p)} мин</h2>
    <p class="meta">${parts}.${p.backlog > p.reviews.length ? " Сначала повторим, потом новые." : ""}</p>
    ${comeback ? `<p class="meta">С возвращением! Начнём с того, что уже знаете.</p>` : ""}
    <button type="button" class="btn ${primary}huge" data-daily>${primary ? "Начать" : "Начать без теста"}</button></article>`;
}

function weekStrip() {
  const days = Array.from({ length: WEEK }, (_, k) => addDays(today(), k - (WEEK - 1)));
  const active = new Set(db.log.map((l) => l.date));
  return `<div class="strip" aria-label="Последние 7 дней">${days.map((d) => {
    const wd = SHORT_DAYS[new Date(`${d}T12:00:00`).getDay()];
    return `<div class="strip-day${active.has(d) ? " hard" : ""}${d === today() ? " today" : ""}"><i></i><span>${wd}</span></div>`;
  }).join("")}</div>`;
}

function canSayList() {
  const known = WORDS.filter((w) => isCounted(db.cards[recId(w.id)])).slice(-4).reverse();
  if (!known.length) return "";
  return `<h3 class="section-title">Вы уже можете сказать</h3>
    <div class="en-say-now">${known.map((w) => `<button type="button" class="en-phrase" data-say-text="${esc(w.ex)}"><b lang="en">${esc(w.ex)}</b><small>${esc(w.exRu)}</small></button>`).join("")}</div>`;
}

function renderToday() {
  const learned = learnedCount();
  const days = streakNow(db.streak, today());
  const courseSize = order().length;
  const goal = MILESTONES.find((m) => m > learned) || courseSize;
  const pct = Math.round((learned / Math.max(1, courseSize)) * 100);
  const nextPack = PACKS[WORD[order().find((w) => !db.cards[recId(w)])]?.pack];
  return `<header class="large-title"><h1>Английский</h1><p>${days ? `Серия ${days} ${plural(days, "день", "дня", "дней")}` : "10–15 минут в день"}</p></header>
    ${testCard()}
    ${mainCard()}
    <div class="stats"><div class="stat"><b>${learned}</b><span>${plural(learned, "слово изучено", "слова изучено", "слов изучено")}</span></div>
      <button type="button" class="stat en-cov-btn" data-coverage><b>≈${coveragePct()}%</b><span>слов в обычной речи вы узнаёте ⓘ</span></button></div>
    <div class="progress"><div class="progress-num"><b>${learned}</b> из ${courseSize} слов курса</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p class="progress-line">Следующая цель: ${goal} ${plural(goal, "слово", "слова", "слов")}.${nextPack ? ` Сейчас тема «${esc(nextPack.title)}»${nextPack.lv ? `, ${nextPack.lv}` : ""}.` : ""}</p></div>
    ${levelRows()}
    ${weekStrip()}
    ${canSayList()}`;
}

function coverageSheet() {
  openSheet(`<h2 class="sheet-title">Что значит «${coveragePct()}% слов в речи»</h2>
    <p>Это доля слов в обычном разговоре, которые вы узнаёте. Самые частые слова встречаются постоянно, поэтому первые 100 слов дают около половины любой речи, а 1000 слов дают около 84%.</p>
    <p>Слово засчитывается, когда вы вспомнили его минимум два раза в разные дни.</p>
    <p class="muted">Это оценка по частоте слов, а не понимание речи: скорость, произношение и грамматику она не учитывает. Чтобы свободно понимать на слух, нужно около 95–98% слов, это примерно 3000 слов.</p>`);
}

/* ---------- «Слова» ---------- */
const DOTS = { new: "○○○", learning: "●●○", known: "●●●" };

function wordRows() {
  const q = words.q.trim().toLowerCase();
  const match = (w) => (!q || w.en.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q)) && (words.filter === "all" || statusOf(w.id) === words.filter);
  const html = PACKS.map((p) => {
    const list = WORDS.filter((w) => w.pack === p.id && match(w));
    if (!list.length) return "";
    return `<h3 class="en-pack">${p.lv || list[0].lv} · ${esc(p.title)}</h3>${list.map((w) => `<button type="button" class="list-item en-row ${statusOf(w.id)}" data-word="${w.id}">
      <span class="en-row-emoji" aria-hidden="true">${esc(w.e || "🔤")}</span><span class="en-row-text"><b lang="en">${esc(w.en)}</b><small>${esc(w.ru)}</small></span>
      <i class="en-dots" aria-label="${{ new: "новое", learning: "учу", known: "знаю" }[statusOf(w.id)]}">${DOTS[statusOf(w.id)]}</i></button>`).join("")}`;
  }).join("");
  return html || `<p class="muted center">${q ? "Ничего не нашлось." : "Здесь пока пусто."}</p>`;
}

function renderWords() {
  const learned = learnedCount();
  return `<header class="large-title"><h1>Слова</h1><p>Изучено ${learned} из ${WORDS.length}</p></header>
    <label class="sr" for="en-search">Поиск</label>
    <input id="en-search" class="field en-search" type="search" placeholder="Поиск по-английски или по-русски" value="${esc(words.q)}" autocomplete="off">
    <div class="seg en-seg">${FILTERS.map(([k, label]) => `<button type="button" data-filter="${k}" class="${words.filter === k ? "on" : ""}">${label}</button>`).join("")}</div>
    <div id="en-list" class="en-list">${wordRows()}</div>`;
}

function wordSheet(wid) {
  const w = WORD[wid];
  const card = db.cards[recId(wid)];
  const body = openSheet(`<div class="en-card">${answerHtml(w, card, db.notes[wid])}</div>
    <p class="muted">${card ? `Верно ${card.right}, забыл ${card.wrong}. Следующее повторение ${esc(card.due)}.` : "Слово ещё не начато, оно придёт по порядку."}</p>
    <button type="button" class="btn big" data-note-edit>✎ ${db.notes[wid] ? "Изменить ассоциацию" : "Своя ассоциация"}</button>`);
  body.addEventListener("click", (e) => {
    const s = e.target.closest("[data-say]");
    if (s) speakEn(s.dataset.say === "ex" ? w.ex : w.en, s.dataset.say === "slow");
    if (e.target.closest("[data-note-edit]")) editNote(wid, () => wordSheet(wid));
  });
  if (db.audio) speakEn(w.en);
}

/* ---------- render & tabs ---------- */
export function renderEng() {
  const main = $("eng-main");
  if (tab === "today") main.innerHTML = renderToday();
  if (tab === "words") main.innerHTML = renderWords();
  if (tab === "method") main.innerHTML = methodHtml(db, { voice: hasEnglishVoice(), canSpeak: canSpeak() });
}

function showEngTab(name) {
  tab = name;
  document.querySelectorAll("[data-etab]").forEach((b) => b.setAttribute("aria-current", b.dataset.etab === name ? "page" : "false"));
  renderEng();
  window.scrollTo(0, 0);
}

function onClick(e) {
  const t = e.target;
  if (t.closest("[data-daily]")) { startSession(plan(), "Слова", { daily: true }); return; }
  if (t.closest("[data-extra]")) { startExtra(); return; }
  if (t.closest("[data-coverage]")) { coverageSheet(); return; }
  if (t.closest("[data-test]")) { startTest(); return; }
  const lv = t.closest("[data-level]");
  if (lv) { applyStart(lv.dataset.level); return; }
  const phrase = t.closest("[data-say-text]");
  if (phrase) { speakEn(phrase.dataset.sayText); return; }
  const row = t.closest("[data-word]");
  if (row) { wordSheet(row.dataset.word); return; }
  const f = t.closest("[data-filter]");
  if (f) { words = { ...words, filter: f.dataset.filter }; renderEng(); return; }
  const pace = t.closest("[data-pace]");
  if (pace) { commit({ ...db, pace: Number(pace.dataset.pace) }); return; }
  if (t.closest("[data-voice-test]")) { speakEn("Hello! I want a coffee, please."); return; }
  if (t.closest("[data-reset]") && confirm("Сбросить весь прогресс английского? Это нельзя отменить.")) { commit(reset()); toast("Прогресс сброшен."); }
}

function onChange(e) {
  if (e.target.id === "en-audio") commit({ ...db, audio: e.target.checked });
}

function onInput(e) {
  if (e.target.id !== "en-search") return;
  words = { ...words, q: e.target.value };
  $("en-list").innerHTML = wordRows();
}

export function initEng() {
  const main = $("eng-main");
  main.addEventListener("click", onClick);
  main.addEventListener("change", onChange);
  main.addEventListener("input", onInput);
  // The finish screen lives in #drill: its phrase buttons speak too.
  $("drill").addEventListener("click", (e) => {
    const phrase = document.body.dataset.mod === "eng" && e.target.closest("[data-say-text]");
    if (phrase) speakEn(phrase.dataset.sayText);
  });
  document.querySelectorAll("[data-etab]").forEach((b) => b.addEventListener("click", () => showEngTab(b.dataset.etab)));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") db = load(); });
  initVoice();
}

/** One line for the home screen tile. */
export function engSummary() {
  const p = plan();
  const n = sizeOf(p);
  const learned = learnedCount();
  const main = doneToday() || !n
    ? `Сегодня готово ✓ · ${learned} ${plural(learned, "слово", "слова", "слов")}`
    : `Сегодня: ${n} ${plural(n, "слово", "слова", "слов")}, ≈${minutesOf(p)} мин`;
  const extra = db.start || learned ? `Уровень ${db.start || "A1"} · узнаёте ≈${coveragePct()}% слов в речи` : "Тест уровня и слова A1–C1";
  return { main, extra, done: doneToday() };
}

