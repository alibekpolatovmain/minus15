// On-device storage for «Речь»: word cards, days each word was said, streak and session log. Own key, not in the sport backup.
import { INTERVALS } from "../neg/srs.js";

const KEY = "minus15:speech:v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CARD_ID_RE = /^w:[a-z0-9-]{1,40}$/;
const WORD_ID_RE = /^[a-z0-9-]{1,40}$/;
const MAX_LOG = 400;

const date = (v) => (typeof v === "string" && DATE_RE.test(v) ? v : null);
const count = (v) => Math.max(0, Math.round(Number(v) || 0));

function cleanCard(c) {
  const box = Math.round(Number(c?.box));
  if (!Number.isFinite(box) || !date(c?.due)) return null;
  return { box: Math.min(INTERVALS.length - 1, Math.max(0, box)), due: c.due, right: count(c.right), wrong: count(c.wrong) };
}

export const DEFAULTS = Object.freeze({ version: 1, cards: {}, active: {}, streak: null, sessions: 0, log: [] });

function cleanLog(l) {
  if (!date(l?.date)) return null;
  const seconds = count(l.seconds);
  return { date: l.date, words: count(l.words), fillers: count(l.fillers), seconds: seconds || null, used: count(l.used), target: count(l.target) };
}

export function validate(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS, cards: {}, active: {}, log: [] };
  const cards = {};
  Object.entries(raw.cards || {}).forEach(([id, c]) => {
    const card = CARD_ID_RE.test(id) ? cleanCard(c) : null;
    if (card) cards[id] = card;
  });
  const active = {};
  Object.entries(raw.active || {}).forEach(([id, days]) => {
    const clean = Array.isArray(days) ? [...new Set(days.map(date).filter(Boolean))].sort() : [];
    if (WORD_ID_RE.test(id) && clean.length) active[id] = clean;
  });
  const streak = date(raw.streak?.last) ? { last: raw.streak.last, days: Math.max(1, count(raw.streak.days)) } : null;
  const log = (Array.isArray(raw.log) ? raw.log : []).map(cleanLog).filter(Boolean).slice(-MAX_LOG);
  return { version: 1, cards, active, streak, sessions: count(raw.sessions), log };
}

export function load() {
  try {
    return validate(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch (err) {
    console.error("Speech data unreadable, starting empty", err);
    return validate(null);
  }
}

export function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch (err) {
    console.error("Speech data save failed", err);
    return false;
  }
}
