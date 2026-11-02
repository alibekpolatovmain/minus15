// Shared view helpers: exercise media, names, bottom sheet, toast.
import { EXERCISES, FIGURES, FIGURE_VIEWBOX, YT } from "./data.js";
import { tierOf } from "./plan.js";
import { bodyMapHtml } from "./bodymap.js";

export const IMG = (id, n, ext = "jpg") => `img/${id}_${n}.${ext}`;

export function esc(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

export function exName(key, level, label) {
  if (label) return label;
  const ex = EXERCISES[key];
  return ex.tiers ? ex.tiers[tierOf(level)] : ex.name;
}

export function seenKey(key, level) {
  return EXERCISES[key].tiers ? `${key}:${tierOf(level)}` : key;
}

export function figureSvg(name, frame) {
  const f = FIGURES[name][frame];
  const helpers = [
    f.floor ? `<path d="M20 178 L280 178" stroke-width="4" opacity="0.45"/>` : "",
    f.mat ? `<rect x="96" y="6" width="108" height="182" rx="12" stroke-width="3" opacity="0.3"/>` : "",
    f.dashX ? `<path d="M${f.dashX} 20 L${f.dashX} 190" stroke-dasharray="6 8" stroke-width="2.5" opacity="0.45"/>` : "",
    f.chair ? `<path d="M112 64 L112 178 M108 118 L166 118 M162 118 L162 178" stroke-width="6" opacity="0.5"/>` : "",
    f.arrow ? `<path class="fig-move" d="${f.arrow}" stroke-width="5"/>` : "",
  ].join("");
  const marks = f.marks ? `<path class="fig-move" d="${f.marks}" stroke-width="7"/>` : "";
  const head = f.headP
    ? `<g transform="translate(${f.headP[0]} ${f.headP[1]}) rotate(${f.headP[2]})" fill="currentColor" stroke="none"><circle r="24"/><path d="M19 -9 L38 5 L19 12 Z"/></g>`
    : `<circle cx="${f.head[0]}" cy="${f.head[1]}" r="15" fill="currentColor" stroke="none"/>`;
  return `<svg class="fig" viewBox="${FIGURE_VIEWBOX[name] || "0 0 300 190"}" preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${helpers}<path d="${f.p}" stroke-width="13"/>${marks}${head}</g></svg>`;
}

/** Photo of the easier variant the user does at this level (push-ups: incline, knees), or null. */
function levelImg(ex, level) {
  if (!ex.levels || level == null) return null;
  return ex.levels[tierOf(level)]?.[0] || null;
}

/** One frame of an exercise: photo, stick figure or the breathing circle. With a level, easier variants show their own photo. */
export function frameHtml(key, frame = 0, level = null) {
  const ex = EXERCISES[key];
  const variant = levelImg(ex, level);
  if (variant) return `<img src="${IMG(variant, 0)}" alt="${esc(exName(key, level))}" draggable="false">`;
  if (ex.breathe) return `<div class="breath" aria-label="Вдох 4 секунды, выдох 6"><i></i></div>`;
  if (ex.figure) return figureSvg(ex.figure, Math.min(frame, 1));
  const n = ex.frames === 2 ? Math.min(frame, 1) : ex.frameIndex ?? 0;
  return `<img src="${IMG(ex.img, n, ex.ext)}" alt="${esc(ex.name)}" draggable="false">`;
}

/** Start/finish pair with captions (or a single frame). */
export function pairHtml(key) {
  const ex = EXERCISES[key];
  if (ex.frames === 2) {
    const [a, b] = ex.captions || ["Старт", "Финиш"];
    return `<div class="pair"><figure>${frameHtml(key, 0)}<figcaption>${a}</figcaption></figure><figure>${frameHtml(key, 1)}<figcaption>${b}</figcaption></figure></div>${levelsHtml(ex)}`;
  }
  return `<div class="pair one"><figure>${frameHtml(key, 0)}</figure></div>`;
}

/** Easier variants of the same move, one photo each. */
function levelsHtml(ex) {
  if (!ex.levels) return "";
  return `<div class="pair">${ex.levels.map(([img, cap]) => `<figure><img src="${IMG(img, 0)}" alt="${esc(cap)}" draggable="false"><figcaption>${esc(cap)}</figcaption></figure>`).join("")}</div>`;
}

export function frameCount(key, level = null) {
  return levelImg(EXERCISES[key], level) ? 1 : EXERCISES[key].frames || 1;
}

export const kcalPerMin = (key, weight) => (EXERCISES[key].met * weight) / 60;

const secs = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : null);

