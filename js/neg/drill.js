// Fullscreen drill: situation quiz → say-it-yourself recall → technique flashcards, graded into spaced repetition.
import { esc } from "../ui.js";
import { TECHNIQUES, SCENARIOS, GROUPS } from "./content.js";

const TECH = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t]));
const SCEN = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g.title]));
// After two right answers in a row a situation is asked as free recall instead of multiple choice.
const RECALL_BOX = 2;
const VERDICT = { 2: ["Сильный ответ", "good"], 1: ["Можно сильнее", "warn"], 0: ["Ловушка", "bad"] };

/** One step of a drill: «s:id» or «t:id» with the way to ask it. */
export function itemFor(id, card) {
  const [kind, key] = id.split(":");
  if (kind === "t") return { id, kind: "tech", key, fresh: !card };
  return { id, kind: (card?.box ?? 0) >= RECALL_BOX ? "say" : "quiz", key };
}

const shuffled = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
const techChips = (ids) => `<div class="chips">${ids.map((t) => `<span class="chip">${esc(TECH[t].name)}</span>`).join("")}</div>`;
const bubble = (s) => `<p class="dr-ctx">${esc(s.ctx)}</p>
  <div class="dr-line"><p>${esc(s.line)}</p><button type="button" class="dr-speak" data-speak aria-label="Прослушать реплику">🔊</button></div>`;

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[«»]/g, ""));
  u.lang = "ru-RU";
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

function quizHtml(item) {
  const s = SCEN[item.key];
  item.order = item.order || shuffled(s.options);
  return `${bubble(s)}<p class="dr-ask">Что ответите?</p>
    <div class="dr-options">${item.order.map((o, i) => `<button type="button" class="dr-opt" data-opt="${i}">${esc(o.text)}</button>`).join("")}</div>
    <div class="dr-feedback" hidden></div>`;
}

function quizFeedback(item, picked) {
  const s = SCEN[item.key];
  const best = s.options.find((o) => o.score === 2);
  const [label, tone] = VERDICT[picked.score];
  return `<div class="dr-verdict ${tone}"><b>${label}</b><p>${esc(picked.why)}</p></div>
    ${picked.score < 2 ? `<div class="dr-best"><span class="eyebrow">Сильный ответ</span><p>${esc(best.text)}</p><p class="muted">${esc(best.why)}</p></div>` : ""}
    ${techChips(s.tech)}`;
}

function sayHtml(s) {
  return `${bubble(s)}<p class="dr-ask">Ответьте вслух, как на встрече. Можно надиктовать: 🎤 на клавиатуре.</p>
    <label class="sr" for="dr-own">Ваш ответ</label><textarea id="dr-own" class="field" rows="3" placeholder="Ваш ответ (не обязательно)"></textarea>
    <button type="button" class="btn primary big" data-reveal>Показать сильный ответ</button>
    <div class="dr-reveal" hidden>
      <div class="dr-best"><span class="eyebrow">Сильный ответ</span><p>${esc(s.options.find((o) => o.score === 2).text)}</p></div>
      <p class="dr-ask">Что было в вашем ответе?</p>
      <div class="checks">${s.tech.map((t) => `<label class="check"><input type="checkbox"> ${esc(TECH[t].check)}</label>`).join("")}</div>
      <div class="row2"><button type="button" class="btn big" data-grade="0">Ещё потренирую</button><button type="button" class="btn primary big" data-grade="1">Получилось</button></div>
    </div>`;
}

function techBack(t) {
  return `<p class="dr-what">${esc(t.what)}</p>
    <p class="dr-label">Когда</p><p>${esc(t.when)}</p>
    <p class="dr-label">Как сказать</p>${t.say.map((p) => `<p class="dr-quote">${esc(p)}</p>`).join("")}
    <p class="dr-label">Не делайте</p><p>${esc(t.trap)}</p>
    <p class="muted dr-src">${esc(t.src)}</p>`;
}

