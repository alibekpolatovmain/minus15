import { test } from "node:test";
import assert from "node:assert/strict";
import { grade, introduced, alreadyKnown, planDay, newQuota, coverage, streakAfter, streakNow, GRADE, INTERVALS, KNOWN_BOX } from "../js/eng/srs.js";
import { validate } from "../js/eng/store.js";
import { WORDS, PACKS, slug } from "../js/eng/words.js";
import { startFrom, courseOrder, testSample, knownEstimate, shouldContinue, TEST_PER_LEVEL } from "../js/eng/levels.js";

const T = "2026-11-03";

test("knowing a due word moves it up a box and schedules it further out", () => {
  const card = grade({ box: 1, due: T, right: 1, wrong: 0, first: "2026-11-02" }, GRADE.good, T);
  assert.equal(card.box, 2);
  assert.equal(card.due, `2026-11-0${3 + INTERVALS[2]}`);
  assert.equal(card.right, 2);
});

test("forgetting drops the word two boxes, not back to zero", () => {
  const card = grade({ box: 5, due: T, right: 5, wrong: 0, first: "2026-09-01" }, GRADE.forgot, T);
  assert.equal(card.box, 3);
  assert.equal(card.due, "2026-11-04");
  assert.equal(card.wrong, 1);
});

test("«с трудом» keeps the box and repeats it at the same interval", () => {
  const card = grade({ box: 3, due: T, right: 3, wrong: 0, first: "2026-10-01" }, GRADE.hard, T);
  assert.equal(card.box, 3);
  assert.equal(card.due, "2026-11-10");
});

test("knowing a word before it is due does not move it", () => {
  const card = grade({ box: 2, due: "2026-11-06", right: 2, wrong: 0, first: "2026-11-01" }, GRADE.good, T);
  assert.equal(card.box, 2);
  assert.equal(card.due, "2026-11-06");
});

test("a new word met and checked comes back tomorrow; «Уже знаю» comes back in a week", () => {
  assert.deepEqual(introduced(true, T), { box: 1, due: "2026-11-04", right: 1, wrong: 0, first: T });
  assert.equal(introduced(false, T).box, 0);
  assert.equal(alreadyKnown(T).box, KNOWN_BOX);
  assert.equal(alreadyKnown(T).due, "2026-11-10");
});

test("daily plan: due reviews first, then the pace of new words minus those met today", () => {
  const order = ["a", "b", "c", "d", "e", "f"];
  const cards = { "r:a": { box: 1, due: "2026-11-02", first: "2026-11-01" }, "r:b": { box: 1, due: "2026-11-04", first: T } };
  const p = planDay(order, cards, T, 3);
  assert.deepEqual(p.reviews, ["r:a"]);
  assert.deepEqual(p.fresh, ["c", "d"]);
  assert.deepEqual(p.prod, []);
});

test("the «say it» card unlocks once a word is recognised twice", () => {
  const cards = { "r:a": { box: 2, due: "2026-11-05", first: "2026-10-30" } };
  assert.deepEqual(planDay(["a", "b"], cards, T, 5).prod, ["a"]);
});

test("a review backlog slows new words, then pauses them", () => {
  assert.equal(newQuota(10, 10), 10);
  assert.equal(newQuota(10, 60), 5);
  assert.equal(newQuota(10, 90), 0);
});

test("coverage follows the frequency curve: first 100 words ≈ half of speech, all 1000 ≈ 84%", () => {
  const ranks = (n) => Array.from({ length: n }, (_, i) => i + 1);
  assert.ok(Math.abs(coverage(ranks(100), 1000) - 0.5) < 0.04);
  assert.ok(Math.abs(coverage(ranks(1000), 1000) - 0.84) < 1e-9);
  assert.equal(coverage([], 1000), 0);
});

test("the streak survives one missed day but not two", () => {
  const s = streakAfter({ last: "2026-11-01", days: 4 }, T);
  assert.equal(s.days, 5);
  assert.equal(streakAfter({ last: "2026-10-31", days: 4 }, T).days, 1);
  assert.equal(streakNow({ last: "2026-10-31", days: 4 }, T), 0);
});

test("stored data is cleaned: bad ids, dates and settings are dropped", () => {
  const db = validate({ cards: { "r:coffee": { box: 9, due: T }, "x:bad": { box: 1, due: T }, "p:tea": { box: 1, due: "nope" } }, pace: 7, audio: false, notes: { coffee: "  кофта  ", "Bad Id": "x" } });
  assert.deepEqual(Object.keys(db.cards), ["r:coffee"]);
  assert.equal(db.cards["r:coffee"].box, INTERVALS.length - 1);
  assert.equal(db.pace, 10);
  assert.equal(db.audio, false);
  assert.deepEqual(db.notes, { coffee: "кофта" });
});

test("slug makes stable storage ids", () => {
  assert.equal(slug("thank you"), "thank-you");
  assert.equal(slug("I'm"), "im");
});

test("the course: 1000 base words in packs of 10, level packs of 5–12, all unique, each with a translation, hint and phrase", () => {
  assert.equal(WORDS.filter((w) => w.base).length, 1000);
  assert.equal(new Set(WORDS.map((w) => w.id)).size, WORDS.length);
  assert.ok(PACKS.filter((p) => !p.lv).every((p) => p.size === 10 && p.title));
  assert.ok(PACKS.filter((p) => p.lv).every((p) => p.size >= 5 && p.size <= 12 && p.title));
  assert.ok(WORDS.every((w) => ["A1", "A2", "B1", "B2", "C1"].includes(w.lv)));
  const broken = WORDS.filter((w) => !w.id || !w.ru || !w.tr || !w.e || !w.ex || !w.exRu);
  assert.deepEqual(broken.map((w) => w.en), []);
});

test("the course starts at the first level not passed in the test", () => {
  assert.equal(startFrom({ A1: 6, A2: 5, B1: 3 }), "B1");
  assert.equal(startFrom({ A1: 4 }), "A1");
  assert.equal(startFrom({ A1: 6, A2: 6, B1: 6, B2: 5, C1: 6 }), "C1");
  assert.equal(shouldContinue(2), false);
});

test("words below the start level leave the course order", () => {
  const words = [{ id: "a", lv: "A1" }, { id: "b", lv: "B1" }, { id: "c", lv: "A2" }, { id: "d", lv: "C1" }];
  assert.deepEqual(courseOrder(words, "B1"), ["b", "d"]);
  assert.deepEqual(courseOrder(words, null), ["a", "b", "c", "d"]);
});

test("the test takes six words of every level and estimates known words by level", () => {
  const sample = testSample(WORDS);
  const levels = [...new Set(WORDS.map((w) => w.lv))];
  assert.equal(sample.length, levels.length * TEST_PER_LEVEL);
  const a1 = WORDS.filter((w) => w.lv === "A1").length;
  assert.equal(knownEstimate({ A1: 6 }, WORDS), a1);
});

test("words marked known today do not use up the new-word quota", () => {
  const cards = { "r:a": { box: 3, due: "2026-11-10", first: T }, "r:b": { box: 1, due: "2026-11-04", first: T } };
  assert.deepEqual(planDay(["a", "b", "c", "d"], cards, T, 2).fresh, ["c"]);
});
