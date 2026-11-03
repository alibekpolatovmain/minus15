// Spaced repetition for English words: Leitner boxes with expanding intervals, two cards per word.
// «r:word» = recognition (hear/see English → meaning), «p:word» = production (Russian → say English aloud).
import { addDays } from "../plan.js";

/** Days until the next showing, by box. Box 0 = forgotten (back tomorrow). */
export const INTERVALS = [1, 1, 3, 7, 16, 35, 90, 180];
const LAST_BOX = INTERVALS.length - 1;
/** «Уже знаю» on the first showing puts the word here: next check in a week. */
export const KNOWN_BOX = 3;
/** Production card unlocks once the word was recognised on two different days. */
export const PROD_BOX = 2;
/** A word counts toward «% слов в речи» from this box: right at least twice with a gap. */
export const COUNTED_BOX = 2;

export const GRADE = Object.freeze({ forgot: 0, hard: 1, good: 2 });
export const PACE_OPTIONS = [5, 10, 15, 20];
export const DEFAULT_PACE = 10;
const REVIEW_CAP = 40;
const PROD_PER_DAY = 5;
// Review debt kills the habit: with a big backlog new words slow down, then pause.
const SLOW_AT = 50;
const SLOW_PACE = 5;
const PAUSE_AT = 80;
// Share of everyday speech covered by the first 1000 frequent words (Nation 2006: 1000 families ≈ 82–84 %).
const COVERAGE_AT_LIST_END = 0.84;
// Zipf–Mandelbrot shift: with it the first 10/100/1000 words give ≈ 21 %/50 %/84 %, close to corpus counts.
const ZIPF_SHIFT = 2.7;

export const recId = (wid) => `r:${wid}`;
export const prodId = (wid) => `p:${wid}`;
export const wordOf = (cid) => cid.slice(2);

/** Grades a card. Extra practice on a card not yet due never moves it, so cramming is not mastery. */
export function grade(card, g, today) {
  const prev = card || { box: 0, right: 0, wrong: 0, first: today };
  const base = { right: (prev.right || 0) + (g === GRADE.forgot ? 0 : 1), wrong: (prev.wrong || 0) + (g === GRADE.forgot ? 1 : 0), first: prev.first || today };
  if (card && card.due > today && g !== GRADE.forgot) return { ...prev, ...base };
  const box = g === GRADE.good ? Math.min(LAST_BOX, prev.box + 1) : g === GRADE.hard ? prev.box : Math.max(0, prev.box - 2);
  // Forgotten words drop two boxes but come back tomorrow, while the slip is fresh.
  return { ...base, box, due: addDays(today, g === GRADE.forgot ? INTERVALS[0] : INTERVALS[box]) };
}

/** First showing answered right: the word is in, see you tomorrow. Wrong first: box 0, also tomorrow. */
export const introduced = (ok, today) => ({ box: ok ? 1 : 0, due: addDays(today, 1), right: ok ? 1 : 0, wrong: ok ? 0 : 1, first: today });
export const alreadyKnown = (today) => ({ box: KNOWN_BOX, due: addDays(today, INTERVALS[KNOWN_BOX]), right: 1, wrong: 0, first: today });

const isDue = (card, today) => Boolean(card && card.due <= today);

/** New words allowed today: the chosen pace, slowed down or paused when reviews pile up. */
export function newQuota(pace, dueCount) {
  if (dueCount > PAUSE_AT) return 0;
  return dueCount > SLOW_AT ? Math.min(pace, SLOW_PACE) : pace;
}

/**
 * Today's plan over the word order (ids in learning order):
 * reviews = due cards (oldest, then weakest first), prod = words whose «say it» card just unlocked, fresh = new words.
 */
export function planDay(order, cards, today, pace = DEFAULT_PACE) {
  const ids = order.flatMap((w) => [recId(w), prodId(w)]);
  const due = ids
    .filter((id) => isDue(cards[id], today))
    .sort((a, b) => (cards[a].due === cards[b].due ? cards[a].box - cards[b].box : cards[a].due < cards[b].due ? -1 : 1));
  const prodToday = order.filter((w) => cards[prodId(w)]?.first === today).length;
  const prod = order
    .filter((w) => !cards[prodId(w)] && (cards[recId(w)]?.box ?? -1) >= PROD_BOX)
    .slice(0, Math.max(0, PROD_PER_DAY - prodToday));
  const metToday = order.filter((w) => cards[recId(w)]?.first === today).length;
  const fresh = order.filter((w) => !cards[recId(w)]).slice(0, Math.max(0, newQuota(pace, due.length) - metToday));
  return { reviews: due.slice(0, REVIEW_CAP), prod, fresh, backlog: due.length };
}

export const isLearned = (card) => Boolean(card && card.box >= 1);
export const isCounted = (card) => Boolean(card && card.box >= COUNTED_BOX);

/** Frequency-weighted share of everyday speech the known words cover. ranks are 1-based positions in the list. */
export function coverage(knownRanks, listSize) {
  const w = (r) => 1 / (r + ZIPF_SHIFT);
  let total = 0;
  for (let r = 1; r <= listSize; r++) total += w(r);
  const known = knownRanks.reduce((s, r) => s + w(r), 0);
  return total ? (COVERAGE_AT_LIST_END * known) / total : 0;
}

/** Streak survives one missed day: a busy day does not wipe a month of work. */
export function streakAfter(streak, today) {
  if (streak?.last === today) return streak;
  const alive = streak && streak.last >= addDays(today, -2);
  return { last: today, days: alive ? streak.days + 1 : 1 };
}

export const streakNow = (streak, today) => (streak && streak.last >= addDays(today, -2) ? streak.days : 0);
