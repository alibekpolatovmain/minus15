// Weight forecast from energy balance: Mifflin-St Jeor resting burn, 7700 kcal per kg of body fat. Pure functions, no DOM.
export const KCAL_PER_KG = 7700;
// Desk job, no workouts: resting burn × 1.2 (FAO/WHO sedentary factor). Workouts and walks are added on top.
const SEDENTARY_FACTOR = 1.2;
// Eating below this for weeks costs muscle and is hard to keep up.
export const MIN_INTAKE = { m: 1500, f: 1200 };
const HEIGHT_CM = [120, 230];
const AGE_Y = [14, 100];

export function restingKcal({ weight, height, age, sex }) {
  return 10 * weight + 6.25 * height - 5 * age + (sex === "f" ? -161 : 5);
}

export const dailyNeed = (profile) => restingKcal(profile) * SEDENTARY_FACTOR;

/** Weight for each day from today (index 0) to `days`; the need is recomputed as the body gets lighter. */
export function projectWeights({ profile, intake, activity, days }) {
  return Array.from({ length: days }).reduce((ws) => {
    const weight = ws[ws.length - 1];
    const balance = intake - dailyNeed({ ...profile, weight }) - activity;
    return [...ws, weight + balance / KCAL_PER_KG];
  }, [profile.weight]);
}

/** Session calories minus the resting ~1 kcal/kg/hour the daily need already covers. */
export function netWorkoutKcal(kcal, minutes, weight) {
  return Math.max(0, Math.round(kcal - (weight * minutes) / 60));
}

const within = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;
export const isProfileComplete = (p) => within(p.height, HEIGHT_CM) && within(p.age, AGE_Y);

export const MONTH_DAYS = 30;

/** Intake to forecast with: the user's own number, or «as usual» = what the body needs, since the weight was stable before. */
export const baseIntake = (profile, intake) => intake ?? dailyNeed(profile);

/** Kg gained (+) or lost (−) in 30 days at this intake and daily movement. */
export function monthChange({ profile, intake, activity }) {
  const ws = projectWeights({ profile, intake: baseIntake(profile, intake), activity, days: MONTH_DAYS });
  return ws[MONTH_DAYS] - profile.weight;
}

// Used until the user gives height and age. With «eat as usual» the need cancels out, so these barely move the forecast.
const AVERAGE_ADULT = { height: 175, age: 40 };

/** Profile plus weight, with average height/age filled in where missing. */
export const bodyFor = (profile, weight) => ({
  sex: profile.sex,
  height: isProfileComplete({ ...profile, age: AVERAGE_ADULT.age }) ? profile.height : AVERAGE_ADULT.height,
  age: isProfileComplete({ ...profile, height: AVERAGE_ADULT.height }) ? profile.age : AVERAGE_ADULT.age,
  weight
});
