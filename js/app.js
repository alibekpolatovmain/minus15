// Screens: onboarding, «Сегодня», «Дневник», «Справка». Owns the database object.
import { WORKOUTS, EXERCISES } from "./data.js";
import {
  nextSession, buildSession, sessionTotals, sessionExercises, applyFeedback, isoDate, addDays, daysBetween,
  daysSinceHard, isHard, hardInLast7, weekIndex, RULES
} from "./plan.js";
import { load, save, exportFile, importFile } from "./store.js";
import { esc, exName, seenKey, frameHtml, howToHtml, openSheet, closeSheet, toast, fmt1, fmtKm } from "./ui.js";
import { startTimer, bindTimer } from "./timer.js";

const STEPS_PER_KM = 1350;
const MAX_KM_PER_DAY = 60;
const SEEN_ENOUGH = 2;
const WEIGHT_EVERY_DAYS = 7;
const WALK_NORM = [[2, 4], [4, 5], [8, 6], [Infinity, 7]];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAY_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const KIND_TITLE = { light: "Спина и шея", stand: "Стоя, без пола" };

let db = load();
const $ = (id) => document.getElementById(id);
const today = () => isoDate(new Date());

function commit(next) {
  db = next;
  if (!save(db)) toast("Не удалось сохранить. Освободите место на телефоне.");
  render();
}

