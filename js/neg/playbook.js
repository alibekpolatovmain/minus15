// «Приёмы»: the method in one screen, every technique with phrases, the common traps and sources.
import { esc } from "../ui.js";
import { TECHNIQUES, GROUPS, SOURCES } from "./content.js";
import { isMastered } from "./srs.js";

const METHOD = [
  ["Границы", "Цель, точка ухода и план Б записаны до встречи."],
  ["Их сторона", "Что им на самом деле нужно и что они сделают без вас."],
  ["Якорь", "Точное первое число с обоснованием."],
  ["Обмен", "Что вам дёшево, а им ценно; три равноценных варианта."],
  ["Слова", "Аудит обвинений и 3–5 вопросов «Как/Что»."],
  ["Финал", "Кто, что и когда — до конца встречи."],
  ["Разбор", "Пять минут после: что сработало, что иначе."],
];

const TRAPS = [
  "Делить пополам.",
  "Уступать без встречной уступки.",
  "Снижать цену, пока клиент молчит.",
  "Спрашивать «Почему?».",
  "Называть круглые числа и диапазоны «от и до».",
  "Хвалить своё предложение: «щедрое», «честное».",
  "Спорить с эмоцией логикой.",
];

function techHtml(t, card) {
  const mark = isMastered(card) ? `<span class="badge good">освоен</span>` : "";
  return `<details class="ex tech"><summary>${esc(t.name)}${mark}</summary>
    <p>${esc(t.what)}</p>
    <p class="dr-label">Когда</p><p>${esc(t.when)}</p>
    <p class="dr-label">Как сказать</p>${t.say.map((p) => `<p class="dr-quote">${esc(p)}</p>`).join("")}
    <p class="dr-label">Не делайте</p><p>${esc(t.trap)}</p>
    <p class="muted dr-src">${esc(t.src)}</p></details>`;
}

export function playbookHtml(cards) {
  const groups = GROUPS.map((g) => `<details class="help"${g.id === "words" ? " open" : ""}><summary>${esc(g.title)} <small class="muted">&nbsp;${esc(g.sub)}</small></summary>
    ${TECHNIQUES.filter((t) => t.group === g.id).map((t) => techHtml(t, cards[`t:${t.id}`])).join("")}</details>`).join("");
  return `<header class="large-title"><h1>Приёмы</h1><p>Гарвард, Стэнфорд, Келлогг, Уортон, ФБР</p></header>
    <article class="card"><span class="eyebrow">Подготовка за 15 минут</span>
      <ol class="method">${METHOD.map(([h, p]) => `<li><b>${esc(h)}.</b> ${esc(p)}</li>`).join("")}</ol>
      <button type="button" class="btn ghost" data-ntab-go="prep">Подготовиться по шагам</button></article>
    ${groups}
    <details class="help"><summary>Семь ловушек</summary><ul class="cues">${TRAPS.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>
    <details class="help"><summary>Источники</summary><p class="muted">${esc(SOURCES)}</p></details>`;
}
