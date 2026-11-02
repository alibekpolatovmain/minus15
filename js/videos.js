// «Видео-тренировки»: follow-along workouts by P4P WORKOUTS, embedded from YouTube. Played time is counted, so a video stopped halfway still records its calories.
import { esc, openSheet, closeSheet } from "./ui.js";

// MET by intensity (Compendium of Physical Activities 2011): calisthenics moderate 3.8, vigorous circuits 8.0; standing fat-burn sits between.
const MET = { easy: 3.8, mid: 5, hard: 7 };
export const VIDEO_WORKOUTS = [
  { id: "plr3QNEDOTo", title: "Утренняя стоя: сжигаем жир", sub: "уровень 1, без пола", min: 11, met: MET.mid, group: "start" },
  { id: "nV80y796Gwk", title: "Грудь", sub: "уровень 1", min: 10, met: MET.easy, group: "start" },
  { id: "jWc8gHlAkoM", title: "Грудь, домашняя версия", sub: "3 фазы отжиманий", min: 12, met: MET.easy, group: "start" },
  { id: "x59f9A1l0ao", title: "Пресс за 8 минут", sub: "уровень 1", min: 11, met: MET.easy, group: "start" },
  { id: "q6QLEtvGLAw", title: "Ягодицы и ноги", sub: "уровень 1", min: 11, met: MET.easy, group: "start" },
  { id: "3-3B7mPXoLA", title: "Всё тело, день 1: плечи", sub: "программа для новичков", min: 9, met: MET.easy, group: "start" },
  { id: "1mMqRGUaaCA", title: "Всё тело, день 2: пресс", sub: "программа для новичков", min: 10, met: MET.easy, group: "start" },
  { id: "sD2efjAm1AU", title: "Грудь и пресс утром", sub: "уровень 1", min: 14, met: MET.easy, group: "start" },
  { id: "Uzo4DKvZEG4", title: "7 минут на всё тело", sub: "с прыжками", min: 9, met: MET.hard, group: "more" },
  { id: "xJ9EmAmEjCM", title: "Body Booster: всё тело", sub: "быстрый темп", min: 12, met: MET.hard, group: "more" },
  { id: "kIaqbrWBexY", title: "Грудь", sub: "уровень 2", min: 12, met: MET.mid, group: "more" },
  { id: "oXSdZeQHA6U", title: "Плечи дома", sub: "программа для новичков, день 10", min: 13, met: MET.mid, group: "more" },
  { id: "TetN47J-Lxo", title: "Длинная: 500 ккал", sub: "25 минут, всё тело", min: 25, met: MET.hard, group: "more" }
];
const BY_ID = new Map(VIDEO_WORKOUTS.map((v) => [v.id, v]));
export const videoTitle = (id) => BY_ID.get(id)?.title || "Видео";

const MIN_RECORD_S = 60;
const POLL_MS = 1000;
// One poll can miss a beat (tab in background), but never adds more than this at once.
const MAX_STEP_S = 3;
const API_SRC = "https://www.youtube.com/iframe_api";
const YT_PLAYING = 1;

export const videoKcal = (video, weight, sec) => Math.round((video.met * weight * sec) / 3600);

/* ---------- list ---------- */
export function videoListSheet({ weight, onPick }) {
  const row = (v) => `<button type="button" class="vrow" data-video="${v.id}">
      <img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy">
      <span><b>${esc(v.title)}</b><small>${esc(v.sub)} · ${v.min} мин · ≈${videoKcal(v, weight, v.min * 60)} ккал</small></span></button>`;
  const group = (key) => VIDEO_WORKOUTS.filter((v) => v.group === key).map(row).join("");
  const body = openSheet(`<h3 class="sheet-title">Видео-тренировки</h3>
    <p class="muted">Делайте вместе с 3D-тренером под музыку. Голос на английском: смотрите на картинку и держите ритм. Калории считаю по времени, которое смотрели.</p>
    <p class="list-group">Для начала</p><div class="vlist">${group("start")}</div>
    <p class="list-group">Посложнее</p><div class="vlist">${group("more")}</div>`);
  body.addEventListener("click", (e) => {
    const id = e.target.closest("[data-video]")?.dataset.video;
    if (id) { closeSheet(); onPick(BY_ID.get(id)); }
  });
}

/* ---------- player ---------- */
let apiReady = null;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
    const s = document.createElement("script");
    s.src = API_SRC;
    s.onerror = () => { apiReady = null; reject(new Error("youtube api")); };
    document.head.appendChild(s);
  });
  return apiReady;
}

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/**
 * Full-screen player. onEnd({ video, sec, kcal }) fires once on close; sec is the time actually played.
 * onDraft(progress | null) keeps the played time on the device whenever the video pauses or ends.
 */
export function playVideo(video, { weight, onEnd, onDraft }) {
  const root = document.createElement("div");
  root.className = "vplayer";
  root.innerHTML = `<div class="vp-head"><b>${esc(video.title)}</b><button type="button" class="vp-close" aria-label="Закрыть">✕</button></div>
    <div class="vp-frame"><div id="vp-yt"></div></div>
    <div class="vp-stats"><p><b data-out="time">0:00</b><span>из ${video.min} мин</span></p><p><b data-out="kcal">0</b><span>ккал</span></p></div>
    <p class="vp-note" data-out="note">Нажмите ▶ на видео. Пауза — на самом видео.</p>
    <button type="button" class="btn primary huge" data-done>Закончить и записать</button>`;
  document.body.appendChild(root);
  document.body.classList.add("locked");
  let sec = 0;
  let player = null;
  let lastAt = null;
  const out = (k) => root.querySelector(`[data-out="${k}"]`);
  const draft = () => onDraft({ video: video.id, sec: Math.round(sec), weight });
  const timer = setInterval(() => {
    const playing = player?.getPlayerState?.() === YT_PLAYING;
    const now = Date.now();
    if (playing && lastAt) sec += Math.min(MAX_STEP_S, (now - lastAt) / 1000);
    lastAt = playing ? now : null;
    out("time").textContent = clock(sec);
    out("kcal").textContent = videoKcal(video, weight, sec);
  }, POLL_MS);

  loadApi().then(() => {
    player = new window.YT.Player("vp-yt", {
      videoId: video.id,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1 },
      events: { onStateChange: (e) => { if (e.data !== YT_PLAYING) draft(); } }
    });
  }).catch((err) => {
    console.error("YouTube player failed", err);
    out("note").innerHTML = `Видео не загрузилось. Проверьте интернет или <a href="https://www.youtube.com/watch?v=${video.id}" target="_blank" rel="noopener">откройте на YouTube</a>.`;
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    try { player?.destroy?.(); } catch (err) { console.warn("player destroy", err); }
    root.remove();
    document.body.classList.remove("locked");
    onDraft(null);
    onEnd(sec >= MIN_RECORD_S ? { video, sec: Math.round(sec), kcal: videoKcal(video, weight, sec) } : null);
  };
  root.querySelector("[data-done]").addEventListener("click", close);
  root.querySelector(".vp-close").addEventListener("click", close);
}
