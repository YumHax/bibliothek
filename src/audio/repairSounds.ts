import { oneShot } from './oneShot';
import { noiseBurst, rand, tone } from './synth';

/*
 * The kitchen table's console repair (`ui/repair/RepairPanel`): a screw turning out or in, a brush scrubbing, a part
 * clicking out of or into its socket, the soldering iron's hiss, and the console powering up. Played by the player's
 * clicks in a panel: the player's own doing, heard over the room's duck, no distance model; synthesised on the spot
 * and gone after.
 */

/** The panel's sounds are in the foreground, 10 ms ahead of the click that asked for them (`oneShot`). */
const output = (level: number, seconds: number) => oneShot(level, seconds, { channel: 'foreground', lead: 0.01 });

/** A screw turned out (or in): the bit's ticks against its head, then the little metal clink (or the last snug turn). */
export function playScrew(tighten = false, level = 0.25): void {
  const o = output(level, 0.8);
  if (!o) return;
  const { ctx, out, t } = o;
  for (let i = 0; i < 4; i++) noiseBurst(ctx, out, t + i * 0.09, { band: rand(3200, 4200), q: 3, level: 0.35, length: 0.03 });
  if (tighten) noiseBurst(ctx, out, t + 0.4, { band: 900, q: 2, level: 0.5, length: 0.06 });
  else tone(ctx, out, t + 0.42, { frequency: rand(4200, 5200), level: 0.22, length: 0.12, type: 'triangle' });
}

/** A stroke of the brush or the cotton bud over a contact. */
export function playScrub(level = 0.22): void {
  const o = output(level, 0.4);
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: rand(2200, 3200), q: 0.9, level: 0.6, length: rand(0.12, 0.2) });
}

/** A part unseated or seated: a plastic click (and a lower one when it goes home). */
export function playPartClick(seated: boolean, level = 0.3): void {
  const o = output(level, 0.4);
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: seated ? 1600 : 2400, q: 4, level: 0.7, length: 0.03 });
  if (seated) noiseBurst(ctx, out, t + 0.05, { band: 700, q: 3, level: 0.5, length: 0.05 });
}

/** The iron on a joint: the flux's hiss, rising, and a tiny tick as the solder flows. */
export function playSolder(level = 0.2): void {
  const o = output(level, 1);
  if (!o) return;
  const { ctx, out, t } = o;
  // The hiss: high-passed noise whose cutoff climbs as the flux boils off.
  noiseBurst(ctx, out, t, { band: 3500, bandTo: 6000, sweep: 0.6, filter: 'highpass', level: 0.5, length: 0.7, attack: 0.08, floor: 0.001, offset: 0, tail: 0.05 });
  tone(ctx, out, t + 0.5, { frequency: 6200, level: 0.08, length: 0.05 });
}

/** The power switch, the relay's thump and a rising two-note chime: it works. */
export function playPowerOn(level = 0.3): void {
  const o = output(level, 1.6);
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: 1200, q: 3, level: 0.8, length: 0.04 });
  tone(ctx, out, t + 0.12, { frequency: 70, level: 0.5, length: 0.25 });
  tone(ctx, out, t + 0.45, { frequency: 659, level: 0.35, length: 0.5, type: 'square' });
  tone(ctx, out, t + 0.62, { frequency: 988, level: 0.35, length: 0.8, type: 'square' });
}
