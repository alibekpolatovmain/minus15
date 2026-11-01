// Fullscreen workout timer: intervals, voice, pause, «Как делать?», finish flow.
import { EXERCISES } from "./data.js";
import { RULES, sessionTotals } from "./plan.js";
import { esc, exName, frameHtml, frameCount, howToHtml, openSheet, closeSheet } from "./ui.js";

const TICK_MS = 200;
const FLIP_MS = 1500;
const BACK_DOUBLE_MS = 2000;
const MIN_WORK_TO_RECORD_S = 60;
const PHASE = { warm: "РАЗМИНКА", work: "РАБОТА", rest: "ОТДЫХ", cool: "ЗАМИНКА", flow: "СПИНА И ШЕЯ", prep: "ПРИГОТОВЬСЯ" };
const PAUSE_LIKE = new Set(["rest", "prep"]);
const SOFT_KINDS = new Set(["light", "stand", "morning", "chin"]);
const FLOW_LABEL = { morning: "УТРО", chin: "ПОДБОРОДОК", light: "СПИНА И ШЕЯ" };
const NUM_WORDS = ["", "один", "два", "три", "четыре", "пять", "шесть"];
const NUM_GEN = ["", "одного", "двух", "трёх", "четырёх", "пяти", "шести"];

let run = null;
const $ = (id) => document.getElementById(id);

