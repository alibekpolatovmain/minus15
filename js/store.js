// On-device database (localStorage) with validation, migration-safe defaults and file backup.
import { RULES } from "./plan.js";

const KEY = "minus15:db:v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["A", "B", "C", "short", "light", "stand", "morning", "chin"]);
const FEELS = new Set(["easy", "ok", "hard", null]);

export const DEFAULTS = Object.freeze({
  version: 1,
  startDate: null,
  startWeight: 90,
  goalLoss: 15,
  level: 2,
  easyStreak: 0,
  hardStreak: 0,
  sound: true,
  seen: {},
  sessions: [],
  days: {},
  weights: [],
  weightSnooze: null,
  homeHintShown: false
});

const num = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const date = (v) => (typeof v === "string" && DATE_RE.test(v) ? v : null);

function cleanSession(s) {
  if (!s || !date(s.date) || !KINDS.has(s.kind)) return null;
  return {
    id: typeof s.id === "string" ? s.id.slice(0, 40) : `${s.date}-${Math.random().toString(36).slice(2, 8)}`,
    date: s.date,
    time: typeof s.time === "string" ? s.time.slice(0, 5) : "",
    kind: s.kind,
    type: ["A", "B", "C"].includes(s.type) ? s.type : null,
    level: Math.round(num(s.level, 1, RULES.MAX_LEVEL, 2)),
    minutes: Math.round(num(s.minutes, 0, 300, 0)),
    kcal: Math.round(num(s.kcal, 0, 3000, 0)),
    feel: FEELS.has(s.feel) ? s.feel : null,
    partial: s.partial === true
  };
}

function cleanDay(d) {
  return { km: num(d?.km, 0, 80, 0), morning: d?.morning === true, cold: d?.cold === true, chin: d?.chin === true };
}

export function validate(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  const days = {};
  Object.entries(raw.days || {}).forEach(([k, v]) => { if (date(k)) days[k] = cleanDay(v); });
  const seen = {};
  Object.entries(raw.seen || {}).forEach(([k, v]) => { if (/^[\w:]{1,40}$/.test(k)) seen[k] = Math.round(num(v, 0, 1000, 0)); });
  return {
    version: 1,
    startDate: date(raw.startDate),
    startWeight: num(raw.startWeight, 40, 250, DEFAULTS.startWeight),
    goalLoss: num(raw.goalLoss, 1, 80, DEFAULTS.goalLoss),
    level: Math.round(num(raw.level, 1, RULES.MAX_LEVEL, DEFAULTS.level)),
    easyStreak: Math.round(num(raw.easyStreak, 0, 10, 0)),
    hardStreak: Math.round(num(raw.hardStreak, 0, 10, 0)),
    sound: raw.sound !== false,
    seen,
    sessions: (Array.isArray(raw.sessions) ? raw.sessions : []).map(cleanSession).filter(Boolean).slice(-2000),
    days,
    weights: (Array.isArray(raw.weights) ? raw.weights : [])
      .filter((w) => date(w?.date) && Number.isFinite(Number(w.kg)))
      .map((w) => ({ date: w.date, kg: num(w.kg, 40, 250, 90) }))
      .slice(-1000),
    weightSnooze: date(raw.weightSnooze),
    homeHintShown: raw.homeHintShown === true
  };
}

export function load() {
  try {
    return validate(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch (err) {
    console.error("Database unreadable, starting empty", err);
    return { ...DEFAULTS };
  }
}

export function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch (err) {
    console.error("Database save failed", err);
    return false;
  }
}

export function exportFile(db) {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  return new File([blob], `minus15-${stamp}.json`, { type: "application/json" });
}

export async function importFile(file) {
  const text = await file.text();
  const raw = JSON.parse(text);
  if (!raw || raw.version !== 1 || !Array.isArray(raw.sessions)) throw new Error("not-a-backup");
  return validate(raw);
}
