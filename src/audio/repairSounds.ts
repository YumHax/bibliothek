import { whiteNoise } from './noise';
import { burst, oneShot, ping, rand } from './oneShot';

/*
 * The kitchen table's console repair (`ui/repair/RepairPanel`): a screw turning out or in, a brush scrubbing, a part
 * clicking out of or into its socket, the soldering iron's hiss, and the console powering up. Played by the player's
 * clicks in a panel, so on the UI bus, no distance model; synthesised on the spot and gone after.
 */

/** The panel's sounds all go on the UI bus, 10 ms ahead of the click that asked for them (`oneShot`). */
const output = (level: number, seconds: number) => oneShot(level, seconds, 'ui', 0.01);

/** A screw turned out (or in): the bit's ticks against its head, then the little metal clink (or the last snug turn). */
export function playScrew(tighten = false, level = 0.25): void {
  const o = output(level, 0.8);
  if (!o) return;
  const { ctx, out, t } = o;
  for (let i = 0; i < 4; i++) burst(ctx, out, t + i * 0.09, rand(3200, 4200), 3, 0.35, 0.03);
  if (tighten) burst(ctx, out, t + 0.4, 900, 2, 0.5, 0.06);
  else ping(ctx, out, t + 0.42, rand(4200, 5200), 0.22, 0.12, 'triangle');
}

/** A stroke of the brush or the cotton bud over a contact. */
export function playScrub(level = 0.22): void {
  const o = output(level, 0.4);
  if (!o) return;
  const { ctx, out, t } = o;
  burst(ctx, out, t, rand(2200, 3200), 0.9, 0.6, rand(0.12, 0.2));
}

/** A part unseated or seated: a plastic click (and a lower one when it goes home). */
export function playPartClick(seated: boolean, level = 0.3): void {
  const o = output(level, 0.4);
  if (!o) return;
  const { ctx, out, t } = o;
  burst(ctx, out, t, seated ? 1600 : 2400, 4, 0.7, 0.03);
  if (seated) burst(ctx, out, t + 0.05, 700, 3, 0.5, 0.05);
}

/** The iron on a joint: the flux's hiss, rising, and a tiny tick as the solder flows. */
export function playSolder(level = 0.2): void {
  const o = output(level, 1);
  if (!o) return;
  const { ctx, out, t } = o;
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, 1);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(3500, t);
  filter.frequency.linearRampToValueAtTime(6000, t + 0.6);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.5, t + 0.08);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  source.connect(filter).connect(env).connect(out);
  source.start(t);
  source.stop(t + 0.75);
  ping(ctx, out, t + 0.5, 6200, 0.08, 0.05);
}

/** The power switch, the relay's thump and a rising two-note chime: it works. */
export function playPowerOn(level = 0.3): void {
  const o = output(level, 1.6);
  if (!o) return;
  const { ctx, out, t } = o;
  burst(ctx, out, t, 1200, 3, 0.8, 0.04);
  ping(ctx, out, t + 0.12, 70, 0.5, 0.25);
  ping(ctx, out, t + 0.45, 659, 0.35, 0.5, 'square');
  ping(ctx, out, t + 0.62, 988, 0.35, 0.8, 'square');
}
