// On-device storage for «Переговоры»: drill progress, streak and deal preparations. Separate key from the workout diary.
import { INTERVALS } from "./srs.js";

const KEY = "minus15:neg:v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CARD_ID_RE = /^[st]:[\w-]{1,40}$/;
const MAX_DEALS = 200;
const MAX_TEXT = 2000;
const MAX_NUMBER = 1e13;

/** Text fields of one deal preparation, in wizard order. Numbers live in DEAL_NUMBERS. */
export const DEAL_TEXTS = [
  "title", "who", "unit", "batna", "batnaUp", "theirInterests", "myInterests", "theirBatna", "anchorWhy",
  "cheapForMe", "askBack", "meso1", "meso2", "meso3", "audit", "questions", "walkLine", "nextStep",
  "outcome", "worked", "change"
];
export const DEAL_NUMBERS = ["target", "walk", "theirs", "anchor", "result"];

const date = (v) => (typeof v === "string" && DATE_RE.test(v) ? v : null);
const text = (v) => (typeof v === "string" ? v.slice(0, MAX_TEXT) : "");
const amount = (v) => {
  if (v === null || v === undefined) return null;
  const raw = typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) && n >= 0 && n <= MAX_NUMBER ? n : null;
};

export const DEFAULTS = Object.freeze({ version: 1, cards: {}, streak: null, deals: [], log: [] });

function cleanCard(c) {
  const box = Math.round(Number(c?.box));
  if (!Number.isFinite(box) || !date(c?.due)) return null;
  return { box: Math.min(INTERVALS.length - 1, Math.max(0, box)), due: c.due, right: Math.max(0, Number(c.right) || 0), wrong: Math.max(0, Number(c.wrong) || 0) };
}

export function cleanDeal(d) {
  if (!d || typeof d !== "object" || typeof d.title !== "string") return null;
  const deal = {
    id: typeof d.id === "string" ? d.id.slice(0, 40) : `d${Date.now().toString(36)}`,
    side: d.side === "buy" ? "buy" : "sell",
    date: date(d.date),
    created: date(d.created),
    rating: [1, 2, 3, 4, 5].includes(d.rating) ? d.rating : null,
  };
  DEAL_TEXTS.forEach((k) => { deal[k] = text(d[k]); });
  DEAL_NUMBERS.forEach((k) => { deal[k] = amount(d[k]); });
  return deal;
}

export function validate(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS, cards: {}, deals: [], log: [] };
  const cards = {};
  Object.entries(raw.cards || {}).forEach(([id, c]) => {
    const card = CARD_ID_RE.test(id) ? cleanCard(c) : null;
    if (card) cards[id] = card;
  });
  const streak = date(raw.streak?.last) ? { last: raw.streak.last, days: Math.max(1, Math.round(Number(raw.streak.days) || 1)) } : null;
  const log = (Array.isArray(raw.log) ? raw.log : [])
    .filter((l) => date(l?.date))
    .map((l) => ({ date: l.date, right: Math.max(0, Number(l.right) || 0), total: Math.max(0, Number(l.total) || 0) }))
    .slice(-400);
  return {
    version: 1,
    cards,
    streak,
    deals: (Array.isArray(raw.deals) ? raw.deals : []).map(cleanDeal).filter(Boolean).slice(-MAX_DEALS),
    log,
  };
}

export function load() {
  try {
    return validate(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch (err) {
    console.error("Negotiation data unreadable, starting empty", err);
    return validate(null);
  }
}

export function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch (err) {
    console.error("Negotiation data save failed", err);
    return false;
  }
}
