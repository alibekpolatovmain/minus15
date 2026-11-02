// «Сколько сброшу за месяц»: two sliders (food, movement) and a 30-day weight forecast.
import { dailyNeed, projectWeights, isProfileComplete, MIN_INTAKE } from "./forecast.js";
import { esc, openSheet, closeSheet, fmt1 } from "./ui.js";

const DAYS = 30;
const WEEK_MARKS = [7, 14, 21, DAYS];
const INTAKE_RANGE = [1200, 4000, 50];
const ACTIVITY_RANGE = [0, 1000, 10];
const FALLBACK_INTAKE = 2200;
const BIG_DEFICIT = 1000;
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const kcal = (n) => Math.round(n).toLocaleString("ru-RU");
const clampStep = (v, [lo, hi, step]) => Math.min(hi, Math.max(lo, Math.round(v / step) * step));
const signed = (kg) => (kg <= -0.05 ? `−${fmt1(-kg)}` : kg >= 0.05 ? `+${fmt1(kg)}` : "±0");
const intOrNull = (v) => (String(v).trim() === "" ? null : Math.round(Number(v)));
// Half-typed numbers («1» on the way to «180») are not saved.
const savedProfile = (p) => ({ sex: p.sex, height: isProfileComplete({ ...p, age: 30 }) ? p.height : null, age: isProfileComplete({ ...p, height: 170 }) ? p.age : null });

