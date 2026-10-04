import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { whiteNoise } from '@/audio/noise';
import { noiseBurst, partials } from '@/audio/synth';
import { random } from '@/random';

/*
 * What a travel door sounds like, synthesised: the latch as the handle goes down, the shop bell on
 * its spring over a shop's door, the leaf pulled shut behind the player on the other side. They
 * follow a click, so the audio has started; they sound on the world bus.
 */

/** The doors' bursts strike from silence in 3 ms and die to 0.0001, cut from the first 0.3 s of the noise, as they always did. */
const GRAIN = { attack: 0.003, curve: 'exponential', floor: 0.0001, offset: 0 } as const;

/** The handle going down and the latch drawing back: a small metal knock, a wooden creak after it. */
export function playLatch(level = 0.22): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const out = audioBus(ctx, 'world');
  noiseBurst(ctx, out, now, { ...GRAIN, band: 1700, q: 4, level: level, length: 0.04, noise: whiteNoise(ctx, 0.3) });
  noiseBurst(ctx, out, now + 0.07, { ...GRAIN, band: 2300, q: 6, level: level * 0.6, length: 0.03, noise: whiteNoise(ctx, 0.3) });
  // The hinges: a short rising squeak, faint.
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(520, now + 0.14);
  osc.frequency.linearRampToValueAtTime(760, now + 0.36);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now + 0.14);
  env.gain.exponentialRampToValueAtTime(level * 0.08, now + 0.2);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
  osc.connect(env).connect(out);
  osc.start(now + 0.14);
  osc.stop(now + 0.4);
}

/** The shop bell's three partials: the strike note, a fifth-ish above it and a bright edge. */
const SHOP_BELL = [
  [2480, 1],
  [3310, 0.55],
  [5120, 0.25],
] as const;

/** The bell on its spring over a shop door: a bright jingle, struck four or five times as it bobs, ringing out. */
export function playShopBell(level = 0.1, delay = 0): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, 'world'));
  let at = ctx.currentTime + delay;
  const strikes = 4 + Math.floor(random() * 2);
  for (let i = 0; i < strikes; i++) {
    const loud = Math.pow(0.62, i);
    partials(ctx, out, at, SHOP_BELL, { level: loud, length: 0.6, attack: 0.002, curve: 'exponential', floor: 0.0001, spread: 0.01 });
    at += 0.07 + random() * 0.05;
  }
  window.setTimeout(() => out.disconnect(), (at - ctx.currentTime + 0.8) * 1000);
}

/** The door swinging shut behind the player: a soft thud of the leaf in its frame, the latch clicking home. */
export function playDoorShut(level = 0.25): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const out = audioBus(ctx, 'world');
  noiseBurst(ctx, out, now, { ...GRAIN, band: 320, q: 1.2, level: level, length: 0.16, noise: whiteNoise(ctx, 0.3) });
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(110, now);
  osc.frequency.exponentialRampToValueAtTime(65, now + 0.15);
  const low = ctx.createGain();
  low.gain.setValueAtTime(level * 0.7, now);
  low.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  osc.connect(low).connect(out);
  osc.start(now);
  osc.stop(now + 0.22);
  noiseBurst(ctx, out, now + 0.05, { ...GRAIN, band: 2400, q: 5, level: level * 0.5, length: 0.03, noise: whiteNoise(ctx, 0.3) });
}

