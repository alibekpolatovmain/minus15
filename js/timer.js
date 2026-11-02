// Fullscreen workout timer: intervals, voice, pause, «Как делать?», finish flow.
import { EXERCISES } from "./data.js";
import { RULES, sessionTotals, exerciseBreakdown } from "./plan.js";
import { esc, exName, frameHtml, frameCount, howToHtml, openSheet, closeSheet } from "./ui.js";

const TICK_MS = 200;
const FLIP_MS = 1500;
const BACK_DOUBLE_MS = 2000;
// Anything from half a minute of moving is recorded, even if the workout was cut short.
const MIN_ACTIVE_TO_RECORD_S = 30;
const PARTS_SHOWN = 6;
const PHASE = { warm: "РАЗМИНКА", work: "РАБОТА", rest: "ОТДЫХ", cool: "ЗАМИНКА", flow: "СПИНА И ШЕЯ", prep: "ПРИГОТОВЬСЯ" };
const PAUSE_LIKE = new Set(["rest", "prep"]);
const SOFT_KINDS = new Set(["light", "stand", "morning", "chin", "office"]);
const FLOW_LABEL = { morning: "УТРО", chin: "ПОДБОРОДОК", light: "СПИНА И ШЕЯ", office: "ОФИС" };
const NUM_WORDS = ["", "один", "два", "три", "четыре", "пять", "шесть"];
const NUM_GEN = ["", "одного", "двух", "трёх", "четырёх", "пяти", "шести"];
// Spoken rhythm: starts after «Начали!», keeps quiet for the side switch and the final 3-2-1 beeps.
const TEMPO_START_MS = 1500;
const TEMPO_RESUME_MS = 1000;
const TEMPO_QUIET_END_MS = 3500;
const SIDE_QUIET_MS = 2500;
const TEMPO_RATE = 1.15;
const HOLD_EVERY_S = 10;
const COUNTDOWN_FROM_S = 3;
// «Осталось 5 секунд» near the end of work and rest, so the user does not need to look at the clock.
const END_CUE_S = 5;
const END_CUE_MIN_STEP_S = 15;
const END_CUE_QUIET_MS = (END_CUE_S + 1) * 1000;
// Warm-up moves are done slower than in the circuit.
const WARM_TEMPO_SCALE = 1.5;

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
function say(text, rate = 1.05) {
  if (!run?.sound || !("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ru-RU";
    u.rate = rate;
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
  if (step.round) return `Круг ${step.round} из ${step.rounds}${step.phase !== "rest" && step.count ? ` · упр. ${step.idx + 1} из ${step.count}` : ""}`;
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
  const afterPrep = run.steps[run.i - 1]?.phase === "prep";
  if (step.phase === "work") say(afterPrep ? "Начали!" : name);
  else if (afterPrep) say(EXERCISES[step.ex].hold ? "Начали! Держим" : "Начали!");
}

/** Voice guidance during the work: a repeated rhythm («вниз… вверх…») or a countdown for holds. */
function rhythm(step, now, left) {
  if (!run.tempoVoice || left < (hasEndCue(step) ? END_CUE_QUIET_MS : TEMPO_QUIET_END_MS)) return;
  const ex = EXERCISES[step.ex];
  if (ex.tempo) {
    if (now < run.tempoAt) return;
    const [word, sec] = ex.tempo[run.tempoIdx % ex.tempo.length];
    run.tempoIdx += 1;
    run.tempoAt = now + sec * 1000 * (step.phase === "warm" ? WARM_TEMPO_SCALE : 1);
    $("t-beat").textContent = word;
    say(word, TEMPO_RATE);
    return;
  }
  if (!ex.hold) return;
  const s = Math.ceil(left / 1000);
  if (s % HOLD_EVERY_S !== 0 || s >= step.sec || s === run.holdSaid) return;
  run.holdSaid = s;
  $("t-beat").textContent = `Ещё ${s} с`;
  say(`Ещё ${s} секунд`);
}

const hasEndCue = (step) => step.phase !== "prep" && step.sec >= END_CUE_MIN_STEP_S;

/** One spoken heads-up five seconds before the step ends. */
function endCue(step, s) {
  if (run.endSaid || s !== END_CUE_S || !hasEndCue(step)) return;
  run.endSaid = true;
  const text = step.phase === "rest" ? "Пять секунд, приготовься" : "Осталось пять секунд";
  $("t-beat").textContent = step.phase === "rest" ? "" : "Ещё 5 секунд";
  say(text);
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
  $("t-cue").textContent = run.ready ? `${run.intro ? run.intro + " " : ""}${step.phase === "prep" ? "Нажмите «Начать»: 10 секунд, чтобы встать на место, дальше голос ведёт сам" : "Нажмите «Начать», дальше голос ведёт сам"}` : step.roundBreak ? `Попейте воды. Потом круг ${step.round}: «${upcoming}»` : EXERCISES[step.ex].cues[0];
  $("t-media").innerHTML = frameHtml(step.ex, 0, run.level);
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
  const live = sessionTotals(run.session, run.weight, spentNow());
  $("t-kcal").textContent = `${Math.round(live.kcal)}`;
  $("t-elapsed").textContent = `${Math.floor(live.seconds / 60)}:${String(Math.floor(live.seconds % 60)).padStart(2, "0")} из ${Math.round(run.totalSec / 60)} мин`;
}

/* ---------- engine ---------- */
/** Time spent on every step so far, the current one included. */
function spentNow() {
  const step = run.steps[run.i];
  const left = run.paused ? run.remaining : Math.max(0, run.endAt - Date.now());
  return run.steps.map((s, i) => (i === run.i ? Math.min(step.sec * 1000, (run.spent[i] || 0) + (step.sec * 1000 - left)) : run.spent[i] || 0));
}

/** After each finished exercise the app keeps what was done, so a closed app or a call still gets it recorded. */
function saveProgress() {
  if (!run || run.finished || run.ready || !run.onDraft) return;
  run.onDraft({ session: run.session, level: run.level, spent: [...run.spent] });
}
function enter(i, { paused = false } = {}) {
  run.i = i;
  run.paused = paused;
  run.remaining = run.steps[i].sec * 1000;
  run.endAt = Date.now() + run.remaining;
  run.lastBeep = null;
  run.sideSaid = false;
  run.frame = 0;
  run.flipAt = Date.now() + FLIP_MS;
  run.tempoIdx = 0;
  run.tempoAt = Date.now() + TEMPO_START_MS;
  run.holdSaid = null;
  run.lastTick = null;
  run.endSaid = false;
  $("t-beat").textContent = "";
  render();
  saveProgress();
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
  if (s <= COUNTDOWN_FROM_S && s >= 1 && s !== run.lastBeep) { run.lastBeep = s; beep(660, 120); }
  else if (step.phase === "prep" && s > COUNTDOWN_FROM_S && s !== run.lastTick) { run.lastTick = s; beep(520, 35); }
  const ex = EXERCISES[step.ex];
  if ((ex.half || ex.side) && !PAUSE_LIKE.has(step.phase) && !run.sideSaid && left <= (step.sec * 1000) / 2) {
    run.sideSaid = true;
    run.holdSaid = s; // the countdown must not talk over «Смени сторону»
    run.tempoIdx = 0;
    run.tempoAt = now + SIDE_QUIET_MS;
    beep(880, 200);
    $("t-beat").textContent = ex.half || "Смени сторону";
    say(ex.half || "Смени сторону");
  }
  if (!PAUSE_LIKE.has(step.phase)) rhythm(step, now, left);
  endCue(step, s);
  if (frameCount(step.ex, run.level) === 2 && !PAUSE_LIKE.has(step.phase) && now >= run.flipAt) {
    run.frame = 1 - run.frame;
    run.flipAt = now + FLIP_MS;
    $("t-media").innerHTML = frameHtml(step.ex, run.frame, run.level);
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
    run.tempoAt = Date.now() + TEMPO_RESUME_MS;
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
  run.parts = exerciseBreakdown(run.session, run.weight, run.spent);
  const activeSec = run.parts.reduce((sum, p) => sum + p.sec, 0);
  if (activeSec < MIN_ACTIVE_TO_RECORD_S) { end({ skipped: true }); return; }
  const partial = totals.ratio < RULES.PARTIAL_RATIO;
  const asksFeel = !partial && !SOFT_KINDS.has(run.session.kind);
  $("d-min").textContent = Math.round(totals.seconds / 60);
  $("d-kcal").textContent = `${Math.round(totals.kcal)}`;
  $("d-title").textContent = partial ? "Что успели" : "Готово!";
  $("d-parts").innerHTML = partsHtml(run.parts);
  $("d-feel").hidden = !asksFeel;
  $("d-ask").hidden = !asksFeel;
  $("d-save").hidden = asksFeel;
  $("d-save").textContent = partial ? "Записать" : "Записать и закрыть";
  $("d-drop").hidden = !partial;
  $("d-drop").textContent = "Не записывать";
  run.partial = partial;
  if (!partial) say("Готово! Отличная работа.");
}

/** «Приседания · 2 мин · 25 ккал», the biggest first, so the user sees where the calories came from. */
function partsHtml(parts) {
  const top = [...parts].sort((a, b) => b.kcal - a.kcal).slice(0, PARTS_SHOWN);
  return top.map((p) => `<li><span>${esc(exName(p.ex, run.level))}</span><b>${p.kcal} ккал</b></li>`).join("");
}

function end(result) {
  const cb = run.onEnd;
  if (run.onDraft) run.onDraft(null);
  clearInterval(run.interval);
  try { run.wake?.release(); } catch (err) { /* released */ }
  try { run.audio?.close(); } catch (err) { /* closed */ }
  run = null;
  $("timer").hidden = true;
  document.body.classList.remove("locked");
  cb(result);
}

function record(feel) {
  end({ session: run.session, totals: run.totals, feel, partial: run.partial, level: run.level, parts: run.parts });
}

/* ---------- public ---------- */
export function startTimer(session, { level, weight, sound, tempoVoice = true, intro = null, onEnd, onDraft = null }) {
  run = {
    session, steps: session.steps, level, weight, sound, tempoVoice, intro, onEnd, onDraft,
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
