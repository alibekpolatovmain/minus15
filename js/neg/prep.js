// «Подготовка»: list of deals and a 7-step worksheet (Harvard 7 elements, Stanford prep, Voss one-sheet). Autosaves as you type.
import { esc } from "../ui.js";
import { preciseNumber, concessionLadder, fmtMoney } from "./numbers.js";

const AUDIT_CHIPS = ["Вы думаете, что мы дорогие", "Боитесь, что внедрение затянется", "Кажется, что нам нужен только ваш логотип", "Вас уже подводили подрядчики"];
const QUESTION_CHIPS = ["Что для вас будет успехом?", "Как нам быть, если бюджет не сходится?", "Что здесь самое сложное для вас?", "Кто ещё участвует в решении?", "Как мне это сделать?", "Что случится, если ничего не менять?"];

/** Wizard steps. Every field is optional: the cheat sheet works from a title and two numbers. Fields: k, t (text, area, num, date, side), l, p, chips. */
export const STEPS = [
  { title: "Встреча", hint: "О чём и с кем. Выясните, кто на самом деле принимает решение.", fields: [
    { k: "title", t: "text", l: "Что обсуждаем", p: "Годовой договор с горнорудным холдингом" },
    { k: "who", t: "text", l: "С кем и кто решает", p: "Закупщик Айгерим, решает финдиректор" },
    { k: "date", t: "date", l: "Когда встреча" },
    { k: "side", t: "side", l: "Моя роль" },
  ] },
  { title: "Цифры", hint: "Пишите до встречи: под давлением границы плывут. Знаете рынок — называйте цену первым.", fields: [
    { k: "target", t: "num", l: "Цель: на что рассчитываю", p: "15 000 000" },
    { k: "walk", t: "num", l: "Точка ухода: хуже — ухожу", p: "11 000 000" },
    { k: "anchor", t: "num", l: "Первое предложение", p: "18 400 000", precise: true },
    { k: "anchorWhy", t: "area", l: "Чем обосную цену", p: "Три отдела × 12 месяцев; экономия клиента ≈60 млн в год" },
    { k: "theirs", t: "num", l: "Их предел (догадка, можно пропустить)", p: "16 500 000" },
  ], ladder: true },
  { title: "Их сторона", hint: "Позиция — что требуют. Интерес — зачем. Работайте с интересами.", fields: [
    { k: "theirInterests", t: "area", l: "Что им на самом деле нужно", p: "Показать совету экономию до апреля; не перегрузить IT" },
    { k: "batna", t: "area", l: "Мой план Б, если не договоримся", p: "Пилот с другим холдингом, ждёт ответа до декабря" },
  ] },
  { title: "Обмен", hint: "Ни одной уступки без встречной. Три варианта на выбор вместо одного «да или нет».", fields: [
    { k: "cheapForMe", t: "text", l: "Могу дать (мне дёшево, им ценно)", p: "Обучение команды, отчёт для совета" },
    { k: "askBack", t: "text", l: "Попрошу взамен", p: "Предоплата 50 % или договор на 2 года" },
    { k: "meso1", t: "text", l: "Вариант 1", p: "18,5 млн, оплата через 60 дней" },
    { k: "meso2", t: "text", l: "Вариант 2", p: "16,9 млн и предоплата 50 %" },
    { k: "meso3", t: "text", l: "Вариант 3", p: "15,2 млн за два отдела" },
  ] },
  { title: "Слова", hint: "Готовые фразы снимают волнение. Нажмите на подсказку, чтобы добавить её.", fields: [
    { k: "audit", t: "area", l: "Начну с: что плохого они о нас думают", p: "Скорее всего, вы думаете, что мы дорогие", chips: AUDIT_CHIPS },
    { k: "questions", t: "area", l: "Мои вопросы «Как?» и «Что?»", p: "Что для вас будет успехом через полгода?", chips: QUESTION_CHIPS },
    { k: "nextStep", t: "text", l: "Чего добиться к концу встречи", p: "Встреча с финдиректором до пятницы" },
  ] },
];

export const blankDeal = (todayIso) => ({ id: `d${Date.now().toString(36)}`, title: "", side: "sell", unit: "₸", date: null, created: todayIso });

const numText = (v) => (Number.isFinite(v) ? fmtMoney(v) : "");

function fieldHtml(f, deal) {
  const id = `f-${f.k}`;
  const label = `<label class="f-label" for="${id}">${esc(f.l)}</label>`;
  if (f.t === "side") {
    return `<div class="f"><span class="f-label">${esc(f.l)}</span><div class="seg" role="group" aria-label="${esc(f.l)}">
      <button type="button" data-side="sell" class="${deal.side === "sell" ? "on" : ""}">Продаю, хочу больше</button>
      <button type="button" data-side="buy" class="${deal.side === "buy" ? "on" : ""}">Покупаю, хочу меньше</button></div></div>`;
  }
  if (f.t === "date") return `<div class="f">${label}<input class="field" id="${id}" type="date" data-k="${f.k}" value="${esc(deal.date || "")}"></div>`;
  if (f.t === "num") {
    const tool = f.precise ? `<button type="button" class="btn small" data-precise>Сделать точным</button>` : "";
    return `<div class="f">${label}<div class="num-row"><input class="field num" id="${id}" type="text" inputmode="numeric" autocomplete="off" data-k="${f.k}" data-num value="${esc(numText(deal[f.k]))}" placeholder="${esc(f.p || "")}"><span class="unit">${esc(deal.unit || "")}</span></div>${tool}</div>`;
  }
  const chips = f.chips ? `<div class="chips add">${f.chips.map((c) => `<button type="button" class="chip" data-chip="${esc(c)}" data-for="${f.k}">+ ${esc(c)}</button>`).join("")}</div>` : "";
  const input = f.t === "area"
    ? `<textarea class="field" id="${id}" rows="3" data-k="${f.k}" placeholder="${esc(f.p || "")}">${esc(deal[f.k] || "")}</textarea>`
    : `<input class="field${f.short ? " short" : ""}" id="${id}" type="text" data-k="${f.k}" value="${esc(deal[f.k] || "")}" placeholder="${esc(f.p || "")}">`;
  return `<div class="f">${label}${input}${chips}</div>`;
}

