// One-screen cheat sheet for a prepared deal, the AI rehearsal prompt and the after-meeting debrief.
import { esc } from "../ui.js";
import { zopa, fmtMoney, fmtShort, concessionLadder } from "./numbers.js";
import { VOICE_RULES } from "./content.js";
import { whenLabel, dealWarnings, LADDER_LABELS } from "./prep.js";

const lines = (text) => String(text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
const block = (title, body) => (body ? `<section class="cs-block"><h3>${esc(title)}</h3>${body}</section>` : "");
const para = (text) => lines(text).map((l) => `<p>${esc(l)}</p>`).join("");
const quotes = (text) => lines(text).map((l) => `<p class="dr-quote">${esc(l)}</p>`).join("");

/** Bar from the lowest to the highest number, my range shaded, their guessed limit marked. */
function zopaHtml(d) {
  const z = zopa({ side: d.side, walk: d.walk, theirs: d.theirs });
  if (!z) return "";
  const pts = [d.walk, d.theirs, d.target, d.anchor].filter(Number.isFinite);
  const min = Math.min(...pts);
  const span = Math.max(...pts) - min || 1;
  const pos = (v) => `${((v - min) / span) * 100}%`;
  const myEnd = Number.isFinite(d.anchor) ? d.anchor : d.target ?? d.walk;
  const [a, b] = [Math.min(d.walk, myEnd), Math.max(d.walk, myEnd)];
  const verdict = z.exists
    ? `Зона сделки по вашим догадкам: от ${fmtMoney(z.low, d.unit)} до ${fmtMoney(z.high, d.unit)}.`
    : "Зоны сделки по вашим догадкам нет. Усильте план Б, поменяйте объём или проверьте догадку вопросами.";
  return `<div class="zopa" role="img" aria-label="${esc(verdict)}">
      <div class="zopa-track"><i class="mine" style="left:${pos(a)};width:calc(${pos(b)} - ${pos(a)})"></i>
        ${z.exists ? `<i class="deal" style="left:${pos(z.low)};width:calc(${pos(z.high)} - ${pos(z.low)})"></i>` : ""}
        <b class="theirs" style="left:${pos(d.theirs)}"></b></div>
      <div class="zopa-key"><span><i class="mine"></i>мой диапазон</span><span><i class="deal"></i>зона сделки</span><span><b class="theirs"></b>их предел</span></div>
    </div><p class="${z.exists ? "muted" : "warn-line"}">${esc(verdict)}</p>`;
}

function numbersHtml(d) {
  const cell = (label, v, main = false) => `<p class="${main ? "main" : ""}"><span>${label}</span><b>${esc(fmtMoney(v))}</b></p>`;
  const steps = concessionLadder({ anchor: d.anchor, target: d.target, side: d.side });
  return `<div class="cs-nums">${cell("Ухожу, если хуже", d.walk, true)}${cell("Цель", d.target)}${cell("Первое предложение", d.anchor)}</div>
    ${zopaHtml(d)}
    ${steps.length ? `<p class="f-label">Уступки по шагам</p><div class="ladder-row">${steps.map((v, i) => `<span><small>${LADDER_LABELS[i]}</small>${esc(fmtShort(v))}</span>`).join("")}</div>` : ""}
    ${dealWarnings(d).map((w) => `<p class="warn-line">${esc(w)}</p>`).join("")}`;
}

const first = (text) => lines(text)[0] || "";
const sentence = (text) => (/[.!?…]$/.test(text) ? text : `${text}.`);

/** Answers to the three pushes every buyer makes, using the deal's own trade-offs where they exist. */
function pushbackHtml(d) {
  const trade = d.askBack ? d.askBack : "предоплату, срок договора или объём";
  const rows = [
    ["Дайте скидку", `Обсудим. Если скидка, то что меняем взамен: ${trade}?`],
    ["Пилот бесплатно", "Пилот возможен. Давайте заранее решим, какие цифры будут успехом, и если достигнем — подписываем договор. Справедливо?"],
    ["У конкурента дешевле", "Похоже, бюджет сейчас главный вопрос. Что именно вы сравниваете у нас и у них?"],
  ];
  return rows.map(([q, a]) => `<div class="push"><b>«${esc(q)}»</b><p>${esc(a)}</p></div>`).join("");
}

function offerLine(d) {
  const interest = first(d.theirInterests);
  const what = d.meso1 || (Number.isFinite(d.anchor) ? fmtMoney(d.anchor, d.unit) : "");
  if (!what) return "";
  return `${interest ? `Исходя из того, что вам важно ${interest.charAt(0).toLowerCase()}${interest.slice(1)}, предлагаю` : "Предлагаю"} ${what}.${d.anchorWhy ? ` ${sentence(first(d.anchorWhy))}` : ""}`;
}

export function cheatSheetHtml(d, todayIso, pitch30 = "") {
  const meso = [d.meso1, d.meso2, d.meso3].filter((m) => m && m.trim());
  const opener = first(d.audit) || pitch30;
  const offer = offerLine(d);
  const debrief = d.outcome || Number.isFinite(d.result)
    ? block("Итог", `${Number.isFinite(d.result) ? `<p><b>${esc(fmtMoney(d.result, d.unit))}</b>${Number.isFinite(d.target) ? ` при цели ${esc(fmtMoney(d.target, d.unit))}` : ""}</p>` : ""}${para(d.outcome)}${d.worked ? `<p><b>Сработало:</b> ${esc(d.worked)}</p>` : ""}${d.change ? `<p><b>В следующий раз:</b> ${esc(d.change)}</p>` : ""}`)
    : "";
  return `<header class="wz-head"><button type="button" class="btn link back" data-cs-exit>‹ Встречи</button>
      <button type="button" class="btn small sos-mini" data-sos-open>Завис? SOS</button></header>
    <header class="cs-title"><h1>${esc(d.title || "Без названия")}</h1><p class="muted">${esc(whenLabel(d.date, todayIso))}${d.who ? ` · ${esc(d.who)}` : ""}</p></header>
    ${debrief}
    <article class="card cs">${numbersHtml(d)}</article>
    ${block("Начать с", opener ? `<p class="dr-quote">${esc(opener)}</p>` : "")}
    ${block("Спросить", quotes(d.questions))}
    ${block("Предложить", `${offer ? `<p class="dr-quote">${esc(offer)}</p>` : ""}${meso.length > 1 ? `<ol class="cues">${meso.map((m) => `<li>${esc(m)}</li>`).join("")}</ol>` : ""}`)}
    ${block("Если давят", pushbackHtml(d))}
    ${block("Обмен", `${d.cheapForMe ? `<p><b>Могу дать:</b> ${esc(d.cheapForMe)}</p>` : ""}${d.askBack ? `<p><b>Попрошу взамен:</b> ${esc(d.askBack)}</p>` : ""}`)}
    ${block("План Б", para(d.batna))}
    ${block("Если ниже точки ухода", quotes(d.walkLine))}
    ${block("К концу встречи", para(d.nextStep))}
    <details class="help"><summary>Как держаться</summary><ul class="cues">${VOICE_RULES.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></details>
    <div class="row2 cs-actions">
      <button type="button" class="btn primary big" data-ai>Репетиция с ИИ</button>
      <button type="button" class="btn big" data-debrief>Разбор после</button>
    </div>
    <div class="row2"><button type="button" class="btn link" data-edit>Изменить</button><button type="button" class="btn link danger" data-delete>Удалить</button></div>`;
}

/** Role-play brief for an AI chat: it plays the other side, then grades me against my own numbers. */
export function rehearsalPrompt(d) {
  const role = d.side === "sell" ? "покупателя (клиента)" : "продавца";
  const known = (label, v) => (v && String(v).trim() ? `\n- ${label}: ${String(v).trim()}` : "");
  const num = (v) => (Number.isFinite(v) ? fmtMoney(v, d.unit) : "");
  return `Давай отрепетируем переговоры. Ты играешь роль ${role}. Говори по-русски, по одной реплике, и жди моего ответа.

Ситуация: ${d.title || "переговоры о сделке"}${known("Кто с той стороны", d.who)}${known("Их интересы (мои догадки)", d.theirInterests)}${known("Их альтернатива без меня", d.theirBatna)}${known("Их предел (догадка)", num(d.theirs))}

Как играть: торгуйся жёстко, но реалистично. Используй типичные приёмы: «у конкурента дешевле», просьба о скидке, ультиматум, срочность, «добрый и злой полицейский», просьбы в последний момент. Уступай, только если я даю что-то взамен или привожу убедительные критерии.

Мои цифры — только для разбора, в роли их не используй:${known("Цель", num(d.target))}${known("Точка ухода", num(d.walk))}${known("Первое предложение", num(d.anchor))}${known("Мой план Б", d.batna)}

Когда я напишу «стоп» или после 10 реплик выйди из роли и сделай разбор: где я уступил без обмена, где сработали или были упущены приёмы (якорь, маркировка эмоций, вопросы «Как/Что», три варианта на выбор, пауза, закрепление договорённостей), какую лучшую фразу я мог сказать в трёх ключевых моментах. Поставь оценку от 1 до 10. Начинай с первой реплики собеседника.`;
}

export function rehearsalSheetHtml(prompt) {
  return `<h3 class="sheet-title">Репетиция с ИИ</h3>
    <p class="muted">Текст ниже — сценарий роли с вашими данными. Нажмите кнопку: он скопируется, откроется Claude. Вставьте и отвечайте как на встрече, можно голосом.</p>
    <label class="sr" for="ai-prompt">Текст для ИИ</label><textarea id="ai-prompt" class="field" rows="9" readonly>${esc(prompt)}</textarea>
    <button type="button" class="btn primary big" data-ai-go>Скопировать и открыть Claude</button>
    <p class="fine">Цифры сделки уходят в чат Claude. Если это конфиденциально, сотрите их из текста перед отправкой.</p>`;
}

export function debriefSheetHtml(d) {
  const num = Number.isFinite(d.result) ? fmtMoney(d.result) : "";
  const rate = [1, 2, 3, 4, 5].map((n) => `<button type="button" data-rate="${n}" class="${d.rating === n ? "on" : ""}">${n}</button>`).join("");
  return `<h3 class="sheet-title">Разбор после встречи</h3>
    <p class="muted">Пять минут сразу после встречи — самый быстрый способ расти. Так учат в Гарварде: опыт без разбора почти ничему не учит.</p>
    <div class="f"><label class="f-label" for="db-result">Итоговая цифра</label><div class="num-row"><input class="field num" id="db-result" type="text" inputmode="numeric" value="${esc(num)}" placeholder="${Number.isFinite(d.target) ? esc(fmtMoney(d.target)) : ""}"><span class="unit">${esc(d.unit || "")}</span></div></div>
    <div class="f"><label class="f-label" for="db-outcome">Чем закончилось</label><textarea id="db-outcome" class="field" rows="2" placeholder="Подписали на 2 года, предоплата 30 %">${esc(d.outcome || "")}</textarea></div>
    <div class="f"><label class="f-label" for="db-worked">Что сработало</label><textarea id="db-worked" class="field" rows="2" placeholder="Пауза после цены, три варианта">${esc(d.worked || "")}</textarea></div>
    <div class="f"><label class="f-label" for="db-change">Что сделаю иначе</label><textarea id="db-change" class="field" rows="2" placeholder="Не уступать до встречного предложения">${esc(d.change || "")}</textarea></div>
    <div class="f"><span class="f-label">Насколько довольны результатом</span><div class="seg five" role="group" aria-label="Оценка от 1 до 5">${rate}</div></div>
    <button type="button" class="btn primary big" data-debrief-save>Сохранить</button>`;
}
