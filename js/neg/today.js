// «Сегодня» in «Переговоры»: one primary card (the daily warm-up) and small cards for SOS, the pitch and the next meeting.
import { esc, plural } from "../ui.js";
import { fmtMoney } from "./numbers.js";

const SECONDS_PER_CARD = 30;
const NBSP = " ";

function warmupCard({ ids, fresh, done }) {
  if (done || !ids.length) {
    return `<article class="card main ok"><h2>Разминка сделана ✓</h2>
      <p class="meta">Новые карточки будут завтра.</p>
      <button type="button" class="btn primary huge" data-extra>Ещё 5 ситуаций</button></article>`;
  }
  const minutes = Math.max(1, Math.round((ids.length * SECONDS_PER_CARD) / 60));
  const review = ids.length - fresh;
  const parts = [review ? `${review} на повторение` : "", fresh ? `${fresh} ${plural(fresh, "новая", "новые", "новых")}` : ""].filter(Boolean).join(", ");
  return `<article class="card main">
    <span class="eyebrow">Разминка дня</span>
    <h2>${ids.length}${NBSP}${plural(ids.length, "ситуация", "ситуации", "ситуаций")} · ≈${minutes}${NBSP}мин</h2>
    <p class="meta">${parts}. Выбираете ответ; через пару дней ту же ситуацию отвечаете сами.</p>
    <button type="button" class="btn primary huge" data-daily>Начать</button>
  </article>`;
}

function dealCard(deal, when) {
  if (!deal) {
    return `<button type="button" class="card tile-card" data-new-deal><span class="eyebrow">Встреча скоро?</span><b>Подготовиться</b><small>5 шагов, любой можно пропустить</small></button>`;
  }
  const nums = Number.isFinite(deal.walk) ? `ухожу ниже ${fmtMoney(deal.walk, deal.unit)}` : "";
  return `<button type="button" class="card tile-card soft" data-open-deal="${esc(deal.id)}"><span class="eyebrow">Встреча ${esc(when)}</span>
    <b>${esc(deal.title || "Без названия")}</b><small>${esc(nums || "открыть шпаргалку")}</small></button>`;
}

export function todayHtml({ ids, fresh, done, streak, deal, when, mastered, total, topics, pitch }) {
  return `<header class="large-title"><h1>Переговоры</h1><p>${streak ? `Серия ${streak} ${plural(streak, "день", "дня", "дней")} · освоено ${mastered} из ${total}` : `Пять минут в день · освоено ${mastered} из ${total}`}</p></header>
    ${warmupCard({ ids, fresh, done })}
    <div class="grid2">
      <button type="button" class="card sq sos-card" data-sos-open><span class="sq-icon" aria-hidden="true">SOS</span><b>Завис?</b><small>8 готовых выходов</small></button>
      <button type="button" class="card sq" data-ntab-go="pitch"><span class="sq-icon" aria-hidden="true">🎤</span><b>Рассказ о себе</b><small>${esc(pitch)}</small></button>
    </div>
    ${dealCard(deal, when)}
    <h3 class="section-title">Потренировать тему</h3>
    <div class="topic-chips">${topics.map((t) => `<button type="button" class="topic" data-topic="${t.id}"><b>${esc(t.title)}</b><small>${t.ok} из ${t.all}</small></button>`).join("")}</div>`;
}
