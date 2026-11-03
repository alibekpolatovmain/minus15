// One-minute improvisation: a topic and three words, live transcript, then a report on fillers, pace and word use.
import { esc, toast } from "../ui.js";
import { WORDS } from "./content.js";
import { usedWordIds, speechStats, fillerCounts, overused } from "./analyze.js";
import { canRecord, startRecording } from "./recorder.js";

const WORD = Object.fromEntries(WORDS.map((w) => [w.id, w]));
const SECONDS = 60;
const TICK_MS = 250;
const MIN_WORDS = 5;
const PACE = { slow: 100, fast: 160 };
const CLAUDE_URL = "https://claude.ai/new";

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const fmt = (n) => String(n).replace(".", ",");

function chipsHtml(targets, hit = new Set(), mark = false) {
  return `<div class="chips">${targets.map((id) => {
    const on = hit.has(id);
    return `<span class="chip${on ? " hit" : mark ? " miss" : ""}" data-target="${esc(id)}">${esc(WORD[id].word)}${mark ? (on ? " ✓" : " ✗") : ""}</span>`;
  }).join("")}</div>`;
}

const head = (prompt, targets) => `<span class="eyebrow">Импровизация · 1 минута</span>
  <div class="dr-line"><p>${esc(prompt.text)}</p></div>
  ${targets.length ? `<p class="dr-ask">Используйте слова:</p>${chipsHtml(targets)}` : ""}`;

function readyHtml(prompt, targets) {
  if (!canRecord()) return typeHtml(prompt, targets);
  return `${head(prompt, targets)}
    <p class="muted">Говорите вслух, как на встрече: вступление, два аргумента, вывод. Подсчёт идёт по распознанному тексту.</p>
    <button type="button" class="btn primary huge" data-rec>🎙 Говорить</button>
    <button type="button" class="btn link" data-im-type>Лучше надиктую на клавиатуре</button>`;
}

function typeHtml(prompt, targets) {
  return `${head(prompt, targets)}
    <p class="muted">Нажмите 🎤 на клавиатуре и говорите минуту. Можно и напечатать.</p>
    <label class="sr" for="im-text">Ваша речь</label><textarea id="im-text" class="field" rows="7" placeholder="Ваша речь"></textarea>
    <button type="button" class="btn primary huge" data-analyze>Разобрать речь</button>`;
}

const recHtml = (prompt, targets) => `${head(prompt, targets)}
  <p class="im-clock" id="im-clock">${clock(SECONDS)}</p>
  <div class="bar"><i id="im-bar" style="width:0%"></i></div>
  <p class="im-live" id="im-live" aria-live="polite">Слушаю…</p>
  <button type="button" class="btn primary huge" data-stop>Готово</button>`;

function paceLine(wpm) {
  if (wpm === null) return "";
  if (wpm < PACE.slow) return "Медленно: добавьте энергии, меньше пауз внутри фразы.";
  if (wpm > PACE.fast) return "Быстро: делайте паузу после главной мысли.";
  return "Хороший деловой темп.";
}

export function reportHtml(text, seconds, targets) {
  const s = speechStats(text, seconds);
  if (s.words < MIN_WORDS) {
    return `<div class="dr-verdict warn"><b>Почти ничего не распознано</b><p>Говорите громче и ближе к телефону или надиктуйте на клавиатуре.</p></div>
      <button type="button" class="btn primary huge" data-again>Попробовать ещё раз</button>`;
  }
  const hit = new Set(usedWordIds(text, targets.map((id) => WORD[id])));
  const fillers = fillerCounts(text);
  const flat = overused(text);
  return `<h2 class="dr-title">Разбор речи</h2>
    <div class="dr-stats">
      ${targets.length ? `<p><b>${hit.size} из ${targets.length}</b><span>слов использовано</span></p>` : ""}
      <p><b>${fmt(s.per100)}</b><span>паразитов на 100 слов</span></p>
      ${s.wpm !== null ? `<p><b>${s.wpm}</b><span>слов в минуту</span></p>` : ""}
      <p><b>${s.variety}%</b><span>разных слов</span></p>
    </div>
    ${targets.length ? chipsHtml(targets, hit, true) : ""}
    <div class="dr-verdict ${fillers.length ? "warn" : "good"}"><b>${fillers.length ? "Слова-паразиты" : "Чисто: ни одного слова-паразита"}</b>
      ${fillers.length ? `<p>${fillers.map((f) => `«${esc(f.word)}» ×${f.n}`).join(" · ")}. Вместо них делайте паузу: она звучит уверенно.</p>` : ""}</div>
    ${flat.map((o) => `<div class="dr-best"><span class="eyebrow">«${esc(o.word)}» ×${o.n}</span><p>Попробуйте: ${o.alt.map(esc).join(", ")}</p></div>`).join("")}
    ${paceLine(s.wpm) ? `<p class="muted">${paceLine(s.wpm)}</p>` : ""}
    <details class="help"><summary>Ваша речь</summary><p>${esc(text)}</p></details>
    <button type="button" class="btn big" data-ai>Подробный разбор у Claude</button>
    <div class="row2"><button type="button" class="btn big" data-again>Ещё раз</button><button type="button" class="btn primary big" data-improv-next>Дальше</button></div>`;
}

