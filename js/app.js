// Screens: onboarding, «Сегодня», «Дневник», «Справка». Owns the database object.
import { WORKOUTS, EXERCISES } from "./data.js";
import {
  nextSession, buildSession, sessionTotals, sessionExercises, exerciseBreakdown, applyFeedback, isoDate, addDays, daysBetween,
  daysSinceHard, isHard, hardInLast7, weekIndex, RULES
} from "./plan.js";
import { load, save, exportFile, importFile, saveDraft, takeDraft, clearDraft } from "./store.js";
import { esc, exName, seenKey, frameHtml, howToHtml, openSheet, closeSheet, bindSheet, toast, fmt1, fmtKm, kcalPerMin, bindVideos, MONTHS } from "./ui.js";
import { startTimer, bindTimer } from "./timer.js";
import { netWorkoutKcal, monthChange, bodyFor } from "./forecast.js";
import { dynamicsSheet, askProfile } from "./dynamics.js";
import { resultsSheet } from "./results.js";
import { videoListSheet, playVideo, videoTitle, videoKcal, VIDEO_WORKOUTS } from "./videos.js";

const STEPS_PER_KM = 1350;
const MAX_KM_PER_DAY = 60;
const HOME_HINT_DELAY_MS = 3800;
const WALK_KCAL_PER_KG_KM = 0.5;
const WEIGHT_EVERY_DAYS = 7;
const WALK_NORM = [[2, 4], [4, 5], [8, 6], [Infinity, 7]];
const WEEKDAY_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const KIND_TITLE = { light: "Спина и шея", stand: "Стоя, без пола", morning: "Утренний комплекс", chin: "Шея и подбородок", office: "Офис: перерыв от сидения", pelvic: "Тазовое дно: мужское здоровье" };
const SOFT_KINDS = new Set(["light", "stand", "morning", "chin", "office", "pelvic"]);
// One full office routine a day; short stand-ups every 30–60 min do the rest (Dunstan 2012).
const OFFICE_GOAL = 1;

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
  return db.days[date] || { km: 0, morning: false, cold: false, chin: false, office: 0 };
}
function kindTitle(kind, type, video = null) {
  if (kind === "video") return `Видео: ${videoTitle(video)}`;
  if (kind === "short") return `Короткая · ${WORKOUTS[type].title.replace("Всё тело: ", "")}`;
  return KIND_TITLE[kind] || WORKOUTS[kind].title;
}
function planFor(kind, type, params) {
  const level = SOFT_KINDS.has(kind) ? db.level : params.level;
  return buildSession(kind, type, level, params.rounds);
}
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
function minLabel(session) {
  const m = minutesOf(session);
  return `≈${m} ${plural(m, "минута", "минуты", "минут")}`;
}
function kcalOf(session) {
  return Math.round(sessionTotals(session, currentWeight()).kcal);
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
  const begin = (startDate) => askWeight(db.startWeight, (kg) => askProfile(db.profile, (profile) => {
    root.hidden = true;
    commit({ ...db, startDate, startWeight: kg, weights: [{ date: today(), kg }], profile });
  }), "Ваш вес сейчас?", "Прокрутите колёса до своего веса.");
  $("ob-today").addEventListener("click", () => begin(today()));
  $("ob-monday").addEventListener("click", () => {
    const d = new Date();
    const shift = (8 - d.getDay()) % 7;
    begin(addDays(today(), shift));
  });
}