/* ---------- derived values ---------- */
function currentWeight() {
  const w = [...db.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  return w.length ? w[w.length - 1].kg : db.startWeight;
}
function walkNorm(week) {
  return WALK_NORM.find(([upTo]) => week <= upTo)[1];
}
function dayOf(date) {
  return db.days[date] || { km: 0, morning: false, cold: false };
}
function kindTitle(kind, type) {
  if (kind === "short") return `Короткая: ${WORKOUTS[type].title.toLowerCase()}`;
  return KIND_TITLE[kind] || WORKOUTS[kind].title;
}
function planFor(kind, type, params) {
  const level = kind === "light" || kind === "stand" ? db.level : params.level;
  return buildSession(kind, type, level, params.rounds);
}
function minutesOf(session) {
  return Math.round(sessionTotals(session, currentWeight()).seconds / 60);
}
function dateTitle(iso) {
  const d = new Date(iso + "T12:00:00");
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/* ---------- onboarding ---------- */
function renderOnboarding() {
  const root = $("onboarding");
  root.hidden = false;
  root.innerHTML = `<div class="ob">
    <h1>Привет.<br>Каждый день одна кнопка.</h1>
    <ol class="howto3">
      <li>Откройте приложение и нажмите большую кнопку: тренировку выбрали за вас.</li>
      <li>Идите за таймером: он голосом говорит, что делать и когда отдыхать.</li>
      <li>В конце нажмите, как было. Завтра приложение само предложит следующее.</li>
    </ol>
    <button type="button" class="btn primary big" id="ob-today">Начать сегодня</button>
    <button type="button" class="btn big" id="ob-monday">С понедельника</button>
    <p class="fine">Если боль в груди при нагрузке или давление выше 140/90, сначала к врачу.</p>
  </div>`;
  const begin = (startDate) => askWeight(db.startWeight, (kg) => {
    root.hidden = true;
    commit({ ...db, startDate, startWeight: kg, weights: [{ date: today(), kg }] });
  }, "Ваш вес сейчас?");
  $("ob-today").addEventListener("click", () => begin(today()));
  $("ob-monday").addEventListener("click", () => {
    const d = new Date();
    const shift = (8 - d.getDay()) % 7 || 7;
    begin(addDays(today(), shift));
  });
}

/* ---------- weight picker (two iOS wheels) ---------- */
function askWeight(initial, onSave, title = "Записать вес") {
  const kg = Math.floor(initial);
  const tenth = Math.round((initial - kg) * 10);
  const kgOpts = Array.from({ length: 111 }, (_, i) => 50 + i).map((v) => `<option value="${v}" ${v === kg ? "selected" : ""}>${v}</option>`).join("");
  const tOpts = Array.from({ length: 10 }, (_, i) => `<option value="${i}" ${i === tenth ? "selected" : ""}>${i}</option>`).join("");
  const body = openSheet(`<h3 class="sheet-title">${esc(title)}</h3>
    <p class="muted">Утром, до еды, раз в неделю.</p>
    <div class="wheels">
      <label for="w-kg" class="sr">Килограммы</label><select id="w-kg">${kgOpts}</select>
      <span class="wheel-sep">,</span>
      <label for="w-t" class="sr">Десятые</label><select id="w-t">${tOpts}</select>
      <span class="wheel-unit">кг</span>
    </div>
    <button type="button" class="btn primary big" id="w-save">Сохранить</button>`);
  body.querySelector("#w-save").addEventListener("click", () => {
    const value = Number(body.querySelector("#w-kg").value) + Number(body.querySelector("#w-t").value) / 10;
    closeSheet();
    onSave(Math.round(value * 10) / 10);
  });
}

function saveWeight(kg) {
  const date = today();
  const weights = [...db.weights.filter((w) => w.date !== date), { date, kg }];
  commit({ ...db, weights, weightSnooze: null });
  toast(`Записано: ${fmt1(kg)} кг`);
}

/* ---------- «Сегодня» ---------- */
function thumbs(session) {
  return `<div class="thumbs">${sessionExercises(session).map((k) => `<span>${frameHtml(k, 0)}</span>`).join("")}</div>`;
}

function hardCard(plan) {
  const main = planFor(plan.mainKind, plan.type, plan.params);
  const exCount = sessionExercises(main).length;
  const rounds = main.steps.filter((s) => s.phase === "work" && s.idx === 0).length;
  const altFull = plan.mainKind === "short"
    ? { kind: plan.type, label: WORKOUTS[plan.type].title, sub: "полная тренировка" }
    : { kind: "short", label: `Короткая · ${minutesOf(planFor("short", plan.type, plan.params))} минут`, sub: "те же упражнения, 2 круга" };
  return `<article class="card main">
    <span class="eyebrow">Тренировка на сегодня</span>
    <h2>${esc(kindTitle(plan.mainKind, plan.type))}</h2>
    <p class="meta">≈${minutesOf(main)} минут · ${exCount} упражнений · ${rounds} ${rounds === 4 ? "круга" : rounds >= 5 ? "кругов" : rounds === 1 ? "круг" : "круга"}</p>
    <p class="meta faint">Уровень ${plan.params.level} из ${RULES.MAX_LEVEL}</p>
    ${thumbs(main)}
    <button type="button" class="btn primary huge" data-start="${plan.mainKind}" data-type="${plan.type}">Начать</button>
  </article>
  <div class="alts">
    <button type="button" class="btn alt" data-start="${altFull.kind}" data-type="${plan.type}"><b>${esc(altFull.label)}</b><small>${esc(altFull.sub)}</small></button>
    ${plan.lightToday ? "" : `<button type="button" class="btn alt" data-start="light"><b>Спина и шея · ${minutesOf(planFor("light", null, plan.params))} минут</b><small>мягко, без прыжков</small></button>`}
  </div>`;
}

function lightCard(plan) {
  if (plan.lightToday) {
    return `<article class="card main ok"><span class="eyebrow">Сегодня восстановление</span><h2>Мягкий день сделан ✓</h2>
      <p class="meta">Добавьте прогулку, если есть время.</p>
      <button type="button" class="btn primary huge" data-walk>Прогулка</button></article>`;
  }
  const s = planFor("light", null, plan.params);
  return `<article class="card main soft">
    <span class="eyebrow">Сегодня восстановление</span>
    <h2>Спина и шея</h2>
    <p class="meta">≈${minutesOf(s)} минут · мягко</p>
    ${thumbs(s)}
    <button type="button" class="btn primary huge" data-start="light">Начать</button>
  </article>
  <div class="alts"><button type="button" class="btn alt" data-walk><b>Прогулка вместо тренировки</b><small>отметить километры</small></button></div>`;
}

function doneCard(plan) {
  const s = plan.doneSession;
  const tomorrow = nextSession(db, addDays(today(), 1));
  const tomorrowLabel = tomorrow.status === "hard" ? kindTitle(tomorrow.mainKind, tomorrow.type) : "Спина и шея";
  return `<article class="card main ok">
    <span class="eyebrow">Сегодня готово ✓</span>
    <h2>${esc(kindTitle(s.kind, s.type))} · ${s.minutes} мин</h2>
    <p class="meta">Завтра: ${esc(tomorrowLabel)}</p>
  </article>
  ${plan.lightToday ? "" : `<div class="alts"><button type="button" class="btn alt" data-start="light"><b>Ещё: Спина и шея · ${minutesOf(planFor("light", null, plan.params))} минут</b><small>мягко, для спины и осанки</small></button></div>`}`;
}

function markTiles(week) {
  const d = dayOf(today());
  const norm = walkNorm(week);
  return `<h3 class="section-title">Отметить сегодня</h3>
  <div class="tiles">
    <div class="tile">
      <button type="button" class="tile-main" data-walk><b>Ходьба ✎</b><span>${fmtKm(d.km)} из ${norm} км · нажмите, чтобы ввести</span></button>
      <div class="tile-actions"><button type="button" class="btn small" data-km="1">+1 км</button><button type="button" class="btn small" data-km="2">+2 км</button></div>
    </div>
    <div class="tile ${d.morning ? "on" : ""}">
      <div class="tile-main"><b>Утренний комплекс</b><span>5 минут для спины</span></div>
      <div class="tile-actions"><button type="button" class="btn small ${d.morning ? "done" : ""}" data-toggle="morning">${d.morning ? "Сделано ✓" : "Сделал"}</button></div>
    </div>
    <div class="tile ${d.cold ? "on" : ""}">
      <div class="tile-main"><b>Холодный душ</b><span>30–90 секунд в конце</span></div>
      <div class="tile-actions"><button type="button" class="btn small ${d.cold ? "done" : ""}" data-toggle="cold">${d.cold ? "Сделано ✓" : "Сделал"}</button></div>
    </div>
  </div>`;
}

function weightCard() {
  const sorted = [...db.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = sorted[sorted.length - 1];
  const age = last ? daysBetween(last.date, today()) : Infinity;
  if (age < WEIGHT_EVERY_DAYS || db.weightSnooze === today()) return "";
  const prev = last ? `Прошлый раз: ${fmt1(last.kg)} кг, ${age} дн. назад.` : "";
  return `<article class="card weight">
    <b>Пора взвеситься</b><p class="meta">Раз в неделю, утром до еды. ${prev}</p>
    <div class="row"><button type="button" class="btn primary" data-weight>Записать вес</button><button type="button" class="btn link" data-snooze>Напомнить завтра</button></div>
  </article>`;
}

function progressBlock() {
  const total = db.sessions.filter((s) => !s.partial).length;
  const sorted = [...db.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (sorted.length < 2) return `<p class="progress-line">Тренировок всего: <b>${total}</b></p>`;
  const recent = sorted.slice(-3);
  const avg = recent.reduce((s, w) => s + w.kg, 0) / recent.length;
  const lost = db.startWeight - avg;
  const pct = Math.max(0, Math.min(100, (lost / db.goalLoss) * 100));
  const label = lost >= 0 ? `−${fmt1(lost)} кг` : `+${fmt1(-lost)} кг`;
  return `<div class="progress">
    <div class="progress-num"><b>${label}</b> из ${db.goalLoss}</div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <p class="progress-line">Тренировок всего: <b>${total}</b> · среднее последних взвешиваний ${fmt1(avg)} кг</p>
  </div>`;
}

function renderToday() {
  const t = today();
  const plan = nextSession(db, t);
  const week = weekIndex(db.startDate, t);
  const notStarted = db.startDate && db.startDate > t;
  const card = notStarted
    ? `<article class="card main soft"><span class="eyebrow">Старт ${esc(dateTitle(db.startDate))}</span><h2>До старта ${daysBetween(t, db.startDate)} дн.</h2><p class="meta">Можно начать раньше: нажмите «Начать».</p><button type="button" class="btn primary huge" data-start="A" data-type="A" data-early>Начать сегодня</button></article>`
    : plan.status === "done" ? doneCard(plan) : plan.status === "light" ? lightCard(plan) : hardCard(plan);
  $("screen-today").innerHTML = `
    <header class="large-title"><h1>Сегодня</h1><p>${esc(dateTitle(t))} · неделя ${week}</p></header>
    ${plan.banner && !notStarted ? `<p class="banner">${esc(plan.banner)}</p>` : ""}
    ${card}
    <button type="button" class="btn link other" data-other>Другая тренировка</button>
    ${weightCard()}
    ${markTiles(week)}
    ${progressBlock()}
    <button type="button" class="btn link safety" data-goto-safety>Когда нельзя тренироваться</button>`;
}

/* ---------- start a session ---------- */
function launch(kind, type, { early = false } = {}) {
  const t = today();
  const plan = nextSession(db, t);
  const params = plan.params;
  if (early && db.startDate > t) db = { ...db, startDate: t };
  const resetSeen = params.comeback === "long";
  const seen = resetSeen ? {} : db.seen;
  const session = planFor(kind, type, params);
  const level = session.level;
  const fresh = sessionExercises(session).filter((k) => (seen[seenKey(k, level)] || 0) < SEEN_ENOUGH);
  const firstEver = db.sessions.length === 0;
  const go = () => startTimer(session, { level, weight: currentWeight(), sound: db.sound, onEnd: (r) => finishSession(r, params, resetSeen) });
  if (!fresh.length) { go(); return; }
  showPreview(fresh, level, firstEver, go);
}

function showPreview(keys, level, firstEver, go) {
  let i = 0;
  const slide = () => {
    const key = keys[i];
    const safety = firstEver && i === 0 ? `<p class="stopline">Боль в суставе, в спине или головокружение: стоп. Лёгкое жжение в мышцах: норма.</p>` : "";
    const body = openSheet(`<p class="eyebrow">Смотри, как делать · ${i + 1} из ${keys.length}</p>${safety}${howToHtml(key, level)}
      <button type="button" class="btn primary big" data-next>${i + 1 < keys.length ? "Понятно" : "Понятно, начать"}</button>
      <button type="button" class="btn link" data-skip>Знаю, пропустить</button>`);
    body.querySelector("[data-next]").addEventListener("click", () => {
      i += 1;
      if (i < keys.length) slide();
      else { closeSheet(); go(); }
    });
    body.querySelector("[data-skip]").addEventListener("click", () => { closeSheet(); go(); });
  };
  slide();
}

function finishSession(result, params, resetSeen) {
  if (!result) { render(); return; }
  const { session, totals, feel, partial, level } = result;
  const now = new Date();
  const entry = {
    id: `${today()}-${now.getTime().toString(36)}`,
    date: today(),
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    kind: session.kind,
    type: session.type,
    level,
    minutes: Math.round(totals.seconds / 60),
    kcal: Math.round(totals.kcal),
    feel,
    partial
  };
  const seenBase = resetSeen ? {} : db.seen;
  const seen = partial ? seenBase : sessionExercises(session).reduce((acc, k) => ({ ...acc, [seenKey(k, level)]: (acc[seenKey(k, level)] || 0) + 1 }), { ...seenBase });
  const hardKind = session.kind !== "light" && session.kind !== "stand";
  const fb = hardKind && !partial && feel ? applyFeedback({ level, easyStreak: db.easyStreak, hardStreak: db.hardStreak }, feel, { noRaise: params.noRaise }) : null;
  const days = session.kind === "light" && !partial ? { ...db.days, [today()]: { ...dayOf(today()), morning: true } } : db.days;
  commit({
    ...db,
    sessions: [...db.sessions, entry],
    seen,
    days,
    level: fb ? fb.level : hardKind && !partial ? level : db.level,
    easyStreak: fb ? fb.easyStreak : db.easyStreak,
    hardStreak: fb ? fb.hardStreak : db.hardStreak
  });
  if (fb?.changed > 0) toast("Следующая будет чуть тяжелее");
  else if (fb?.changed < 0) toast("Следующая будет чуть легче");
  else toast(partial ? "Записано как неполная" : "Записано");
  maybeHomeHint();
}

function maybeHomeHint() {
  const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  if (standalone || db.homeHintShown) return;
  commit({ ...db, homeHintShown: true });
  const body = openSheet(`<h3 class="sheet-title">Поставьте на экран «Домой»</h3>
    <ol class="cues"><li>Внизу Safari нажмите «Поделиться» (квадрат со стрелкой).</li><li>Выберите «На экран „Домой“».</li><li>Открывайте приложение с иконки: так записи не пропадут.</li></ol>
    <button type="button" class="btn primary big" data-close>Понятно</button>`);
  body.querySelector("[data-close]").addEventListener("click", closeSheet);
}

/* ---------- sheets on «Сегодня» ---------- */
function otherSheet() {
  const t = today();
  const plan = nextSession(db, t);
  const dh = daysSinceHard(db.sessions, t);
  const p = plan.params;
  const item = (kind, type, label, sub) => `<button type="button" class="list-item" data-start="${kind}" ${type ? `data-type="${type}"` : ""}><b>${esc(label)}</b><small>${esc(sub)}</small></button>`;
  const hint = dh === 1 ? `<p class="banner">Вчера уже была силовая. Лучше спина и шея.</p>` : "";
  const body = openSheet(`<h3 class="sheet-title">Другая тренировка</h3>${hint}
    <div class="list">
      ${["A", "B", "C"].map((x) => item(x, x, WORKOUTS[x].title, `≈${minutesOf(planFor(x, x, p))} минут`)).join("")}
      ${item("short", plan.type, `Короткая: ${WORKOUTS[plan.type].title.toLowerCase()}`, `≈${minutesOf(planFor("short", plan.type, p))} минут, 2 круга`)}
      ${item("light", null, "Спина и шея", `≈${minutesOf(planFor("light", null, p))} минут, мягко`)}
      ${item("stand", null, "Стоя, без пола", `≈${minutesOf(planFor("stand", null, p))} минут: хлопки, колени, глубокий присед`)}
      <button type="button" class="list-item" data-walk><b>Прогулка</b><small>отметить километры</small></button>
    </div>`);
  body.addEventListener("click", onTodayClick);
}

/** Parses "3,5" / "3.5" km or "8 432" steps into km; null when it is not a sensible number. */
function parseWalk(text, unit) {
  const n = Number(String(text).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const km = unit === "steps" ? n / STEPS_PER_KM : n;
  return km > MAX_KM_PER_DAY ? null : Math.round(km * 10) / 10;
}

function walkSheet(date = today()) {
  const isToday = date === today();
  let unit = "km";
  const body = openSheet(`<h3 class="sheet-title">Ходьба ${isToday ? "сегодня" : "· " + esc(dateTitle(date))}</h3>
    <p class="muted">Уже записано: <b>${fmtKm(dayOf(date).km)} км</b></p>
    <div class="seg" role="group" aria-label="Единицы">
      <button type="button" class="on" data-unit="km">Километры</button>
      <button type="button" data-unit="steps">Шаги</button>
    </div>
    <label class="sr" for="walk-input">Сколько прошли</label>
    <input id="walk-input" class="num-input" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="например, 3,5">
    <p class="muted" id="walk-hint">Шаги можно взять из приложения «Здоровье». 1 км ≈ ${STEPS_PER_KM} шагов.</p>
    <button type="button" class="btn primary big" data-add>Добавить к записанному</button>
    <button type="button" class="btn big" data-set>Это итог за день</button>
    <div class="row3"><button type="button" class="btn" data-km="1">+1 км</button><button type="button" class="btn" data-km="2">+2 км</button><button type="button" class="btn" data-km="3">+3 км</button></div>
    <button type="button" class="btn link" data-reset>Обнулить ходьбу за этот день</button>`);
  const input = body.querySelector("#walk-input");
  const hint = body.querySelector("#walk-hint");
  const showHint = () => {
    const km = parseWalk(input.value, unit);
    hint.classList.remove("error");
    if (!input.value.trim()) { hint.textContent = `Шаги можно взять из приложения «Здоровье». 1 км ≈ ${STEPS_PER_KM} шагов.`; return; }
    hint.textContent = km === null ? "" : unit === "steps" ? `≈ ${fmtKm(km)} км` : `≈ ${Math.round(km * STEPS_PER_KM).toLocaleString("ru-RU")} шагов`;
  };
  const apply = (mode) => {
    const km = parseWalk(input.value, unit);
    if (km === null) {
      hint.textContent = unit === "steps" ? "Введите число шагов, например 8432." : "Введите километры, например 3,5.";
      hint.classList.add("error");
      input.focus();
      return;
    }
    const total = mode === "add" ? dayOf(date).km + km : km;
    setWalk(date, total);
    closeSheet();
  };
  input.addEventListener("input", showHint);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") apply("add"); });
  body.addEventListener("click", (e) => {
    const el = e.target.closest("button");
    if (!el) return;
    if (el.dataset.unit) {
      unit = el.dataset.unit;
      body.querySelectorAll("[data-unit]").forEach((b) => b.classList.toggle("on", b === el));
      input.placeholder = unit === "steps" ? "например, 8432" : "например, 3,5";
      input.inputMode = unit === "steps" ? "numeric" : "decimal";
      showHint();
      input.focus();
    }
    if (el.hasAttribute("data-add")) apply("add");
    if (el.hasAttribute("data-set")) apply("set");
    if (el.dataset.km) { setWalk(date, dayOf(date).km + Number(el.dataset.km)); closeSheet(); }
    if (el.hasAttribute("data-reset")) { setWalk(date, 0); closeSheet(); }
  });
  input.focus();
}

function setDay(date, patch) {
  commit({ ...db, days: { ...db.days, [date]: { ...dayOf(date), ...patch } } });
}
function setWalk(date, km) {
  const value = Math.min(MAX_KM_PER_DAY, Math.max(0, Math.round(km * 10) / 10));
  setDay(date, { km: value });
  toast(`Ходьба${date === today() ? " сегодня" : ""}: ${fmtKm(value)} км`);
}
function addKm(delta) {
  setWalk(today(), dayOf(today()).km + delta);
}

function onTodayClick(e) {
  const el = e.target.closest("button, a");
  if (!el) return;
  if (el.dataset.start) { closeSheet(); launch(el.dataset.start, el.dataset.type || nextSession(db, today()).type, { early: el.hasAttribute("data-early") }); return; }
  if (el.hasAttribute("data-walk")) { closeSheet(); walkSheet(); return; }
  if (el.hasAttribute("data-other")) { otherSheet(); return; }
  if (el.dataset.km) { addKm(Number(el.dataset.km)); return; }
  if (el.dataset.toggle) { const k = el.dataset.toggle; setDay(today(), { [k]: !dayOf(today())[k] }); return; }
  if (el.hasAttribute("data-weight")) { askWeight(currentWeight(), saveWeight); return; }
  if (el.hasAttribute("data-snooze")) { commit({ ...db, weightSnooze: today() }); return; }
  if (el.hasAttribute("data-goto-safety")) { showTab("help"); $("help-safety").open = true; $("help-safety").scrollIntoView(); }
}

/* ---------- «Дневник» ---------- */
function stripHtml() {
  const t = today();
  const cells = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6)).map((date) => {
    const ss = db.sessions.filter((s) => s.date === date && !s.partial);
    const mark = ss.some(isHard) ? "hard" : ss.length ? "soft" : dayOf(date).km > 0 ? "walk" : "";
    const d = new Date(date + "T12:00:00");
    return `<div class="strip-day ${mark} ${date === t ? "today" : ""}"><i></i><span>${WEEKDAY_SHORT[d.getDay()]}</span></div>`;
  });
  return `<div class="strip">${cells.join("")}</div>
    <p class="legend"><i class="hard"></i>силовая <i class="soft"></i>мягкая <i class="walk"></i>прогулка</p>`;
}

function weekTiles() {
  const t = today();
  const week = weekIndex(db.startDate, t);
  const plan = nextSession(db, t);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const km = dates.reduce((s, d) => s + dayOf(d).km, 0);
  const mornings = dates.filter((d) => dayOf(d).morning).length;
  const normKm = walkNorm(week) * 7;
  const tile = (v, k, ratio) => `<div class="stat"><b>${v}</b><span>${k}</span><div class="bar"><i style="width:${Math.min(100, Math.round(ratio * 100))}%"></i></div></div>`;
  return `<div class="stats">${tile(`${hardInLast7(db.sessions, t)} из ${plan.cap}`, "силовых за 7 дней", hardInLast7(db.sessions, t) / plan.cap)}${tile(`${fmtKm(km)} из ${normKm}`, "км ходьбы", km / normKm)}${tile(`${mornings} из 7`, "утренних комплексов", mornings / 7)}</div>`;
}

function weightChart() {
  const pts = [...db.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (pts.length < 2) return `<p class="muted">График появится после второго взвешивания.</p>`;
  const W = 340, H = 180, L = 34, R = 10, T = 12, B = 24;
  const goal = db.startWeight - db.goalLoss;
  const first = pts[0].date;
  const span = Math.max(7, daysBetween(first, pts[pts.length - 1].date));
  const vals = [...pts.map((p) => p.kg), goal, db.startWeight];
  const minY = Math.floor(Math.min(...vals)) - 1;
  const maxY = Math.ceil(Math.max(...vals)) + 1;
  const x = (d) => L + (daysBetween(first, d) / span) * (W - L - R);
  const y = (v) => T + ((maxY - v) / (maxY - minY)) * (H - T - B);
  const step = Math.max(1, Math.round((maxY - minY) / 4));
  const grid = [];
  for (let v = minY; v <= maxY; v += step) grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${v}</text>`);
  const line = pts.map((p) => `${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Вес по неделям">${grid.join("")}
    <line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" class="goal"/><text x="${W - R}" y="${y(goal) - 5}" text-anchor="end" class="goal-label">цель ${goal} кг</text>
    <polyline points="${line}" class="wline"/>${pts.map((p) => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3.5" class="wdot"/>`).join("")}
    <text x="${L}" y="${H - 6}" class="axis">${new Date(first + "T12:00:00").getDate()} ${MONTHS[new Date(first + "T12:00:00").getMonth()].slice(0, 3)}</text></svg>`;
}

function dayCards() {
  const dates = new Set([...db.sessions.map((s) => s.date), ...Object.keys(db.days).filter((d) => { const x = db.days[d]; return x.km || x.morning || x.cold; }), ...db.weights.map((w) => w.date)]);
  const list = [...dates].sort().reverse().slice(0, 30);
  if (!list.length) return `<p class="muted">Здесь появятся ваши дни. Начните с кнопки на экране «Сегодня».</p>`;
  return `<div class="days">${list.map((date) => {
    const ss = db.sessions.filter((s) => s.date === date);
    const d = dayOf(date);
    const w = db.weights.find((x) => x.date === date);
    const parts = [
      ...ss.map((s) => `${kindTitle(s.kind, s.type)}${s.partial ? " (неполная)" : ""} · ${s.minutes} мин`),
      d.km ? `ходьба ${fmtKm(d.km)} км` : "", d.morning ? "утро ✓" : "", d.cold ? "холод ✓" : "", w ? `вес ${fmt1(w.kg)}` : ""
    ].filter(Boolean);
    return `<button type="button" class="day" data-day="${date}"><b>${esc(dateTitle(date))}</b><span>${esc(parts.join(" · "))}</span></button>`;
  }).join("")}</div>`;
}

function renderDiary() {
  $("screen-diary").innerHTML = `<header class="large-title"><h1>Дневник</h1><p>Последние 7 дней</p></header>
    ${stripHtml()}${weekTiles()}
    <h3 class="section-title">Вес</h3>${weightChart()}
    <button type="button" class="btn" data-weight>Записать вес</button>
    <h3 class="section-title">Дни</h3>${dayCards()}`;
}

function dayEditSheet(date) {
  const ss = db.sessions.filter((s) => s.date === date);
  const d = dayOf(date);
  const body = openSheet(`<h3 class="sheet-title">${esc(dateTitle(date))}</h3>
    <div class="list">${ss.map((s) => `<div class="list-item static"><b>${esc(kindTitle(s.kind, s.type))}</b><small>${s.time} · ${s.minutes} мин · ${s.kcal} ккал</small><button type="button" class="btn small danger" data-del="${esc(s.id)}">Удалить</button></div>`).join("") || `<p class="muted">Тренировок не было.</p>`}</div>
    <button type="button" class="btn big" data-walk-day>Ходьба: ${fmtKm(d.km)} км · изменить</button>
    <div class="row"><button type="button" class="btn ${d.morning ? "done" : ""}" data-t="morning">Утро ${d.morning ? "✓" : ""}</button><button type="button" class="btn ${d.cold ? "done" : ""}" data-t="cold">Холод ${d.cold ? "✓" : ""}</button></div>`);
  body.addEventListener("click", (e) => {
    const el = e.target.closest("button");
    if (!el) return;
    if (el.dataset.del) {
      if (el.dataset.armed !== "1") { el.dataset.armed = "1"; el.textContent = "Точно удалить?"; return; }
      commit({ ...db, sessions: db.sessions.filter((s) => s.id !== el.dataset.del) });
    }
    if (el.hasAttribute("data-walk-day")) { walkSheet(date); return; }
    if (el.dataset.t) setDay(date, { [el.dataset.t]: !dayOf(date)[el.dataset.t] });
    dayEditSheet(date);
  });
}

/* ---------- «Справка»: backup + sound ---------- */
async function shareBackup() {
  const file = exportFile(db);
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Минус 15: резервная копия" });
      toast("Копия готова");
      return;
    }
  } catch (err) {
    if (err?.name === "AbortError") return;
    console.warn("share failed, falling back to download", err);
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function restoreBackup(file) {
  try {
    const restored = await importFile(file);
    commit(restored);
    toast(`Восстановлено: ${restored.sessions.length} тренировок`);
  } catch (err) {
    console.error("restore failed", err);
    toast("Это не файл резервной копии «Минус 15».");
  }
}

function bindHelp() {
  $("backup-save").addEventListener("click", shareBackup);
  $("backup-load").addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) restoreBackup(f); e.target.value = ""; });
  $("opt-sound").addEventListener("change", (e) => commit({ ...db, sound: e.target.checked }));
  $("help-ex").innerHTML = ["A", "B", "C"].map((t) => `<h4>${esc(WORKOUTS[t].title)}</h4>${WORKOUTS[t].list.map((k) => `<details class="ex"><summary>${esc(EXERCISES[k].name)}</summary>${howToHtml(k, db.level)}</details>`).join("")}`).join("")
    + `<h4>Спина и шея, стоя без пола</h4>${["birdDog", "chinTuck", "neckFront", "neckSide", "clapLeg", "kneePush", "kneeElbow", "deepSquat"].map((k) => `<details class="ex"><summary>${esc(EXERCISES[k].name)}</summary>${howToHtml(k, db.level)}</details>`).join("")}`;
}

/* ---------- tabs ---------- */
let tab = "today";
function showTab(name) {
  tab = name;
  ["today", "diary", "help"].forEach((n) => {
    $(`screen-${n}`).hidden = n !== name;
    document.querySelector(`[data-tab="${n}"]`).setAttribute("aria-current", n === name ? "page" : "false");
  });
  render();
  window.scrollTo(0, 0);
}

function render() {
  if (tab === "today") renderToday();
  if (tab === "diary") renderDiary();
  $("opt-sound").checked = db.sound;
}

function init() {
  bindTimer();
  bindHelp();
  $("screen-today").addEventListener("click", onTodayClick);
  $("screen-diary").addEventListener("click", (e) => {
    const day = e.target.closest("[data-day]")?.dataset.day;
    if (day) dayEditSheet(day);
    if (e.target.closest("[data-weight]")) askWeight(currentWeight(), saveWeight);
  });
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.querySelector("#sheet .backdrop").addEventListener("click", closeSheet);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") render(); });
  if (!db.startDate) renderOnboarding();
  render();
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("offline cache unavailable", err));
  }
}

init();
