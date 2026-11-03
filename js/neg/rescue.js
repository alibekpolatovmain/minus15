// «Завис?»: eight ways out of a stuck moment. One tap opens the kit, one more shows what to say and do.
import { esc, openSheet, speak } from "../ui.js";
import { RESCUE } from "./kit.js";

const tilesHtml = () => `<h3 class="sheet-title">Что случилось?</h3>
  <div class="sos-grid">${RESCUE.map((r) => `<button type="button" class="sos-tile" data-sos="${r.id}"><span aria-hidden="true">${esc(r.icon)}</span><b>${esc(r.title)}</b></button>`).join("")}</div>`;

function cardHtml(r) {
  return `<button type="button" class="btn link back" data-sos-back>‹ Все ситуации</button>
    <h3 class="sheet-title">${esc(r.title)}</h3>
    <p class="dr-label">Скажите</p>
    ${r.say.map((p) => `<p class="sos-say">${esc(p)}</p>`).join("")}
    <p class="dr-label">Сделайте</p>
    <p class="sos-act">${esc(r.act)}</p>
    ${r.silent ? "" : `<button type="button" class="btn big" data-sos-speak>🔊 Прослушать фразу</button>`}`;
}

export function openRescue(startId = null) {
  const body = openSheet(`<div class="sos">${startId ? cardHtml(RESCUE.find((r) => r.id === startId)) : tilesHtml()}</div>`);
  const box = body.querySelector(".sos");
  let current = startId;
  body.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-sos]");
    if (tile) {
      current = tile.dataset.sos;
      box.innerHTML = cardHtml(RESCUE.find((r) => r.id === current));
      return;
    }
    if (e.target.closest("[data-sos-back]")) { box.innerHTML = tilesHtml(); return; }
    if (e.target.closest("[data-sos-speak]")) speak(RESCUE.find((r) => r.id === current).say[0]);
  });
}
