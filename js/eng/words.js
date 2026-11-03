// The 1000-word course: situational packs of 10 in learning order (≈ spoken frequency, see «Как учить»).
// Each word: en, ru, tr (Russian-letter hint, stressed vowel in CAPS), e (emoji), ex/exRu (a ready phrase), mn (association, only for hard words).
import W1 from "./words/w1.js";
import W2 from "./words/w2.js";
import W3 from "./words/w3.js";
import W4 from "./words/w4.js";
import W5 from "./words/w5.js";

const RAW = [...W1, ...W2, ...W3, ...W4, ...W5];

/** «thank you» → «thank-you», «I'm» → «im»: stable ids for progress storage. */
export const slug = (en) => en.toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export const PACKS = RAW.map((p, i) => ({ id: i, title: p.t, size: p.w.length }));

export const WORDS = RAW.flatMap((p, pack) => p.w.map((w) => ({ ...w, pack })))
  .map((w, i) => ({ ...w, id: slug(w.en), rank: i + 1 }));

export const WORD = Object.fromEntries(WORDS.map((w) => [w.id, w]));
export const ORDER = WORDS.map((w) => w.id);
