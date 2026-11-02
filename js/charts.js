// Small inline-SVG charts for the dynamics screen. Strings only, no DOM.
import { fmt1 } from "./ui.js";

const W = 340;
const PAD = { l: 34, r: 8, t: 14, b: 22 };

const niceRange = (values, minSpan) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(0, minSpan - (hi - lo)) / 2;
  return [lo - pad - 0.2, hi + pad + 0.2];
};

/**
 * Weight over the next days. series: [{ values, cls }], first value is today.
 * xLabels: [[dayIndex, text]].
 */
export function weightLineChart(series, xLabels, height = 170) {
  const days = series[0].values.length - 1;
  const [lo, hi] = niceRange(series.flatMap((s) => s.values), 1.5);
  const x = (i) => PAD.l + (i / days) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + ((hi - v) / (hi - lo)) * (height - PAD.t - PAD.b);
  const ticks = [hi - 0.2, (hi + lo) / 2, lo + 0.2];
  const grid = ticks.map((v) => `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt1(v)}</text>`).join("");
  const xs = xLabels.map(([i, t], n) => `<text class="tick" x="${x(i)}" y="${height - 6}" text-anchor="${n === 0 ? "start" : n === xLabels.length - 1 ? "end" : "middle"}">${t}</text>`).join("");
  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const end = s.values[days];
    return `<polyline class="${s.cls}" points="${pts}"/><circle class="${s.cls}-dot" cx="${x(days)}" cy="${y(end)}" r="4"/>`;
  }).join("");
  return `<svg class="dchart" viewBox="0 0 ${W} ${height}" role="img" aria-label="Прогноз веса на месяц">${grid}${xs}${lines}</svg>`;
}

/** Calories burned per day as stacked bars (workouts + walks) with the average as a dashed line. days: [{ label, train, walk, today }]. */
export function burnBarChart(days, avg, height = 150) {
  const totals = days.map((d) => d.train + d.walk);
  const max = Math.max(100, avg, ...totals);
  const slot = (W - PAD.l - PAD.r) / days.length;
  const bw = Math.max(6, slot * 0.62);
  const h = (v) => (v / max) * (height - PAD.t - PAD.b);
  const base = height - PAD.b;
  const bars = days.map((d, i) => {
    const cx = PAD.l + slot * i + slot / 2;
    const walkH = h(d.walk);
    const trainH = h(d.train);
    const value = d.today || totals[i] === max ? `<text class="val" x="${cx}" y="${base - walkH - trainH - 4}" text-anchor="middle">${totals[i]}</text>` : "";
    return `<rect class="b-walk" x="${cx - bw / 2}" y="${base - walkH}" width="${bw}" height="${walkH}" rx="2"/>
      <rect class="b-train" x="${cx - bw / 2}" y="${base - walkH - trainH}" width="${bw}" height="${trainH}" rx="2"/>
      ${value}<text class="tick${d.today ? " now" : ""}" x="${cx}" y="${height - 6}" text-anchor="middle">${d.label}</text>`;
  }).join("");
  const avgY = base - h(avg);
  const avgLine = avg > 0 ? `<line class="avg" x1="${PAD.l}" x2="${W - PAD.r}" y1="${avgY}" y2="${avgY}"/><text class="tick" x="${PAD.l - 6}" y="${avgY + 4}" text-anchor="end">${Math.round(avg)}</text>` : "";
  return `<svg class="dchart" viewBox="0 0 ${W} ${height}" role="img" aria-label="Сожжённые калории по дням">${bars}${avgLine}<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${base}" y2="${base}"/></svg>`;
}
