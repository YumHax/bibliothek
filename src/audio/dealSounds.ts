import { oneShot } from './oneShot';
import { noiseBurst, rand, tone } from './synth';

/*
 * The little sounds of a deal and a game at a counter: the handshake that closes a haggle, a seller's huff as they
 * dig in, the coin's scrape on a scratch card and its win, a quiz's right and wrong answer. Each follows a click and
 * plays at the player's own hands, so only a level.
 */

/** A deal closed: two palms meeting, then a pat. */
export function playHandshake(level = 0.22): void {
  const o = oneShot(level, 0.5, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: 1400, q: 0.8, level: 0.9, length: 0.05 });
  tone(ctx, out, t, { frequency: 140, to: 90, glide: 0.04, level: 0.4, length: 0.06 });
  noiseBurst(ctx, out, t + 0.22, { band: 1100, q: 0.9, level: 0.45, length: 0.04 });
}

/** A seller digging in (a walk-off, an insult): a short breath out through the nose. */
export function playHuff(level = 0.12): void {
  const o = oneShot(level, 0.5, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: 700, q: 0.6, level: 0.7, length: 0.28, attack: 0.04 });
}

/** A coin's edge across a scratch card's silver: a dry rasp. */
export function playScratch(level = 0.12): void {
  const o = oneShot(level, 0.3, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: rand(3000, 4200), q: 1.4, level: 0.6, length: 0.12, attack: 0.01 });
}

/** A scratch card's win showing: three bright notes up. */
export function playScratchWin(level = 0.12): void {
  const o = oneShot(level, 0.9, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  [784, 988, 1319].forEach((f, i) => tone(ctx, out, t + i * 0.1, { frequency: f, level: 0.4, length: 0.22, type: 'triangle' }));
}

/** A quiz answer: a bell for a right one, a low buzz for a wrong one. */
export function playAnswer(right: boolean, level = 0.12): void {
  const o = oneShot(level, 0.8, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  if (right) {
    tone(ctx, out, t, { frequency: 1046, level: 0.5, length: 0.5 });
    tone(ctx, out, t, { frequency: 1568, level: 0.18, length: 0.35 });
  } else {
    tone(ctx, out, t, { frequency: 130, level: 0.45, length: 0.4, type: 'square' });
    tone(ctx, out, t, { frequency: 138, level: 0.3, length: 0.4, type: 'square' });
  }
}
