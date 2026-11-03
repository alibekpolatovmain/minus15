// «Речь»: daily vocabulary session, free improvisation and the dictionary. Owns its own database object.
import { esc, toast, plural, fmt1 } from "../ui.js";
import { isoDate, addDays } from "../plan.js";
import { review, streakAfter } from "../neg/srs.js";
import { load, save } from "./store.js";
import { WORDS, TOPICS } from "./content.js";
import { planSession, freePlan, recordUses, activeIds, ACTIVE_DAYS, KNOWN_CARD } from "./plan.js";
import { usedWordIds, speechStats } from "./analyze.js";
import { runSession } from "./session.js";

const SECONDS_PER_WORD = 40;
const DRILLS_SECONDS = 4 * 60;
const TREND_SPAN = 3;

let db = load();
let tab = "today";
const $ = (id) => document.getElementById(id);
const today = () => isoDate(new Date());
const doneToday = () => db.streak?.last === today();
const learning = () => WORDS.filter((w) => db.cards[`w:${w.id}`]).length;
const activeCount = () => activeIds(db.active).length;
const plan = () => planSession(db.cards, today(), db.sessions);
const wordsLabel = (n) => `${n} ${plural(n, "слово", "слова", "слов")}`;

function commit(next, rerender = true) {
  db = next;
  if (!save(db)) toast("Не удалось сохранить. Освободите место на телефоне.");
  if (rerender) renderSpeech();
}

/* ---------- session callbacks ---------- */
const onGrade = (id, right) => commit({ ...db, cards: { ...db.cards, [id]: review(db.cards[id], right, today()) } }, false);
const onKnown = (id) => commit({ ...db, cards: { ...db.cards, [id]: { box: KNOWN_CARD.box, due: addDays(today(), KNOWN_CARD.days), right: 1, wrong: 0 } } }, false);

/** Every learned word said in the speech moves towards «active», not only the three asked for. */
function onSpeech({ text, seconds, targets }) {
  const known = WORDS.filter((w) => db.cards[`w:${w.id}`] || targets.includes(w.id));
  const used = usedWordIds(text, known);
  const s = speechStats(text, seconds);
  const entry = { date: today(), words: s.words, fillers: s.fillers, seconds, used: targets.filter((id) => used.includes(id)).length, target: targets.length };
  commit({ ...db, active: recordUses(db.active, used, today()), log: [...db.log, entry] }, false);
}

function finishHtml() {
  const tomorrow = planSession(db.cards, addDays(today(), 1), db.sessions).wordIds.length;
  return `<h2 class="dr-title center">Сессия сделана</h2>
    <div class="dr-stats"><p><b>${db.streak.days}</b><span>${plural(db.streak.days, "день", "дня", "дней")} подряд</span></p>
      <p><b>${activeCount()}</b><span>${plural(activeCount(), "слово", "слова", "слов")} в активе</span></p></div>
    <p class="muted center">Завтра ${wordsLabel(tomorrow)}. Слово переходит в актив, когда вы скажете его в импровизации в ${ACTIVE_DAYS} разных дня.</p>`;
}

function startDaily() {
  const p = plan();
  const targets = p.targets.length ? p.targets : freePlan(db.cards, db.active).targets;
  const steps = [
    ...p.wordIds.map((id) => ({ kind: db.cards[id] ? "recall" : "learn", id })),
    { kind: "paraphrase", item: p.paraphrase },
    { kind: "cleanup", item: p.cleanup },
    { kind: "improv", prompt: p.prompt, targets },
  ];
  runSession({
    steps, title: "Сессия дня", onGrade, onKnown, onSpeech,
    onFinish: () => {
      if (!doneToday()) commit({ ...db, streak: streakAfter(db.streak, today()), sessions: db.sessions + 1 }, false);
      return finishHtml();
    },
    onClose: renderSpeech,
  });
}

function startFree() {
  const { prompt, targets } = freePlan(db.cards, db.active);
  runSession({
    steps: [{ kind: "improv", prompt, targets }], title: "Импровизация", onGrade, onKnown, onSpeech,
    onFinish: () => `<h2 class="dr-title center">Записано</h2><p class="muted center">Слов в активе: ${activeCount()}. Чем чаще говорите новые слова, тем быстрее они становятся вашими.</p>`,
    onClose: renderSpeech,
  });
}

/* ---------- «Тренировка» ---------- */
function mainCard() {
  if (doneToday()) {
    return `<article class="card main ok"><h2>Сессия сделана ✓</h2><p class="meta">Новые слова будут завтра.</p>
      <button type="button" class="btn primary huge" data-free>Ещё минута импровизации</button></article>`;
  }
  const ids = plan().wordIds;
  const fresh = ids.filter((id) => !db.cards[id]).length;
  const reviews = ids.length - fresh;
  const minutes = Math.round((ids.length * SECONDS_PER_WORD + DRILLS_SECONDS) / 60);
  const parts = [fresh ? `${fresh} ${plural(fresh, "новое слово", "новых слова", "новых слов")}` : "", reviews ? `${reviews} на повторение` : ""].filter(Boolean).join(", ");
  return `<article class="card main">
    <span class="eyebrow">Сессия дня</span>
    <h2>≈${minutes} мин</h2>
    <p class="meta">${parts ? `${parts}, затем` : "Сегодня без новых слов:"} перефраз, чистая речь и минута импровизации вслух.</p>
    <button type="button" class="btn primary huge" data-daily>Начать</button>
  </article>`;
}

const per100 = (l) => (l.words ? (l.fillers / l.words) * 100 : 0);
const avg = (list, f) => list.reduce((sum, l) => sum + f(l), 0) / list.length;