/* ---------- audio ---------- */
function makeAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    return AC ? new AC() : null;
  } catch (err) {
    return null;
  }
}
function beep(freq, ms) {
  if (!run?.sound || !run.audio) return;
  try {
    const osc = run.audio.createOscillator();
    const gain = run.audio.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(run.audio.destination);
    osc.start();
    osc.stop(run.audio.currentTime + ms / 1000);
  } catch (err) {
    console.warn("beep failed", err);
  }
}
function say(text) {
  if (!run?.sound || !("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ru-RU";
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch (err) {
    console.warn("speech failed", err);
  }
}
async function keepAwake() {
  try { run.wake = await navigator.wakeLock?.request("screen"); } catch (err) { run.wake = null; }
}

/* ---------- labels ---------- */
const stepName = (step) => exName(step.ex, run.level, step.label);

function progressText(step) {
  if (step.round) return `Круг ${step.round} из ${step.rounds}`;
  if (step.phase === "prep") {
    const next = run.steps[run.i + 1];
    return next?.count ? `${next.idx + 1} из ${next.count}` : "";
  }
  return `${step.idx + 1} из ${step.count}`;
}

function segmentsHtml(step) {
  if (!step.round) return "";
  return `<div class="segs">${Array.from({ length: step.count }, (_, i) => `<i class="${i < step.idx ? "done" : i === step.idx ? "cur" : ""}"></i>`).join("")}</div>`;
}

const roundWords = (step) => `Круг ${NUM_WORDS[step.round] || step.round} из ${NUM_GEN[step.rounds] || step.rounds}`;

/** Voice: the position cue comes during the pause before an exercise, so you can get into place in time. */
function announce(step) {
  const name = stepName(step);
  const cue = EXERCISES[step.ex].cues[0];
  if (step.phase === "prep") { say(`${step.round ? roundWords(step) + ". " : ""}Приготовься: ${name}. ${cue}`); return; }
  if (step.phase === "rest") {
    const next = stepName({ ...step, label: null });
    say(step.roundBreak ? `Круг закончен. Отдых ${step.sec} секунд. Потом ${roundWords(step).toLowerCase()}: ${next}. ${cue}` : `Отдых. Дальше: ${next}. ${cue}`);
    return;
  }
  if (step.phase === "work") say(run.steps[run.i - 1]?.phase === "prep" ? "Начали!" : name);
}

/* ---------- render ---------- */
function render() {
  const step = run.steps[run.i];
  const next = run.steps.slice(run.i + 1).find((s) => !PAUSE_LIKE.has(s.phase));
  const root = $("timer");
  root.dataset.phase = step.phase;
  root.classList.toggle("paused", run.paused && !run.ready);
  const phaseLabel = step.phase === "flow" ? FLOW_LABEL[run.session.kind] || PHASE.flow : PHASE[step.phase];
  $("t-phase").textContent = run.ready ? "ГОТОВЫ?" : run.paused ? "ПАУЗА" : phaseLabel;
  $("t-progress").innerHTML = `${esc(progressText(step))}${segmentsHtml(step)}`;
  const isRest = step.phase === "rest";
  const upcoming = stepName({ ...step, label: isRest ? null : step.label });
  $("t-name").textContent = step.roundBreak ? "Отдых между кругами" : isRest ? `Дальше: ${upcoming}` : upcoming;
  $("t-cue").textContent = run.ready ? "Займите место и нажмите «Начать»" : step.roundBreak ? `Попейте воды. Потом круг ${step.round}: «${upcoming}»` : EXERCISES[step.ex].cues[0];
  $("t-media").innerHTML = frameHtml(step.ex, 0);
  $("t-next").innerHTML = PAUSE_LIKE.has(step.phase) ? "" : next ? `<span>Потом:</span> ${esc(stepName(next))}` : "Последнее упражнение";
  $("t-pause").textContent = run.ready ? "Начать" : run.paused ? "Продолжить" : "Пауза";
  $("t-stop").hidden = !run.paused || run.ready;
  updateClock();
}

function updateClock() {
  const step = run.steps[run.i];
  const left = run.paused ? run.remaining : run.endAt - Date.now();
  const total = Math.max(0, Math.ceil(left / 1000));
  $("t-clock").textContent = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  $("t-bar").style.width = `${Math.min(100, Math.max(0, (left / (step.sec * 1000)) * 100))}%`;
  const spent = run.steps.map((s, i) => (i === run.i ? (run.spent[i] || 0) + (s.sec * 1000 - Math.max(0, left)) : run.spent[i] || 0));
  const live = sessionTotals(run.session, run.weight, spent);
  $("t-kcal").textContent = `${Math.round(live.kcal)}`;
  $("t-elapsed").textContent = `${Math.floor(live.seconds / 60)}:${String(Math.floor(live.seconds % 60)).padStart(2, "0")} из ${Math.round(run.totalSec / 60)} мин`;
}

/* ---------- engine ---------- */
function enter(i, { paused = false } = {}) {
  run.i = i;
  run.paused = paused;
  run.remaining = run.steps[i].sec * 1000;
  run.endAt = Date.now() + run.remaining;
  run.lastBeep = null;
  run.sideSaid = false;
  run.frame = 0;
  run.flipAt = Date.now() + FLIP_MS;
  render();
  if (!paused) announce(run.steps[i]);
}

function leave() {
  const step = run.steps[run.i];
  const left = run.paused ? run.remaining : Math.max(0, run.endAt - Date.now());
  run.spent[run.i] = Math.min(step.sec * 1000, (run.spent[run.i] || 0) + (step.sec * 1000 - left));
}

function tick() {
  if (!run || run.paused || run.finished) return;
  const now = Date.now();
  const step = run.steps[run.i];
  const left = run.endAt - now;
  updateClock();
  const s = Math.ceil(left / 1000);
  if (s <= 3 && s >= 1 && s !== run.lastBeep) { run.lastBeep = s; beep(660, 120); }
  const ex = EXERCISES[step.ex];
  if ((ex.half || ex.side) && !PAUSE_LIKE.has(step.phase) && !run.sideSaid && left <= (step.sec * 1000) / 2) {
    run.sideSaid = true;
    beep(880, 200);
    say(ex.half || "Смени сторону");
  }
  if (frameCount(step.ex) === 2 && !PAUSE_LIKE.has(step.phase) && now >= run.flipAt) {
    run.frame = 1 - run.frame;
    run.flipAt = now + FLIP_MS;
    $("t-media").innerHTML = frameHtml(step.ex, run.frame);
  }
  if (left <= 0) {
    leave();
    beep(990, 350);
    if (run.i + 1 < run.steps.length) enter(run.i + 1);
    else finish();
  }
}

function setPaused(paused) {
  if (!run || run.finished || run.paused === paused) return;
  if (paused) {
    run.remaining = Math.max(0, run.endAt - Date.now());
    try { speechSynthesis.cancel(); } catch (err) { /* no speech */ }
  } else {
    run.endAt = Date.now() + run.remaining;
  }
  run.paused = paused;
  const starting = !paused && run.ready;
  if (starting) {
    run.ready = false;
    try { run.audio?.resume(); } catch (err) { /* audio optional */ }
  }
  render();
  if (starting) announce(run.steps[run.i]);
}

/** ← and → move between steps but keep the pause (and the «Начать» gate) as it was. */
function forward() {
  if (!run || run.finished) return;
  const wasPaused = run.paused;
  leave();
  const target = run.i + 1;
  if (target >= run.steps.length) finish();
  else enter(target, { paused: wasPaused });
}

function back() {
  if (!run || run.finished) return;
  const wasPaused = run.paused;
  const now = Date.now();
  const double = now - (run.lastBackAt || 0) < BACK_DOUBLE_MS;
  run.lastBackAt = now;
  leave();
  if (!double) { enter(run.i, { paused: wasPaused }); return; }
  let target = run.i - 1;
  while (target > 0 && PAUSE_LIKE.has(run.steps[target].phase)) target -= 1;
  enter(Math.max(0, target), { paused: wasPaused });
}

function showHowTo() {
  const step = run.steps[run.i];
  const resume = !run.paused;
  setPaused(true);
  const body = openSheet(`${howToHtml(step.ex, run.level, step.label)}<div class="sheet-foot"><button type="button" class="btn primary big" data-close>${resume ? "Продолжить тренировку" : "Закрыть"}</button></div>`, { onClose: () => resume && setPaused(false) });
  body.querySelector("[data-close]").addEventListener("click", closeSheet);
}

function confirmClose() {
  const resume = !run.paused;
  setPaused(true);
  const body = openSheet(`<h3 class="sheet-title">Закончить тренировку?</h3>
    <button type="button" class="btn primary big" data-act="continue">Продолжить</button>
    <button type="button" class="btn big" data-act="finish">Закончить и записать</button>
    <button type="button" class="btn link" data-act="drop">Выйти без записи</button>`);
  body.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "continue") { closeSheet(); if (resume) setPaused(false); }
    if (act === "finish") { closeSheetSilently(); leave(); finish(); }
    if (act === "drop") { closeSheetSilently(); end(null); }
  });
}

