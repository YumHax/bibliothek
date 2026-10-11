import { SUNDAY_WEEKDAY, weekdayOf } from '@/time/wakefulness';
import { inHours } from '@/time/clock';

/*
 * WHO RIDES THE 38 WITH THE PLAYER (docs/grandma.md "Around her flat"): the line's regulars, drawn on the ride's
 * canvas (`busRideScene`) by the hour and the day: the man with his baguette in the seat in front (early morning, early
 * evening), the schoolgirl with her headphones standing by the pole (school days, the school run), the lady with her
 * tartan trolley (market mornings); and some mornings Mémé herself, turned round in the seat in front to wave
 * (`grandma/sharedRide`). Each drawn in a few flat shapes, the bus's light on them; the seat back hides the rest.
 */

/** A regular of the line, or Mémé. */
export type Rider = 'baguette' | 'schoolgirl' | 'trolley' | 'meme';

/** Where each sits or stands: the seat in front, or by the pole at the door. */
const SPOT: Record<Rider, 'seat' | 'pole'> = { baguette: 'seat', schoolgirl: 'pole', trolley: 'seat', meme: 'seat' };

/** Their hours (game hours, [from, to)), and the weekdays they ride (`weekdayOf`: Monday 0 .. Sunday 6; all when absent). */
const HABITS: Record<Exclude<Rider, 'meme'>, { hours: readonly (readonly [number, number])[]; days?: readonly number[] }> = {
  baguette: { hours: [[7, 9.5], [17.5, 20]] },
  schoolgirl: { hours: [[7.5, 8.75], [16.25, 18]], days: [0, 1, 3, 4] },
  trolley: { hours: [[9, 12.5]], days: [1, 3, 5] },
};

/** Who is on the bus on `day` at `hour`: the regulars whose hours these are, one to a spot; Mémé (`meme`) takes the seat in front. */
export function ridersFor(day: number, hour: number, meme: boolean): Rider[] {
  const weekday = weekdayOf(day);
  const riders: Rider[] = meme ? ['meme'] : [];
  for (const rider of Object.keys(HABITS) as Exclude<Rider, 'meme'>[]) {
    const { hours, days } = HABITS[rider];
    if (days && !days.includes(weekday)) continue;
    if (weekday === SUNDAY_WEEKDAY && rider !== 'baguette') continue;
    if (!hours.some(([a, b]) => inHours(hour, [a, b]))) continue;
    if (riders.some((other) => SPOT[other] === SPOT[rider])) continue;
    riders.push(rider);
  }
  return riders;
}

/** What a rider's frame needs: the ride's clock (s), how dark it is (0 day .. 1 night), the bus's bounce (px). */
interface RiderFrame {
  t: number;
  night: number;
  bounce: number;
}

/** Draws whoever sits in the seat in front (before its back is drawn over them). */
export function drawSeated(ctx: CanvasRenderingContext2D, w: number, h: number, riders: readonly Rider[], f: RiderFrame): void {
  const rider = riders.find((r) => SPOT[r] === 'seat');
  if (!rider) return;
  const lit = (colour: string): string => shade(colour, f.night * 0.45);
  const cx = w * 0.24;
  const top = h * 0.71 + f.bounce;
  if (rider === 'meme') {
    drawMeme(ctx, w, h, f, lit);
    return;
  }
  // Shoulders over the seat back, a coat's collar, the back of the head.
  ctx.fillStyle = lit(rider === 'baguette' ? '#3a4a5a' : '#6a3a4a');
  ellipse(ctx, cx, top - h * 0.01, w * 0.11, h * 0.06);
  ctx.fillStyle = lit(rider === 'baguette' ? '#2a3440' : '#c8b8a0');
  ellipse(ctx, cx, top - h * 0.05, w * 0.035, h * 0.025);
  const head = { x: cx + Math.sin(f.t * 0.4) * w * 0.004, y: top - h * 0.11 };
  ctx.fillStyle = lit('#d2a68a');
  ellipse(ctx, head.x, head.y, w * 0.032, h * 0.06);
  if (rider === 'baguette') {
    // Thinning grey hair, the ears, and the baguette standing up out of his lap by the window.
    ctx.fillStyle = lit('#8a8680');
    ellipse(ctx, head.x, head.y - h * 0.018, w * 0.031, h * 0.045);
    ctx.fillStyle = lit('#d2a68a');
    ellipse(ctx, head.x, head.y - h * 0.035, w * 0.016, h * 0.02);
    ctx.save();
    ctx.translate(cx - w * 0.13, top + h * 0.02);
    ctx.rotate(-0.35);
    ctx.fillStyle = lit('#d8a456');
    roundedBar(ctx, -w * 0.012, -h * 0.2, w * 0.024, h * 0.22, w * 0.012);
    ctx.strokeStyle = lit('#a8742e');
    ctx.lineWidth = Math.max(1, w * 0.002);
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.008, -h * 0.2 + i * h * 0.04);
      ctx.lineTo(w * 0.008, -h * 0.19 + i * h * 0.04);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    // A headscarf knotted under the chin, and the tartan trolley's top in the aisle.
    ctx.fillStyle = lit('#7a2a3a');
    ellipse(ctx, head.x, head.y - h * 0.012, w * 0.036, h * 0.056);
    ctx.fillStyle = lit('#2a4a3a');
    ctx.fillRect(w * 0.43, top + h * 0.02, w * 0.07, h * 0.2);
    ctx.fillStyle = lit('#8a2a2a');
    for (let i = 0; i < 4; i++) ctx.fillRect(w * 0.43, top + h * (0.04 + i * 0.045), w * 0.07, h * 0.012);
    ctx.fillStyle = lit('#3a3a3a');
    ctx.fillRect(w * 0.455, top - h * 0.04, w * 0.006, h * 0.07);
    ctx.fillRect(w * 0.445, top - h * 0.045, w * 0.026, h * 0.008);
  }
}