function trendCard() {
  const logs = db.log.filter((l) => l.words);
  if (!logs.length) return "";
  const now = avg(logs.slice(-TREND_SPAN), per100);
  const start = avg(logs.slice(0, TREND_SPAN), per100);
  const timed = logs.filter((l) => l.seconds).slice(-TREND_SPAN);
  const wpm = timed.length ? Math.round(avg(timed, (l) => l.words / (l.seconds / 60))) : null;
  const compare = logs.length > TREND_SPAN
    ? `В первых импровизациях было ${fmt1(start)}: ${now < start ? "речь стала чище" : "пока без улучшения, делайте паузу вместо «ну»"}.`
    : "Среднее по последним импровизациям.";
  return `<article class="card"><span class="eyebrow">Слова-паразиты</span>
    <p class="sp-big"><b>${fmt1(now)}</b> на 100 слов</p>
    <p class="meta faint">${compare}${wpm ? ` Темп ≈${wpm} слов в минуту.` : ""}</p></article>`;
}

function renderToday() {
  const streak = db.streak && (doneToday() || db.streak.last === addDays(today(), -1)) ? db.streak.days : 0;
  const active = activeCount();
  const pct = Math.round((active / WORDS.length) * 100);
  return `<header class="large-title"><h1>Речь</h1><p>${streak ? `Серия ${streak} ${plural(streak, "день", "дня", "дней")}` : "Несколько минут в день, вслух"}</p></header>
    ${mainCard()}
    <div class="progress"><div class="progress-num"><b>${active}</b> ${plural(active, "слово", "слова", "слов")} в активе</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p class="progress-line">Изучаете ${learning()} из ${WORDS.length}. В актив слово попадает, когда вы сказали его в импровизации в ${ACTIVE_DAYS} разных дня.</p></div>
    ${trendCard()}
    ${doneToday() ? "" : `<div class="alts"><button type="button" class="btn alt" data-free><b>Свободная импровизация</b><small>Минута на случайную тему с вашими словами</small></button></div>`}
    <details class="help"><summary>Как это работает</summary>
      <ul class="cues">
        <li><b>Говорить, а не читать.</b> Слово становится вашим, только когда вы произносите его сами. Поэтому каждое задание делается вслух.</li>
        <li><b>Повторение с интервалами.</b> Слова возвращаются через 1, 3, 7, 14 и 30 дней, ровно когда начинают забываться.</li>
        <li><b>Импровизация.</b> Минута речи на тему с тремя словами. Приложение распознаёт речь, считает паразитов, темп и проверяет, прозвучали ли слова в любой форме.</li>
        <li><b>Паузы вместо паразитов.</b> «Ну» и «как бы» заполняют тишину. Пауза в полсекунды звучит увереннее.</li>
        <li><b>Красиво — значит точно.</b> Сложное слово ради сложности звучит хуже простого. Цель — точное слово к месту.</li>
      </ul>
      <p class="muted">Данные хранятся только на этом телефоне. Речь распознаёт браузер: в Safari нужна включённая Siri, иначе надиктуйте через 🎤 на клавиатуре.</p>
    </details>`;
}

/* ---------- «Словарь» ---------- */
function statusBadge(w) {
  if (db.active[w.id]?.length >= ACTIVE_DAYS) return `<span class="badge good">в активе</span>`;
  if (db.cards[`w:${w.id}`]) return `<span class="badge sp-learning">изучаете</span>`;
  return "";
}

function wordRow(w) {
  return `<details class="ex"><summary><span class="sp-row"><b>${esc(w.word)}</b>${statusBadge(w)}</span></summary>
    <p class="sp-stress">${esc(w.stress)}</p><p>${esc(w.mean)}</p>
    <p class="muted">Вместо «${esc(w.plain)}» · ${w.pair.map(esc).join(", ")}</p>
    <p class="dr-quote">${esc(w.ex)}</p></details>`;
}

function renderDict() {
  return `<header class="large-title"><h1>Словарь</h1><p>${WORDS.length} слов и выражений для красивой речи</p></header>
    ${TOPICS.map((t) => {
      const list = WORDS.filter((w) => w.topic === t.id);
      const ok = list.filter((w) => db.active[w.id]?.length >= ACTIVE_DAYS).length;
      return `<details class="help"><summary><span class="sp-head">${esc(t.title)}<small>${ok ? `в активе ${ok} из ${list.length}` : esc(t.sub)}</small></span></summary>
        ${list.map(wordRow).join("")}</details>`;
    }).join("")}`;
}

/* ---------- render & tabs ---------- */
export function renderSpeech() {
  $("speech-main").innerHTML = tab === "dict" ? renderDict() : renderToday();
}

function showTab(name) {
  tab = name;
  document.querySelectorAll("[data-stab]").forEach((b) => b.setAttribute("aria-current", b.dataset.stab === name ? "page" : "false"));
  renderSpeech();
  window.scrollTo(0, 0);
}

export function initSpeech() {
  $("speech-main").addEventListener("click", (e) => {
    if (e.target.closest("[data-daily]")) startDaily();
    else if (e.target.closest("[data-free]")) startFree();
  });
  document.querySelectorAll("[data-stab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.stab)));
  // Reload from storage when returning to the app: a session may have finished in another tab.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") db = load(); });
}

/** One line for the home screen tile. */
export function speechSummary() {
  const n = plan().wordIds.length;
  const main = doneToday() ? `Сессия сделана ✓${db.streak ? ` · серия ${db.streak.days}` : ""}` : `Сессия дня: ${n ? wordsLabel(n) : "импровизация"}`;
  return { main, extra: `В активе ${wordsLabel(activeCount())}`, done: doneToday() };
}