function claudePrompt(text, prompt, targets) {
  const words = targets.map((id) => WORD[id].word).join(", ");
  return `Я тренирую красивую деловую речь. Тема минутной импровизации: «${prompt.text}».${words ? ` Нужно было использовать слова: ${words}.` : ""}
Вот расшифровка моей речи (распознана автоматически, ошибки распознавания не считай):
«${text}»
Оцени от 1 до 10 по четырём осям: точность слов, разнообразие, чистота (слова-паразиты), структура мысли. Потом перепиши мою речь красиво, сохранив смысл и длину, и выдели сильные слова. В конце дай одно конкретное задание на завтра.`;
}

/** Runs the step inside `box`. onResult({ text, seconds }) after each analysed attempt, onNext() to move on. */
export function mountImprov(box, { prompt, targets, onResult, onNext }) {
  let rec = null;
  let timer = null;
  let started = 0;
  let lastText = "";
  let dead = false;

  const stopTimer = () => { clearInterval(timer); timer = null; };
  const analyse = (text, seconds) => {
    if (dead) return;
    lastText = text;
    box.innerHTML = reportHtml(text, seconds, targets);
    if (speechStats(text, seconds).words >= MIN_WORDS) onResult({ text, seconds });
  };
  const live = (text) => {
    const el = box.querySelector("#im-live");
    if (el) el.textContent = text || "Слушаю…";
    const hit = new Set(usedWordIds(text, targets.map((id) => WORD[id])));
    box.querySelectorAll("[data-target]").forEach((c) => c.classList.toggle("hit", hit.has(c.dataset.target)));
  };
  const stop = () => {
    stopTimer();
    if (rec) rec.stop();
  };
  const record = () => {
    stopTimer();
    box.innerHTML = recHtml(prompt, targets);
    started = Date.now();
    timer = setInterval(() => {
      const left = SECONDS - Math.floor((Date.now() - started) / 1000);
      const el = box.querySelector("#im-clock");
      if (el) el.textContent = clock(left);
      const bar = box.querySelector("#im-bar");
      if (bar) bar.style.width = `${Math.min(100, ((SECONDS - left) / SECONDS) * 100)}%`;
      if (left <= 0) stop();
    }, TICK_MS);
    rec = startRecording({
      onText: live,
      // Recognition can end by itself (a failed restart), so the timer is stopped here too.
      onDone: (text) => { stopTimer(); rec = null; analyse(text, Math.max(1, Math.round((Date.now() - started) / 1000))); },
      onBlocked: () => {
        if (dead) return;
        stopTimer();
        rec = null;
        box.innerHTML = typeHtml(prompt, targets);
        toast("Микрофон недоступен. Надиктуйте через 🎤 на клавиатуре.");
      },
    });
  };
  const askClaude = () => {
    const text = claudePrompt(lastText, prompt, targets);
    const copied = navigator.clipboard?.writeText(text);
    window.open(CLAUDE_URL, "_blank", "noopener");
    if (copied) copied.then(() => toast("Скопировано. Вставьте в чат Claude.")).catch(() => toast("Не удалось скопировать."));
    else toast("Не удалось скопировать.");
  };

  box.onclick = (e) => {
    const t = e.target;
    if (t.closest("[data-rec]")) record();
    else if (t.closest("[data-im-type]")) box.innerHTML = typeHtml(prompt, targets);
    else if (t.closest("[data-stop]")) stop();
    else if (t.closest("[data-analyze]")) analyse(box.querySelector("#im-text").value, null);
    else if (t.closest("[data-again]")) box.innerHTML = readyHtml(prompt, targets);
    else if (t.closest("[data-ai]")) askClaude();
    else if (t.closest("[data-improv-next]")) onNext();
  };
  box.innerHTML = readyHtml(prompt, targets);

  return {
    destroy() {
      dead = true;
      stopTimer();
      if (rec) { const r = rec; rec = null; r.stop(); }
      box.onclick = null;
    },
  };
}
