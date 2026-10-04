import type { CatNoiseKind } from '@/world/cat/types';
import { audioBus, startedAudioContext } from './audioContext';
import { whiteNoise } from './noise';
import { noiseBurst, tone } from './synth';
import { random } from '@/random';

/*
 * The noises of the cat's body and of its things, synthesised from the shared white noise and a
 * few oscillators (no samples): lapping, kibble crunch, claws on sisal or rug, a paw-soft landing,
 * the bell ball rolling off, and the kibble poured into the bowl. The cat's own noises go into the
 * voice's placed output (`CatVoice.noise`: distance, pan, walls); the pour, clicked for, goes
 * straight to the world bus.
 */

/** Peak level of each noise at 0 m, before `strength`. */
const LEVELS: Record<CatNoiseKind, number> = { lap: 0.05, lick: 0.018, crunch: 0.07, claws: 0.06, rug: 0.035, thud: 0.14, ball: 0.05, tick: 0.045 };
/** The kibble raining into the bowl: how long (matches `FoodBowl`'s pour), how many pieces are heard, how loud. */
const POUR = { seconds: 0.75, pieces: 30, level: 0.09 };

/** Plays one noise of the cat into `out`, starting now. `strength` 0..1 scales it. */
export function playCatNoise(ctx: AudioContext, out: AudioNode, kind: CatNoiseKind, strength = 1): void {
  const t = ctx.currentTime + 0.005;
  const gain = ctx.createGain();
  gain.gain.value = LEVELS[kind] * Math.max(0, Math.min(1, strength));
  gain.connect(out);
  const noise = whiteNoise(ctx, 1);
  let length = 0.3;
  switch (kind) {
    case 'lap':
      // Three quick licks: a wet click and a tiny tongue "tock" each.
      for (let i = 0; i < 3; i++) {
        const at = t + i * (0.12 + random() * 0.03);
        grain(ctx, gain, noise, at, 0.025, 'bandpass', 2200 + random() * 500, 3, 1);
        tone(ctx, gain, at, { frequency: 720, to: 420, level: 0.5, length: 0.03, attack: 0, floor: 0.0001, type: 'sine' });
      }
      length = 0.45;
      break;
    case 'lick':
      // One rasp of the tongue over fur: a short soft band of noise, a little wet at the end.
      grain(ctx, gain, noise, t, 0.07 + random() * 0.04, 'bandpass', 1500 + random() * 500, 1.2, 0.8);
      grain(ctx, gain, noise, t + 0.06, 0.02, 'bandpass', 2600, 3, 0.4);
      length = 0.2;
      break;
    case 'tick':
      // The ball knocking into a leg or the skirting: a soft woody tick and a faint shiver of its bell.
      tone(ctx, gain, t, { frequency: 900 + random() * 200, to: 600, level: 0.9, length: 0.035, attack: 0, floor: 0.0001, type: 'triangle' });
      grain(ctx, gain, noise, t, 0.012, 'bandpass', 3200, 2, 0.5);
      tone(ctx, gain, t + 0.01, { frequency: 3300 + random() * 300, to: 3200, level: 0.2 * strength, length: 0.07, attack: 0, floor: 0.0001, type: 'sine' });
      length = 0.2;
      break;
    case 'crunch': {
      // Two to four dry crackles as a piece of kibble breaks.
      const cracks = 2 + Math.floor(random() * 3);
      let at = t;
      for (let i = 0; i < cracks; i++) {
        grain(ctx, gain, noise, at, 0.012 + random() * 0.01, 'bandpass', 2800 + random() * 1800, 1.5, 0.6 + random() * 0.4);
        at += 0.03 + random() * 0.04;
      }
      length = 0.3;
      break;
    }
    case 'claws':
    case 'rug':
      scrape(ctx, gain, noise, t, kind === 'claws');
      length = 0.5;
      break;
    case 'thud':
      // A soft body landing: a low knock, a muffled pad of noise.
      tone(ctx, gain, t, { frequency: 95, to: 50, level: 1, length: 0.13, attack: 0, floor: 0.0001, type: 'sine' });
      grain(ctx, gain, noise, t, 0.05, 'lowpass', 450, 0.7, 0.7);
      length = 0.3;
      break;
    case 'ball':
      rollAndJingle(ctx, gain, noise, t, strength);
      length = 1.1;
      break;
  }
  window.setTimeout(() => gain.disconnect(), (length + 0.3) * 1000);
}

