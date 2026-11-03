// One-screen cheat sheet for a prepared deal, the AI rehearsal prompt and the after-meeting debrief.
import { esc } from "../ui.js";
import { zopa, fmtMoney, fmtShort, concessionLadder } from "./numbers.js";
import { VOICE_RULES } from "./content.js";
import { whenLabel, dealWarnings } from "./prep.js";

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
  const cell = (label, v) => `<p><span>${label}</span><b>${esc(fmtShort(v))}</b></p>`;
  const steps = concessionLadder({ anchor: d.anchor, target: d.target, side: d.side });
  return `<div class="cs-nums">${cell("Якорь", d.anchor)}${cell("Цель", d.target)}${cell("Ухожу", d.walk)}</div>
    ${zopaHtml(d)}
    ${steps.length ? `<p class="f-label">Уступки</p><div class="chips">${steps.map((v) => `<span class="chip">${esc(fmtShort(v))}</span>`).join("<span class='arrow'>→</span>")}</div>` : ""}
    ${dealWarnings(d).map((w) => `<p class="warn-line">${esc(w)}</p>`).join("")}`;
}

export function cheatSheetHtml(d, todayIso) {
  const meso = [d.meso1, d.meso2, d.meso3].filter((m) => m && m.trim());
  const debrief = d.outcome || Number.isFinite(d.result)
    ? block("Итог", `${Number.isFinite(d.result) ? `<p><b>${esc(fmtMoney(d.result, d.unit))}</b>${Number.isFinite(d.target) ? ` при цели ${esc(fmtMoney(d.target, d.unit))}` : ""}</p>` : ""}${para(d.outcome)}${d.worked ? `<p><b>Сработало:</b> ${esc(d.worked)}</p>` : ""}${d.change ? `<p><b>В следующий раз:</b> ${esc(d.change)}</p>` : ""}`)
    : "";
  return `<header class="wz-head"><button type="button" class="btn link back" data-cs-exit>‹ Все подготовки</button></header>
    <header class="large-title cs-title"><h1>${esc(d.title || "Без названия")}</h1><p>${esc(whenLabel(d.date, todayIso))}${d.who ? ` · ${esc(d.who)}` : ""}</p></header>
    ${debrief}
    <article class="card cs">${numbersHtml(d)}</article>
    ${block("План Б", para(d.batna))}
    ${block("Им на самом деле нужно", para(d.theirInterests))}
    ${block("Начать с", quotes(d.audit))}
    ${block("Спросить", quotes(d.questions))}
    ${block("Обоснование цены", para(d.anchorWhy))}
    ${block("Три варианта на выбор", meso.length ? `<ol class="cues">${meso.map((m) => `<li>${esc(m)}</li>`).join("")}</ol>` : "")}
    ${block("Обмен", `${d.cheapForMe ? `<p><b>Могу дать:</b> ${esc(d.cheapForMe)}</p>` : ""}${d.askBack ? `<p><b>Попрошу взамен:</b> ${esc(d.askBack)}</p>` : ""}`)}
    ${block("Если ниже точки ухода", quotes(d.walkLine))}
    ${block("В конце встречи", para(d.nextStep))}
    ${block("Как держаться", `<ul class="cues">${VOICE_RULES.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`)}
    <div class="alts">
      <button type="button" class="btn alt" data-ai><b>Репетиция с ИИ</b><small>Claude сыграет вашего собеседника и разберёт ошибки</small></button>
      <button type="button" class="btn alt" data-practice="price"><b>Потренировать торг</b><small>ситуации про цену и скидки</small></button>
      <button type="button" class="btn alt" data-debrief><b>Разбор после встречи</b><small>3 вопроса, чтобы следующая прошла лучше</small></button>
      <button type="button" class="btn alt" data-edit><b>Изменить подготовку</b></button>
    </div>
    <button type="button" class="btn link danger" data-delete>Удалить подготовку</button>`;
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
