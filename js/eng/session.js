// Fullscreen word session: reviews → «say it in English» → new words in batches of 5 (meet, then check by ear).
import { esc } from "../ui.js";
import { WORD, WORDS } from "./words.js";
import { GRADE, KNOWN_BOX, recId, prodId, grade, introduced, alreadyKnown } from "./srs.js";
import { speakEn, stopSpeech } from "./audio.js";

const BATCH = 5;
const OPTIONS = 4;
// A forgotten card comes back a few cards later in the same session, as practice (no second grade).
const REQUEUE_GAP = 4;
// Hard words get their association shown on every review.
const HARD_WRONG = 2;
// Cards share button positions: a double tap must not answer the next card too.
const TAP_GUARD_MS = 350;

const shuffled = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

/** Queue for one session: reviews and new «say it» cards mixed, then new words as intro ×5 → check ×5. */
export function buildQueue({ reviews, prod, fresh }, cards) {
  const review = (cid) => {
    const wid = cid.slice(2);
    if (cid.startsWith("p:")) return { kind: "prod", cid, wid };
    return { kind: "rec", cid, wid, listen: (cards[cid]?.box ?? 0) <= 1 };
  };
  const old = shuffled([...reviews.map(review), ...prod.map((wid) => ({ kind: "prod", cid: prodId(wid), wid }))]);
  const batches = [];
  for (let i = 0; i < fresh.length; i += BATCH) batches.push(fresh.slice(i, i + BATCH));
  const fresher = batches.flatMap((b) => [
    ...b.map((wid) => ({ kind: "intro", wid })),
    ...shuffled(b).map((wid) => ({ kind: "check", cid: recId(wid), wid, listen: true })),
  ]);
  return [...old, ...fresher];
}

/** Three wrong meanings from other packs: unrelated words are not confused with each other. */
export function optionsFor(w) {
  const pool = shuffled(WORDS.filter((o) => o.pack !== w.pack && o.ru !== w.ru)).slice(0, OPTIONS - 1);
  return shuffled([w, ...pool]);
}

const sayBtn = (what, label) => `<button type="button" class="en-say" data-say="${what}" aria-label="${label}">🔊</button>`;

function mnemonicHtml(w, note, force = false) {
  const text = note || ((force || w.mn) && w.mn);
  if (!text) return "";
  return `<div class="en-mn"><span class="eyebrow">${note ? "Ваша ассоциация" : "Ассоциация"}</span><p>${esc(text)}</p></div>`;
}

const exampleHtml = (w) => `<div class="dr-line en-ex"><p>${esc(w.ex)}</p><small>${esc(w.exRu)}</small>
  <button type="button" class="dr-speak" data-say="ex" aria-label="Прослушать фразу">🔊</button></div>`;

function wordHead(w, { tr = true, emoji = true } = {}) {
  return `<div class="en-hero">${emoji ? `<span class="en-emoji" aria-hidden="true">${esc(w.e || "🔤")}</span>` : ""}
    <div class="en-word-row"><h2 class="en-word" lang="en">${esc(w.en)}</h2>${sayBtn("word", "Прослушать слово")}</div>
    ${tr && w.tr ? `<p class="en-tr">[${esc(w.tr)}]</p>` : ""}</div>`;
}

/** Back of a card: word, meaning, association, phrase. The parts already on the front are left out. */
export function answerHtml(w, card, note, { front = "none" } = {}) {
  const hard = (card?.wrong || 0) >= HARD_WRONG;
  const head = front === "en" ? "" : wordHead(w, { tr: (card?.box ?? 0) < KNOWN_BOX, emoji: front !== "ru" });
  return `${head}${front === "ru" ? "" : `<p class="en-ru">${esc(w.ru)}</p>`}
    ${mnemonicHtml(w, note, hard)}${exampleHtml(w)}
    ${hard && !note && !w.mn ? `<p class="muted">Трудное слово. Придумайте свою ассоциацию: так запомнится быстрее.</p>` : ""}`;
}

const grades = `<div class="row3 en-grade">
  <button type="button" class="btn big forgot" data-grade="${GRADE.forgot}">Забыл</button>
  <button type="button" class="btn big hard" data-grade="${GRADE.hard}">С трудом</button>
  <button type="button" class="btn big primary" data-grade="${GRADE.good}">Знаю</button></div>`;