function techHtml(item) {
  const t = TECH[item.key];
  const head = `<span class="eyebrow">${item.fresh ? "Новый приём" : `Вспомните приём · ${esc(GROUP[t.group])}`}</span><h2 class="dr-title">${esc(t.name)}</h2>`;
  if (item.fresh) return `${head}${techBack(t)}<button type="button" class="btn primary big" data-grade="1">Понятно</button>`;
  return `${head}<p class="dr-ask">Что это и какой фразой это сказать? Вспомните, потом проверьте.</p>
    <button type="button" class="btn primary big" data-reveal>Проверить</button>
    <div class="dr-reveal" hidden>${techBack(t)}
      <div class="row2"><button type="button" class="btn big" data-grade="0">Не вспомнил</button><button type="button" class="btn primary big" data-grade="1">Вспомнил</button></div>
    </div>`;
}

function bodyHtml(item) {
  if (item.kind === "tech") return techHtml(item);
  return item.kind === "say" ? sayHtml(SCEN[item.key]) : quizHtml(item);
}

/**
 * Runs a drill over the given card ids. onGrade(id, right) is called after each answer,
 * onFinish({ right, total }) once at the end; it returns HTML for the result screen.
 */
export function runDrill({ ids, cards, title, onGrade, onFinish, onMore, onClose }) {
  const root = document.getElementById("drill");
  const items = ids.map((id) => itemFor(id, cards[id]));
  let i = 0;
  let right = 0;
  let answered = false;

  const close = () => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    root.hidden = true;
    root.innerHTML = "";
    document.body.classList.remove("locked");
    if (onClose) onClose();
  };

  const grade = (ok) => {
    if (ok) right += 1;
    onGrade(items[i].id, ok);
  };

  const show = () => {
    answered = false;
    if (i >= items.length) {
      root.innerHTML = `<div class="dr-wrap">${onFinish({ right, total: items.length })}
        ${onMore ? `<button type="button" class="btn big" data-more>Ещё 5 ситуаций</button>` : ""}
        <button type="button" class="btn primary huge" data-close>Готово</button></div>`;
      return;
    }
    const pct = Math.round((i / items.length) * 100);
    root.innerHTML = `<div class="dr-top"><span class="dr-count">${esc(title)} · ${i + 1} из ${items.length}</span>
        <button type="button" class="dr-x" data-close aria-label="Закрыть тренировку">✕</button></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="dr-wrap">${bodyHtml(items[i])}<button type="button" class="btn primary big" data-next hidden>Дальше</button></div>`;
    root.scrollTop = 0;
  };

  const onClick = (e) => {
    const t = e.target;
    if (t.closest("[data-close]")) { close(); return; }
    if (t.closest("[data-more]")) { close(); onMore(); return; }
    if (t.closest("[data-speak]")) { speak(SCEN[items[i].key].line); return; }
    if (t.closest("[data-next]")) { i += 1; show(); return; }
    const opt = t.closest("[data-opt]");
    if (opt && !answered) {
      answered = true;
      const item = items[i];
      const picked = item.order[Number(opt.dataset.opt)];
      root.querySelectorAll(".dr-opt").forEach((b, n) => {
        b.disabled = true;
        b.classList.add(item.order[n].score === 2 ? "best" : n === Number(opt.dataset.opt) ? "picked" : "dim");
      });
      const fb = root.querySelector(".dr-feedback");
      fb.innerHTML = quizFeedback(item, picked);
      fb.hidden = false;
      root.querySelector("[data-next]").hidden = false;
      grade(picked.score === 2);
      return;
    }
    if (t.closest("[data-reveal]")) {
      t.closest("[data-reveal]").hidden = true;
      root.querySelector(".dr-reveal").hidden = false;
      return;
    }
    const g = t.closest("[data-grade]");
    if (g && !answered) {
      answered = true;
      grade(g.dataset.grade === "1");
      i += 1;
      show();
    }
  };

  root.onclick = onClick;
  root.hidden = false;
  document.body.classList.add("locked");
  show();
}
