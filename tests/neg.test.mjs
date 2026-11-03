import { test } from "node:test";
import assert from "node:assert/strict";
import { review, pickDaily, curriculum, isMastered, streakAfter, INTERVALS } from "../js/neg/srs.js";
import { preciseNumber, concessionLadder, zopa, fmtMoney, fmtShort } from "../js/neg/numbers.js";
import { TECHNIQUES, SCENARIOS } from "../js/neg/content.js";
import { validate } from "../js/neg/store.js";

const T = "2026-11-03";

test("a right answer moves the card up a box and schedules it later", () => {
  const card = review(undefined, true, T);
  assert.equal(card.box, 1);
  assert.equal(card.due, "2026-11-04");
  const next = review(card, true, card.due);
  assert.equal(next.box, 2);
  assert.equal(next.due, `2026-11-0${4 + INTERVALS[2]}`);
});

test("a wrong answer sends the card back to the first box for tomorrow", () => {
  const card = review({ box: 4, due: T, right: 4, wrong: 0 }, false, T);
  assert.equal(card.box, 0);
  assert.equal(card.due, "2026-11-04");
  assert.equal(card.wrong, 1);
});

test("the box never goes above the last interval", () => {
  let card;
  for (let i = 0; i < 20; i++) card = review(card, true, card ? card.due : T);
  assert.equal(card.box, INTERVALS.length - 1);
});

test("daily pick shows due cards first, then a few new ones", () => {
  const order = ["a", "b", "c", "d", "e", "f"];
  const cards = { a: { box: 2, due: "2026-11-01" }, b: { box: 1, due: "2026-11-10" } };
  const ids = pickDaily(order, cards, T, { total: 4, newPerDay: 2 });
  assert.deepEqual(ids, ["a", "c", "d"]);
});

test("daily pick is empty when nothing is due and new cards are used up", () => {
  const cards = { a: { box: 1, due: "2026-11-09" } };
  assert.deepEqual(pickDaily(["a"], cards, T, { total: 5, newPerDay: 3 }), []);
});

test("curriculum introduces each technique before its first scenario", () => {
  const order = curriculum([{ id: "s1", tech: ["label", "ask"] }, { id: "s2", tech: ["ask", "trade"] }]);
  assert.deepEqual(order, ["t:label", "t:ask", "s:s1", "t:trade", "s:s2"]);
});

test("mastered means the third box or higher", () => {
  assert.equal(isMastered({ box: 3 }), true);
  assert.equal(isMastered({ box: 2 }), false);
  assert.equal(isMastered(undefined), false);
});

test("streak grows on consecutive days and restarts after a gap", () => {
  assert.deepEqual(streakAfter({ last: "2026-11-02", days: 4 }, T), { last: T, days: 5 });
  assert.deepEqual(streakAfter({ last: T, days: 5 }, T), { last: T, days: 5 });
  assert.deepEqual(streakAfter({ last: "2026-10-30", days: 9 }, T), { last: T, days: 1 });
  assert.deepEqual(streakAfter(null, T), { last: T, days: 1 });
});

test("precise numbers never land on a round figure and keep the side of the target", () => {
  const up = preciseNumber(15000000, "up");
  const down = preciseNumber(15000000, "down");
  assert.ok(up > 15000000 && up < 15300000, `up ${up}`);
  assert.ok(down < 15000000 && down > 14700000, `down ${down}`);
  assert.notEqual(up % 100000, 0);
  assert.notEqual(down % 100000, 0);
  assert.equal(preciseNumber(0, "up"), 0);
});

test("a seller's ladder starts at the anchor and concedes less each step", () => {
  const steps = concessionLadder({ anchor: 20000000, target: 15000000, side: "sell" });
  assert.equal(steps.length, 4);
  assert.equal(steps[0], 20000000);
  assert.ok(steps[3] >= 15000000);
  const gaps = steps.slice(1).map((v, i) => steps[i] - v);
  assert.ok(gaps[0] > gaps[1] && gaps[1] > gaps[2], `gaps ${gaps}`);
});

test("a buyer's ladder follows Ackerman: 65, 85, 95 and a precise 100 percent", () => {
  const steps = concessionLadder({ target: 1000000, side: "buy" });
  assert.equal(steps[0], 650000);
  assert.equal(steps[1], 850000);
  assert.equal(steps[2], 950000);
  assert.ok(steps[3] <= 1000000 && steps[3] > 990000 && steps[3] % 1000 !== 0, `last ${steps[3]}`);
});

test("ladder is empty without the numbers it needs", () => {
  assert.deepEqual(concessionLadder({ target: null, side: "buy" }), []);
  assert.deepEqual(concessionLadder({ anchor: 10, target: 20, side: "sell" }), []);
});

test("zopa exists when a seller's floor is below the buyer's ceiling", () => {
  assert.deepEqual(zopa({ side: "sell", walk: 10, theirs: 14 }), { exists: true, low: 10, high: 14 });
  assert.equal(zopa({ side: "sell", walk: 15, theirs: 14 }).exists, false);
  assert.deepEqual(zopa({ side: "buy", walk: 14, theirs: 10 }), { exists: true, low: 10, high: 14 });
  assert.equal(zopa({ side: "buy", walk: null, theirs: 10 }), null);
});

test("every scenario has one best answer and only known techniques", () => {
  const known = new Set(TECHNIQUES.map((t) => t.id));
  for (const s of SCENARIOS) {
    assert.equal(s.options.filter((o) => o.score === 2).length, 1, s.id);
    assert.ok(s.options.length >= 3, s.id);
    s.tech.forEach((t) => assert.ok(known.has(t), `${s.id}: ${t}`));
  }
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
});

