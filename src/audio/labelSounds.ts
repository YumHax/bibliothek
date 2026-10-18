import { oneShot } from './oneShot';
import { noiseBurst, rand, tone } from './synth';

/*
 * The label maker at work (docs/furnishing.md "Shelf labels"): the dial clicking round to each letter and the
 * plunger embossing it, a crunch per letter, then the blade cutting the tape and the backing peeled.
 */

/** Printing a label of `letters` letters: one clack per letter (a dozen at most), the cut, the peel. */
export function playLabelPrint(letters: number, level = 0.22): void {
  const presses = Math.max(1, Math.min(12, letters));
  const gap = 0.085;
  const length = presses * gap + 0.5;
  const o = oneShot(level, length, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  for (let i = 0; i < presses; i++) {
    const at = t + i * gap;
    noiseBurst(ctx, out, at, { band: rand(2600, 3400), q: 2.5, level: 0.35, length: 0.02 }); // the dial's detent
    noiseBurst(ctx, out, at + 0.03, { band: rand(900, 1300), q: 1.2, level: 0.6, length: 0.035, attack: 0 }); // the plunger
    tone(ctx, out, at + 0.03, { frequency: rand(180, 220), level: 0.18, length: 0.04 });
  }
  const cut = t + presses * gap + 0.08;
  noiseBurst(ctx, out, cut, { band: 4200, q: 1.5, level: 0.7, length: 0.03, attack: 0 }); // the blade
  noiseBurst(ctx, out, cut + 0.18, { band: 5200, bandTo: 2400, q: 0.8, level: 0.25, length: 0.22 }); // the backing peeled
}
