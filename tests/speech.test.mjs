import { test } from "node:test";
import assert from "node:assert/strict";
import { tokens, fillerCounts, usedWordIds, overused, speechStats, blankOut } from "../js/speech/analyze.js";
import { planSession, recordUses, activeIds, ACTIVE_DAYS, ORDER } from "../js/speech/plan.js";
import { validate } from "../js/speech/store.js";
import { TOPICS, WORDS, PARAPHRASE, CLEANUP, PROMPTS } from "../js/speech/content.js";

const T = "2026-11-03";
const W = (id, stems) => ({ id, stems });

test("tokens are lowercase, ё becomes е, punctuation and hyphens split words", () => {
  assert.deepEqual(tokens("Ну, ЁЛКИ-палки! Всё."), ["ну", "елки", "палки", "все"]);
  assert.deepEqual(tokens("  "), []);
});

test("fillers are counted as whole words and phrases, most frequent first", () => {
  const counts = fillerCounts("Ну короче, мы как бы готовы. Ну вот. В общем-то всё. Нужно новое решение.");
  assert.deepEqual(counts, [
    { word: "ну", n: 2 }, { word: "короче", n: 1 }, { word: "как бы", n: 1 }, { word: "вот", n: 1 }, { word: "в общем", n: 1 },
  ]);
});

test("a word counts as used in any grammatical form when every stem matches", () => {
  const words = [W("obosn", ["обосн"]), W("kamen", ["краеугольн"]), W("palka", ["палк", "концах"]), W("never", ["нивелир"])];
  const ids = usedWordIds("Я обосную цену. Это краеугольного значения вопрос, палка о двух концах? Нет, о трёх концах.", words);
  assert.deepEqual(ids, ["obosn", "kamen", "palka"]);
});

test("an expression counts only when its words come in order and close together", () => {
  const words = [
    { id: "pri", word: "при этом", stems: ["при", "этом"] },
    { id: "mesto", word: "узкое место", stems: ["узко", "мест"] },
    { id: "igra", word: "игра стоит свеч", stems: ["игра", "стоит", "свеч"] },
  ];
  assert.deepEqual(usedWordIds("В этом году мы на месте, а узкий круг ждёт.", words), []);
  assert.deepEqual(usedWordIds("Цена выше, при этом срок короче. Игра явно не стоит свеч? Узкое место — склад.", words), ["pri", "mesto", "igra"]);
});

test("a stem only matches the start of a word", () => {
  assert.deepEqual(usedWordIds("необоснованно", [W("obosn", ["обосн"])]), []);
});

test("overused words are reported from two uses with replacements to try", () => {
  const list = overused("Это очень важно и очень срочно. Сделаем хорошо, сделаем быстро.");
  assert.deepEqual(list.map((o) => [o.word, o.n]), [["очень", 2], ["сделать", 2]]);
  assert.ok(list[0].alt.length >= 3);
});

test("speech stats give fillers per 100 words, pace and variety", () => {
  const s = speechStats("ну мы готовы ну начать ну завтра утром рано мы", 30);
  assert.equal(s.words, 10);
  assert.equal(s.fillers, 3);
  assert.equal(s.per100, 30);
  assert.equal(s.wpm, 20);
  assert.equal(s.variety, 70);
});

test("pace is unknown when the length of the speech is unknown", () => {
  assert.equal(speechStats("мы готовы", null).wpm, null);
  assert.equal(speechStats("", 60).per100, 0);
});

test("example sentences can hide the word being recalled", () => {
  assert.equal(blankOut("Предлагаю инициировать пилот, его инициирует Аня.", ["инициир"]), "Предлагаю ______ пилот, его ______ Аня.");
});

test("a session has today's words, one paraphrase, one cleanup and an improvisation on up to three words", () => {
  const p = planSession({}, T, 0);
  assert.deepEqual(p.wordIds, ORDER.slice(0, 3));
  assert.equal(p.paraphrase, PARAPHRASE[0]);
  assert.equal(p.cleanup, CLEANUP[0]);
  assert.equal(p.prompt, PROMPTS[0]);
  assert.deepEqual(p.targets, p.wordIds.map((id) => id.slice(2)));
});