function introHtml(w, note, n, total) {
  return `<span class="eyebrow">Новое слово · ${n} из ${total}</span>${wordHead(w)}<p class="en-ru">${esc(w.ru)}</p>
    ${mnemonicHtml(w, note)}${exampleHtml(w)}
    <p class="muted">Скажите слово вслух два раза, потом фразу.</p>
    <button type="button" class="btn link en-note" data-note>✎ ${note ? "Изменить ассоциацию" : "Своя ассоциация"}</button>
    <div class="en-foot row2"><button type="button" class="btn big" data-known>Уже знаю</button>
      <button type="button" class="btn primary big" data-met>Запомнил</button></div>`;
}

function listenHtml(item, audio) {
  const w = WORD[item.wid];
  item.options = item.options || optionsFor(w);
  const head = audio
    ? `<button type="button" class="en-play" data-say="word" aria-label="Прослушать ещё раз">🔊</button>
       <div class="row2"><button type="button" class="btn small" data-say="word">Ещё раз</button><button type="button" class="btn small" data-say="slow">Медленно</button></div>
       <button type="button" class="btn link" data-show-word>Не слышно? Показать слово</button><h2 class="en-word center" lang="en" hidden>${esc(w.en)}</h2>`
    : `<h2 class="en-word center" lang="en">${esc(w.en)}</h2>`;
  return `<span class="eyebrow">${item.kind === "check" ? "Проверка" : "Повторение"}</span>${head}
    <p class="dr-ask">${audio ? "Что вы услышали?" : "Что значит это слово?"}</p>
    <div class="dr-options">${item.options.map((o, i) => `<button type="button" class="dr-opt" data-opt="${i}">${esc(o.ru)}</button>`).join("")}</div>
    <div class="dr-reveal" hidden></div>`;
}

function recallHtml(item, card, note) {
  const w = WORD[item.wid];
  const front = item.kind === "prod"
    ? `<span class="eyebrow">Скажите по-английски</span><div class="en-hero"><span class="en-emoji" aria-hidden="true">${esc(w.e || "🔤")}</span><h2 class="en-word">${esc(w.ru)}</h2></div>
       <p class="dr-ask center">Скажите вслух, потом проверьте.</p>`
    : `<span class="eyebrow">Что значит?</span>${wordHead(w, { tr: (card?.box ?? 0) < KNOWN_BOX })}`;
  return `${front}<button type="button" class="btn primary huge" data-reveal>${item.kind === "prod" ? "Проверить" : "Показать"}</button>
    <div class="dr-reveal" hidden>${answerHtml(w, card, note, { front: item.kind === "prod" ? "ru" : "en" })}${item.again ? `<button type="button" class="btn primary big" data-next>Дальше</button>` : grades}</div>`;
}

/**
 * Runs one session. onCard(cid, card) stores each graded card; onEnd(stats) runs once, at the end or on an early close;
 * onFinish(stats) returns the result screen HTML; onNote(wid, after) opens the association editor.
 */
