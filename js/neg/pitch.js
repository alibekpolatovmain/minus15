// «Подача»: self-presentation in 30 s / 2 min / 5 min built from five blocks, the positioning line and a timed rehearsal.
import { esc, openSheet, closeSheet, toast, plural } from "../ui.js";
import { daysBetween } from "../plan.js";
import { PITCH_BLOCKS, PITCH_VERSIONS, POSITION_FIELDS, PITCH_CHECKS, pitchText, positionText } from "./kit.js";

const BLOCK = Object.fromEntries(PITCH_BLOCKS.map((b) => [b.k, b]));
const VERSION = Object.fromEntries(PITCH_VERSIONS.map((v) => [v.id, v]));
const TICK_MS = 250;
const MAX_SEC = 3600;
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const filled = (me, v) => v.blocks.filter((k) => (me[k] || "").trim()).length;

function runLabel(run, todayIso) {
  if (!run) return "ещё не репетировали";
  const ago = daysBetween(run.date, todayIso);
  return `${ago === 0 ? "сегодня" : ago === 1 ? "вчера" : `${ago} ${plural(ago, "день", "дня", "дней")} назад`} · ${clock(run.sec)}`;
}

function versionCard(me, v, todayIso) {
  const n = filled(me, v);
  const ready = n === v.blocks.length;
  return `<article class="card pv">
    <div class="pv-head"><b>${esc(v.title)}</b><span class="muted">${esc(v.sub)}</span></div>
    <p class="meta faint">${ready ? esc(runLabel(me.runs[v.id], todayIso)) : `заполнено ${n} из ${v.blocks.length} блоков`}</p>
    <button type="button" class="btn ${ready ? "primary" : ""}" data-rehearse="${v.id}">${ready ? "Отрепетировать" : "Дописать"}</button>
  </article>`;
}

const blockRow = (me, b) => `<button type="button" class="list-item" data-block="${b.k}"><b>${esc(b.title)}</b><small>${esc((me[b.k] || "").trim() || b.ask)}</small></button>`;

export function pitchHtml(me, todayIso) {
  const position = positionText(me);
  return `<header class="large-title"><h1>Подача</h1><p>Кто вы и почему вас стоит слушать</p></header>
    ${PITCH_VERSIONS.map((v) => versionCard(me, v, todayIso)).join("")}
    <h3 class="section-title">Из чего собран рассказ</h3>
    <div class="list">${PITCH_BLOCKS.map((b) => blockRow(me, b)).join("")}</div>
    <h3 class="section-title">Позиционирование</h3>
    <button type="button" class="card pos" data-position>
      <span class="eyebrow">Одна фраза о вас или компании</span>
      <p>${position ? esc(position) : "Для [кого] мы [что делаем], в отличие от [альтернативы], потому что [доказательство]."}</p>
      <span class="pos-cta">${position ? "Изменить" : "Заполнить за 2 минуты"} ›</span>
    </button>
    <div class="alts"><button type="button" class="btn alt" data-pitch-ai><b>Прогнать с Claude</b><small>выслушает, задаст 3 каверзных вопроса и разберёт</small></button></div>
    <p class="muted">Рассказ строится по схеме «сейчас → прошлое → зачем я здесь» с выводом в первой фразе (принцип пирамиды Минто). Короткие версии собираются из тех же блоков.</p>`;
}

function editBlock(me, k, saveMe, onSaved = null) {
  const b = BLOCK[k];
  const body = openSheet(`<h3 class="sheet-title">${esc(b.title)}</h3>
    <p class="muted">${esc(b.ask)}</p>
    <label class="sr" for="pb-text">${esc(b.title)}</label><textarea id="pb-text" class="field" rows="4" placeholder="${esc(b.ex)}">${esc(me[k] || "")}</textarea>
    <p class="fine">Пример: ${esc(b.ex)}</p>
    <button type="button" class="btn big" data-use-example>Взять пример за основу</button>
    <button type="button" class="btn primary big" data-save-block>Сохранить</button>`);
  const area = body.querySelector("#pb-text");
  body.querySelector("[data-use-example]").addEventListener("click", () => { area.value = b.ex; area.focus(); });
  body.querySelector("[data-save-block]").addEventListener("click", () => {
    const next = { ...me, [k]: area.value.trim() };
    saveMe(next);
    closeSheet();
    if (onSaved) onSaved(next);
  });
}

function editPosition(me, saveMe) {
  const fields = POSITION_FIELDS.map((f) => `<div class="f"><label class="f-label" for="pf-${f.k}">${esc(f.label)}</label>
    <input class="field" id="pf-${f.k}" data-pf="${f.k}" value="${esc(me[f.k] || "")}" placeholder="${esc(f.ex)}"></div>`).join("");
  const body = openSheet(`<h3 class="sheet-title">Позиционирование</h3>
    <p class="muted">Четыре поля — и готова фраза для начала встречи, письма или профиля.</p>
    ${fields}
    <div class="dr-best"><span class="eyebrow">Получается</span><p id="pf-out"></p></div>
    <div class="row2"><button type="button" class="btn big" data-copy-pos>Скопировать</button><button type="button" class="btn primary big" data-save-pos>Сохранить</button></div>`);
  const read = () => ({ ...me, ...Object.fromEntries([...body.querySelectorAll("[data-pf]")].map((el) => [el.dataset.pf, el.value.trim()])) });
  const out = body.querySelector("#pf-out");
  const refresh = () => { out.textContent = positionText(read()) || "Заполните «Для кого» и «Какую боль снимаем»."; };
  body.addEventListener("input", refresh);
  refresh();
  body.querySelector("[data-copy-pos]").addEventListener("click", () => {
    const line = positionText(read());
    if (!line) return;
    navigator.clipboard?.writeText(line).then(() => toast("Фраза скопирована.")).catch(() => toast("Не удалось скопировать."));
  });
  body.querySelector("[data-save-pos]").addEventListener("click", () => { saveMe(read()); closeSheet(); });
}

