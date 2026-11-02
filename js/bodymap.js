// Front/back muscle map: every region is a simple shape, the exercise's muscles are coloured.

const NAMES = {
  neckF: "шея спереди", neckB: "шея сзади и трапеции", delts: "плечи", chest: "грудь", biceps: "бицепс", triceps: "трицепс",
  abs: "пресс", obliques: "косые мышцы живота", quads: "передняя поверхность бедра", adductors: "внутренняя поверхность бедра",
  upperBack: "верх спины и лопатки", lats: "широчайшие", lowBack: "поясница", glutes: "ягодицы", hams: "задняя поверхность бедра", calves: "икры"
};

// Mirrored pairs are listed once for the left side; mirror() adds the right side around the view's centre.
const FRONT = {
  neckF: ["rect", 45, 25, 10, 9, 3],
  delts: ["ellipse", 31, 41, 7, 7],
  chest: ["rect", 36, 34, 13, 16, 5],
  biceps: ["rect", 22, 47, 8, 19, 4],
  obliques: ["rect", 34, 53, 6, 24, 3],
  abs: ["rect", 41, 52, 18, 28, 5],
  quads: ["rect", 35, 89, 12, 40, 6],
  adductors: ["rect", 47, 89, 3, 22, 1.5]
};
const BACK = {
  neckB: ["path", "M44 26 L56 26 L66 36 L34 36 Z"],
  delts: ["ellipse", 31, 41, 7, 7],
  upperBack: ["rect", 38, 37, 24, 15, 4],
  lats: ["rect", 33, 50, 8, 24, 4],
  triceps: ["rect", 22, 47, 8, 19, 4],
  lowBack: ["rect", 42, 54, 16, 24, 4],
  glutes: ["rect", 36, 80, 13, 19, 6],
  hams: ["rect", 35, 101, 12, 28, 6],
  calves: ["rect", 37, 131, 10, 22, 5]
};
// Non-muscle body parts in a neutral tone.
const BASE = [["ellipse", 50, 13, 10, 11], ["rect", 20, 68, 8, 22, 4], ["rect", 37, 131, 10, 38, 5], ["rect", 36, 78, 28, 12, 5], ["rect", 38, 34, 24, 46, 6]];
const CENTER = 50;
const MIRROR_X = new Set(["rect", "ellipse"]);

function shape([kind, ...a], cls) {
  if (kind === "path") return `<path class="${cls}" d="${a[0]}"/>`;
  if (kind === "ellipse") return `<ellipse class="${cls}" cx="${a[0]}" cy="${a[1]}" rx="${a[2]}" ry="${a[3]}"/>`;
  return `<rect class="${cls}" x="${a[0]}" y="${a[1]}" width="${a[2]}" height="${a[3]}" rx="${a[4]}"/>`;
}

function mirror(s) {
  const [kind, ...a] = s;
  if (!MIRROR_X.has(kind)) return null;
  if (kind === "ellipse") return a[0] === CENTER ? null : [kind, 2 * CENTER - a[0], ...a.slice(1)];
  const x = 2 * CENTER - a[0] - a[2];
  return x === a[0] ? null : [kind, x, ...a.slice(1)];
}

function view(regions, main, help, dx, label) {
  const both = (s) => [s, mirror(s)].filter(Boolean);
  const base = BASE.flatMap(both).map((s) => shape(s, "bm-base")).join("");
  const muscles = Object.entries(regions).flatMap(([id, s]) => {
    const cls = main.has(id) ? "bm-main" : help.has(id) ? "bm-help" : "bm-off";
    return both(s).map((p) => shape(p, cls));
  }).join("");
  return `<g transform="translate(${dx} 0)">${base}${muscles}<text x="${CENTER}" y="184" text-anchor="middle">${label}</text></g>`;
}

/** SVG with front and back views plus the list of muscles in words; empty string when the exercise has no map. */
export function bodyMapHtml(map) {
  if (!map) return "";
  const main = new Set(map[0]);
  const help = new Set(map[1]);
  const svg = `<svg class="bodymap" viewBox="0 0 200 190" role="img" aria-label="Карта мышц">${view(FRONT, main, help, 0, "спереди")}${view(BACK, main, help, 100, "сзади")}</svg>`;
  const words = (ids) => ids.map((id) => NAMES[id]).join(", ");
  const helpLine = map[1].length ? `<p><i class="bm-dot help"></i>Помогают: ${words(map[1])}</p>` : "";
  return `<div class="muscles">${svg}<div class="bm-legend"><p><i class="bm-dot main"></i>Работают: <b>${words(map[0])}</b></p>${helpLine}</div></div>`;
}