test("new words alternate between topics and every word is in the order once", () => {
  const topic = (id) => WORDS.find((w) => `w:${w.id}` === id).topic;
  assert.equal(new Set(ORDER.slice(0, TOPICS.length).map(topic)).size, TOPICS.length);
  assert.equal(new Set(ORDER).size, WORDS.length);
});

test("drills rotate with the number of finished sessions", () => {
  const p = planSession({}, T, PARAPHRASE.length + 1);
  assert.equal(p.paraphrase, PARAPHRASE[1]);
});

test("due words come back for review before new ones", () => {
  const due = `w:${WORDS[10].id}`;
  const p = planSession({ [due]: { box: 2, due: "2026-11-01", right: 2, wrong: 0 } }, T, 0);
  assert.equal(p.wordIds[0], due);
});

test("a word becomes active after being said on three different days", () => {
  let active = {};
  active = recordUses(active, ["a"], "2026-11-01");
  active = recordUses(active, ["a"], "2026-11-01");
  active = recordUses(active, ["a", "b"], "2026-11-02");
  assert.deepEqual(activeIds(active), []);
  const next = recordUses(active, ["a"], "2026-11-05");
  assert.deepEqual(activeIds(next), ["a"]);
  assert.equal(next.a.length, ACTIVE_DAYS);
  assert.deepEqual(active.a, ["2026-11-01", "2026-11-02"], "the old object is not changed");
});

test("stored data is cleaned: bad cards, dates and logs are dropped", () => {
  const db = validate({
    cards: { "w:ok": { box: 9, due: T, right: 1 }, "x:bad": { box: 1, due: T }, "w:nodate": { box: 1 } },
    active: { ok: [T, "nope", T], bad: "x" },
    streak: { last: T, days: 3 },
    log: [{ date: T, words: 120, fillers: 4, seconds: 60, used: 2, target: 3 }, { date: "bad" }],
  });
  assert.deepEqual(Object.keys(db.cards), ["w:ok"]);
  assert.equal(db.cards["w:ok"].box, 5);
  assert.deepEqual(db.active, { ok: [T] });
  assert.equal(db.log.length, 1);
  assert.deepEqual(validate("junk").cards, {});
});

test("content: 8 topics, 200 unique words, 25 per topic, all fields filled", () => {
  assert.equal(TOPICS.length, 8);
  assert.equal(WORDS.length, 200);
  assert.equal(new Set(WORDS.map((w) => w.id)).size, 200);
  assert.equal(new Set(WORDS.map((w) => w.word)).size, 200);
  TOPICS.forEach((t) => assert.equal(WORDS.filter((w) => w.topic === t.id).length, 25, t.id));
  WORDS.forEach((w) => {
    assert.match(w.id, /^[a-z0-9-]{1,30}$/, w.id);
    ["word", "stress", "mean", "plain", "ex"].forEach((k) => assert.ok(w[k]?.trim(), `${w.id}.${k}`));
    assert.ok(w.pair.length >= 2, w.id);
    const phrase = w.word.includes(" ");
    assert.ok(w.stems.length >= 1 && w.stems.every((s) => s === s.toLowerCase() && (phrase || s.length >= 4)), w.id);
    assert.ok(w.stems.some((s) => s.length >= 4), `${w.id} needs one distinctive stem`);
    if (phrase) assert.ok(w.stems.length >= 2, `${w.id}: an expression needs two stems so a lone common word does not count`);
  });
});

test("content: every example contains its word in a form the stems recognise", () => {
  const missed = WORDS.filter((w) => !usedWordIds(w.ex, [w]).length).map((w) => w.id);
  assert.deepEqual(missed, []);
});

test("content: drills have enough items and three strong variants per paraphrase", () => {
  assert.ok(PARAPHRASE.length >= 30 && PARAPHRASE.every((p) => p.strong.length === 3));
  assert.ok(CLEANUP.length >= 20 && CLEANUP.every((c) => c.raw && c.clean && fillerCounts(c.raw).length));
  assert.ok(PROMPTS.length >= 30);
});
