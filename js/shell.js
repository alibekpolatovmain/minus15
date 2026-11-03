// Home screen with one tile per section; the URL hash remembers which section is open (#sport, #neg, #speech, #eng).
import { esc } from "./ui.js";
// Namespace import: an old cached app.js without sportSummary must not blank the page during an update.
import * as sport from "./app.js";
import { initNeg, renderNeg, negSummary } from "./neg/index.js";
import { initSpeech, renderSpeech, speechSummary } from "./speech/index.js";
import { initEng, renderEng, engSummary } from "./eng/index.js";

const MODULES = [
  { id: "sport", title: "Спорт", tone: "sport", summary: () => sport.sportSummary(),
    icon: `<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>` },
  { id: "neg", title: "Переговоры", tone: "neg", summary: negSummary,
    icon: `<path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M19 9h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-3"/>` },
  { id: "speech", title: "Речь", tone: "speech", summary: speechSummary,
    icon: `<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>` },
  { id: "eng", title: "Английский", tone: "eng", summary: engSummary,
    icon: `<path d="M4 6h9M8.5 4v2M6 6c0 4 3 7 6 8M11 6c0 3-3 7-7 9"/><path d="M13 20l4-10 4 10M14.5 17h5"/>` },
];
const GREETING = [[5, "Доброй ночи"], [12, "Доброе утро"], [18, "Добрый день"], [23, "Добрый вечер"], [24, "Доброй ночи"]];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

const $ = (id) => document.getElementById(id);
const current = () => (MODULES.some((m) => `#${m.id}` === location.hash) ? location.hash.slice(1) : "hub");

function tileHtml(m) {
  let s;
  try {
    s = m.summary();
  } catch (err) {
    console.error(`Summary for ${m.id} failed`, err);
    s = { main: "Открыть", extra: "", done: false };
  }
  return `<a class="hub-tile ${m.tone}${s.done ? " done" : ""}" href="#${m.id}">
    <span class="hub-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${m.icon}</svg></span>
    <span class="hub-text"><b>${esc(m.title)}</b><span>${esc(s.main)}</span>${s.extra ? `<small>${esc(s.extra)}</small>` : ""}</span>
  </a>`;
}

function renderHub() {
  const now = new Date();
  const hello = GREETING.find(([h]) => now.getHours() < h)[1];
  $("hub").innerHTML = `<header class="large-title"><h1>${hello}</h1><p>${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}</p></header>
    <nav class="hub-grid" aria-label="Разделы">${MODULES.map(tileHtml).join("")}</nav>`;
}

function route() {
  const name = current();
  document.body.dataset.mod = name;
  $("hub").hidden = name !== "hub";
  MODULES.forEach((m) => { $(`mod-${m.id}`).hidden = m.id !== name; });
  if (name === "hub") renderHub();
  if (name === "neg") renderNeg();
  if (name === "speech") renderSpeech();
  if (name === "eng") renderEng();
  window.scrollTo(0, 0);
}

initNeg();
initSpeech();
initEng();
window.addEventListener("hashchange", route);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && current() === "hub") renderHub(); });
route();
