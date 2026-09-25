import type { ValuePoint } from '@/economy/ValueHistory';

const INK = 'rgba(236, 233, 226, 0.65)';
const GRID = 'rgba(255, 255, 255, 0.1)';
const LINE = '#d4a52a';
const FILL = 'rgba(212, 165, 42, 0.16)';
const FONT = '12px system-ui, sans-serif';

/**
 * The collection's value, one point per day played, as a small line chart on `canvas` (drawn at
 * the device's pixel ratio): the line in the panel's gold over a soft fill, the top value and the
 * first and last days along the edges. Days not played are skipped, not interpolated as flat.
 */
export function drawValueChart(canvas: HTMLCanvasElement, points: readonly ValuePoint[]): void {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.width;
  const cssH = canvas.height;
  canvas.style.width = '100%';
  canvas.style.maxWidth = `${cssW}px`;
  canvas.style.aspectRatio = `${cssW} / ${cssH}`;
  canvas.width = cssW * ratio;
  canvas.height = cssH * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  ctx.font = FONT;
  ctx.textBaseline = 'middle';

  const left = 48;
  const right = cssW - 12;
  const top = 14;
  const bottom = cssH - 24;
  if (points.length < 2) {
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(points.length ? 'Come back tomorrow: the chart starts with a second day.' : 'Nothing to chart yet.', cssW / 2, cssH / 2);
    return;
  }
  const max = niceCeiling(Math.max(...points.map((p) => p.value)));
  const x = (i: number) => left + (i / (points.length - 1)) * (right - left);
  const y = (v: number) => bottom - (v / max) * (bottom - top);

  // Grid: four bands, labelled on the left.
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.fillStyle = INK;
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, Math.round(y(v)) + 0.5);
    ctx.lineTo(right, Math.round(y(v)) + 0.5);
    ctx.stroke();
    ctx.fillText(short(v), left - 6, y(v));
  }

  // The fill under the line, then the line.
  ctx.beginPath();
  ctx.moveTo(x(0), bottom);
  points.forEach((p, i) => ctx.lineTo(x(i), y(p.value)));
  ctx.lineTo(x(points.length - 1), bottom);
  ctx.closePath();
  ctx.fillStyle = FILL;
  ctx.fill();
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.value)) : ctx.moveTo(x(i), y(p.value))));
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  const last = points[points.length - 1]!;
  ctx.fillStyle = LINE;
  ctx.beginPath();
  ctx.arc(x(points.length - 1), y(last.value), 3.5, 0, Math.PI * 2);
  ctx.fill();

  // The first and the last day under the axis.
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText(points[0]!.day, left, cssH - 10);
  ctx.textAlign = 'right';
  ctx.fillText(last.day, right, cssH - 10);
}

/** A round number at or above `v` for the chart's top (1, 2 or 5 times a power of ten). */
function niceCeiling(v: number): number {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** 1200 -> "1.2k". */
function short(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(Math.round(v));
}