test("store drops broken records and keeps good ones", () => {
  const db = validate({
    cards: { "s:price": { box: 9, due: "2026-11-03", right: 2, wrong: 1 }, "bad key!": { box: 1, due: T }, "t:label": { box: 1, due: "nope" } },
    deals: [{ id: "d1", title: "Сделка", side: "buy", target: "1200" }, null, { title: 5 }],
    streak: { last: T, days: 3 }
  });
  assert.equal(db.cards["s:price"].box, INTERVALS.length - 1);
  assert.equal(db.cards["bad key!"], undefined);
  assert.equal(db.cards["t:label"], undefined);
  assert.equal(db.deals.length, 1);
  assert.equal(db.deals[0].target, 1200);
  assert.equal(db.streak.days, 3);
  assert.deepEqual(validate(null).deals, []);
});

test("a right answer before the card is due keeps its box: extra practice is not mastery", () => {
  const card = { box: 1, due: "2026-11-04", right: 1, wrong: 0 };
  const next = review(card, true, T);
  assert.equal(next.box, 1);
  assert.equal(next.due, "2026-11-04");
  assert.equal(next.right, 2);
  assert.equal(review(card, false, T).box, 0);
});

test("ladder in millions typed as small decimals stays monotonic and positive", () => {
  const sell = concessionLadder({ anchor: 18, target: 15, side: "sell" });
  sell.slice(1).forEach((v, i) => assert.ok(v <= sell[i] && v >= 15, `sell ${sell}`));
  const buy = concessionLadder({ anchor: 10, target: 15, side: "buy" });
  buy.slice(1).forEach((v, i) => assert.ok(v >= buy[i] && v <= 15, `buy ${buy}`));
  assert.ok(preciseNumber(1, "down") > 0.98 && preciseNumber(1, "down") < 1);
  const near = concessionLadder({ anchor: 15050000, target: 15000000, side: "sell" });
  assert.ok(near[3] <= near[2], `near ${near}`);
});

test("money formats keep decimals and short form for big numbers", () => {
  assert.equal(fmtMoney(16.29, "млн"), "16,29\u00A0млн");
  assert.equal(fmtMoney(18540000), "18\u00A0540\u00A0000");
  assert.equal(fmtShort(18540000), "18,54\u00A0млн");
  assert.equal(fmtShort(540000), "540\u00A0тыс");
});

test("a blank or whitespace number is empty, not zero", () => {
  const db = validate({ deals: [{ id: "a", title: "x", target: " ", walk: "", anchor: "1 500,5" }] });
  assert.equal(db.deals[0].target, null);
  assert.equal(db.deals[0].walk, null);
  assert.equal(db.deals[0].anchor, 1500.5);
});

test("new cards met today count against the daily allowance", () => {
  const met = { box: 1, due: "2026-11-04", right: 1, wrong: 0 };
  const ids = pickDaily(["a", "b", "c", "d"], { a: met, b: met }, T, { total: 7, newPerDay: 3 });
  assert.deepEqual(ids, ["c"]);
});

import { PITCH_VERSIONS, PITCH_BLOCKS, RESCUE, pitchText, positionText } from "../js/neg/kit.js";

test("pitch versions grow from 30 s to 5 min and always end with a question to them", () => {
  const known = new Set(PITCH_BLOCKS.map((b) => b.k));
  PITCH_VERSIONS.forEach((v) => {
    v.blocks.forEach((k) => assert.ok(known.has(k), `${v.id}: ${k}`));
    assert.equal(v.blocks[v.blocks.length - 1], "bridge", v.id);
  });
  const secs = PITCH_VERSIONS.map((v) => v.sec);
  assert.deepEqual([...secs].sort((a, b) => a - b), secs);
});

test("pitch text joins only the filled blocks of a version, in order", () => {
  const me = { now: "Я руковожу продуктом.", past: "", future: "Хочу пилот.", bridge: "Что для вас важно?" };
  assert.equal(pitchText(me, PITCH_VERSIONS[1]), "Я руковожу продуктом. Хочу пилот. Что для вас важно?");
});

test("positioning line follows the value-proposition formula and skips empty parts", () => {
  assert.equal(positionText({ forWho: "отделов продаж", pain: "сокращаем путь до встречи" }), "Для отделов продаж мы сокращаем путь до встречи.");
  assert.equal(
    positionText({ forWho: "банков", pain: "находим клиентов", unlike: "ручного поиска", proof: "40 клиентов" }),
    "Для банков мы находим клиентов, в отличие от ручного поиска, потому что 40 клиентов."
  );
  assert.equal(positionText({}), "");
});

test("store keeps pitch texts and valid rehearsals, drops broken ones", () => {
  const db = validate({ me: { now: "Я", story: 7, runs: { p30: { date: T, sec: 28 }, p2: { date: "x", sec: 10 }, p5: { date: T, sec: -1 } } } });
  assert.equal(db.me.now, "Я");
  assert.equal(db.me.story, "");
  assert.deepEqual(db.me.runs, { p30: { date: T, sec: 28 } });
  assert.deepEqual(validate(null).me.runs, {});
});

test("every SOS tile has something to say and something to do", () => {
  assert.equal(RESCUE.length, 8);
  RESCUE.forEach((r) => assert.ok(r.say.length && r.act && r.title, r.id));
  assert.equal(new Set(RESCUE.map((r) => r.id)).size, RESCUE.length);
});
