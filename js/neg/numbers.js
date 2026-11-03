// Negotiation arithmetic: precise offers, a concession ladder and the zone of possible agreement.

// Precise numbers anchor harder than round ones: counter-offers move less (Mason et al., Columbia, 2013).
const PRECISE_SHIFT = 0.0075;
const SIGNIFICANT = 4;

/** 15 000 000 → 15 112 500 ("up") or 14 887 500 ("down"): close to the value, never round. */
export function preciseNumber(value, direction) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const shifted = value * (direction === "up" ? 1 + PRECISE_SHIFT : 1 - PRECISE_SHIFT);
  const exp = Math.floor(Math.log10(shifted)) - SIGNIFICANT + 1;
  const units = (direction === "up" ? Math.ceil : Math.floor)(shifted / 10 ** exp);
  const nudged = units % 10 === 0 ? units + (direction === "up" ? 3 : -3) : units;
  return byExp(nudged, exp);
}

/** units × 10^exp without float noise: works for 15 120 000 and for 15,11 (millions typed as decimals). */
const byExp = (units, exp) => (exp >= 0 ? units * 10 ** exp : Number((units / 10 ** -exp).toFixed(-exp)));

// Ackerman plan (Voss): offers at 65, 85, 95 and 100 % of the target. Each step is smaller, which signals the limit is near.
const ACKERMAN = [0.65, 0.85, 0.95];
// The same shrinking steps over any anchor-to-target gap: 57 %, 29 %, 14 % of the distance.
const GAP_SHARE = [0, 4 / 7, 6 / 7];

/** 16 517 143 → 16 520 000: middle offers read as considered, not as calculator output. */
const significant = (v) => {
  const exp = Math.floor(Math.log10(v)) - SIGNIFICANT + 1;
  return byExp(Math.round(v / 10 ** exp), exp);
};

/** Four offers from the first to the last. Seller: anchor down to target. Buyer: up to the target. */
export function concessionLadder({ anchor, target, side }) {
  if (!Number.isFinite(target) || target <= 0) return [];
  const sell = side === "sell";
  const precise = preciseNumber(target, sell ? "up" : "down");
  const head = side === "buy" && !(anchor > 0)
    ? ACKERMAN.map((k) => significant(target * k))
    : Number.isFinite(anchor) && (sell ? anchor > target : anchor < target)
      ? [anchor, ...GAP_SHARE.slice(1).map((k) => significant(anchor + (target - anchor) * k))]
      : null;
  if (!head) return [];
  // The precise last offer must not step back past the previous one; then plain target is the last step.
  const prev = head[head.length - 1];
  return [...head, (sell ? precise < prev : precise > prev) ? precise : target];
}

/** Overlap between my walk-away point and my guess of theirs; null when a number is missing. */
export function zopa({ side, walk, theirs }) {
  if (!Number.isFinite(walk) || !Number.isFinite(theirs)) return null;
  const [low, high] = side === "sell" ? [walk, theirs] : [theirs, walk];
  return { exists: low <= high, low, high };
}

// Non-breaking spaces keep «18 540 000 ₸» on one line.
const GROUP = /\B(?=(\d{3})+(?!\d))/g;
const NBSP = "\u00A0";
export function fmtMoney(n, unit = "") {
  if (!Number.isFinite(n)) return "—";
  const [whole, frac] = String(Math.round(n * 100) / 100).split(".");
  return `${whole.replace(GROUP, NBSP)}${frac ? `,${frac}` : ""}${unit ? `${NBSP}${unit}` : ""}`;
}

const SHORT = [[1e9, "млрд"], [1e6, "млн"], [1e3, "тыс"]];
/** 18 540 000 → «18,54 млн»: for narrow cells. Small numbers stay whole. */
export function fmtShort(n, unit = "") {
  if (!Number.isFinite(n)) return "—";
  const hit = SHORT.find(([base]) => Math.abs(n) >= base * 10 || (base >= 1e6 && Math.abs(n) >= base));
  if (!hit) return fmtMoney(n, unit);
  const v = String(Math.round((n / hit[0]) * 100) / 100).replace(".", ",");
  return `${v}${NBSP}${hit[1]}${unit ? `${NBSP}${unit}` : ""}`;
}
