// CEFR levels for «Английский»: course order from the chosen level and the placement test scoring.
export const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
export const LEVEL_NAMES = { A1: "начальный", A2: "элементарный", B1: "средний", B2: "выше среднего", C1: "продвинутый" };
export const TEST_PER_LEVEL = 6;
// A level counts as known at 5 of 6 right (≈ 80 %); below 3 of 6 the test stops, harder levels would be guessing.
export const PASS_SCORE = 5;
export const STOP_SCORE = 3;

export const levelIndex = (lv) => Math.max(0, LEVELS.indexOf(lv));
export const isBelow = (lv, start) => levelIndex(lv) < levelIndex(start || LEVELS[0]);

/** Learning order: words of the start level and above, base packs first, then the level packs. */
export const courseOrder = (words, start) => words.filter((w) => !isBelow(w.lv, start)).map((w) => w.id);

/** Random sample of n words per level for the test. */
export function testSample(words, n = TEST_PER_LEVEL, rnd = Math.random) {
  return LEVELS.flatMap((lv) => words.filter((w) => w.lv === lv)
    .map((w) => [rnd(), w]).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, w]) => w));
}

/** Start where the run of passed levels ends; everything below it counts as known. */
export function startFrom(scores) {
  const firstFailed = LEVELS.findIndex((lv) => (scores[lv] ?? 0) < PASS_SCORE);
  return firstFailed === -1 ? LEVELS[LEVELS.length - 1] : LEVELS[firstFailed];
}

/** After a level, go on only if it went reasonably well. */
export const shouldContinue = (right) => right >= STOP_SCORE;

/** Words of the course the learner likely knows: the share right on each level × that level's size. */
export function knownEstimate(scores, words, n = TEST_PER_LEVEL) {
  return Math.round(LEVELS.reduce((sum, lv) => sum + ((scores[lv] ?? 0) / n) * words.filter((w) => w.lv === lv).length, 0));
}