/** Lazy YouTube player: a button that turns into an embedded video on tap. video = [id, label, start?, end?]. */
export function videoHtml(key) {
  const v = EXERCISES[key].video;
  if (!v) return "";
  const [id, label, start, end] = v;
  const length = esc(label.split("·").pop().trim());
  const range = `${secs(start) ? ` data-from="${secs(start)}"` : ""}${secs(end) ? ` data-to="${secs(end)}"` : ""}`;
  const link = `${YT(id)}${secs(start) ? `&t=${secs(start)}s` : ""}`;
  return `<div class="yt"><button type="button" class="yt-play" data-yt="${esc(id)}"${range}><span class="yt-icon" aria-hidden="true"></span>Смотреть видео · ${length}</button></div>
    <a class="yt-link" href="${link}" target="_blank" rel="noopener">Не открывается? Смотреть на YouTube</a>`;
}

export function howToHtml(key, level, label, { showTitle = true } = {}) {
  const ex = EXERCISES[key];
  const stop = ex.stop ? `<p class="stopline">${esc(ex.stop)}</p>` : "";
  const home = ex.home ? `<p class="homeline">${esc(ex.home)}</p>` : "";
  const title = showTitle ? `<h3 class="howto-title">${esc(exName(key, level, label))}</h3><p class="gives">${esc(ex.gives)}</p>` : "";
  return `${pairHtml(key)}${home}${title}
    ${bodyMapHtml(ex.map)}
    <ol class="cues">${ex.cues.slice(0, 3).map((c) => `<li>${esc(c)}</li>`).join("")}</ol>
    ${stop}${videoHtml(key)}${ex.why ? `<details class="why"><summary>Почему именно это упражнение</summary><p>${esc(ex.why)}</p></details>` : ""}`;
}

export function bindVideos() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-yt]");
    if (!btn) return;
    const id = encodeURIComponent(btn.dataset.yt);
    const frame = document.createElement("div");
    frame.className = "yt-frame";
    const origin = encodeURIComponent(location.origin);
    const range = `${btn.dataset.from ? `&start=${Number(btn.dataset.from)}` : ""}${btn.dataset.to ? `&end=${Number(btn.dataset.to)}` : ""}`;
    frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&rel=0${range}&origin=${origin}" title="Видео упражнения" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    btn.closest(".yt").replaceWith(frame);
  });
}

/* ---------- bottom sheet ---------- */
let sheetClose = null;

export function openSheet(html, { onClose } = {}) {
  const root = document.getElementById("sheet");
  const fresh = document.createElement("div");
  fresh.className = "sheet-body";
  fresh.innerHTML = html;
  root.querySelector(".sheet-body").replaceWith(fresh);
  root.querySelector(".sheet-panel").scrollTop = 0;
  root.hidden = false;
  sheetClose = onClose || null;
  requestAnimationFrame(() => root.classList.add("open"));
  return fresh;
}

const DRAG_CLOSE_PX = 90;

/** Close by ✕, by tapping the dark area, by Escape, or by pulling the sheet down. */
export function bindSheet() {
  const root = document.getElementById("sheet");
  const panel = root.querySelector(".sheet-panel");
  root.querySelector(".backdrop").addEventListener("click", closeSheet);
  root.querySelector(".sheet-close").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  let startY = null;
  let dy = 0;
  panel.addEventListener("touchstart", (e) => {
    const onHead = e.target.closest(".sheet-head");
    startY = onHead || panel.scrollTop <= 0 ? e.touches[0].clientY : null;
    dy = 0;
  }, { passive: true });
  panel.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    dy = e.touches[0].clientY - startY;
    if (dy > 0) { panel.classList.add("dragging"); panel.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  panel.addEventListener("touchend", () => {
    panel.classList.remove("dragging");
    panel.style.transform = "";
    if (startY !== null && dy > DRAG_CLOSE_PX) closeSheet();
    startY = null;
  });
}

export function closeSheet() {
  const root = document.getElementById("sheet");
  if (root.hidden) return;
  root.classList.remove("open");
  root.hidden = true;
  const cb = sheetClose;
  sheetClose = null;
  if (cb) cb();
}

let toastTimer = null;
export function toast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

export const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
export const fmtKm = (n) => (Number.isInteger(n) ? String(n) : fmt1(n));