/** Draws whoever stands by the pole (before the pole, which their hand holds). */
export function drawStanding(ctx: CanvasRenderingContext2D, w: number, h: number, riders: readonly Rider[], f: RiderFrame): void {
  if (!riders.includes('schoolgirl')) return;
  const lit = (colour: string): string => shade(colour, f.night * 0.45);
  const x = w * 0.765;
  const sway = Math.sin(f.t * 1.3) * w * 0.003 + f.bounce * 0.5;
  // Her coat and the backpack's strap, her arm up to the pole.
  ctx.fillStyle = lit('#3a5a8a');
  roundedBar(ctx, x - w * 0.055 + sway, h * 0.3, w * 0.11, h * 0.75, w * 0.03);
  ctx.fillStyle = lit('#d8b23a');
  ctx.fillRect(x + w * 0.02 + sway, h * 0.32, w * 0.012, h * 0.4);
  ctx.strokeStyle = lit('#3a5a8a');
  ctx.lineWidth = w * 0.018;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.04 + sway, h * 0.36);
  ctx.lineTo(w * 0.85, h * 0.3);
  ctx.stroke();
  ctx.fillStyle = lit('#d9b294');
  ellipse(ctx, w * 0.852, h * 0.3, w * 0.012, h * 0.018);
  // Her head turned to the window, the ponytail, the headphones' band.
  const head = { x: x + sway, y: h * 0.235 };
  ctx.fillStyle = lit('#d9b294');
  ellipse(ctx, head.x - w * 0.006, head.y, w * 0.03, h * 0.058);
  ctx.fillStyle = lit('#3a2418');
  ellipse(ctx, head.x + w * 0.006, head.y - h * 0.02, w * 0.03, h * 0.045);
  ctx.save();
  ctx.translate(head.x + w * 0.03, head.y - h * 0.01);
  ctx.rotate(0.4 + Math.sin(f.t * 2.1) * 0.08);
  ellipse(ctx, 0, h * 0.04, w * 0.01, h * 0.05);
  ctx.restore();
  ctx.strokeStyle = lit('#e8e6e0');
  ctx.lineWidth = w * 0.005;
  ctx.beginPath();
  ctx.arc(head.x, head.y, w * 0.031, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.fillStyle = lit('#e8e6e0');
  ellipse(ctx, head.x - w * 0.03, head.y + h * 0.004, w * 0.008, h * 0.016);
}

/** Mémé turned round in the seat in front: her cardigan, her grey bun and glasses, her hand up waving at first. */
function drawMeme(ctx: CanvasRenderingContext2D, w: number, h: number, f: RiderFrame, lit: (colour: string) => string): void {
  const cx = w * 0.26;
  const top = h * 0.71 + f.bounce;
  ctx.fillStyle = lit('#8a5a6a');
  ellipse(ctx, cx, top - h * 0.01, w * 0.11, h * 0.065);
  const head = { x: cx + w * 0.01, y: top - h * 0.115 };
  ctx.fillStyle = lit('#e0b8a0');
  ellipse(ctx, head.x, head.y, w * 0.033, h * 0.062);
  ctx.fillStyle = lit('#d9d3c8');
  ellipse(ctx, head.x - w * 0.006, head.y - h * 0.04, w * 0.034, h * 0.03);
  ellipse(ctx, head.x - w * 0.03, head.y - h * 0.035, w * 0.014, h * 0.024);
  // Her glasses, her smile (she is looking at the player).
  ctx.strokeStyle = lit('#6a4a3a');
  ctx.lineWidth = Math.max(1, w * 0.0025);
  for (const dx of [-0.012, 0.014]) {
    ctx.beginPath();
    ctx.arc(head.x + w * dx, head.y - h * 0.004, w * 0.009, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(head.x + w * 0.001, head.y + h * 0.022, w * 0.011, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // The wave: her hand up by her face for the first seconds, to and fro.
  const waving = Math.max(0, Math.min(1, (f.t - 0.9) * 3)) * Math.max(0, Math.min(1, (4.2 - f.t) * 3));
  if (waving > 0) {
    const hand = { x: head.x + w * 0.06 + Math.sin(f.t * 9) * w * 0.008, y: head.y + h * (0.08 - 0.07 * waving) };
    ctx.strokeStyle = lit('#8a5a6a');
    ctx.lineWidth = w * 0.016;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.07, top - h * 0.02);
    ctx.lineTo(hand.x, hand.y + h * 0.02);
    ctx.stroke();
    ctx.fillStyle = lit('#e0b8a0');
    ellipse(ctx, hand.x, hand.y, w * 0.012, h * 0.022);
  }
  // Her shopping in the aisle: a basket's handle over the seat's edge.
  ctx.strokeStyle = lit('#8a6a3a');
  ctx.lineWidth = w * 0.006;
  ctx.beginPath();
  ctx.arc(w * 0.47, top + h * 0.02, w * 0.03, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = lit('#4a7a3a');
  ellipse(ctx, w * 0.465, top - h * 0.005, w * 0.012, h * 0.02);
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundedBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
  ctx.fill();
}

/** `colour` darkened by `k` (0..1) toward the night bus's gloom. */
function shade(colour: string, k: number): string {
  const n = parseInt(colour.slice(1), 16);
  const c = (shift: number): number => Math.round(((n >> shift) & 255) * (1 - k));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}
