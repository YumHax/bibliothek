import { oneShot } from './oneShot';
import { noiseBurst, rand, tone } from './synth';

/*
 * The arcade's prizes at home, played with (docs/household.md "The arcade's prizes at home"): the duck's squeak, the
 * bouncy ball's hops, the yo-yo's whirr, the keyring's jingle. Each follows a click, synthesised on the spot; the
 * player stands at the thing, so only a level.
 */

/** The rubber duck squeezed: a reedy squeak, up then down. */
export function playSqueak(level = 0.22): void {
  const o = oneShot(level, 0.5);
  if (!o) return;
  const { ctx, out, t } = o;
  tone(ctx, out, t, { frequency: 1150, to: 1650, glide: 0.08, level: 0.5, length: 0.12, type: 'sawtooth' });
  tone(ctx, out, t + 0.12, { frequency: 1600, to: 1050, glide: 0.1, level: 0.35, length: 0.12, type: 'sawtooth' });
}

/** One hop of the bouncy ball on the floor, softer as it dies (`strength` 0..1). */
export function playBounce(strength: number, level = 0.3): void {
  const o = oneShot(level * Math.max(0.15, strength), 0.3);
  if (!o) return;
  const { ctx, out, t } = o;
  tone(ctx, out, t, { frequency: 180 + strength * 120, to: 90, glide: 0.06, level: 0.8, length: 0.08, attack: 0 });
  noiseBurst(ctx, out, t, { band: 1800, q: 1, level: 0.25, length: 0.02 });
}

/** The yo-yo thrown: the string's whirr down, the catch, the whirr back up. */
export function playYoyo(level = 0.16): void {
  const o = oneShot(level, 1.4);
  if (!o) return;
  const { ctx, out, t } = o;
  tone(ctx, out, t, { frequency: 260, to: 520, glide: 0.5, level: 0.4, length: 0.55, type: 'triangle' });
  noiseBurst(ctx, out, t + 0.55, { band: 2500, q: 2, level: 0.4, length: 0.03 });
  tone(ctx, out, t + 0.6, { frequency: 520, to: 260, glide: 0.5, level: 0.35, length: 0.55, type: 'triangle' });
}

/** The keyring knocked: a couple of thin metal tinks. */
export function playJingle(level = 0.14): void {
  const o = oneShot(level, 0.7);
  if (!o) return;
  const { ctx, out, t } = o;
  for (let i = 0; i < 3; i++) {
    const f = rand(3800, 5600);
    tone(ctx, out, t + i * rand(0.06, 0.12), { frequency: f, level: 0.3, length: 0.18 });
    tone(ctx, out, t + i * 0.08, { frequency: f * 1.52, level: 0.1, length: 0.12 });
  }
}
