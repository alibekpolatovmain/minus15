// Fullscreen drill: situation quiz → say-it-yourself recall → technique flashcards, graded into spaced repetition.
import { esc, speak } from "../ui.js";
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
const bubble = (s) => `<p class="dr-ctx">${esc(s.ctx)}</p>
  <div class="dr-line"><p>${esc(s.line)}</p><button type="button" class="dr-speak" data-speak aria-label="Прослушать реплику">🔊</button></div>`;

const techNotes = (ids) => ids.map((t) => `<details class="dr-tech"><summary>Приём: ${esc(TECH[t].name)}</summary>
  <p>${esc(TECH[t].what)}</p><p class="dr-quote">${esc(TECH[t].say[0])}</p></details>`).join("");
const NEXT = `<button type="button" class="btn primary huge" data-next>Дальше</button>`;
const GRADE = (no, yes) => `<div class="row2"><button type="button" class="btn big" data-grade="0">${no}</button><button type="button" class="btn primary big" data-grade="1">${yes}</button></div>`;

function quizHtml(item) {
  const s = SCEN[item.key];
  item.order = item.order || shuffled(s.options);
  return {
    body: `${bubble(s)}<p class="dr-ask">Что ответите?</p>
      <div class="dr-options">${item.order.map((o, i) => `<button type="button" class="dr-opt" data-opt="${i}">${esc(o.text)}</button>`).join("")}</div>
      <div class="dr-feedback" hidden></div>`,
    foot: `<p class="dr-hint">Выберите ответ</p>`,
  };
}

/** The picked option is graded in place; the green option already shows the strong answer, so only the reasons follow. */
function quizFeedback(item, picked) {
  const s = SCEN[item.key];
  const best = s.options.find((o) => o.score === 2);
  const [label, tone] = VERDICT[picked.score];
  return `<div class="dr-verdict ${tone}"><b>${label}</b><p>${esc(picked.why)}</p></div>
    ${picked.score < 2 ? `<p class="dr-why"><b>Почему зелёный сильнее.</b> ${esc(best.why)}</p>` : ""}
    ${techNotes(s.tech)}`;
}

function sayHtml(s) {
  return {
    body: `${bubble(s)}<p class="dr-ask">Ответьте вслух, как на встрече. Можно надиктовать: 🎤 на клавиатуре.</p>
      <label class="sr" for="dr-own">Ваш ответ</label><textarea id="dr-own" class="field" rows="3" placeholder="Ваш ответ (не обязательно)"></textarea>
      <div class="dr-reveal" hidden>
        <div class="dr-best"><span class="eyebrow">Сильный ответ</span><p>${esc(s.options.find((o) => o.score === 2).text)}</p></div>
        <p class="dr-ask">Что было в вашем ответе?</p>
        <div class="checks">${s.tech.map((t) => `<label class="check"><input type="checkbox"> ${esc(TECH[t].check)}</label>`).join("")}</div>
      </div>`,
    foot: `<button type="button" class="btn primary huge" data-reveal>Показать сильный ответ</button>`,
    after: GRADE("Ещё потренирую", "Получилось"),
  };
}

function techBack(t) {
  return `<p class="dr-what">${esc(t.what)}</p>
    <p class="dr-label">Как сказать</p>${t.say.map((p) => `<p class="dr-quote">${esc(p)}</p>`).join("")}
    <p class="dr-label">Не делайте</p><p>${esc(t.trap)}</p>
    <p class="muted dr-src">${esc(t.src)}</p>`;
}

function techHtml(item) {
  const t = TECH[item.key];
  const head = `<span class="eyebrow">${item.fresh ? "Новый приём" : `Вспомните приём · ${esc(GROUP[t.group])}`}</span><h2 class="dr-title">${esc(t.name)}</h2>`;
  if (item.fresh) return { body: `${head}${techBack(t)}`, foot: `<button type="button" class="btn primary huge" data-grade="1">Понятно</button>` };
  return {
    body: `${head}<p class="dr-ask">Что это и какой фразой это сказать? Вспомните, потом проверьте.</p><div class="dr-reveal" hidden>${techBack(t)}</div>`,
    foot: `<button type="button" class="btn primary huge" data-reveal>Проверить</button>`,
    after: GRADE("Не вспомнил", "Вспомнил"),
  };
}

function viewOf(item) {
  if (item.kind === "tech") return techHtml(item);
  return item.kind === "say" ? sayHtml(SCEN[item.key]) : quizHtml(item);
}

/**
 * Runs a drill over the given card ids, one card per screen with the action pinned to the bottom.
 * onGrade(id, right) after each answer; onFinish({ right, total }) at the end returns the result HTML.
 * The score counts situations only: reading a technique card is not an answer.
 */
export function runDrill({ ids, cards, title, onGrade, onFinish, onMore, onClose }) {
  const root = document.getElementById("drill");
  const items = ids.map((id) => itemFor(id, cards[id]));
  const total = items.filter((it) => it.kind !== "tech").length;
  let i = 0;
  let right = 0;
  let answered = false;
  let view = null;

  const close = () => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    root.hidden = true;
    root.innerHTML = "";
    document.body.classList.remove("locked");
    if (onClose) onClose();
  };

  const grade = (ok) => {
    if (ok && items[i].kind !== "tech") right += 1;
    onGrade(items[i].id, ok);
  };

  const setFoot = (html) => { root.querySelector(".dr-foot").innerHTML = html; };

  const show = () => {
    answered = false;
    if (i >= items.length) {
      root.innerHTML = `<div class="dr-wrap">${onFinish({ right, total })}</div>
        <div class="dr-foot">${onMore ? `<button type="button" class="btn big" data-more>Ещё 5 ситуаций</button>` : ""}
        <button type="button" class="btn primary huge" data-close>Готово</button></div>`;
      return;
    }
    view = viewOf(items[i]);
    const pct = Math.round((i / items.length) * 100);
    root.innerHTML = `<div class="dr-top"><span class="dr-count">${esc(title)} · ${i + 1} из ${items.length}</span>
        <button type="button" class="dr-x" data-close aria-label="Закрыть тренировку">✕</button></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <article class="dr-wrap dr-card">${view.body}</article>
      <div class="dr-foot">${view.foot}</div>`;
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
      const n = Number(opt.dataset.opt);
      const picked = item.order[n];
      root.querySelectorAll(".dr-opt").forEach((b, k) => {
        b.disabled = true;
        const o = item.order[k];
        b.classList.add(...(o.score === 2 ? ["best"] : k === n ? (o.score === 1 ? ["picked", "ok"] : ["picked"]) : ["dim"]));
      });
      const fb = root.querySelector(".dr-feedback");
      fb.innerHTML = quizFeedback(item, picked);
      fb.hidden = false;
      setFoot(NEXT);
      grade(picked.score === 2);
      return;
    }
    if (t.closest("[data-reveal]")) {
      root.querySelector(".dr-reveal").hidden = false;
      setFoot(view.after);
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
