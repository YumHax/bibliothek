import { oneShot } from './oneShot';
import { noiseBurst, rand } from './synth';

/*
 * Playing cards on a table (Mémé's crazy eights): a card laid down is a soft slap of card on cloth, a card drawn a
 * short slide off the stock.
 */

/** A card put down on the pile. */
export function playCardLay(level = 0.18): void {
  const o = oneShot(level, 0.3, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: rand(1800, 2400), q: 0.9, level: 0.5, length: 0.05, attack: 0 });
  noiseBurst(ctx, out, t + 0.012, { band: 600, q: 0.7, level: 0.25, length: 0.06 });
}

/** A card slid off the stock. */
export function playCardDraw(level = 0.14): void {
  const o = oneShot(level, 0.35, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: 3600, bandTo: 2200, q: 0.8, level: 0.4, length: 0.14 });
}
