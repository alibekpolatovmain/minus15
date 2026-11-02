// «Динамика»: calories burned per day, 30-day weight forecast and «что если» scenarios. Also the one-time height/age question.
import { dailyNeed, projectWeights, baseIntake, bodyFor, isProfileComplete, MIN_INTAKE, MONTH_DAYS } from "./forecast.js";
import { weightLineChart, burnBarChart } from "./charts.js";
import { esc, openSheet, closeSheet, fmt1, MONTHS } from "./ui.js";

const INTAKE_RANGE = [1200, 4000, 50];
const EXTRA_WALK_KM = 3;
const WALK_MIN_PER_KM = 12;
const FOOD_CUT = 300;
const MIN_PLAN_GAIN = 30;
const HEIGHTS = [140, 210];
const AGES = [16, 90];

const kcal = (n) => Math.round(n).toLocaleString("ru-RU");
const signed = (kg) => (kg <= -0.05 ? `−${fmt1(-kg)}` : kg >= 0.05 ? `+${fmt1(kg)}` : "±0");
const snap = (v, [lo, hi, step]) => Math.min(hi, Math.max(lo, Math.round(v / step) * step));

function dateAfter(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/* ---------- one-time question: height, age, sex ---------- */
const options = ([lo, hi], selected) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  .map((v) => `<option value="${v}" ${v === selected ? "selected" : ""}>${v}</option>`).join("");

export function askProfile(profile, onSave) {
  let sex = profile.sex;
  const body = openSheet(`<h3 class="sheet-title">Рост и возраст</h3>
    <p class="muted">Нужны, чтобы посчитать, сколько тратит ваш организм, и показать прогноз веса. Спрошу один раз.</p>
    <div class="wheels">
      <label class="wheel-col">Рост, см<select id="p-h">${options(HEIGHTS, profile.height ?? 175)}</select></label>
      <label class="wheel-col">Возраст<select id="p-a">${options(AGES, profile.age ?? 35)}</select></label>
    </div>
    <div class="seg" role="group" aria-label="Пол">
      <button type="button" data-sex="m" class="${sex === "m" ? "on" : ""}">Мужчина</button>
      <button type="button" data-sex="f" class="${sex === "f" ? "on" : ""}">Женщина</button>
    </div>
    <button type="button" class="btn primary big" id="p-save">Сохранить</button>`);
  body.addEventListener("click", (e) => {
    const el = e.target.closest("button");
    if (!el) return;
    if (el.dataset.sex) {
      sex = el.dataset.sex;
      body.querySelectorAll("[data-sex]").forEach((b) => b.classList.toggle("on", b === el));
    }
    if (el.id === "p-save") {
      const next = { sex, height: Number(body.querySelector("#p-h").value), age: Number(body.querySelector("#p-a").value) };
      closeSheet();
      onSave(next);
    }
  });
}

/* ---------- the dynamics screen ---------- */
function scenarioOf(state, ctx) {
  const extra = (state.on.walk ? ctx.walkKcal : 0) + (state.on.plan ? ctx.planGain : 0);
  const intake = baseIntake(ctx.body, state.intake) - (state.on.food ? FOOD_CUT : 0);
  return { intake, activity: ctx.activity.week + extra };
}

const project = (ctx, { intake, activity }) => projectWeights({ profile: ctx.body, intake, activity, days: MONTH_DAYS });

function heroHtml(state, ctx) {
  const now = project(ctx, scenarioOf({ ...state, on: {} }, ctx));
  const changed = Object.values(state.on).some(Boolean);
  const plan = changed ? project(ctx, scenarioOf(state, ctx)) : now;
  const end = plan[MONTH_DAYS];
  const series = changed ? [{ values: now, cls: "l-now" }, { values: plan, cls: "l-plan" }] : [{ values: now, cls: "l-plan" }];
  const legend = changed
    ? `<p class="dyn-legend"><span><i class="k-now"></i>как сейчас: ${fmt1(now[MONTH_DAYS])} кг</span><span><i class="k-plan"></i>с изменениями: ${fmt1(end)} кг</span></p>`
    : "";
  return `<p class="dyn-when">Через 30 дней, ${dateAfter(MONTH_DAYS)} · сейчас ${fmt1(ctx.weight)} кг</p>
    <p class="dyn-end"><b>${fmt1(end)} кг</b><em class="${end > ctx.weight ? "up" : ""}">${signed(end - ctx.weight)} кг</em></p>
    ${weightLineChart(series, [[0, "сегодня"], [MONTH_DAYS, dateAfter(MONTH_DAYS)]])}
    ${legend}${warningHtml(scenarioOf(state, ctx), ctx)}`;
}

function warningHtml({ intake, activity }, ctx) {
  const need = dailyNeed(ctx.body);
  if (intake < MIN_INTAKE[ctx.body.sex]) return `<p class="homeline">Меньше ${kcal(MIN_INTAKE[ctx.body.sex])} ккал в день надолго нельзя: уходят мышцы, и сорваться легко.</p>`;
  if (intake > need + activity) return `<p class="homeline">Так вес будет расти. Проще всего убрать сладкие напитки, выпечку и перекусы.</p>`;
  return "";
}

function whatIfHtml(state, ctx) {
  const base = project(ctx, scenarioOf({ ...state, on: {} }, ctx))[MONTH_DAYS];
  const gain = (key) => project(ctx, scenarioOf({ ...state, on: { [key]: true } }, ctx))[MONTH_DAYS] - base;
  const row = (key, title, sub) => `<button type="button" class="wi" data-wi="${key}" aria-pressed="${state.on[key] ? "true" : "false"}">
      <span class="wi-check" aria-hidden="true"></span><span class="wi-text"><b>${esc(title)}</b><small>${esc(sub)}</small></span><em>${signed(gain(key))} кг</em></button>`;
  return [
    row("walk", `+${EXTRA_WALK_KM} км ходьбы в день`, `≈${EXTRA_WALK_KM * WALK_MIN_PER_KM} минут`),
    ctx.planGain >= MIN_PLAN_GAIN ? row("plan", "Все тренировки по плану", `+${kcal(ctx.planGain)} ккал в день`) : "",
    row("food", `Есть на ${FOOD_CUT} ккал меньше`, "без сладкого и перекусов")
  ].join("");
}

function foodHint(state, ctx) {
  const usual = kcal(Math.round(dailyNeed(ctx.body) / 10) * 10);
  return state.intake == null
    ? `Пока считаю «как обычно»: ≈${usual} ккал: столько ест человек, у которого вес стоит на месте.`
    : `Ваш организм тратит ≈${usual} ккал без тренировок.`;
}

/**
 * ctx.profile {sex, height, age}, ctx.intake (null = as usual), ctx.weight kg,
 * ctx.days [{label, train, walk, today}] for the bar chart, ctx.activity {week, plan} net kcal a day,
 * ctx.avgBurn gross kcal a day over the same days, ctx.walkKcalPerKm, ctx.onSave({intake}) on close,
 * ctx.onEditProfile(), ctx.onLongTerm() opens «Что будет через 1, 3 и 6 месяцев».
 */
export function dynamicsSheet(input) {
  const ctx = {
    ...input,
    body: bodyFor(input.profile, input.weight),
    walkKcal: Math.round(EXTRA_WALK_KM * input.walkKcalPerKm),
    planGain: Math.max(0, input.activity.plan - input.activity.week)
  };
  let state = { intake: input.intake, on: {} };
  const { avgBurn } = input;
  const sliderValue = () => snap(baseIntake(ctx.body, state.intake), INTAKE_RANGE);
  const intakeLabel = () => kcal(state.intake ?? Math.round(baseIntake(ctx.body, null) / 10) * 10);
  const profileLine = isProfileComplete(ctx.profile)
    ? `${ctx.profile.height} см · ${ctx.profile.age} лет · ${ctx.profile.sex === "f" ? "женщина" : "мужчина"} · <button type="button" class="inline-link" data-profile>изменить</button>`
    : `Рост и возраст не указаны · <button type="button" class="inline-link" data-profile>указать</button>`;
  const body = openSheet(`<h3 class="sheet-title">Динамика</h3>
    <section class="dyn-card" data-out="hero">${heroHtml(state, ctx)}</section>
    <p class="list-group">Что если…</p>
    <div class="wi-list">
      <div data-out="whatif">${whatIfHtml(state, ctx)}</div>
      <details class="wi-food"${state.intake == null ? "" : " open"}><summary>Указать, сколько я ем</summary>
        <p class="month-label">Ем в день <b data-out="intake">${intakeLabel()} ккал</b></p>
        <input class="range" type="range" data-range="intake" min="${INTAKE_RANGE[0]}" max="${INTAKE_RANGE[1]}" step="${INTAKE_RANGE[2]}" value="${sliderValue()}" aria-label="Сколько ккал в день я ем">
        <p class="muted" data-out="food">${foodHint(state, ctx)}</p>
        <p class="muted">${profileLine}</p>
        <button type="button" class="btn link" data-usual>Считать «как обычно»</button>
      </details>
    </div>
    <p class="list-group">По дням, ккал</p>
    <section class="dyn-card">
      ${burnBarChart(ctx.days, avgBurn)}
      <p class="dyn-legend"><span><i class="k-train"></i>тренировки</span><span><i class="k-walk"></i>ходьба</span><span><i class="k-avg"></i>среднее</span></p>
    </section>
    <p class="muted">Это оценка, ±20–30%. Взвешивайтесь раз в неделю.</p>
    <div class="alts"><button type="button" class="btn alt" data-long><b>Что будет через 1, 3 и 6 месяцев</b></button></div>`,
  { onClose: () => input.onSave({ intake: state.intake }) });

  const out = (name) => body.querySelector(`[data-out="${name}"]`);
  const refresh = () => {
    out("hero").innerHTML = heroHtml(state, ctx);
    out("whatif").innerHTML = whatIfHtml(state, ctx);
    out("intake").textContent = `${intakeLabel()} ккал`;
    out("food").textContent = foodHint(state, ctx);
    body.querySelector('[data-range="intake"]').value = sliderValue();
  };
  body.addEventListener("input", (e) => {
    if (e.target.dataset.range !== "intake") return;
    state = { ...state, intake: Number(e.target.value) };
    refresh();
  });
  body.addEventListener("click", (e) => {
    const el = e.target.closest("button");
    if (!el) return;
    if (el.hasAttribute("data-long")) { input.onSave({ intake: state.intake }); input.onLongTerm(); return; }
    if (el.hasAttribute("data-profile")) { input.onSave({ intake: state.intake }); input.onEditProfile(); return; }
    if (el.dataset.wi) state = { ...state, on: { ...state.on, [el.dataset.wi]: !state.on[el.dataset.wi] } };
    if (el.hasAttribute("data-usual")) state = { ...state, intake: null };
    refresh();
  });
}
