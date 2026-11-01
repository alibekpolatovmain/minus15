// Scheduling rules: which session to propose today. Pure functions, no DOM, no storage.
import { LEVELS, WORKOUTS, WARMUP, COOLDOWN, LIGHT_FLOW, MORNING_FLOW, CHIN_FLOW, STAND_WARM, STAND_LIST, STAND_SHAPE, MET, PREP_SEC, ROUND_REST_SEC, POS_CHANGE_REST_SEC, EXERCISES } from "./data.js";

export const RULES = {
  EASY_WEEKS: 2,          // weeks 1–2 use the low weekly cap
  CAP_LOW: 3,
  CAP_HIGH: 4,
  PAUSE_SHORT: 8,         // days since last hard session → one round less
  PAUSE_MID: 15,          // → also level −1
  PAUSE_LONG: 29,         // → restart from level 1
  DELOAD_AFTER_WEEKS: 3,  // qualifying weeks in a row before a light week
  DELOAD_MIN_HARD: 2,     // hard sessions that make a week "qualifying"
  MIN_ROUNDS: 2,
  PARTIAL_RATIO: 0.5,
  EASY_TO_LEVEL_UP: 2,
  HARD_TO_SHORT: 2,
  SHORT_ROUNDS: 2,
  MAX_LEVEL: LEVELS.length
};

export const ROTATION = ["A", "B", "C"];
export const HARD_KINDS = new Set(["A", "B", "C", "short"]);

