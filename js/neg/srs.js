// Spaced repetition (Leitner boxes) for negotiation drills: what to show today and when to show it again.
import { addDays } from "../plan.js";

/** Days until the next showing, by box. Box 0 = new or forgotten. */
export const INTERVALS = [1, 1, 3, 7, 14, 30];
const LAST_BOX = INTERVALS.length - 1;
const MASTERED_BOX = 3;

export const DAILY = Object.freeze({ total: 7, newPerDay: 4 });

/** Right moves a due card up a box; right before it is due (extra practice) keeps box and date, so cramming is not mastery. */
export function review(card, right, today) {
  const prev = card || { box: 0, right: 0, wrong: 0 };
  const early = right && card && card.due > today;
  const box = early ? prev.box : right ? Math.min(LAST_BOX, prev.box + 1) : 0;
  return {
    box,
    due: early ? prev.due : addDays(today, INTERVALS[box]),
    right: (prev.right || 0) + (right ? 1 : 0),
    wrong: (prev.wrong || 0) + (right ? 0 : 1),
  };
}

const isDue = (card, today) => card && card.due <= today;

/** Overdue and due cards first (oldest, then weakest), then new cards in curriculum order. */
export function pickDaily(order, cards, today, { total, newPerDay } = DAILY) {
  const due = order
    .filter((id) => isDue(cards[id], today))
    .sort((a, b) => (cards[a].due === cards[b].due ? cards[a].box - cards[b].box : cards[a].due < cards[b].due ? -1 : 1));
  const fresh = order.filter((id) => !cards[id]);
  // A card first answered today has one answer and is due tomorrow; it uses up today's new-card allowance.
  const tomorrow = addDays(today, 1);
  const metToday = order.filter((id) => cards[id] && cards[id].right + cards[id].wrong === 1 && cards[id].due === tomorrow).length;
  const reviews = due.slice(0, total);
  return [...reviews, ...fresh.slice(0, Math.max(0, Math.min(newPerDay - metToday, total - reviews.length)))];
}

/** Lesson order: each technique card comes right before the first scenario that uses it. */
export function curriculum(scenarios) {
  const met = new Set();
  return scenarios.flatMap((s) => {
    const intro = s.tech.filter((t) => !met.has(t)).map((t) => { met.add(t); return `t:${t}`; });
    return [...intro, `s:${s.id}`];
  });
}

export const isMastered = (card) => Boolean(card && card.box >= MASTERED_BOX);

export function streakAfter(streak, today) {
  if (streak?.last === today) return streak;
  const days = streak?.last === addDays(today, -1) ? streak.days + 1 : 1;
  return { last: today, days };
}
