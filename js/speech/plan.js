// What today's speech session contains, and when a word counts as part of the active vocabulary.
import { pickDaily } from "../neg/srs.js";
import { WORDS, PARAPHRASE, CLEANUP, PROMPTS } from "./content.js";

/** Beautiful and literary words first; plain business words most people already use come after them. */
export const FIRST_TOPICS = ["beauty", "literary", "wings", "verbs2", "idioms", "rare", "links", "soul"];
export const LATER_TOPICS = ["strong", "verbs", "eval", "ideas", "deal", "people"];

/** Topics take turns so a session mixes an epithet, an image and a verb instead of 25 of one kind in a row. */
function alternate(topics) {
  const lists = topics.map((t) => WORDS.filter((w) => w.topic === t));
  const longest = Math.max(0, ...lists.map((l) => l.length));
  return Array.from({ length: longest }, (_, n) => lists.map((l) => l[n]).filter(Boolean)).flat();
}
export const ORDER = [...alternate(FIRST_TOPICS), ...alternate(LATER_TOPICS)].map((w) => `w:${w.id}`);
/** «Уже использую»: a known word skips learning and comes back for a check in two weeks. */
export const KNOWN_CARD = Object.freeze({ box: 4, days: 14 });
export const DAILY = Object.freeze({ total: 7, newPerDay: 3 });
/** A word is «active» once it was said in an improvisation on this many different days. */
export const ACTIVE_DAYS = 3;
const TARGETS = 3;

const wordId = (cardId) => cardId.slice(2);
const pick = (list, n) => list[n % list.length];

/** Improvisation words: today's new ones first, then the weakest reviews. */
function targetsFor(wordIds, cards) {
  const fresh = wordIds.filter((id) => !cards[id]);
  const seen = wordIds.filter((id) => cards[id]).sort((a, b) => cards[a].box - cards[b].box);
  return [...fresh, ...seen].slice(0, TARGETS).map(wordId);
}

/** done = number of finished sessions; it rotates the paraphrase, cleanup and improvisation topic. */
export function planSession(cards, today, done) {
  const wordIds = pickDaily(ORDER, cards, today, DAILY);
  return {
    wordIds,
    paraphrase: pick(PARAPHRASE, done),
    cleanup: pick(CLEANUP, done),
    prompt: pick(PROMPTS, done),
    targets: targetsFor(wordIds, cards),
  };
}

/** Free improvisation: a random topic and the learned words that are furthest from active. */
export function freePlan(cards, active) {
  const seen = ORDER.filter((id) => cards[id]).map(wordId);
  const targets = seen
    .map((id) => [(active[id]?.length || 0) + Math.random() * 0.5, id])
    .sort((a, b) => a[0] - b[0])
    .slice(0, TARGETS)
    .map(([, id]) => id);
  return { prompt: PROMPTS[Math.floor(Math.random() * PROMPTS.length)], targets };
}

export function recordUses(active, ids, today) {
  const next = { ...active };
  ids.forEach((id) => {
    const days = [...new Set([...(next[id] || []), today])].sort();
    next[id] = days.slice(-ACTIVE_DAYS);
  });
  return next;
}

export const activeIds = (active) => Object.keys(active).filter((id) => active[id].length >= ACTIVE_DAYS);
