import { oneShot } from './oneShot';
import { noiseBurst, rand, tone } from './synth';

/*
 * The little sounds of Mémé's pastimes (docs/grandma.md "Things to do with her"), at the player's own hands: the
 * afternoon quiz's jingle, her buzzing in and the studio's applause; a pencil letter, the rubber and the pen going over
 * a found word in the crossword; the yarn given slack and the yarn snapping.
 */

/** The show coming on: a bright four-note jingle, a little tinny, as through her set's speaker. */
export function playQuizJingle(level = 0.1): void {
  const o = oneShot(level, 1.4, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  [523, 659, 784, 1046].forEach((f, i) => {
    tone(ctx, out, t + i * 0.13, { frequency: f, level: 0.4, length: i === 3 ? 0.6 : 0.2, type: 'square' });
    tone(ctx, out, t + i * 0.13, { frequency: f * 2, level: 0.08, length: 0.15, type: 'triangle' });
  });
}

/** Her hand on the armrest, buzzing in before the player: a short rising "ding". */
export function playQuizBuzzIn(level = 0.12): void {
  const o = oneShot(level, 0.5, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  tone(ctx, out, t, { frequency: 880, to: 1320, glide: 0.06, level: 0.45, length: 0.32, type: 'triangle' });
}

/** The studio audience at the end of the show: a swell of claps (many short bursts), fading. */
export function playApplause(level = 0.09): void {
  const seconds = 2.4;
  const o = oneShot(level, seconds, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  for (let i = 0; i < 70; i++) {
    const at = t + rand(0, seconds - 0.3) * (i % 3 === 0 ? 0.6 : 1);
    const fade = 1 - (at - t) / seconds;
    noiseBurst(ctx, out, at, { band: rand(1200, 2600), q: 1.1, level: 0.35 * fade, length: rand(0.02, 0.04), offset: 'random' });
  }
}

/** A letter pencilled into a square: two quick graphite strokes. */
export function playPencil(level = 0.08): void {
  const o = oneShot(level, 0.25, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: rand(4200, 5200), q: 2, level: 0.5, length: 0.05, attack: 0.005, offset: 'random' });
  noiseBurst(ctx, out, t + 0.07, { band: rand(3800, 4800), q: 2, level: 0.4, length: 0.06, attack: 0.005, offset: 'random' });
}

/** The rubber across the squares: a soft, longer rub back and forth. */
export function playRubOut(level = 0.08): void {
  const o = oneShot(level, 0.6, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  for (let i = 0; i < 3; i++) noiseBurst(ctx, out, t + i * 0.12, { band: rand(900, 1400), q: 0.8, level: 0.45, length: 0.1, attack: 0.03, offset: 'random' });
}

/** The pen going over a found word: one long, smooth stroke and a tap of the full stop. */
export function playPenStroke(level = 0.08): void {
  const o = oneShot(level, 0.7, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: 2600, bandTo: 3400, q: 1.6, level: 0.35, length: 0.42, attack: 0.04, offset: 'random' });
  tone(ctx, out, t + 0.48, { frequency: 420, level: 0.2, length: 0.05 });
}

/** Slack given: the yarn sliding through the fingers, a soft woolly hiss. */
export function playYarnSlack(level = 0.07): void {
  const o = oneShot(level, 0.4, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: 700, bandTo: 450, q: 0.7, level: 0.5, length: 0.28, attack: 0.03, offset: 'random' });
}

/** The yarn snapping: a dry twang and a whip of the loose end. */
export function playYarnSnap(level = 0.14): void {
  const o = oneShot(level, 0.6, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  tone(ctx, out, t, { frequency: 520, to: 180, glide: 0.12, level: 0.45, length: 0.16, type: 'triangle' });
  noiseBurst(ctx, out, t, { band: 2400, q: 1.2, level: 0.6, length: 0.04 });
  noiseBurst(ctx, out, t + 0.05, { band: 1800, bandTo: 600, q: 0.8, level: 0.35, length: 0.22, attack: 0.01 });
}
