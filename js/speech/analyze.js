// Speech analysis for «Речь»: filler words, overused words, target words in any form, pace and variety.

/** Crutch words and phrases. Order breaks ties in the report. */
export const FILLERS = [
  "ну", "короче", "типа", "как бы", "вот", "в общем", "в принципе", "так сказать", "на самом деле", "это самое",
  "как его", "блин", "реально", "собственно", "э", "ээ", "эээ", "эм", "мм", "ммм",
];

/** Words that make speech flat, with stronger ones to try instead. */
export const OVERUSED = [
  { word: "очень", stems: ["очень"], alt: ["существенно", "крайне", "исключительно", "принципиально"] },
  { word: "важно", stems: ["важн"], alt: ["ключевой", "принципиально", "первостепенно", "критично"] },
  { word: "сделать", stems: ["делат", "делаю", "делае", "делал", "сделат", "сделаю", "сделае", "сделал", "сделан"], alt: ["выполнить", "реализовать", "запустить", "подготовить"] },
  { word: "хорошо", stems: ["хорош"], alt: ["убедительно", "весомо", "удачно", "сильно"] },
  { word: "проблема", stems: ["проблем"], alt: ["риск", "препятствие", "узкое место", "камень преткновения"] },
  { word: "нормально", stems: ["нормальн"], alt: ["приемлемо", "достаточно", "в рамках ожиданий"] },
  { word: "просто", stems: ["просто"], alt: ["лишь", "всего лишь", "достаточно"] },
  { word: "много", stems: ["много"], alt: ["значительно", "существенно", "львиная доля"] },
  { word: "супер", stems: ["супер", "классн", "круто", "крутой", "крутая"], alt: ["впечатляюще", "сильно", "блестяще"] },
];

const BLANK = "______";
/** Words allowed between the parts of an expression: «игра (явно не) стоит свеч». */
const MAX_GAP = 2;
/** Stems this short are whole function words («в», «на», «из») and must match exactly. */
const EXACT_LEN = 2;
const MIN_REPEAT = 2;

const norm = (text) => String(text ?? "").toLowerCase().replace(/ё/g, "е");

export const tokens = (text) => norm(text).match(/\p{L}+/gu) || [];

/** How many times a phrase (as a token list) occurs in a token list. */
function countPhrase(list, phrase) {
  const p = phrase.split(" ");
  let n = 0;
  for (let i = 0; i + p.length <= list.length; i++) {
    if (p.every((w, k) => list[i + k] === w)) n += 1;
  }
  return n;
}

const byCount = (a, b) => b.n - a.n;

export function fillerCounts(text) {
  const list = tokens(text);
  return FILLERS.map((word) => ({ word, n: countPhrase(list, word) })).filter((f) => f.n > 0).sort(byCount);
}

const fits = (token, stem) => (stem.length <= EXACT_LEN ? token === stem : token.startsWith(stem));

/** Stems in order, each within MAX_GAP words of the previous one. */
function hasSequence(list, stems, from = 0, prev = -1) {
  if (!stems.length) return true;
  const last = prev < 0 ? list.length - 1 : Math.min(list.length - 1, prev + MAX_GAP + 1);
  for (let i = prev < 0 ? from : prev + 1; i <= last; i++) {
    if (fits(list[i], stems[0]) && hasSequence(list, stems.slice(1), 0, i)) return true;
  }
  return false;
}

/** Ids of words said in the text in any form. A single word needs each stem somewhere; an expression needs them in order, close together. */
export function usedWordIds(text, words) {
  const list = tokens(text);
  return words.filter((w) => {
    const stems = w.stems.map(norm);
    return w.word?.includes(" ") ? hasSequence(list, stems) : stems.every((s) => list.some((t) => fits(t, s)));
  }).map((w) => w.id);
}

export function overused(text) {
  const list = tokens(text);
  return OVERUSED
    .map((o) => ({ word: o.word, alt: o.alt, n: list.filter((t) => o.stems.some((s) => t.startsWith(s))).length }))
    .filter((o) => o.n >= MIN_REPEAT)
    .sort(byCount);
}

/** seconds = null when the speech was typed or dictated without a timer. */
export function speechStats(text, seconds) {
  const list = tokens(text);
  const words = list.length;
  const fillers = fillerCounts(text).reduce((sum, f) => sum + f.n, 0);
  return {
    words,
    fillers,
    per100: words ? Math.round((fillers / words) * 1000) / 10 : 0,
    wpm: seconds ? Math.round(words / (seconds / 60)) : null,
    variety: words ? Math.round((new Set(list).size / words) * 100) : 0,
  };
}

/** The sentence with the recalled word hidden, for a recall card. */
export function blankOut(text, stems) {
  const low = stems.map(norm);
  return String(text).replace(/\p{L}+/gu, (w) => (low.some((s) => norm(w).startsWith(s)) ? BLANK : w));
}
