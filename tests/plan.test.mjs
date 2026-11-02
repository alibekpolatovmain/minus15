import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextSession, nextType, applyFeedback, isDeloadWeek, sessionParams, buildSession, sessionTotals, addDays
} from "../js/plan.js";

const hard = (date, type, extra = {}) => ({ date, kind: type, type, level: 2, partial: false, ...extra });
const state = (over = {}) => ({ startDate: "2026-11-02", level: 2, easyStreak: 0, hardStreak: 0, sessions: [], ...over });

test("first ever session is A, a hard day", () => {
  const plan = nextSession(state(), "2026-11-02");
  assert.equal(plan.status, "hard");
  assert.equal(plan.mainKind, "A");
  assert.equal(plan.banner, null);
});

test("rotation follows the last completed hard session, not the weekday", () => {
  assert.equal(nextType([hard("2026-11-02", "A")]), "B");
  assert.equal(nextType([hard("2026-11-02", "A"), hard("2026-11-04", "B")]), "C");
  assert.equal(nextType([hard("2026-11-02", "A"), hard("2026-11-04", "B"), hard("2026-11-06", "C")]), "A");
});

test("partial session does not move the queue", () => {
  assert.equal(nextType([hard("2026-11-02", "A"), hard("2026-11-04", "B", { partial: true })]), "B");
});

test("day after a hard session is a light day", () => {
  const plan = nextSession(state({ sessions: [hard("2026-11-02", "A")] }), "2026-11-03");
  assert.equal(plan.status, "light");
});

test("two days later it proposes the next type", () => {
  const plan = nextSession(state({ sessions: [hard("2026-11-02", "A")] }), "2026-11-04");
  assert.equal(plan.status, "hard");
  assert.equal(plan.mainKind, "B");
});

test("done state when a hard session exists today", () => {
  const plan = nextSession(state({ sessions: [hard("2026-11-02", "A")] }), "2026-11-02");
  assert.equal(plan.status, "done");
});

test("weekly cap of 3 in weeks 1–2 turns the day light", () => {
  const sessions = [hard("2026-11-02", "A"), hard("2026-11-04", "B"), hard("2026-11-06", "C")];
  const plan = nextSession(state({ sessions }), "2026-11-08");
  assert.equal(plan.status, "light");
  assert.equal(plan.cap, 3);
});

test("pause of 10 days removes one round and shows a comeback banner", () => {
  const s = state({ sessions: [hard("2026-11-02", "A")] });
  const p = sessionParams(s, "2026-11-12");
  assert.equal(p.rounds, 3);
  assert.equal(p.level, 2);
  assert.match(nextSession(s, "2026-11-12").banner, /возвращением/);
});

test("pause of 20 days lowers the level by one", () => {
  const p = sessionParams(state({ level: 4, sessions: [hard("2026-11-02", "A")] }), "2026-11-22");
  assert.equal(p.level, 3);
  assert.equal(p.rounds, 3);
});

test("pause of 30+ days restarts from level 1", () => {
  const p = sessionParams(state({ level: 5, sessions: [hard("2026-11-02", "A")] }), "2026-12-05");
  assert.equal(p.level, 1);
});

test("deload week comes after three qualifying weeks", () => {
  const start = "2026-11-02";
  const sessions = [];
  for (let w = 0; w < 3; w += 1) {
    sessions.push(hard(addDays(start, w * 7), "A"), hard(addDays(start, w * 7 + 2), "B"));
  }
  assert.equal(isDeloadWeek(start, sessions, addDays(start, 21)), true);
  assert.equal(isDeloadWeek(start, sessions, addDays(start, 14)), false);
});

test("easy twice raises the level, hard lowers it at once", () => {
  const once = applyFeedback({ level: 2, easyStreak: 0 }, "easy");
  assert.equal(once.level, 2);
  const twice = applyFeedback({ level: 2, easyStreak: once.easyStreak }, "easy");
  assert.equal(twice.level, 3);
  assert.equal(twice.changed, 1);
  const hardOnce = applyFeedback({ level: 3 }, "hard");
  assert.equal(hardOnce.level, 2);
  assert.equal(hardOnce.hardStreak, 1);
});

test("level does not rise during a deload or comeback", () => {
  const r = applyFeedback({ level: 2, easyStreak: 1 }, "easy", { noRaise: true });
  assert.equal(r.level, 2);
});

test("two hard feedbacks in a row propose the short session", () => {
  const plan = nextSession(state({ hardStreak: 2 }), "2026-11-02");
  assert.equal(plan.mainKind, "short");
});

test("durations: full ≈30–34 min, short ≈15–22, back & neck ≈12–17, morning and chin ≤ 9", () => {
  const min = (kind, type) => sessionTotals(buildSession(kind, type, 2, 4), 95).seconds / 60;
  const full = min("A", "A");
  assert.ok(full >= 30 && full <= 34, `full ${full}`);
  const short = min("short", "A");
  assert.ok(short >= 15 && short <= 22, `short ${short}`);
  const light = min("light", null);
  assert.ok(light >= 12 && light <= 17, `light ${light}`);
  assert.ok(min("morning", null) <= 9, `morning ${min("morning", null)}`);
  assert.ok(min("chin", null) <= 9, `chin ${min("chin", null)}`);
});