function closeSheetSilently() {
  const root = document.getElementById("sheet");
  root.classList.remove("open");
  root.hidden = true;
}

/* ---------- finish ---------- */
function finish() {
  run.finished = true;
  clearInterval(run.interval);
  try { speechSynthesis.cancel(); } catch (err) { /* no speech */ }
  const totals = sessionTotals(run.session, run.weight, run.spent);
  run.totals = totals;
  const root = $("timer");
  root.dataset.phase = "done";
  root.classList.remove("paused");
  $("t-run").hidden = true;
  $("t-done").hidden = false;
  if (totals.workSeconds < MIN_WORK_TO_RECORD_S) { end({ skipped: true }); return; }
  const partial = totals.ratio < RULES.PARTIAL_RATIO;
  const asksFeel = !partial && !SOFT_KINDS.has(run.session.kind);
  $("d-min").textContent = Math.round(totals.seconds / 60);
  $("d-kcal").textContent = `${Math.round(totals.kcal)}`;
  $("d-title").textContent = partial ? "Сделано меньше половины. Записать?" : "Готово!";
  $("d-feel").hidden = !asksFeel;
  $("d-ask").hidden = !asksFeel;
  $("d-save").hidden = asksFeel;
  $("d-save").textContent = partial ? "Записать" : "Записать и закрыть";
  $("d-drop").hidden = !partial;
  run.partial = partial;
  if (!partial) say("Готово! Отличная работа.");
}

function end(result) {
  const cb = run.onEnd;
  clearInterval(run.interval);
  try { run.wake?.release(); } catch (err) { /* released */ }
  try { run.audio?.close(); } catch (err) { /* closed */ }
  run = null;
  $("timer").hidden = true;
  document.body.classList.remove("locked");
  cb(result);
}

function record(feel) {
  end({ session: run.session, totals: run.totals, feel, partial: run.partial, level: run.level });
}

/* ---------- public ---------- */
export function startTimer(session, { level, weight, sound, onEnd }) {
  run = {
    session, steps: session.steps, level, weight, sound, onEnd,
    i: 0, spent: [], paused: true, ready: true, finished: false, audio: sound ? makeAudio() : null,
    totalSec: session.steps.reduce((sum, s) => sum + s.sec, 0)
  };
  keepAwake();
  $("t-run").hidden = false;
  $("t-done").hidden = true;
  $("timer").hidden = false;
  document.body.classList.add("locked");
  enter(0, { paused: true });
  run.interval = setInterval(tick, TICK_MS);
}

export function bindTimer() {
  $("t-pause").addEventListener("click", () => setPaused(!run?.paused));
  $("t-clock").addEventListener("click", () => setPaused(!run?.paused));
  $("t-next-btn").addEventListener("click", forward);
  $("t-back").addEventListener("click", back);
  $("t-close").addEventListener("click", () => run && !run.finished && confirmClose());
  $("t-how").addEventListener("click", () => run && !run.finished && showHowTo());
  $("t-stop").addEventListener("click", () => run && !run.finished && confirmClose());
  $("d-feel").addEventListener("click", (e) => {
    const feel = e.target.closest("[data-feel]")?.dataset.feel;
    if (feel && run?.finished) record(feel);
  });
  $("d-save").addEventListener("click", () => run?.finished && record(null));
  $("d-drop").addEventListener("click", () => run?.finished && end(null));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && run && !run.finished) keepAwake();
  });
}