/** The kibble poured into the bowl: dozens of tiny ticks on the ceramic, denser as it fills, over a faint hiss. */
export function playKibblePour(): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  try {
    const t = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = POUR.level;
    out.connect(audioBus(ctx, 'world'));
    const noise = whiteNoise(ctx, 1);
    for (let i = 0; i < POUR.pieces; i++) {
      // Early pieces ring on bare ceramic (brighter), later ones fall on kibble (duller).
      const u = i / POUR.pieces;
      const at = t + Math.pow(random(), 0.8) * POUR.seconds;
      grain(ctx, out, noise, at, 0.006 + random() * 0.006, 'bandpass', 5200 - 2200 * u + random() * 900, 4, 0.4 + random() * 0.6);
    }
    grain(ctx, out, noise, t, POUR.seconds, 'highpass', 3000, 0.7, 0.08);
    window.setTimeout(() => out.disconnect(), (POUR.seconds + 0.4) * 1000);
  } catch {
    // No sound rather than a broken click.
  }
}

// --- building blocks ---------------------------------------------------------------------------

/**
 * Claws dragged down: noise through a band that sweeps as the paw pulls, chopped at ~45 Hz by the
 * fibres catching the claws. Sisal is bright and raspy, the rug duller and softer.
 */
function scrape(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, at: number, sisal: boolean): void {
  const duration = sisal ? 0.28 + random() * 0.1 : 0.35;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = sisal ? 'bandpass' : 'lowpass';
  band.Q.value = sisal ? 1.8 : 0.8;
  band.frequency.setValueAtTime(sisal ? 1600 : 700, at);
  band.frequency.exponentialRampToValueAtTime(sisal ? 3600 : 1300, at + duration);
  const grain = ctx.createGain();
  grain.gain.value = 0.55;
  const chop = ctx.createOscillator();
  chop.type = 'square';
  chop.frequency.value = sisal ? 45 + random() * 15 : 30;
  const chopDepth = ctx.createGain();
  chopDepth.gain.value = 0.45;
  chop.connect(chopDepth).connect(grain.gain);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(1, at + 0.03);
  env.gain.setValueAtTime(1, at + duration * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(band).connect(grain).connect(env).connect(out);
  source.start(at, random() * 0.5, duration + 0.02);
  chop.start(at);
  chop.stop(at + duration + 0.02);
}

/** The ball batted off: a low roll dying away and the bell inside tinkling as it turns. */
function rollAndJingle(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, at: number, strength: number): void {
  const roll = 0.5 + 0.5 * strength;
  grain(ctx, out, noise, at, roll, 'lowpass', 260, 0.9, 0.9);
  const tinkles = 3 + Math.round(3 * strength);
  for (let i = 0; i < tinkles; i++) {
    const when = at + (i / tinkles) * roll * (0.8 + random() * 0.3);
    const level = 0.35 * (1 - i / (tinkles + 1));
    // A small bell: two inharmonic partials, ringing briefly.
    tone(ctx, out, when, { frequency: 3300 + random() * 300, to: 3200, level: level, length: 0.09, attack: 0, floor: 0.0001, type: 'sine' });
    tone(ctx, out, when, { frequency: 4900 + random() * 400, to: 4800, level: level * 0.5, length: 0.06, attack: 0, floor: 0.0001, type: 'sine' });
  }
}

/** A grain of the cat's noise: `type`-filtered at `frequency`, swelling from 0.0001 in a few ms and gone by `duration`, cut from a random stretch of `noise`. */
function grain(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, at: number, duration: number, type: BiquadFilterType, frequency: number, q: number, level: number): void {
  noiseBurst(ctx, out, at, { band: frequency, filter: type, q, level, length: duration, attack: Math.min(0.004, duration * 0.3), curve: 'exponential', floor: 0.0001, noise, duration: duration + 0.01 });
}