/* ---------- weight picker (two iOS wheels) ---------- */
function askWeight(initial, onSave, title = "Записать вес", hint = "Утром, до еды, раз в неделю.") {
  const kg = Math.floor(initial);
  const tenth = Math.round((initial - kg) * 10);
  const kgOpts = Array.from({ length: 111 }, (_, i) => 50 + i).map((v) => `<option value="${v}" ${v === kg ? "selected" : ""}>${v}</option>`).join("");
  const tOpts = Array.from({ length: 10 }, (_, i) => `<option value="${i}" ${i === tenth ? "selected" : ""}>${i}</option>`).join("");
  const body = openSheet(`<h3 class="sheet-title">${esc(title)}</h3>
    <p class="muted">${esc(hint)}</p>
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
const altRow = (attrs, title, sub = "") => `<button type="button" class="btn alt" ${attrs}><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</button>`;
// Secondary choices sit in one quiet list under the main card, so «Начать» is the only loud button.
const altsHtml = (rows = []) => `<div class="alts">${rows.join("")}${altRow("data-videos", "Видео-тренировки", "вместе с 3D-тренером под музыку")}${altRow("data-other", "Другая тренировка")}</div>`;

// One row: four exercises and «+N»; the full list sits behind «?».
const THUMBS_SHOWN = 4;
function thumbs(session) {
  const keys = sessionExercises(session);
  const shown = keys.length > THUMBS_SHOWN + 1 ? keys.slice(0, THUMBS_SHOWN) : keys;
  const more = keys.length - shown.length;
  return `<div class="thumbs">${shown.map((k) => `<span>${frameHtml(k, 0, session.level)}</span>`).join("")}${more ? `<span class="more">+${more}</span>` : ""}</div>`;
}

function hardCard(plan) {
  const main = planFor(plan.mainKind, plan.type, plan.params);
  const exCount = sessionExercises(main).length;
  const rounds = main.steps.filter((s) => s.phase === "work" && s.idx === 0).length;
  const altFull = plan.mainKind === "short"
    ? { kind: plan.type, label: WORKOUTS[plan.type].title, sub: "полная тренировка" }
    : { kind: "short", label: `Короткая · ${minLabel(planFor("short", plan.type, plan.params))}`, sub: "те же упражнения, 2 круга" };
  return `<article class="card main">
    <button type="button" class="info-btn" data-info="${plan.mainKind}" data-type="${plan.type}" aria-label="Что в этой тренировке">?</button>
    <h2>${esc(kindTitle(plan.mainKind, plan.type))}</h2>
    <p class="meta">${minLabel(main)} · <b>≈${kcalOf(main)} ккал</b> · ${exCount} ${plural(exCount, "упражнение", "упражнения", "упражнений")} · ${rounds} ${plural(rounds, "круг", "круга", "кругов")}</p>
    <p class="meta faint">Уровень ${plan.params.level} из ${RULES.MAX_LEVEL}</p>
    ${thumbs(main)}
    <button type="button" class="btn primary huge" data-start="${plan.mainKind}" data-type="${plan.type}">Начать</button>
  </article>
  ${altsHtml([
    altRow(`data-start="${altFull.kind}" data-type="${plan.type}"`, altFull.label, altFull.sub),
    plan.lightToday ? "" : altRow(`data-start="light"`, `Спина и шея · ${minLabel(planFor("light", null, plan.params))}`, "мягко, без прыжков"),
  ])}`;
}

function lightCard(plan) {
  if (plan.lightToday) {
    return `<article class="card main ok"><h2>Мягкий день сделан ✓</h2>
      <p class="meta">Можно добавить прогулку.</p>
      <button type="button" class="btn primary huge" data-walk>Прогулка</button></article>
    ${altsHtml()}`;
  }
  const s = planFor("light", null, plan.params);
  return `<article class="card main soft">
    <button type="button" class="info-btn" data-info="light" aria-label="Что в этой тренировке">?</button>
    <h2>Спина и шея</h2>
    <p class="meta">${esc(plan.reason || "Мягкий день")} · ${minLabel(s)} · <b>≈${kcalOf(s)} ккал</b></p>
    ${thumbs(s)}
    <button type="button" class="btn primary huge" data-start="light">Начать</button>
  </article>
  ${altsHtml()}`;
}

function doneCard(plan) {
  const s = plan.doneSession;
  const tomorrow = nextSession(db, addDays(today(), 1));
  const tomorrowLabel = tomorrow.status === "hard" ? kindTitle(tomorrow.mainKind, tomorrow.type) : "Спина и шея";
  return `<article class="card main ok">
    <h2>${esc(kindTitle(s.kind, s.type))} ✓</h2>
    <p class="meta">${s.minutes} ${plural(s.minutes, "минута", "минуты", "минут")} · <b>${s.kcal} ккал</b></p>
    <p class="meta">Завтра: ${esc(tomorrowLabel)}</p>
  </article>
  ${altsHtml([plan.lightToday ? "" : altRow(`data-start="light"`, `Ещё: Спина и шея · ${minLabel(planFor("light", null, plan.params))}`, "мягко, для спины и осанки")])}`;
}

function routineTile(kind, done, title, sub) {
  const action = done
    ? `<button type="button" class="btn small done" data-toggle="${kind}">Сделано ✓</button>`
    : `<button type="button" class="btn small" data-start="${kind}">Начать</button>`;
  return `<div class="tile ${done ? "on" : ""}">
      <button type="button" class="tile-main" data-info="${kind}"><b>${esc(title)}</b><span>${esc(sub)}</span></button>
      <div class="tile-actions">${action}</div>
    </div>`;
}

function officeTile(count) {
  const s = planFor("office", null, {});
  const done = count >= OFFICE_GOAL;
  return `<div class="tile ${done ? "on" : ""}">
      <button type="button" class="tile-main" data-info="office"><b>Офис</b><span>${minLabel(s)}, раз в день</span></button>
      <div class="tile-actions"><button type="button" class="btn small ${done ? "done" : ""}" data-start="office">${done ? "Сделано ✓" : "Начать"}</button></div>
    </div>`;
}

function markTiles(week) {
  const d = dayOf(today());
  const norm = walkNorm(week);
  return `<h3 class="section-title">Отметить сегодня</h3>
  <div class="tiles">
    <div class="tile">
      <button type="button" class="tile-main" data-walk><b>Ходьба</b><span>${fmtKm(d.km)} из ${norm} км</span></button>
      <div class="tile-actions"><button type="button" class="btn small" data-km="1">+1 км</button></div>
    </div>
    ${routineTile("morning", d.morning, "Утро", minLabel(planFor("morning", null, {})))}
    ${officeTile(d.office || 0)}
    ${routineTile("chin", d.chin, "Шея и подбородок", minLabel(planFor("chin", null, {})))}
    <div class="tile ${d.cold ? "on" : ""}">
      <div class="tile-main"><b>Холодный душ</b><span>30–90 секунд</span></div>
      <div class="tile-actions"><button type="button" class="btn small ${d.cold ? "done" : ""}" data-toggle="cold">${d.cold ? "Сделано ✓" : "Готово"}</button></div>
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
  const count = total ? `${total} ${plural(total, "тренировка", "тренировки", "тренировок")}` : "";
  if (sorted.length < 2) return "";
  const now = sorted[sorted.length - 1].kg;
  const lost = db.startWeight - now;
  const pct = Math.max(0, Math.min(100, (lost / db.goalLoss) * 100));
  const label = lost >= 0 ? `−${fmt1(lost)} кг` : `+${fmt1(-lost)} кг`;
  return `<div class="progress">
    <div class="progress-num"><b>${label}</b> из ${db.goalLoss}</div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <p class="progress-line">Сейчас ${fmt1(now)} кг, старт ${fmt1(db.startWeight)}${count ? " · " + count : ""}</p>
  </div>`;
}

function todayBurn() {
  const { train, walk } = burnOn(today());
  const parts = [train ? `тренировки ${train}` : "", walk ? `ходьба ${walk}` : ""].filter(Boolean).join(" · ");
  return `<button type="button" class="burn" data-dyn><span>Сожжено сегодня</span><b class="${train + walk ? "" : "zero"}">${train + walk} ккал</b>${parts ? `<small>${parts}</small>` : ""}${paceLine()}</button>`;
}

/** «Через месяц ≈94,4 кг −0,6 кг» at the pace of the last 7 days. */
function paceLine() {
  const weight = currentWeight();
  const kg = monthChange({ profile: bodyFor(db.profile, weight), intake: db.intake, activity: activityPerDay(recentDates()) });
  const delta = kg <= -0.05 ? ` <em>−${fmt1(-kg)}</em>` : kg >= 0.05 ? ` <em class="up">+${fmt1(kg)}</em>` : "";
  return `<span class="burn-pace"><span>Через месяц</span><b>≈${fmt1(weight + kg)} кг${delta} ›</b></span>`;
}

/* ---------- «Динамика»: calories by day and the 30-day forecast ---------- */
// Bars from the start date: at least a week so one day is not one fat bar, at most two weeks.
const BURN_CHART_DAYS = [7, 14];
function burnOn(date) {
  const w = currentWeight();
  const ss = db.sessions.filter((s) => s.date === date);
  const walk = Math.round(dayOf(date).km * WALK_KCAL_PER_KG_KM * w);
  return { train: ss.reduce((sum, s) => sum + s.kcal, 0), walk, net: ss.reduce((sum, s) => sum + netWorkoutKcal(s.kcal, s.minutes, w), 0) + walk };
}
/** Up to the last 7 days, never before the start date. */
function recentDates() {
  const t = today();
  const since = db.startDate && db.startDate <= t ? daysBetween(db.startDate, t) + 1 : 1;
  return Array.from({ length: Math.min(7, since) }, (_, i) => addDays(t, -i));
}
/** Net kcal a day from workouts and walks over the given dates. */
function activityPerDay(dates) {
  return Math.round(dates.reduce((sum, d) => sum + burnOn(d).net, 0) / dates.length);
}
/** Kcal a day if the plan is followed: the weekly cap of full workouts plus the walking norm. */
function plannedActivity() {
  const t = today();
  const plan = nextSession(db, t);
  const main = planFor(plan.type, plan.type, plan.params);
  const workout = netWorkoutKcal(kcalOf(main), minutesOf(main), currentWeight());
  const walk = walkNorm(weekIndex(db.startDate, t)) * WALK_KCAL_PER_KG_KM * currentWeight();
  return Math.round((plan.cap * workout) / 7 + walk);
}
function openResults() {
  const start = db.startDate || today();
  resultsSheet({ weight: currentWeight(), startWeight: db.startWeight, goalLoss: db.goalLoss, startDate: start, startTitle: dateTitle(start), sex: db.profile.sex });
}
function editProfile(then) {
  askProfile(db.profile, (profile) => { commit({ ...db, profile }); if (then) then(); });
}
function openDynamics() {
  const t = today();
  const since = db.startDate && db.startDate <= t ? daysBetween(db.startDate, t) + 1 : 1;
  const span = Math.min(BURN_CHART_DAYS[1], Math.max(BURN_CHART_DAYS[0], since));
  const days = Array.from({ length: span }, (_, i) => addDays(t, i - span + 1)).map((d) => {
    const { train, walk } = burnOn(d);
    return { label: d === t ? "сег" : String(Number(d.slice(8))), train, walk, today: d === t };
  });
  dynamicsSheet({
    profile: db.profile, intake: db.intake, weight: currentWeight(), days,
    activity: { week: activityPerDay(recentDates()), plan: plannedActivity() },
    avgBurn: Math.round(recentDates().reduce((sum, d) => sum + burnOn(d).train + burnOn(d).walk, 0) / recentDates().length),
    walkKcalPerKm: WALK_KCAL_PER_KG_KM * currentWeight(),
    onSave: ({ intake }) => { if (intake !== db.intake) commit({ ...db, intake }); },
    onEditProfile: () => editProfile(openDynamics),
    onLongTerm: openResults
  });
}

function renderToday() {
  const t = today();
  const plan = nextSession(db, t);
  const week = weekIndex(db.startDate, t);
  const notStarted = db.startDate && db.startDate > t;
  const card = notStarted
    ? `<article class="card main soft"><h2>До старта ${daysBetween(t, db.startDate)} дн.</h2><p class="meta">Старт ${esc(dateTitle(db.startDate))}. Можно начать раньше.</p><button type="button" class="btn primary huge" data-start="A" data-type="A" data-early>Начать сегодня</button></article>${altsHtml()}`
    : plan.status === "done" ? doneCard(plan) : plan.status === "light" ? lightCard(plan) : hardCard(plan);
  $("screen-today").innerHTML = `
    <header class="large-title"><h1>Сегодня</h1><p>${esc(dateTitle(t))} · неделя ${week}</p></header>
    ${plan.banner && !notStarted ? `<p class="banner">${esc(plan.banner)}</p>` : ""}
    ${card}
    ${weightCard()}
    ${markTiles(week)}
    ${todayBurn()}
    ${progressBlock()}
    <div class="alts">${altRow("data-results", "Что будет через 1, 3 и 6 месяцев")}</div>
    <button type="button" class="btn link safety" data-goto-safety>Когда нельзя тренироваться</button>`;
}

/* ---------- start a session ---------- */
function launch(kind, type, { early = false } = {}) {
  const t = today();
  const plan = nextSession(db, t);
  const params = plan.params;
  if (early && db.startDate > t) commit({ ...db, startDate: t });
  const resetSeen = params.comeback === "long";
  const session = planFor(kind, type, params);
  // Straight into the timer: it opens on the first exercise and waits for «Начать».
  const intro = db.sessions.length === 0 ? "Боль в суставе, в спине или головокружение: стоп. Жжение в мышцах: норма." : null;
  startTimer(session, { level: session.level, weight: currentWeight(), sound: db.sound, tempoVoice: db.tempo, intro, onEnd: (r) => finishSession(r, params, resetSeen),
    onDraft: (d) => (d ? saveDraft({ ...d, date: today(), weight: currentWeight() }) : clearDraft()) });
}

function finishSession(result, params, resetSeen) {
  if (!result) { render(); return; }
  if (result.skipped) { toast("Меньше 30 секунд движения, записывать нечего"); render(); return; }
  const { session, totals, feel, partial, level, parts = [] } = result;
  const date = result.date || today();
  const now = new Date();
  const entry = {
    id: `${date}-${now.getTime().toString(36)}`,
    date,
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    kind: session.kind,
    type: session.type,
    level,
    minutes: Math.round(totals.seconds / 60),
    kcal: Math.round(totals.kcal),
    feel,
    partial,
    parts
  };
  const seenBase = resetSeen ? {} : db.seen;
  const seen = partial ? seenBase : sessionExercises(session).reduce((acc, k) => ({ ...acc, [seenKey(k, level)]: (acc[seenKey(k, level)] || 0) + 1 }), { ...seenBase });
  const hardKind = !SOFT_KINDS.has(session.kind);
  const fb = hardKind && !partial && feel ? applyFeedback({ level, easyStreak: db.easyStreak, hardStreak: db.hardStreak }, feel, { noRaise: params.noRaise }) : null;
  const habit = session.kind === "chin" ? "chin" : session.kind === "light" || session.kind === "morning" ? "morning" : null;
  const day = dayOf(date);
  const days = partial ? db.days
    : session.kind === "office" ? { ...db.days, [date]: { ...day, office: (day.office || 0) + 1 } }
    : habit ? { ...db.days, [date]: { ...day, [habit]: true } } : db.days;
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
  else toast(result.recovered ? `Записал прерванную тренировку: ${entry.kcal} ккал` : partial ? `Записано, что успели: ${entry.kcal} ккал` : "Записано");
  maybeHomeHint();
}

/* ---------- «Видео-тренировки» ---------- */
function openVideos() {
  videoListSheet({ weight: currentWeight(), sex: db.profile.sex, onPick: (video) => playVideo(video, {
    weight: currentWeight(),
    onEnd: (r) => (r ? saveVideo(r.video.id, r.sec, r.kcal) : toast("Меньше минуты, записывать нечего")),
    onDraft: (d) => (d ? saveDraft({ ...d, date: today() }) : clearDraft())
  }) });
}
function saveVideo(id, sec, kcal, date = today(), recovered = false) {
  const now = new Date();
  const entry = {
    id: `${date}-${now.getTime().toString(36)}`, date,
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    kind: "video", type: null, level: db.level, minutes: Math.max(1, Math.round(sec / 60)), kcal, feel: null, partial: false, parts: [], video: id
  };
  commit({ ...db, sessions: [...db.sessions, entry] });
  toast(`${recovered ? "Записал прерванное видео" : "Записано"}: ${kcal} ккал`);
}

/** A workout cut short by a closed app or a call: record the part that was done. */
const MIN_RECOVER_ACTIVE_S = 30;
function recoverDraft() {
  const draft = takeDraft();
  if (!draft) return;
  if (draft.video) {
    const video = VIDEO_WORKOUTS.find((v) => v.id === draft.video);
    const sec = Math.round(Number(draft.sec));
    if (video && sec >= MIN_RECOVER_ACTIVE_S * 2) saveVideo(video.id, sec, videoKcal(video, Number(draft.weight) || currentWeight(), sec), draft.date, true);
    return;
  }
  const weight = Number(draft.weight) || currentWeight();
  const parts = exerciseBreakdown(draft.session, weight, draft.spent);
  if (parts.reduce((sum, p) => sum + p.sec, 0) < MIN_RECOVER_ACTIVE_S) return;
  const totals = sessionTotals(draft.session, weight, draft.spent);
  const level = Math.round(Number(draft.level)) || db.level;
  finishSession({ session: draft.session, totals, feel: null, partial: totals.ratio < RULES.PARTIAL_RATIO, level, parts, date: draft.date, recovered: true }, {}, false);
}

function maybeHomeHint() {
  const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  if (standalone || db.homeHintShown) return;
  commit({ ...db, homeHintShown: true });
  setTimeout(() => showHomeHint(), HOME_HINT_DELAY_MS);
}

function showHomeHint() {
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
  const recommended = plan.status === "hard" ? plan.mainKind : plan.status === "light" ? "light" : null;
  const item = (kind, type, label, sub) => {
    const session = planFor(kind, type, p);
    const rec = kind === recommended && (kind !== plan.mainKind || type === plan.type) ? `<span class="rec">по плану · </span>` : "";
    return `<button type="button" class="list-item" data-start="${kind}" ${type ? `data-type="${type}"` : ""}><b>${esc(label)}</b><small>${rec}${minLabel(session)} · ≈${kcalOf(session)} ккал · ${esc(sub)}</small></button>`;
  };
  const hint = dh === 1 ? `<p class="banner">Вчера уже была силовая. Сегодня лучше «Спина и шея».</p>` : "";
  const body = openSheet(`<h3 class="sheet-title">Другая тренировка</h3>${hint}
    <p class="list-group">Силовые</p>
    <div class="list">
      ${item("A", "A", WORKOUTS.A.title, "приседания, отжимания, мост")}
      ${item("B", "B", WORKOUTS.B.title, "выпады, пайк, супермен")}
      ${item("C", "C", WORKOUTS.C.title, "бёрпи, выпады, скалолаз")}
      ${item("short", plan.type, kindTitle("short", plan.type), "2 круга, когда мало времени")}
    </div>
    <p class="list-group">Мягкие</p>
    <div class="list">
      ${item("light", null, "Спина и шея", "мягко, без прыжков")}
      ${item("morning", null, "Утренний комплекс", "для спины после сна")}
      ${item("chin", null, "Шея и подбородок", "от второго подбородка")}
      ${item("office", null, "Офис", "стоя и сидя, без пота, раз в день")}
      ${item("stand", null, "Стоя, без пола", "хлопки, колени, глубокий присед")}
    </div>
    ${db.profile.sex === "f" ? "" : `<p class="list-group">Мужское здоровье</p>
    <div class="list"><button type="button" class="list-item" data-info="pelvic"><b>Тазовое дно (Кегель)</b><small>${minLabel(planFor("pelvic", null, p))} · программа на 3 месяца · эрекция и контроль</small></button></div>`}
    <p class="list-group">Без таймера</p>
    <div class="list"><button type="button" class="list-item" data-walk><b>Прогулка</b><small>отметить километры или шаги</small></button></div>`);
  body.addEventListener("click", onTodayClick);
}

/** Parses "3,5" / "3.5" km or "8 432" steps into km; null when it is not a sensible number. */
function parseWalk(text, unit) {
  const n = Number(String(text).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const km = unit === "steps" ? n / STEPS_PER_KM : n;
  return km > MAX_KM_PER_DAY ? null : Math.round(km * 10) / 10;
}

const INFO_INTRO = {
  office: "Каждые 30–60 минут сидения вставайте хотя бы на пару минут, а раз в день делайте этот комплекс. Всё стоя или сидя, в обычной одежде и без пота. Короткие перерывы в сидении снижают сахар после еды, а упражнения для лопаток и шеи на рабочем месте уменьшают боль в шее и плечах.",
  morning: "Делайте сразу после сна, можно прямо на кровати или на коврике. Снимает утреннюю скованность в спине и шее.",
  light: "Мягкая тренировка для спины, шеи и осанки. Подходит на следующий день после силовой.",
  stand: "Всё стоя, без пола и прыжков: пресс, ноги и пульс.",
  pelvic: "Мышцы тазового дна сжимают основание пениса и помогают удерживать эрекцию и контролировать семяизвержение. Тренировать их можно незаметно, без формы и коврика. Мышцы крепнут за 4–6 недель, эффект на эрекцию — через 3–6 месяцев.",
  chin: "Жир под подбородком уходит только вместе с общим весом, заметно после −5…8 кг. Эти упражнения укрепляют шею и возвращают голову на место: осанка головы меняется уже за 3–4 недели, и подбородок меньше «складывается». Лучше каждый день."
};

// Week-by-week plan for programs you keep up for months (Dorey et al., 2005: daily for 3 months, then keep it up).
const INFO_PROGRAM = {
  pelvic: `<p class="list-group">Программа</p>
    <ol class="cues">
      <li><b>Недели 1–2.</b> Этот комплекс раз в день. Стоя 10 с не держится — держите сколько получается.</li>
      <li><b>Недели 3–12.</b> Два раза в день: утром и вечером.</li>
      <li><b>Дальше.</b> Раз в день, чтобы не потерять результат.</li>
      <li><b>Весь день.</b> После туалета 2–3 сильных сжатия, чтобы не было капель. Сжимайте при кашле и перед подъёмом тяжёлого.</li>
    </ol>
    <p class="homeline">Сильнее всего на эрекцию влияют ходьба, тренировки и снижение веса: всё это уже есть в вашем плане. Если проблема держится больше 3 месяцев, сходите к урологу: иногда это первый знак проблем с сосудами.</p>`
};

/** «?»: what is inside a session, what each exercise gives and how many calories. */
function infoSheet(kind, type) {
  const plan = nextSession(db, today());
  const session = planFor(kind, type, plan.params);
  const weight = currentWeight();
  const totals = sessionTotals(session, weight);
  const level = session.level;
  const rows = sessionExercises(session).map((k) => `<details class="info-row">
      <summary><span class="info-thumb">${frameHtml(k, 0, level)}</span><span class="info-text"><b>${esc(exName(k, level))}</b><small>${esc(EXERCISES[k].gives)}</small></span><span class="info-kcal"><b>${Math.round(kcalPerMin(k, weight))}</b><small>ккал/мин</small></span></summary>
      <div class="info-more">${howToHtml(k, level, null, { showTitle: false })}<button type="button" class="btn link info-collapse" data-collapse>Свернуть ▲</button></div>
    </details>`).join("");
  const intro = (INFO_INTRO[kind] ? `<p class="muted">${esc(INFO_INTRO[kind])}</p>` : "") + (INFO_PROGRAM[kind] || "");
  const extra = kind === "morning" || kind === "chin" ? `<button type="button" class="btn big" data-toggle="${kind}">${dayOf(today())[kind] ? "Снять отметку" : "Отметить без таймера"}</button>` : "";
  const body = openSheet(`<h3 class="sheet-title">${esc(kindTitle(kind, type))}</h3>
    <p class="info-sum">${minLabel(session)} · ≈${Math.round(totals.kcal)} ккал за всю тренировку</p>
    ${intro}
    <p class="muted small">Нажмите на упражнение: фото, техника и видео.</p>
    <div class="info-list">${rows}</div>
    <div class="sheet-foot">
      <button type="button" class="btn primary big" data-start="${kind}" ${type ? `data-type="${type}"` : ""}>Начать</button>
      ${extra}
    </div>
    <p class="fine">Калории примерные, для вашего веса ${fmt1(weight)} кг.</p>`);
  body.addEventListener("click", (e) => {
    const collapse = e.target.closest("[data-collapse]");
    if (collapse) {
      const row = collapse.closest("details");
      row.open = false;
      row.scrollIntoView({ block: "nearest" });
      return;
    }
    onTodayClick(e);
  });
}

function walkSheet(date = today()) {
  const isToday = date === today();
  const recorded = dayOf(date).km;
  let unit = "km";
  // Nothing recorded yet: one «Записать». Add/replace/reset only make sense once there is a number.
  const actions = recorded > 0
    ? `<button type="button" class="btn primary big" data-add>Добавить к записанному</button>
    <button type="button" class="btn big" data-set>Заменить: это всё за день</button>
    <button type="button" class="btn link" data-reset>Обнулить ходьбу за этот день</button>`
    : `<button type="button" class="btn primary big" data-add>Записать</button>`;
  const body = openSheet(`<h3 class="sheet-title">Ходьба ${isToday ? "сегодня" : "· " + esc(dateTitle(date))}</h3>
    ${recorded > 0 ? `<p class="muted">Уже записано: <b>${fmtKm(recorded)} км</b></p>` : ""}
    <div class="row3"><button type="button" class="btn big" data-km="1">+1 км</button><button type="button" class="btn big" data-km="2">+2 км</button><button type="button" class="btn big" data-km="3">+3 км</button></div>
    <p class="list-group">Или введите точно</p>
    <div class="seg" role="group" aria-label="Единицы">
      <button type="button" class="on" data-unit="km">Километры</button>
      <button type="button" data-unit="steps">Шаги</button>
    </div>
    <label class="sr" for="walk-input">Сколько прошли</label>
    <input id="walk-input" class="num-input" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="например, 3,5">
    <p class="muted" id="walk-hint">Шаги можно взять из приложения «Здоровье». 1&nbsp;км&nbsp;≈&nbsp;${STEPS_PER_KM}&nbsp;шагов.</p>
    ${actions}`);
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
      const raw = Number(String(input.value).replace(/\s/g, "").replace(",", "."));
      const tooMuch = Number.isFinite(raw) && (unit === "steps" ? raw / STEPS_PER_KM : raw) > MAX_KM_PER_DAY;
      hint.textContent = tooMuch ? `Слишком много: больше ${MAX_KM_PER_DAY} км за день не бывает.`
        : unit === "steps" ? "Введите число шагов, например 8432." : "Введите километры, например 3,5.";
      hint.classList.add("error");
      input.focus();
      return;
    }
    if (km === 0) { hint.textContent = "Это меньше 0,1 км, записывать нечего."; hint.classList.add("error"); return; }
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
  if (el.hasAttribute("data-results")) { openResults(); return; }
  if (el.hasAttribute("data-dyn")) { openDynamics(); return; }
  if (el.hasAttribute("data-videos")) { openVideos(); return; }
  if (el.dataset.km) { addKm(Number(el.dataset.km)); return; }
  if (el.dataset.info) { infoSheet(el.dataset.info, el.dataset.type || nextSession(db, today()).type); return; }
  if (el.dataset.toggle) { closeSheet(); const k = el.dataset.toggle; setDay(today(), { [k]: !dayOf(today())[k] }); return; }
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

function diaryCount() {
  const n = db.sessions.filter((s) => !s.partial).length;
  return `${n} ${plural(n, "тренировка", "тренировки", "тренировок")}`;
}

/** Calories per exercise of one recorded session, biggest first. */
function partsList(s) {
  if (!s.parts?.length) return "";
  const rows = [...s.parts].sort((a, b) => b.kcal - a.kcal)
    .map((p) => `<li><span>${esc(EXERCISES[p.ex] ? exName(p.ex, s.level) : p.ex)}</span><b>${p.kcal} ккал</b></li>`).join("");
  return `<ul class="d-parts in-list">${rows}</ul>`;
}

function weekTiles() {
  const t = today();
  const week = weekIndex(db.startDate, t);
  const plan = nextSession(db, t);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const km = dates.reduce((s, d) => s + dayOf(d).km, 0);
  const mornings = dates.filter((d) => dayOf(d).morning).length;
  const normKm = walkNorm(week) * 7;
  const kcalWork = db.sessions.filter((s) => dates.includes(s.date)).reduce((sum, s) => sum + s.kcal, 0);
  const kcalWalk = Math.round(km * WALK_KCAL_PER_KG_KM * currentWeight());
  const tile = (v, k, ratio) => `<div class="stat"><b>${v}</b><span>${k}</span><div class="bar"><i style="width:${Math.min(100, Math.round(ratio * 100))}%"></i></div></div>`;
  return `<div class="stats">${tile(`${hardInLast7(db.sessions, t)} из ${plan.cap}`, "силовых за 7 дней", hardInLast7(db.sessions, t) / plan.cap)}${tile(`${fmtKm(km)} из ${normKm}`, "км ходьбы", km / normKm)}${tile(`${mornings} из 7`, "утренних комплексов", mornings / 7)}<div class="stat"><b>≈${kcalWork + kcalWalk}</b><span>ккал за 7 дней: тренировки ${kcalWork} + ходьба ${kcalWalk}</span></div></div>`;
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
  const dates = new Set([...db.sessions.map((s) => s.date), ...Object.keys(db.days).filter((d) => { const x = db.days[d]; return x.km || x.morning || x.cold || x.office; }), ...db.weights.map((w) => w.date)]);
  const list = [...dates].sort().reverse().slice(0, 30);
  if (!list.length) return `<p class="muted">Здесь появятся ваши дни. Начните с кнопки на экране «Сегодня».</p>`;
  return `<div class="days">${list.map((date) => {
    const ss = db.sessions.filter((s) => s.date === date);
    const d = dayOf(date);
    const w = db.weights.find((x) => x.date === date);
    const parts = [
      ...ss.map((s) => `${kindTitle(s.kind, s.type, s.video)}${s.partial ? " (неполная)" : ""} · ${s.minutes} мин · ${s.kcal} ккал`),
      d.km ? `ходьба ${fmtKm(d.km)} км` : "", d.morning ? "утро ✓" : "", d.chin ? "подбородок ✓" : "", d.office ? (d.office > 1 ? `офис ×${d.office}` : "офис ✓") : "", d.cold ? "холод ✓" : "", w ? `вес ${fmt1(w.kg)}` : ""
    ].filter(Boolean);
    return `<button type="button" class="day" data-day="${date}"><b>${esc(dateTitle(date))}</b><span>${esc(parts.join(" · "))}</span></button>`;
  }).join("")}</div>`;
}

function renderDiary() {
  $("screen-diary").innerHTML = `<header class="large-title"><h1>Дневник</h1><p>Последние 7 дней · всего ${diaryCount()}</p></header>
    ${stripHtml()}${weekTiles()}
    <h3 class="section-title">Вес</h3>${weightChart()}
    <button type="button" class="btn" data-weight>Записать вес</button>
    <h3 class="section-title">Дни</h3>${dayCards()}`;
}

function dayEditSheet(date) {
  const ss = db.sessions.filter((s) => s.date === date);
  const d = dayOf(date);
  const body = openSheet(`<h3 class="sheet-title">${esc(dateTitle(date))}</h3>
    <div class="list">${ss.map((s) => `<div class="list-item static"><b>${esc(kindTitle(s.kind, s.type, s.video))}${s.partial ? " (неполная)" : ""}</b><small>${s.time} · ${s.minutes} мин · ${s.kcal} ккал</small>${partsList(s)}<button type="button" class="btn small danger" data-del="${esc(s.id)}">Удалить</button></div>`).join("") || `<p class="muted">Тренировок не было.</p>`}</div>
    <button type="button" class="btn big" data-walk-day>Ходьба: ${fmtKm(d.km)} км · изменить</button>
    <div class="row"><button type="button" class="btn ${d.morning ? "done" : ""}" data-t="morning">Утро ${d.morning ? "✓" : ""}</button><button type="button" class="btn ${d.chin ? "done" : ""}" data-t="chin">Подбородок ${d.chin ? "✓" : ""}</button><button type="button" class="btn ${d.cold ? "done" : ""}" data-t="cold">Холод ${d.cold ? "✓" : ""}</button></div>`);
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

/** Restoring replaces everything, so show what is in the file and ask first. */
async function restoreBackup(file) {
  let restored;
  try {
    restored = await importFile(file);
  } catch (err) {
    console.error("restore failed", err);
    toast("Это не файл резервной копии «Минус 15».");
    return;
  }
  if (!restored.startDate) { toast("В файле нет данных программы, восстанавливать нечего."); return; }
  const n = restored.sessions.length;
  const w = restored.weights.length;
  const body = openSheet(`<h3 class="sheet-title">Заменить записи данными из файла?</h3>
    <p>В файле: ${n} ${plural(n, "тренировка", "тренировки", "тренировок")}, ${w} ${plural(w, "взвешивание", "взвешивания", "взвешиваний")}, старт ${esc(dateTitle(restored.startDate))}.</p>
    <p class="muted">Сейчас в телефоне: ${db.sessions.length} ${plural(db.sessions.length, "тренировка", "тренировки", "тренировок")}. Они будут заменены, отменить нельзя.</p>
    <div class="sheet-foot">
      <button type="button" class="btn primary big" data-ok>Заменить</button>
      <button type="button" class="btn big" data-cancel>Отмена</button>
    </div>`);
  body.querySelector("[data-cancel]").addEventListener("click", closeSheet);
  body.querySelector("[data-ok]").addEventListener("click", () => {
    closeSheet();
    commit(restored);
    toast(`Восстановлено: ${n} ${plural(n, "тренировка", "тренировки", "тренировок")}`);
  });
}

function bindHelp() {
  $("backup-save").addEventListener("click", shareBackup);
  $("backup-load").addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) restoreBackup(f); e.target.value = ""; });
  $("opt-sound").addEventListener("change", (e) => commit({ ...db, sound: e.target.checked }));
  $("opt-tempo").addEventListener("change", (e) => commit({ ...db, tempo: e.target.checked }));
  $("help-ex").innerHTML = ["A", "B", "C"].map((t) => `<h2 class="help-group">${esc(WORKOUTS[t].title)}</h2>${WORKOUTS[t].list.map((k) => `<details class="ex"><summary>${esc(EXERCISES[k].name)}</summary>${howToHtml(k, db.level)}</details>`).join("")}`).join("")
    + `<h2 class="help-group">Спина, шея, подбородок, стоя без пола</h2>${["birdDog", "chinTuck", "chinLift", "headLift", "neckFront", "neckSide", "clapLeg", "kneePush", "kneeElbow", "deepSquat"].map((k) => `<details class="ex"><summary>${esc(EXERCISES[k].name)}</summary>${howToHtml(k, db.level)}</details>`).join("")}`
    + (db.profile.sex === "f" ? "" : `<h2 class="help-group">Тазовое дно</h2>${["pfLong", "pfQuick", "pfSit", "pfStand"].map((k) => `<details class="ex"><summary>${esc(EXERCISES[k].name)}</summary>${howToHtml(k, db.level)}</details>`).join("")}`);
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
  $("opt-tempo").checked = db.tempo;
}

function init() {
  bindTimer();
  bindVideos();
  bindHelp();
  $("screen-today").addEventListener("click", onTodayClick);
  $("screen-diary").addEventListener("click", (e) => {
    const day = e.target.closest("[data-day]")?.dataset.day;
    if (day) dayEditSheet(day);
    if (e.target.closest("[data-weight]")) askWeight(currentWeight(), saveWeight);
  });
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  bindSheet();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") render(); });
  if (!db.startDate) renderOnboarding();
  render();
  recoverDraft();
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("offline cache unavailable", err));
  }
}

init();
