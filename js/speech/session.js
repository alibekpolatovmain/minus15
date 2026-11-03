// Fullscreen speech session: new words → recall → paraphrase → clean speech → one-minute improvisation.
import { esc, speak } from "../ui.js";
import { WORDS, TOPICS } from "./content.js";
import { blankOut, FILLERS } from "./analyze.js";
import { mountImprov } from "./improv.js";

const WORD = Object.fromEntries(WORDS.map((w) => [w.id, w]));
const TOPIC = Object.fromEntries(TOPICS.map((t) => [t.id, t.title]));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Longest first so «в общем» wins over «в».
const FILLER_RE = new RegExp(`(?<!\\p{L})(${[...FILLERS].sort((a, b) => b.length - a.length).map(reEsc).join("|")})(?!\\p{L})`, "giu");

const wordHead = (w) => `<div class="sp-word"><h2 class="dr-title">${esc(w.stress)}</h2>
  <button type="button" class="dr-speak" data-say="${esc(w.word)}" aria-label="Прослушать">🔊</button></div>`;

function learnHtml(w) {
  return `<span class="eyebrow">Новое слово · ${esc(TOPIC[w.topic])}</span>${wordHead(w)}
    <p class="dr-what">${esc(w.mean)}</p>
    <p class="dr-label">Вместо</p><p>«${esc(w.plain)}»</p>
    <p class="dr-label">Сочетания</p><div class="chips">${w.pair.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>
    <p class="dr-label">Пример</p><p class="dr-quote">${esc(w.ex)}</p>
    <p class="dr-ask">Скажите вслух свою фразу с этим словом — про вашу работу.</p>
    <div class="row2"><button type="button" class="btn big" data-known>Уже использую</button><button type="button" class="btn primary big" data-grade="1">Сказал</button></div>`;
}

function recallHtml(w) {
  return `<span class="eyebrow">Вспомните слово · ${esc(TOPIC[w.topic])}</span>
    <p class="dr-what">${esc(w.mean)}</p>
    <p class="dr-quote">${esc(blankOut(w.ex, w.stems))}</p>
    <p class="muted">Начинается на «${esc(w.word[0])}». Скажите вслух, потом проверьте.</p>
    <button type="button" class="btn primary big" data-reveal>Проверить</button>
    <div class="dr-reveal" hidden>${wordHead(w)}<p class="dr-quote">${esc(w.ex)}</p>
      <div class="row2"><button type="button" class="btn big" data-grade="0">Не вспомнил</button><button type="button" class="btn primary big" data-grade="1">Вспомнил</button></div>
    </div>`;
}

function paraphraseHtml(p) {
  return `<span class="eyebrow">Перефраз</span>
    <div class="dr-line"><p>${esc(p.plain)}</p></div>
    <p class="dr-ask">Скажите это вслух тремя разными способами. Без «очень» и «важно».</p>
    <button type="button" class="btn primary big" data-reveal>Показать варианты</button>
    <div class="dr-reveal" hidden>${p.strong.map((s) => `<p class="dr-quote">${esc(s)}</p>`).join("")}
      <button type="button" class="btn primary big" data-step-next>Дальше</button></div>`;
}

function cleanupHtml(c) {
  return `<span class="eyebrow">Чистая речь</span>
    <div class="dr-line"><p>${esc(c.raw).replace(FILLER_RE, "<mark>$1</mark>")}</p></div>
    <p class="dr-ask">Скажите эту мысль вслух чисто: без выделенных слов, коротко и по делу.</p>
    <button type="button" class="btn primary big" data-reveal>Как звучит чисто</button>
    <div class="dr-reveal" hidden><div class="dr-best"><span class="eyebrow">Чисто</span><p>${esc(c.clean)}</p></div>
      <button type="button" class="btn primary big" data-step-next>Дальше</button></div>`;
}

/**
 * steps: [{ kind: "learn"|"recall", id: "w:…" } | { kind: "paraphrase", item } | { kind: "cleanup", item } | { kind: "improv", prompt, targets }].
 * onGrade(cardId, right) after each word, onKnown(cardId) when a new word is already in use, onSpeech({ text, seconds, targets }) after each analysed improvisation,
 * onFinish() once at the end; it returns HTML for the result screen.
 */
export function runSession({ steps, title, onGrade, onKnown, onSpeech, onFinish, onClose }) {
  const root = document.getElementById("drill");
  let i = 0;
  let improv = null;

  const dropImprov = () => { if (improv) { improv.destroy(); improv = null; } };
  const close = () => {
    dropImprov();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    root.hidden = true;
    root.innerHTML = "";
    document.body.classList.remove("locked");
    if (onClose) onClose();
  };
  const next = () => { i += 1; show(); };

  function show() {
    dropImprov();
    if (i >= steps.length) {
      root.innerHTML = `<div class="dr-wrap">${onFinish()}<button type="button" class="btn primary huge" data-close>Готово</button></div>`;
      root.scrollTop = 0;
      return;
    }
    const step = steps[i];
    const pct = Math.round((i / steps.length) * 100);
    root.innerHTML = `<div class="dr-top"><span class="dr-count">${esc(title)} · ${i + 1} из ${steps.length}</span>
        <button type="button" class="dr-x" data-close aria-label="Закрыть тренировку">✕</button></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="dr-wrap" id="sp-step"></div>`;
    const box = root.querySelector("#sp-step");
    if (step.kind === "improv") {
      improv = mountImprov(box, { prompt: step.prompt, targets: step.targets, onResult: (r) => onSpeech({ ...r, targets: step.targets }), onNext: next });
    } else if (step.kind === "learn") box.innerHTML = learnHtml(WORD[step.id.slice(2)]);
    else if (step.kind === "recall") box.innerHTML = recallHtml(WORD[step.id.slice(2)]);
    else if (step.kind === "paraphrase") box.innerHTML = paraphraseHtml(step.item);
    else box.innerHTML = cleanupHtml(step.item);
    root.scrollTop = 0;
  }

  root.onclick = (e) => {
    const t = e.target;
    if (t.closest("[data-close]")) { close(); return; }
    const say = t.closest("[data-say]");
    if (say) { speak(say.dataset.say); return; }
    if (t.closest("[data-step-next]")) { next(); return; }
    if (t.closest("[data-known]")) { onKnown(steps[i].id); next(); return; }
    const reveal = t.closest("[data-reveal]");
    if (reveal) {
      reveal.hidden = true;
      root.querySelector(".dr-reveal").hidden = false;
      return;
    }
    const g = t.closest("[data-grade]");
    if (g) {
      g.disabled = true;
      onGrade(steps[i].id, g.dataset.grade === "1");
      next();
    }
  };
  root.hidden = false;
  document.body.classList.add("locked");
  show();
}
