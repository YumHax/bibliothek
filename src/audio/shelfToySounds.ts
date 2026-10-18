import { oneShot } from './oneShot';
import { noiseBurst, rand, tone } from './synth';

/*
 * The trophy row's toys at home, played with (`world/prizes/ShelfToy`): the snow globe's shake, the jukebox tape's
 * bar of italo on a warbly cassette, the mini cabinet's attract jingle. Each follows a click; the player stands at it.
 */

/** The globe shaken: water sloshing in glass, a few tinkles. */
export function playGlobeShake(level = 0.16): void {
  const o = oneShot(level, 0.9);
  if (!o) return;
  const { ctx, out, t } = o;
  for (let i = 0; i < 3; i++) noiseBurst(ctx, out, t + i * 0.12, { band: 900, q: 1.2, level: 0.5, length: 0.1, attack: 0.02 });
  for (let i = 0; i < 4; i++) tone(ctx, out, t + 0.3 + i * rand(0.05, 0.1), { frequency: rand(2600, 3800), level: 0.18, length: 0.2 });
}

/** The tape's side B: a bar of synth bass and lead, a little out of tune as cassettes are. */
export function playTapeTune(level = 0.12): void {
  const o = oneShot(level, 2.4);
  if (!o) return;
  const { ctx, out, t } = o;
  const wow = rand(0.985, 1.015);
  const bass = [110, 110, 146.8, 130.8];
  const lead = [440, 523.3, 587.3, 659.3, 587.3, 523.3, 440, 392];
  bass.forEach((f, i) => tone(ctx, out, t + i * 0.5, { frequency: f * wow, level: 0.5, length: 0.45, type: 'sawtooth' }));
  lead.forEach((f, i) => tone(ctx, out, t + i * 0.25, { frequency: f * wow, level: 0.25, length: 0.22, type: 'square' }));
}

/** The mini cabinet's attract jingle: a quick chiptune run up and its chord. */
export function playCabinetJingle(level = 0.1): void {
  const o = oneShot(level, 1.2);
  if (!o) return;
  const { ctx, out, t } = o;
  [523.3, 659.3, 784, 1046.5, 784, 1046.5].forEach((f, i) => tone(ctx, out, t + i * 0.09, { frequency: f, level: 0.35, length: 0.1, type: 'square', attack: 0 }));
  [523.3, 659.3, 784].forEach((f) => tone(ctx, out, t + 0.6, { frequency: f, level: 0.2, length: 0.45, type: 'triangle' }));
}
