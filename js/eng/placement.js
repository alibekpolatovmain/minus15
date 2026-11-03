// Placement test: six words per level, A1 → C1, stops when a level goes badly. Runs in the shared #drill screen.
import { esc } from "../ui.js";
import { WORDS } from "./words.js";
import { LEVELS, LEVEL_NAMES, TEST_PER_LEVEL, testSample, shouldContinue } from "./levels.js";
import { optionsFor } from "./session.js";
import { speakEn, stopSpeech } from "./audio.js";

const FEEDBACK_MS = 700;

/** onDone({ scores, right: [word ids answered right] }) returns the result screen HTML; onPick(level) applies a start level. */
export function runPlacement({ audio, onDone, onPick, onClose }) {
  const root = document.getElementById("drill");
  const questions = testSample(WORDS);
  const scores = {};
  const right = [];
  let i = 0;
  let busy = false;

  const close = () => {
    stopSpeech();
    root.hidden = true;
    root.innerHTML = "";
    root.onclick = null;
    root.setAttribute("aria-label", ownerLabel);
    document.body.classList.remove("locked");
    if (onClose) onClose();
  };

  const finish = () => {
    stopSpeech();
    root.innerHTML = `<div class="dr-wrap">${onDone({ scores, right })}</div>`;
  };

  const show = () => {
    const q = questions[i];
    if (!q) { finish(); return; }
    q.options = q.options || optionsFor(q, WORDS.filter((w) => w.lv === q.lv));
    const pct = Math.round((i / questions.length) * 100);
    root.innerHTML = `<div class="dr-top"><span class="dr-count">Тест уровня · ${q.lv}</span>
        <button type="button" class="dr-x" data-close aria-label="Закрыть">✕</button></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="dr-wrap en-card"><span class="eyebrow">Уровень ${q.lv} · ${LEVEL_NAMES[q.lv]}</span>
        <div class="en-hero"><div class="en-word-row"><h2 class="en-word" lang="en">${esc(q.en)}</h2>
          <button type="button" class="en-say" data-say aria-label="Прослушать слово">🔊</button></div></div>
        <p class="dr-ask">Что значит это слово?</p>
        <div class="dr-options">${q.options.map((o, n) => `<button type="button" class="dr-opt" data-opt="${n}">${esc(o.ru)}</button>`).join("")}
          <button type="button" class="dr-opt en-dunno" data-opt="-1">Не знаю</button></div></div>`;
    root.scrollTop = 0;
    if (audio) speakEn(q.en);
  };

  /** After the last question of a level: stop if it went badly, else go on. */
  const advance = () => {
    const q = questions[i];
    i += 1;
    const levelDone = !questions[i] || questions[i].lv !== q.lv;
    if (levelDone && !shouldContinue(scores[q.lv] ?? 0)) i = questions.length;
    busy = false;
    show();
  };

  const answer = (btn) => {
    busy = true;
    const q = questions[i];
    const n = Number(btn.dataset.opt);
    const ok = n >= 0 && q.options[n].id === q.id;
    scores[q.lv] = (scores[q.lv] ?? 0) + (ok ? 1 : 0);
    if (ok) right.push(q.id);
    root.querySelectorAll(".dr-opt").forEach((b) => {
      b.disabled = true;
      const m = Number(b.dataset.opt);
      b.classList.add(m >= 0 && q.options[m].id === q.id ? "best" : b === btn ? "picked" : "dim");
    });
    setTimeout(advance, FEEDBACK_MS);
  };

  root.onclick = (e) => {
    const t = e.target;
    if (t.closest("[data-close]")) { close(); return; }
    if (t.closest("[data-say]")) { speakEn(questions[i].en); return; }
    const pick = t.closest("[data-start]");
    if (pick) { onPick(pick.dataset.start); close(); return; }
    const opt = t.closest("[data-opt]");
    if (opt && !busy) answer(opt);
  };

  const ownerLabel = root.getAttribute("aria-label") || "";
  root.setAttribute("aria-label", "Тест уровня английского");
  root.hidden = false;
  document.body.classList.add("locked");
  show();
}

/** Result screen: per-level score bars and buttons to start from the suggested or another level. */
export function placementResultHtml({ scores, start, known, total }) {
  const rows = LEVELS.map((lv) => {
    const s = scores[lv];
    const pct = s === undefined ? 0 : Math.round((s / TEST_PER_LEVEL) * 100);
    return `<div class="en-lv-row"><b>${lv}</b><div class="bar"><i style="width:${pct}%"></i></div><span>${s === undefined ? "—" : `${s}/${TEST_PER_LEVEL}`}</span></div>`;
  }).join("");
  return `<h2 class="dr-title center">Ваш уровень: ${start}</h2>
    <p class="center muted">${LEVEL_NAMES[start]} · из ${total} слов курса вы знаете ≈${known}</p>
    <div class="en-lv">${rows}</div>
    <p class="muted">Слова уровней ниже ${start} считаются знакомыми и в тренировку не попадут. Слова, на которые вы ответили верно, придут на проверку через неделю.</p>
    <button type="button" class="btn primary huge" data-start="${start}">Начать с ${start}</button>
    <div class="seg en-pace">${LEVELS.filter((lv) => lv !== start).map((lv) => `<button type="button" data-start="${lv}">${lv}</button>`).join("")}</div>
    <p class="muted center">Или выберите другой уровень</p>`;
}
