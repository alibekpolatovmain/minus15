// On-device storage for «Английский»: card progress, own associations, streak and settings. Own key, like «Переговоры».
import { INTERVALS, PACE_OPTIONS, DEFAULT_PACE } from "./srs.js";

const KEY = "minus15:eng:v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CARD_ID_RE = /^[rp]:[a-z0-9-]{1,40}$/;
const WORD_ID_RE = /^[a-z0-9-]{1,40}$/;
const MAX_NOTE = 300;
const MAX_LOG = 400;

const date = (v) => (typeof v === "string" && DATE_RE.test(v) ? v : null);
const count = (v) => Math.max(0, Math.round(Number(v) || 0));

export const DEFAULTS = Object.freeze({ version: 1, cards: {}, notes: {}, streak: null, log: [], pace: DEFAULT_PACE, audio: true });

export function cleanCard(c) {
  const box = Math.round(Number(c?.box));
  if (!Number.isFinite(box) || !date(c?.due)) return null;
  return {
    box: Math.min(INTERVALS.length - 1, Math.max(0, box)),
    due: c.due,
    right: count(c.right),
    wrong: count(c.wrong),
    first: date(c.first) || c.due,
  };
}

function cleanMap(raw, keyRe, clean) {
  const out = {};
  Object.entries(raw && typeof raw === "object" ? raw : {}).forEach(([k, v]) => {
    const value = keyRe.test(k) ? clean(v) : null;
    if (value) out[k] = value;
  });
  return out;
}

export function validate(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    version: 1,
    cards: cleanMap(src.cards, CARD_ID_RE, cleanCard),
    notes: cleanMap(src.notes, WORD_ID_RE, (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_NOTE) : null)),
    streak: date(src.streak?.last) ? { last: src.streak.last, days: Math.max(1, count(src.streak.days)) } : null,
    log: (Array.isArray(src.log) ? src.log : [])
      .filter((l) => date(l?.date))
      .map((l) => ({ date: l.date, fresh: count(l.fresh), reviews: count(l.reviews), right: count(l.right) }))
      .slice(-MAX_LOG),
    pace: PACE_OPTIONS.includes(src.pace) ? src.pace : DEFAULT_PACE,
    audio: src.audio !== false,
  };
}

export function load() {
  try {
    return validate(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch (err) {
    console.error("English data unreadable, starting empty", err);
    return validate(null);
  }
}

export function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch (err) {
    console.error("English data save failed", err);
    return false;
  }
}

export function reset() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.error("English data reset failed", err);
  }
  return validate(null);
}