function dateAfter(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function warning(state, need) {
  const deficit = need + state.activity - state.intake;
  if (state.intake < MIN_INTAKE[state.profile.sex]) return `Меньше ${kcal(MIN_INTAKE[state.profile.sex])} ккал в день надолго нельзя: уходят мышцы, и сорваться легко. Лучше есть чуть больше и больше ходить.`;
  if (deficit > BIG_DEFICIT) return "Дефицит больше 1000 ккал в день тяжело держать. Надёжнее 300–700: вес уходит медленнее, но не возвращается.";
  if (deficit < 0) return "Так вес будет расти. Проще всего убрать сладкие напитки, выпечку и перекусы: это 300–500 ккал.";
  return "";
}

function resultHtml(state, weight) {
  if (!isProfileComplete(state.profile)) return `<p class="muted">Введите рост и возраст: без них не посчитать, сколько тратит организм.</p>`;
  const profile = { ...state.profile, weight };
  const need = dailyNeed(profile);
  const ws = projectWeights({ profile, intake: state.intake, activity: state.activity, days: DAYS });
  const end = ws[DAYS];
  const deficit = need + state.activity - state.intake;
  const warn = warning(state, need);
  return `<section class="month-result">
      <p class="month-end"><span>К ${dateAfter(DAYS)}</span><b>${fmt1(end)} кг</b><em class="${end > weight ? "up" : ""}">${signed(end - weight)} кг</em></p>
      <div class="month-weeks">${WEEK_MARKS.map((d) => `<div><small>${d === DAYS ? "30 дней" : `${d / 7} нед.`}</small><b>${fmt1(ws[d])}</b></div>`).join("")}</div>
      <p class="muted">Тратите ≈${kcal(need)} (организм) + ${kcal(state.activity)} (движение) = ${kcal(need + state.activity)} ккал, едите ${kcal(state.intake)}. ${deficit >= 0 ? `Минус ${kcal(deficit)} ккал в день.` : `Плюс ${kcal(-deficit)} ккал в день.`}</p>
    </section>${warn ? `<p class="homeline">${esc(warn)}</p>` : ""}`;
}

function needHint(state, weight) {
  if (!isProfileComplete(state.profile)) return "";
  return `Не знаете? Если вес последние месяцы стоял на месте, вы едите примерно ${kcal(dailyNeed({ ...state.profile, weight }))} ккал: столько тратит организм за обычный день.`;
}

/**
 * @param ctx.profile {sex, height, age}  ctx.intake  saved values (intake may be null)
 * @param ctx.weight current weight, kg
 * @param ctx.activity {today, week, plan} kcal per day spent on workouts and walks
 * @param ctx.onSave ({profile, intake}) => void, called once when the sheet closes
 */
export function monthSheet({ profile, intake, weight, activity, onSave }) {
  const startIntake = intake ?? (isProfileComplete(profile) ? dailyNeed({ ...profile, weight }) : FALLBACK_INTAKE);
  let state = {
    profile: { ...profile },
    intake: clampStep(startIntake, INTAKE_RANGE),
    activity: clampStep(activity.week, ACTIVITY_RANGE)
  };
  const range = (name, [lo, hi, step], value) => `<input class="range" type="range" data-range="${name}" min="${lo}" max="${hi}" step="${step}" value="${value}">`;
  const chip = (value, label) => {
    const v = clampStep(value, ACTIVITY_RANGE);
    return `<button type="button" class="chip" data-act="${v}">${esc(label)} · ${kcal(v)}</button>`;
  };
  const profileHtml = `<p class="month-label">О вас</p>
    <div class="month-profile">
      <label>Рост, см<input class="num-input small" type="text" inputmode="numeric" data-p="height" value="${state.profile.height ?? ""}" placeholder="175"></label>
      <label>Возраст<input class="num-input small" type="text" inputmode="numeric" data-p="age" value="${state.profile.age ?? ""}" placeholder="35"></label>
    </div>
    <div class="seg" role="group" aria-label="Пол">
      <button type="button" data-sex="m" class="${state.profile.sex === "m" ? "on" : ""}">Мужчина</button>
      <button type="button" data-sex="f" class="${state.profile.sex === "f" ? "on" : ""}">Женщина</button>
    </div>`;
  // Asked once: until height and age are known they come first, afterwards they wait at the bottom.
  const askFirst = !isProfileComplete(state.profile);
  const body = openSheet(`<h3 class="sheet-title">Сколько сброшу за месяц</h3>
    <p class="muted">Сейчас ${fmt1(weight)} кг. Двигайте ползунки, прогноз меняется сразу.</p>
    ${askFirst ? profileHtml : ""}
    <div data-out="result">${resultHtml(state, weight)}</div>
    <p class="month-label">Едите в день <b data-out="intake">${kcal(state.intake)} ккал</b></p>
    ${range("intake", INTAKE_RANGE, state.intake)}
    <p class="muted" data-out="need">${needHint(state, weight)}</p>
    <p class="month-label">Тренировки и ходьба в день <b data-out="activity">${kcal(state.activity)} ккал</b></p>
    ${range("activity", ACTIVITY_RANGE, state.activity)}
    <div class="chips">${chip(activity.today, "Как сегодня")}${chip(activity.week, "В среднем за неделю")}${chip(activity.plan, "Всё по плану")}</div>
    ${askFirst ? "" : profileHtml}
    <p class="muted">Это оценка, ошибка до 20–30%. В первую неделю весы могут показать больше: уходит вода. Взвешивайтесь раз в неделю.</p>
    <div class="sheet-foot"><button type="button" class="btn primary big" data-close>Готово</button></div>`,
  { onClose: () => onSave({ profile: savedProfile(state.profile), intake: state.intake }) });

  const out = (name) => body.querySelector(`[data-out="${name}"]`);
  const refresh = () => {
    out("intake").textContent = `${kcal(state.intake)} ккал`;
    out("activity").textContent = `${kcal(state.activity)} ккал`;
    out("need").textContent = needHint(state, weight);
    out("result").innerHTML = resultHtml(state, weight);
    body.querySelector('[data-range="activity"]').value = state.activity;
  };
  body.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.range) state = { ...state, [el.dataset.range]: Number(el.value) };
    if (el.dataset.p) state = { ...state, profile: { ...state.profile, [el.dataset.p]: intOrNull(el.value.replace(/\D/g, "")) } };
    refresh();
  });
  body.addEventListener("click", (e) => {
    const el = e.target.closest("button");
    if (!el) return;
    if (el.hasAttribute("data-close")) { closeSheet(); return; }
    if (el.dataset.sex) {
      state = { ...state, profile: { ...state.profile, sex: el.dataset.sex } };
      body.querySelectorAll("[data-sex]").forEach((b) => b.classList.toggle("on", b === el));
    }
    if (el.dataset.act) state = { ...state, activity: Number(el.dataset.act) };
    refresh();
  });
}
