// The course: 1000 base spoken words (A1–B1, each tagged), then B1, B2 and C1 packs. Situational packs of 10 in learning order.
// Each word: en, ru, tr (Russian-letter hint, stressed vowel in CAPS), e (emoji), ex/exRu (a ready phrase), mn (association, only for hard words), l (CEFR level, base words).
import W1 from "./words/w1.js";
import W2 from "./words/w2.js";
import W3 from "./words/w3.js";
import W4 from "./words/w4.js";
import W5 from "./words/w5.js";
import B1A from "./words/b1-1.js";
import B1B from "./words/b1-2.js";
import B1C from "./words/b1-3.js";
import B2A from "./words/b2-1.js";
import B2B from "./words/b2-2.js";
import C1A from "./words/c1-1.js";
import C1B from "./words/c1-2.js";

const withLevel = (lv, packs) => packs.map((p) => ({ ...p, lv }));
const RAW = [
  ...[...W1, ...W2, ...W3, ...W4, ...W5].map((p) => ({ ...p, base: true })),
  ...withLevel("B1", [...B1A, ...B1B, ...B1C]),
  ...withLevel("B2", [...B2A, ...B2B]),
  ...withLevel("C1", [...C1A, ...C1B]),
];

/** «thank you» → «thank-you», «I'm» → «im»: stable ids for progress storage. */
export const slug = (en) => en.toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export const PACKS = RAW.map((p, i) => ({ id: i, title: p.t, size: p.w.length, lv: p.lv || null }));

export const WORDS = RAW.flatMap((p, pack) => p.w.map((w) => ({ ...w, pack, base: Boolean(p.base), lv: w.l || p.lv || "A1" })))
  .map((w, i) => ({ ...w, id: slug(w.en), rank: i + 1 }));

/** The frequency curve behind «% слов в речи» is defined over the base spoken list only. */
export const BASE_SIZE = WORDS.filter((w) => w.base).length;
export const WORD = Object.fromEntries(WORDS.map((w) => [w.id, w]));
export const ORDER = WORDS.map((w) => w.id);