export function runSession({ plan, db, title, onCard, onAudio, onNote, onEnd, onFinish, onMore, onClose }) {
  const root = document.getElementById("drill");
  const queue = buildQueue(plan, db().cards);
  const stats = { right: 0, graded: 0, fresh: [], reviews: 0 };
  let i = 0;
  let answered = false;
  let ended = false;
  let shownAt = 0;

  const end = () => {
    if (ended) return;
    ended = true;
    onEnd(stats);
  };

  const item = () => queue[i];
  const audio = () => db().audio;
  const cardOf = (it) => db().cards[it.cid];
  const say = (what) => {
    const w = WORD[item().wid];
    if (what === "ex") speakEn(w.ex);
    else speakEn(w.en, what === "slow");
  };

  const close = () => {
    end();
    stopSpeech();
    root.hidden = true;
    root.innerHTML = "";
    root.onclick = null;
    root.setAttribute("aria-label", ownerLabel);
    document.body.classList.remove("locked");
    if (onClose) onClose();
  };

  const requeue = (it) => queue.splice(Math.min(queue.length, i + REQUEUE_GAP), 0, { ...it, again: true, listen: false, options: null });

  const record = (it, ok, g) => {
    if (it.again) return;
    stats.graded += 1;
    if (ok) stats.right += 1;
    if (it.kind === "check") {
      onCard(it.cid, introduced(ok, plan.today));
      stats.fresh.push(it.wid);
    } else {
      onCard(it.cid, grade(cardOf(it), g, plan.today));
      stats.reviews += 1;
    }
    if (!ok) requeue(it);
  };

  const bodyFor = (it) => {
    const note = db().notes[it.wid];
    if (it.kind === "intro") {
      const intros = queue.filter((q) => q.kind === "intro");
      return introHtml(WORD[it.wid], note, intros.indexOf(it) + 1, intros.length);
    }
    if (it.listen) return listenHtml(it, audio());
    return recallHtml(it, cardOf(it), note);
  };

  const show = () => {
    answered = false;
    shownAt = Date.now();
    if (i >= queue.length) {
      stopSpeech();
      end();
      root.innerHTML = `<div class="dr-wrap">${onFinish(stats)}
        ${onMore ? `<button type="button" class="btn big" data-more>Ещё 5 новых слов</button>` : ""}
        <button type="button" class="btn primary huge" data-close>Готово</button></div>`;
      return;
    }
    const it = item();
    const pct = Math.round((i / queue.length) * 100);
    root.innerHTML = `<div class="dr-top"><span class="dr-count">${esc(title)} · ${i + 1} из ${queue.length}</span>
        <span class="en-top-actions"><button type="button" class="dr-x" data-audio aria-label="${audio() ? "Выключить звук" : "Включить звук"}">${audio() ? "🔊" : "🔇"}</button>
        <button type="button" class="dr-x" data-close aria-label="Закрыть">✕</button></span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="dr-wrap en-card">${it.again ? `<span class="badge en-again">ещё раз</span>` : ""}${bodyFor(it)}
        <button type="button" class="btn primary big" data-next hidden>Дальше</button></div>`;
    root.scrollTop = 0;
    // Recognition starts from the sound; «say it» cards stay silent until the answer is shown.
    if (audio() && it.kind !== "prod") say("word");
  };

  const next = () => { i += 1; show(); };

  const pick = (btn) => {
    answered = true;
    const it = item();
    const w = WORD[it.wid];
    const chosen = it.options[Number(btn.dataset.opt)];
    const ok = chosen.id === w.id;
    root.querySelectorAll(".dr-opt").forEach((b, n) => {
      b.disabled = true;
      b.classList.add(it.options[n].id === w.id ? "best" : b === btn ? "picked" : "dim");
    });
    const reveal = root.querySelector(".dr-reveal");
    reveal.innerHTML = answerHtml(w, cardOf(it), db().notes[it.wid]);
    reveal.hidden = false;
    root.querySelectorAll("[data-show-word], .en-play, .en-card > .row2, .en-card > .en-word").forEach((el) => { el.hidden = true; });
    root.querySelector("[data-next]").hidden = false;
    record(it, ok, ok ? GRADE.good : GRADE.forgot);
    if (audio()) say("word");
  };

  root.onclick = (e) => {
    const t = e.target;
    const it = item();
    if (t.closest("[data-close]")) { close(); return; }
    if (t.closest("[data-more]")) { close(); onMore(); return; }
    const toggle = t.closest("[data-audio]");
    if (toggle) {
      onAudio(!audio());
      stopSpeech();
      toggle.textContent = audio() ? "🔊" : "🔇";
      toggle.setAttribute("aria-label", audio() ? "Выключить звук" : "Включить звук");
      return;
    }
    const s = t.closest("[data-say]");
    if (s) { say(s.dataset.say); return; }
    if (Date.now() - shownAt < TAP_GUARD_MS) return;
    if (t.closest("[data-next]")) { next(); return; }
    if (!it) return;
    if (t.closest("[data-note]")) { onNote(it.wid, show); return; }
    if (t.closest("[data-show-word]")) { root.querySelector(".en-word[hidden]").hidden = false; t.closest("[data-show-word]").hidden = true; return; }
    if (t.closest("[data-met]")) { next(); return; }
    if (t.closest("[data-known]")) {
      onKnownWord(it.wid);
      return;
    }
    const opt = t.closest("[data-opt]");
    if (opt && !answered) { pick(opt); return; }
    if (t.closest("[data-reveal]")) {
      t.closest("[data-reveal]").hidden = true;
      root.querySelector(".dr-reveal").hidden = false;
      if (audio() && it.kind === "prod") say("word");
      return;
    }
    const g = t.closest("[data-grade]");
    if (g && !answered) {
      answered = true;
      const value = Number(g.dataset.grade);
      record(it, value !== GRADE.forgot, value);
      next();
    }
  };

  // «Уже знаю»: the word skips its check and comes back in a week.
  function onKnownWord(wid) {
    onCard(recId(wid), alreadyKnown(plan.today));
    stats.graded += 1;
    stats.right += 1;
    stats.fresh.push(wid);
    const at = queue.findIndex((q, n) => n > i && q.kind === "check" && q.wid === wid);
    if (at > -1) queue.splice(at, 1);
    next();
  }

  // #drill is shared with «Переговоры»: borrow it and give the label back on close.
  const ownerLabel = root.getAttribute("aria-label") || "";
  root.setAttribute("aria-label", "Тренировка слов");
  root.hidden = false;
  document.body.classList.add("locked");
  show();
}
