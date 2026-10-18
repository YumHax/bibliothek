import { oneShot } from './oneShot';
import { noiseBurst, rand } from './synth';

/*
 * The papers of a game box in the hand (`world/box/papers`): a booklet's page turned is a quick dry swish with the
 * soft flap of the page landing; a sheet turned over (a card, a poster) a shorter flick; a paper drawn out of the box
 * or slipped back in, a long low slide of paper on paper.
 */

/** A booklet's page turned. */
export function playPageTurn(level = 0.09): void {
  const o = oneShot(level, 0.45, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: rand(3200, 3800), bandTo: 1400, q: 0.7, level: 0.45, length: 0.2, attack: 0.03 });
  noiseBurst(ctx, out, t + 0.17, { band: 700, q: 0.8, level: 0.25, length: 0.06, attack: 0.004 });
}

/** A card or a sheet turned over. */
export function playSheetFlip(level = 0.08): void {
  const o = oneShot(level, 0.3, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: rand(2400, 2900), bandTo: 1800, q: 0.9, level: 0.4, length: 0.11, attack: 0.01 });
}

/** A paper slid out of the box, or back in. */
export function playPaperSlide(level = 0.07): void {
  const o = oneShot(level, 0.6, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: rand(1500, 1900), bandTo: 900, q: 0.6, level: 0.4, length: 0.32, attack: 0.05 });
}