/** Checks the numbers make sense for the chosen side; returns warning lines. */
export function dealWarnings(d) {
  const up = d.side === "sell";
  const out = [];
  const worse = (a, b) => (up ? a > b : a < b);
  if (Number.isFinite(d.walk) && Number.isFinite(d.target) && worse(d.walk, d.target)) out.push("Точка ухода получилась лучше цели. Проверьте цифры.");
  if (Number.isFinite(d.anchor) && Number.isFinite(d.target) && worse(d.target, d.anchor)) out.push(up ? "Якорь ниже цели: с него можно только уступать вниз." : "Якорь выше цели: с него можно только уступать вверх.");
  return out;
}

export const LADDER_LABELS = ["Первое", "Уступка 1", "Уступка 2", "Финал"];

export function ladderHtml(d) {
  const steps = concessionLadder({ anchor: d.anchor, target: d.target, side: d.side });
  if (!steps.length) return `<p class="muted">Заполните цель${d.side === "sell" ? " и якорь" : ""}, и появится лестница уступок.</p>`;
  const how = d.side === "buy" && !(d.anchor > 0) ? "по Аккерману: 65 → 85 → 95 → 100 % цели" : "каждый шаг меньше прошлого";
  return `<div class="ladder"><p class="f-label">Лестница уступок, ${how}</p>
    <ul>${steps.map((v, i) => `<li><span>${LADDER_LABELS[i]}</span><b>${esc(fmtMoney(v, d.unit))}</b></li>`).join("")}</ul></div>`;
}

export function wizardHtml(deal, step) {
  const s = STEPS[step];
  const dots = STEPS.map((_, n) => `<i class="${n === step ? "on" : n < step ? "done" : ""}"></i>`).join("");
  const warns = dealWarnings(deal).map((w) => `<p class="warn-line">${esc(w)}</p>`).join("");
  const last = step === STEPS.length - 1;
  return `<header class="wz-head"><button type="button" class="btn link back" data-wz-exit>‹ Встречи</button>
      <button type="button" class="btn link" data-wz-done>Шпаргалка ›</button></header>
    <div class="dots" aria-label="Шаг ${step + 1} из ${STEPS.length}">${dots}</div>
    <div class="wz">
      <h1 class="wz-title">${esc(s.title)}</h1>
      <p class="muted">${esc(s.hint)}</p>
      ${s.fields.map((f) => fieldHtml(f, deal)).join("")}
      <div id="wz-live">${warns}${s.ladder ? ladderHtml(deal) : ""}</div>
    </div>
    <div class="wz-foot">
      <button type="button" class="btn big" data-wz="${step - 1}" ${step === 0 ? "disabled" : ""}>Назад</button>
      <button type="button" class="btn primary big" ${last ? "data-wz-done" : `data-wz="${step + 1}"`}>${last ? "Шпаргалка" : "Дальше"}</button>
    </div>`;
}

/** «Сделать точным»: 18 400 000 → 18 538 000 for a seller, slightly lower for a buyer. */
export const preciseFor = (deal, value) => preciseNumber(value, deal.side === "sell" ? "up" : "down");

const daysTo = (iso, todayIso) => Math.round((new Date(`${iso}T12:00:00`) - new Date(`${todayIso}T12:00:00`)) / 86400000);
export function whenLabel(iso, todayIso) {
  if (!iso) return "без даты";
  const n = daysTo(iso, todayIso);
  if (n === 0) return "сегодня";
  if (n === 1) return "завтра";
  if (n > 1) return `через ${n} дн.`;
  return "прошла";
}

export function dealListHtml(deals, todayIso) {
  const sorted = [...deals].sort((a, b) => {
    const pa = a.date && a.date >= todayIso ? 0 : 1;
    const pb = b.date && b.date >= todayIso ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return pa === 0 ? (a.date < b.date ? -1 : 1) : (a.created < b.created ? 1 : -1);
  });
  const rows = sorted.map((d) => {
    const status = d.outcome || Number.isFinite(d.result) ? `Итог: ${Number.isFinite(d.result) ? fmtMoney(d.result, d.unit) : d.outcome.slice(0, 40)}` : whenLabel(d.date, todayIso);
    return `<button type="button" class="list-item" data-deal="${esc(d.id)}"><b>${esc(d.title || "Без названия")}</b><small>${esc(status)}${d.who ? ` · ${esc(d.who.slice(0, 40))}` : ""}</small></button>`;
  }).join("");
  return `<header class="large-title"><h1>Встречи</h1><p>15 минут подготовки экономят миллионы на встрече</p></header>
    <button type="button" class="btn primary huge" data-new-deal>Подготовиться к встрече</button>
    ${rows ? `<div class="list">${rows}</div>` : `<div class="card soft"><b>Как это работает</b><p class="meta">5 коротких шагов по методике Гарварда и Стэнфорда: цифры, их интересы, обмен, готовые фразы. Любой шаг можно пропустить. В конце — шпаргалка и репетиция с ИИ.</p></div>`}`;
}