/** Fullscreen rehearsal: the text, a stopwatch against the target, then a four-point self-check. */
function rehearse(me, v, saveMe, todayIso) {
  const root = document.getElementById("drill");
  let started = 0;
  let timer = null;
  let sec = 0;
  const close = () => { clearInterval(timer); root.hidden = true; root.innerHTML = ""; document.body.classList.remove("locked"); };
  const tick = () => {
    sec = Math.floor((Date.now() - started) / 1000);
    root.querySelector(".pr-clock").textContent = clock(sec);
    root.querySelector(".pr-clock").classList.toggle("over", sec > v.sec);
    root.querySelector(".bar i").style.width = `${Math.min(100, (sec / v.sec) * 100)}%`;
  };
  root.innerHTML = `<div class="dr-top"><span class="dr-count">Подача · ${esc(v.title)}</span><button type="button" class="dr-x" data-close aria-label="Закрыть">✕</button></div>
    <article class="dr-wrap dr-card">
      <p class="pr-clock">0:00</p><p class="muted center">цель — ${clock(v.sec)}</p>
      <div class="bar"><i style="width:0%"></i></div>
      <p class="pr-text">${esc(pitchText(me, v))}</p>
      <div class="pr-checks" hidden><p class="dr-ask">Что получилось?</p>
        <div class="checks">${PITCH_CHECKS.map((c) => `<label class="check"><input type="checkbox"> ${esc(c)}</label>`).join("")}</div></div>
    </article>
    <div class="dr-foot"><button type="button" class="btn primary huge" data-run>Начать говорить</button></div>`;
  root.onclick = (e) => {
    if (e.target.closest("[data-close]")) { close(); return; }
    const foot = root.querySelector(".dr-foot");
    if (e.target.closest("[data-run]")) {
      started = Date.now();
      timer = setInterval(tick, TICK_MS);
      foot.innerHTML = `<button type="button" class="btn primary huge" data-stop>Закончил</button>`;
      return;
    }
    if (e.target.closest("[data-stop]")) {
      clearInterval(timer);
      tick();
      root.querySelector(".pr-checks").hidden = false;
      foot.innerHTML = `<button type="button" class="btn primary huge" data-done>Записать ${clock(sec)}</button>`;
      return;
    }
    if (e.target.closest("[data-done]")) {
      saveMe({ ...me, runs: { ...me.runs, [v.id]: { date: todayIso, sec: Math.min(sec, MAX_SEC) } } });
      close();
      toast(sec <= v.sec ? "Уложились. Завтра попробуйте без подглядывания." : `Дольше цели на ${clock(sec - v.sec)}. Сократите самый длинный блок.`);
    }
  };
  root.hidden = false;
  document.body.classList.add("locked");
}

export function pitchPrompt(me) {
  const v = PITCH_VERSIONS.find((x) => filled(me, x) === x.blocks.length) || PITCH_VERSIONS[PITCH_VERSIONS.length - 1];
  const position = positionText(me);
  return `Давай отрепетируем мой рассказ о себе (версия «${v.title}»). Ты — директор крупной компании, у тебя мало времени и много подрядчиков.

Мой текст:
${pitchText(me, v) || "(я расскажу голосом)"}${position ? `\n\nМоё позиционирование: ${position}` : ""}

Сначала просто выслушай: я напишу или надиктую рассказ. Потом задай три каверзных вопроса по одному, жди ответа на каждый. В конце дай разбор: начал ли я с результата для клиента, есть ли цифра или факт, уложился ли в ${clock(v.sec)}, закончил ли вопросом, что звучало как самопохвала. Предложи улучшенную версию той же длины.`;
}

export function onPitchClick(e, { me, saveMe, openPrompt, todayIso }) {
  const t = e.target;
  const block = t.closest("[data-block]");
  if (block) { editBlock(me, block.dataset.block, saveMe); return true; }
  if (t.closest("[data-position]")) { editPosition(me, saveMe); return true; }
  if (t.closest("[data-pitch-ai]")) { openPrompt(pitchPrompt(me)); return true; }
  const r = t.closest("[data-rehearse]");
  if (!r) return false;
  fillThenRehearse(me, VERSION[r.dataset.rehearse], saveMe, todayIso);
  return true;
}

/** Walks through the empty blocks of a version one sheet at a time, then starts the rehearsal. */
function fillThenRehearse(me, v, saveMe, todayIso) {
  const missing = v.blocks.find((k) => !(me[k] || "").trim());
  if (!missing) { rehearse(me, v, saveMe, todayIso); return; }
  editBlock(me, missing, saveMe, (next) => {
    if ((next[missing] || "").trim()) fillThenRehearse(next, v, saveMe, todayIso);
  });
}
