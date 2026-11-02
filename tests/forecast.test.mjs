import { test } from "node:test";
import assert from "node:assert/strict";
import { restingKcal, dailyNeed, projectWeights, netWorkoutKcal, isProfileComplete, monthChange, KCAL_PER_KG } from "../js/forecast.js";

const man = { weight: 95, height: 180, age: 35, sex: "m" };

test("resting burn follows Mifflin-St Jeor", () => {
  assert.equal(restingKcal(man), 1905);
  assert.equal(restingKcal({ ...man, sex: "f" }), 1739);
});

test("eating exactly what the body needs keeps the weight", () => {
  const ws = projectWeights({ profile: man, intake: dailyNeed(man), activity: 0, days: 30 });
  assert.equal(ws.length, 31);
  assert.ok(Math.abs(ws[30] - 95) < 0.01);
});

test("a daily deficit of 770 kcal loses close to 1 kg in 10 days", () => {
  const ws = projectWeights({ profile: man, intake: dailyNeed(man) - 470, activity: 300, days: 10 });
  const lost = 95 - ws[10];
  assert.ok(lost > 0.95 && lost <= 1, `lost ${lost}`);
});

test("lighter body burns less, so loss slows down over time", () => {
  const ws = projectWeights({ profile: man, intake: 1800, activity: 300, days: 60 });
  assert.ok(ws[1] - ws[0] < ws[60] - ws[59]);
});

test("eating above the need gains weight", () => {
  const ws = projectWeights({ profile: man, intake: dailyNeed(man) + KCAL_PER_KG / 30, activity: 0, days: 30 });
  assert.ok(ws[30] > 95.9);
});

test("workout calories drop the resting part already counted in the daily need", () => {
  assert.equal(netWorkoutKcal(250, 30, 90), 205);
  assert.equal(netWorkoutKcal(10, 30, 90), 0);
});

test("profile needs a sane height and age", () => {
  assert.equal(isProfileComplete({ height: 180, age: 35 }), true);
  assert.equal(isProfileComplete({ height: null, age: 35 }), false);
  assert.equal(isProfileComplete({ height: 180, age: 5 }), false);
});

test("month change: eating as usual, only extra movement counts", () => {
  const kg = monthChange({ profile: man, intake: null, activity: 257 });
  assert.ok(Math.abs(kg - -1) < 0.03, `kg ${kg}`);
});

test("month change uses the recorded intake when there is one", () => {
  const usual = monthChange({ profile: man, intake: null, activity: 0 });
  const less = monthChange({ profile: man, intake: dailyNeed(man) - 300, activity: 0 });
  assert.equal(Math.round(usual * 100), 0);
  assert.ok(less < -1.1 && less > -1.2, `less ${less}`);
});
