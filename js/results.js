// «Что я получу через 1, 3 и 6 месяцев»: honest milestones from the start date.
import { addDays } from "./plan.js";
import { esc, openSheet, closeSheet, fmt1, MONTHS } from "./ui.js";

// Realistic fat loss: 0.5 kg a week up to ~0.8% of body weight (with ~500 kcal deficit from food).
const LOSS_PER_WEEK_MIN = 0.5;
const LOSS_PER_WEEK_SHARE_MAX = 0.008;
const MILESTONES = [
  { weeks: 2, title: "Через 2 недели", items: [
    "Техника на автомате, голос ведёт, на экран смотреть почти не нужно.",
    "Сила уже растёт: первые недели тело учится лучше включать мышцы (нервная адаптация), поэтому прогресс быстрый.",
    "Утром спина гнётся легче, меньше скованности после сна."
  ] },
  { weeks: 4, title: "Через 1 месяц", items: [
    "Отжиманий и приседаний на 20–30% больше, чем в первый день. Уровень в приложении поднимется сам.",
    "Боль в спине по утрам у большинства заметно слабее: упражнения считаются главным лечением хронической боли в пояснице (Cochrane, 2021).",
    "Лестница и прогулки даются легче."
  ] },
  { weeks: 13, title: "Через 3 месяца", items: [
    "Мышцы видно: заметный рост мышц начинается через 6–12 недель регулярных тренировок.",
    "Талия меньше, примерно на 1 см за каждый сброшенный килограмм (грубая оценка).",
    "Шея крепче, голова меньше уходит вперёд, осанка ровнее (Falla, 2007; Ylinen, 2003).",
    "Выносливость выше примерно на 10–15%: пульс быстрее успокаивается."
  ] },
  { weeks: 26, title: "Через 6 месяцев", items: [
    "Вес близко к цели, лицо и шея суше: второй подбородок уходит вместе с общим жиром.",
    "Спортивный силуэт: плечи, грудь, ноги в тонусе. Отжиматься 20+ раз подряд реально.",
    "Сильные мышцы и ходьба снижают риск болезней сердца и диабета: это доказано для любого возраста (ВОЗ, 2020)."
  ] }
];

function lossRange(weeks, w, goalLoss) {
  const lo = Math.min(goalLoss, weeks * LOSS_PER_WEEK_MIN);
  const hi = Math.min(goalLoss, weeks * Math.max(LOSS_PER_WEEK_MIN, w * LOSS_PER_WEEK_SHARE_MAX));
  return [lo, hi];
}

export function resultsSheet({ weight, startWeight, goalLoss, startDate: start, startTitle }) {
  const cards = MILESTONES.map((m) => {
    const [lo, hi] = lossRange(m.weeks, weight, goalLoss);
    const d = new Date(addDays(start, m.weeks * 7) + "T12:00:00");
    const kg = Math.abs(hi - lo) < 0.5 ? `−${fmt1(hi)} кг` : `−${fmt1(lo)}…${fmt1(hi)} кг`;
    return `<section class="mile"><header><b>${esc(m.title)}</b><span>${d.getDate()} ${MONTHS[d.getMonth()]}</span></header>
      <p class="mile-kg">${kg}<small>≈ ${fmt1(startWeight - hi)}–${fmt1(startWeight - lo)} кг на весах</small></p>
      <ul>${m.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section>`;
  }).join("");
  const body = openSheet(`<h3 class="sheet-title">Что вы получите</h3>
    <p class="muted">Прогноз от старта ${esc(startTitle)}, если делать 3–4 тренировки в неделю, ходить по норме и есть примерно на 500 ккал меньше, чем тратите.</p>
    ${cards}
    <p class="homeline">Честно: вес на 70–80% зависит от питания. Тренировки без питания дают силу, форму и здоровую спину, но вес уходит в 2–3 раза медленнее.</p>
    <div class="sheet-foot"><button type="button" class="btn primary big" data-close>Понятно</button></div>`);
  body.querySelector("[data-close]").addEventListener("click", closeSheet);
}
