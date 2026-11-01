// Shared view helpers: exercise media, names, bottom sheet, toast.
import { EXERCISES, FIGURES, FIGURE_VIEWBOX, YT } from "./data.js";
import { tierOf } from "./plan.js";

export const IMG = (id, n) => `img/${id}_${n}.jpg`;

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
  const dash = f.dash ? `<path d="M150 20 L150 180" stroke-dasharray="6 8" stroke-width="2" opacity="0.4"/>` : "";
  // Profile head (skull, nose, chin) for neck exercises; plain circle otherwise.
  const head = f.head
    ? `<g transform="translate(${f.head[0]} ${f.head[1]}) rotate(${f.head[2]})"><circle r="24"/><path d="M21 -8 L40 6 L21 11 M19 15 Q12 32 -8 26"/></g>`
    : `<circle cx="${f.c[0]}" cy="${f.c[1]}" r="13"/>`;
  return `<svg class="fig" viewBox="${FIGURE_VIEWBOX[name] || "0 0 300 190"}" preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${dash}${head}<path d="${f.p}"/></g></svg>`;
}

/** One frame of an exercise: photo, stick figure or the breathing circle. */
export function frameHtml(key, frame = 0) {
  const ex = EXERCISES[key];
  if (ex.breathe) return `<div class="breath" aria-label="Вдох 4 секунды, выдох 6"><i></i></div>`;
  if (ex.figure) return figureSvg(ex.figure, Math.min(frame, 1));
  const n = ex.frames === 2 ? Math.min(frame, 1) : 0;
  return `<img src="${IMG(ex.img, n)}" alt="${esc(ex.name)}" draggable="false">`;
}

/** Start/finish pair with captions (or a single frame). */
export function pairHtml(key) {
  const ex = EXERCISES[key];
  if (ex.frames === 2) {
    return `<div class="pair"><figure>${frameHtml(key, 0)}<figcaption>Старт</figcaption></figure><figure>${frameHtml(key, 1)}<figcaption>Финиш</figcaption></figure></div>`;
  }
  return `<div class="pair one"><figure>${frameHtml(key, 0)}</figure></div>`;
}

export function frameCount(key) {
  return EXERCISES[key].frames || 1;
}

export const kcalPerMin = (key, weight) => (EXERCISES[key].met * weight) / 60;

/** Lazy YouTube player: a button that turns into an embedded video on tap. */
export function videoHtml(key) {
  const v = EXERCISES[key].video;
  if (!v) return "";
  const length = esc(v[1].split("·").pop().trim());
  return `<div class="yt"><button type="button" class="yt-play" data-yt="${esc(v[0])}"><span class="yt-icon" aria-hidden="true"></span>Смотреть видео · ${length}</button></div>
    <a class="yt-link" href="${YT(v[0])}" target="_blank" rel="noopener">Не открывается? Смотреть на YouTube</a>`;
}

export function howToHtml(key, level, label, { showTitle = true } = {}) {
  const ex = EXERCISES[key];
  const stop = ex.stop ? `<p class="stopline">${esc(ex.stop)}</p>` : "";
  const home = ex.home ? `<p class="homeline">${esc(ex.home)}</p>` : "";
  const title = showTitle ? `<h3 class="howto-title">${esc(exName(key, level, label))}</h3><p class="gives">${esc(ex.gives)}</p>` : "";
  return `${pairHtml(key)}${home}${title}
    <ol class="cues">${ex.cues.slice(0, 3).map((c) => `<li>${esc(c)}</li>`).join("")}</ol>
    ${stop}${videoHtml(key)}`;
}

export function bindVideos() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-yt]");
    if (!btn) return;
    const id = encodeURIComponent(btn.dataset.yt);
    const frame = document.createElement("div");
    frame.className = "yt-frame";
    frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0" title="Видео упражнения" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
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
  root.hidden = false;
  sheetClose = onClose || null;
  requestAnimationFrame(() => root.classList.add("open"));
  return fresh;
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