test("partial ratio counts only work time", () => {
  const session = buildSession("A", "A", 2, 4);
  const spent = session.steps.map((s) => (s.phase === "work" ? 0 : s.sec * 1000));
  assert.equal(sessionTotals(session, 95, spent).ratio, 0);
});

/* ---------- session structure (evidence-based layout) ---------- */
import { LEVELS, WORKOUTS, EXERCISES } from "../js/data.js";

test("every level leaves at least 20 s to rest and change position", () => {
  LEVELS.forEach((lv, i) => assert.ok(lv.rest >= 20, `level ${i + 1} rest ${lv.rest}`));
});

test("a 10 s get-ready step comes before every flow item and before the circuit", () => {
  for (const kind of ["light", "morning", "chin"]) {
    const { steps } = buildSession(kind, null, 2, 4);
    steps.forEach((s, i) => {
      if (s.phase === "flow") assert.equal(steps[i - 1]?.phase, "prep", `${kind} step ${i} has no prep`);
    });
  }
  const a = buildSession("A", "A", 2, 4).steps;
  const firstWork = a.findIndex((s) => s.phase === "work");
  assert.equal(a[firstWork - 1].phase, "prep");
  assert.equal(a[firstWork - 1].sec, 10);
});

test("rounds are separated by a longer rest", () => {
  const steps = buildSession("A", "A", 2, 4).steps;
  const roundRests = steps.filter((s) => s.phase === "rest" && s.roundBreak);
  assert.equal(roundRests.length, 3);
  roundRests.forEach((s) => assert.ok(s.sec >= 45));
});

test("each strength circuit alternates body regions (no two same regions in a row)", () => {
  for (const [type, w] of Object.entries(WORKOUTS)) {
    const regions = w.list.map((k) => EXERCISES[k].region);
    regions.forEach((r, i) => assert.ok(r, `${type}: ${w.list[i]} has no region`));
    for (let i = 1; i < regions.length; i += 1) {
      assert.notEqual(regions[i], regions[i - 1], `${type}: ${w.list[i - 1]} → ${w.list[i]} both ${regions[i]}`);
    }
  }
});

test("every strength session trains legs, push, pull and core across the week", () => {
  const all = new Set(Object.values(WORKOUTS).flatMap((w) => w.list.map((k) => EXERCISES[k].region)));
  for (const r of ["legs", "push", "pull", "core"]) assert.ok(all.has(r), `missing ${r}`);
});

test("changing between standing and floor always leaves at least 30 s, on every level", () => {
  for (const type of ["A", "B", "C"]) {
    for (let level = 1; level <= 6; level += 1) {
      const steps = buildSession(type, type, level, 4).steps;
      steps.forEach((s, i) => {
        if (s.phase !== "rest") return;
        const prev = steps[i - 1];
        if (EXERCISES[prev.ex].pos !== EXERCISES[s.ex].pos) assert.ok(s.sec >= 30, `${type}${level}: ${prev.ex} → ${s.ex} rest ${s.sec}`);
      });
    }
  }
});

test("the cardio circuit does not start with burpees", () => {
  assert.notEqual(WORKOUTS.C.list[0], "burpee");
});

test("after burpees, push-ups, pike push-ups and climbers the rest is at least 30 s on every level", () => {
  for (const type of ["A", "B", "C"]) {
    for (let level = 1; level <= 6; level += 1) {
      const steps = buildSession(type, type, level, 4).steps;
      steps.forEach((s, i) => {
        if (s.phase === "rest" && EXERCISES[steps[i - 1].ex].heavy) assert.ok(s.sec >= 30, `${type}${level}: after ${steps[i - 1].ex} rest ${s.sec}`);
      });
    }
  }
});

test("every timed exercise has a spoken rhythm or a countdown, so the screen is not needed", () => {
  const kinds = [["A", "A"], ["B", "B"], ["C", "C"], ["light", null], ["morning", null], ["chin", null], ["stand", null]];
  for (const [kind, type] of kinds) {
    const keys = new Set(buildSession(kind, type, 2, 4).steps.filter((s) => s.phase === "work" || s.phase === "flow").map((s) => s.ex));
    keys.forEach((k) => assert.ok(EXERCISES[k].tempo || EXERCISES[k].hold, `${kind}: ${k} has no tempo`));
  }
});

test("every exercise in a session has a muscle map", () => {
  const keys = new Set(["A", "B", "C"].flatMap((t) => buildSession(t, t, 2, 4).steps.map((s) => s.ex)));
  keys.forEach((k) => { if (k !== "breathe") assert.ok(EXERCISES[k].map?.[0]?.length, `${k} has no muscle map`); });
});

test("every exercise has a short demo video: at most 90 s plays", () => {
  for (const [key, ex] of Object.entries(EXERCISES)) {
    if (key === "breathe") continue;
    assert.ok(ex.video, `${key} has no video`);
    const [, label, start = 0, end] = ex.video;
    const [m, s] = label.split("·").pop().trim().split(":").map(Number);
    const played = end ? end - start : m * 60 + s;
    assert.ok(played <= 90, `${key} plays ${played} s`);
  }
});