/* ---------- dates (local, YYYY-MM-DD) ---------- */
export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso, n) {
  const d = parseDate(iso);
  return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

/* ---------- history queries ---------- */
export function isHard(s) {
  return HARD_KINDS.has(s.kind) && !s.partial;
}
export function hardSessions(sessions) {
  return sessions.filter(isHard).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
export function nextType(sessions) {
  const hard = hardSessions(sessions);
  if (!hard.length) return "A";
  const last = hard[hard.length - 1].type;
  return ROTATION[(ROTATION.indexOf(last) + 1) % ROTATION.length];
}
export function daysSinceHard(sessions, today) {
  const hard = hardSessions(sessions).filter((s) => s.date <= today);
  return hard.length ? daysBetween(hard[hard.length - 1].date, today) : null;
}
export function hardInLast7(sessions, today) {
  const from = addDays(today, -6);
  return hardSessions(sessions).filter((s) => s.date >= from && s.date <= today).length;
}
export function weekIndex(startDate, today) {
  if (!startDate) return 1;
  return Math.floor(Math.max(0, daysBetween(startDate, today)) / 7) + 1;
}

export function isDeloadWeek(startDate, sessions, today) {
  if (!startDate) return false;
  const current = weekIndex(startDate, today) - 1;
  const countIn = (block) => {
    const from = addDays(startDate, block * 7);
    const to = addDays(from, 6);
    return hardSessions(sessions).filter((s) => s.date >= from && s.date <= to).length;
  };
  let streak = 0;
  for (let b = 0; b <= current; b += 1) {
    if (streak >= RULES.DELOAD_AFTER_WEEKS) {
      if (b === current) return true;
      streak = 0;
      continue;
    }
    if (b === current) return false;
    const n = countIn(b);
    if (n >= RULES.DELOAD_MIN_HARD) streak += 1;
    else if (n === 0) streak = 0;
  }
  return false;
}

/* ---------- today's proposal ---------- */
function pauseAdjust(dh, level) {
  if (dh === null || dh < RULES.PAUSE_SHORT) return { level, roundsDelta: 0, comeback: null };
  if (dh < RULES.PAUSE_MID) return { level, roundsDelta: -1, comeback: "short" };
  if (dh < RULES.PAUSE_LONG) return { level: Math.max(1, level - 1), roundsDelta: -1, comeback: "mid" };
  return { level: 1, roundsDelta: 0, comeback: "long" };
}

export function sessionParams(state, today) {
  const dh = daysSinceHard(state.sessions, today);
  const deload = isDeloadWeek(state.startDate, state.sessions, today);
  const adj = pauseAdjust(dh, state.level);
  const base = LEVELS[adj.level - 1].rounds;
  const rounds = Math.max(RULES.MIN_ROUNDS, base + adj.roundsDelta + (deload ? -1 : 0));
  return { level: adj.level, rounds, deload, comeback: adj.comeback, noRaise: deload || adj.comeback !== null };
}

export function nextSession(state, today) {
  const todays = state.sessions.filter((s) => s.date === today);
  const hardToday = todays.find(isHard);
  const lightToday = todays.some((s) => s.kind === "light");
  const dh = daysSinceHard(state.sessions, today);
  const weekIdx = weekIndex(state.startDate, today);
  const params = sessionParams(state, today);
  const cap = weekIdx <= RULES.EASY_WEEKS || params.deload ? RULES.CAP_LOW : RULES.CAP_HIGH;
  const h7 = hardInLast7(state.sessions, today);
  const type = nextType(state.sessions);
  const base = { weekIdx, cap, h7, type, params, lightToday };

  if (hardToday) return { ...base, status: "done", doneSession: hardToday, banner: null };
  if (dh === 1) return { ...base, status: "light", banner: "Вчера была тренировка. Сегодня мягкий день." };
  if (h7 >= cap) return { ...base, status: "light", banner: "Силовые на эту неделю сделаны. Сегодня мягкий день." };

  const short = (state.hardStreak || 0) >= RULES.HARD_TO_SHORT;
  const banner = params.comeback === "long" ? "Начнём заново, без спешки."
    : params.comeback ? "С возвращением! Сегодня на круг меньше, чтобы войти в ритм."
    : params.deload ? "Лёгкая неделя: на круг меньше, уровень не растёт."
    : short ? "Облегчил нагрузку. Сегодня короткая тренировка." : null;
  return { ...base, status: "hard", mainKind: short ? "short" : type, banner };
}

/* ---------- feedback ---------- */
export function applyFeedback({ level, easyStreak = 0, hardStreak = 0 }, feel, { noRaise = false } = {}) {
  if (feel === "easy") {
    const streak = easyStreak + 1;
    if (streak >= RULES.EASY_TO_LEVEL_UP && !noRaise && level < RULES.MAX_LEVEL) {
      return { level: level + 1, easyStreak: 0, hardStreak: 0, changed: 1 };
    }
    return { level, easyStreak: Math.min(streak, RULES.EASY_TO_LEVEL_UP), hardStreak: 0, changed: 0 };
  }
  if (feel === "hard") {
    const next = Math.max(1, level - 1);
    return { level: next, easyStreak: 0, hardStreak: hardStreak + 1, changed: next === level ? 0 : -1 };
  }
  return { level, easyStreak: 0, hardStreak: 0, changed: 0 };
}

/* ---------- step building ---------- */
export function tierOf(level) {
  return level <= 2 ? 0 : level <= 4 ? 1 : 2;
}

function prep(ex, label = null) {
  return { phase: "prep", ex, sec: PREP_SEC, label };
}

/** Timed items one after another, each preceded by 10 s to get into position. */
function flowSteps(items, phase) {
  return items.flatMap(([ex, sec, label], i) => [prep(ex, label), { phase, ex, sec, label, idx: i, count: items.length }]);
}

/** Circuit: get ready → work/rest × exercises × rounds, with a longer break between rounds. */
function circuitSteps(list, work, rest, rounds) {
  const steps = [{ ...prep(list[0]), round: 1, rounds, idx: 0, count: list.length }];
  for (let r = 1; r <= rounds; r += 1) {
    list.forEach((ex, i) => {
      steps.push({ phase: "work", ex, sec: work, round: r, rounds, idx: i, count: list.length });
      const last = r === rounds && i === list.length - 1;
      if (last) return;
      const roundBreak = i === list.length - 1;
      const nextIdx = roundBreak ? 0 : i + 1;
      const moves = EXERCISES[ex].pos !== EXERCISES[list[nextIdx]].pos;
      const sec = roundBreak ? ROUND_REST_SEC : moves ? Math.max(rest, POS_CHANGE_REST_SEC) : rest;
      steps.push({ phase: "rest", ex: list[nextIdx], sec, roundBreak, round: roundBreak ? r + 1 : r, rounds, idx: nextIdx, count: list.length });
    });
  }
  return steps;
}

export function buildSession(kind, type, level, rounds) {
  if (kind === "light") return { kind, type: null, level, steps: flowSteps(LIGHT_FLOW, "flow") };
  if (kind === "chin") return { kind, type: null, level, steps: flowSteps(CHIN_FLOW, "flow") };
  if (kind === "morning") return { kind, type: null, level, steps: flowSteps(MORNING_FLOW, "flow") };
  if (kind === "stand") {
    const steps = [...flowSteps(STAND_WARM, "warm"), ...circuitSteps(STAND_LIST, STAND_SHAPE.work, STAND_SHAPE.rest, STAND_SHAPE.rounds), ...flowSteps([["breathe", 60]], "cool")];
    return { kind, type: null, level, steps };
  }
  const lv = LEVELS[level - 1];
  const list = WORKOUTS[type].list;
  if (kind === "short") {
    const r = Math.min(rounds, RULES.SHORT_ROUNDS);
    return { kind, type, level, steps: [...flowSteps(WARMUP, "warm"), ...circuitSteps(list, lv.work, lv.rest, r), ...flowSteps(COOLDOWN.slice(-2), "cool")] };
  }
  return { kind, type, level, steps: [...flowSteps(WARMUP, "warm"), ...circuitSteps(list, lv.work, lv.rest, rounds), ...flowSteps(COOLDOWN, "cool")] };
}

export function stepMet(step, session) {
  if (step.phase !== "work") return MET[step.phase] ?? MET.rest;
  return MET.work[session.kind === "stand" ? "stand" : session.type];
}

export function sessionTotals(session, weight, spentMs = null) {
  let seconds = 0;
  let kcal = 0;
  let workDone = 0;
  let workTotal = 0;
  session.steps.forEach((step, i) => {
    const sec = spentMs ? (spentMs[i] || 0) / 1000 : step.sec;
    seconds += sec;
    kcal += (stepMet(step, session) * weight * sec) / 3600;
    if (step.phase === "work" || step.phase === "flow") { workDone += sec; workTotal += step.sec; }
  });
  return { seconds, kcal, ratio: workTotal ? workDone / workTotal : 0, workSeconds: workDone };
}

export function sessionExercises(session) {
  const phases = ["light", "morning", "chin"].includes(session.kind) ? ["flow"] : ["work"];
  return [...new Set(session.steps.filter((s) => phases.includes(s.phase)).map((s) => s.ex))];
}
