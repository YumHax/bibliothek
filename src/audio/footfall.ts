import * as THREE from 'three';
import type { FootSurface } from './footSurface';
import { whiteNoise } from './noise';

/** How each surface sounds: the heel's thump (pitch, level, decay), the click or scuff on top (band, level, length). */
const VOICE: Record<FootSurface, { thump: number; thumpLevel: number; decay: number; band: number; q: number; scuff: number; length: number; hollow?: number }> = {
  wood: { thump: 95, thumpLevel: 0.5, decay: 0.09, band: 1400, q: 1.2, scuff: 0.18, length: 0.05, hollow: 210 },
  carpet: { thump: 75, thumpLevel: 0.28, decay: 0.07, band: 600, q: 0.7, scuff: 0.08, length: 0.07 },
  tiles: { thump: 120, thumpLevel: 0.25, decay: 0.05, band: 4200, q: 2.5, scuff: 0.3, length: 0.03 },
  concrete: { thump: 100, thumpLevel: 0.32, decay: 0.06, band: 2200, q: 1.5, scuff: 0.24, length: 0.04 },
  stone: { thump: 105, thumpLevel: 0.3, decay: 0.06, band: 2600, q: 1.3, scuff: 0.26, length: 0.045 },
  asphalt: { thump: 90, thumpLevel: 0.3, decay: 0.06, band: 1800, q: 0.9, scuff: 0.28, length: 0.06 },
  grass: { thump: 70, thumpLevel: 0.12, decay: 0.05, band: 1100, q: 0.6, scuff: 0.22, length: 0.13 },
};

export interface FootfallOptions {
  /** 1 a walking step; less crouching, more sprinting. */
  force?: number;
  /** Stereo position of this foot (-1..1). */
  pan?: number;
  /** How wet and how snowed-on the ground is (0..1 each), for the outdoor surfaces. */
  wetness?: number;
  snowCover?: number;
}

/**
 * One footfall on `surface`, into `out`: the heel's thump (muffled by snow) and a wooden floor's
 * hollow ring under it, the sole's scuff or click twice (heel then toe), a crunch of snow, a splash
 * on wet ground. Synthesised afresh each time, never a sample. The player's `Footsteps` and the
 * friends walking the flat (`world/visitors`) share it.
 */
export function playFootfall(ctx: AudioContext, out: AudioNode, surface: FootSurface, options: FootfallOptions = {}): void {
  const force = options.force ?? 1;
  const pan = ctx.createStereoPanner();
  pan.pan.value = options.pan ?? 0;
  pan.connect(out);
  const t = ctx.currentTime + 0.005;
  const v = VOICE[surface];
  const snow = THREE.MathUtils.smoothstep(options.snowCover ?? 0, 0.15, 0.6);
  const wetness = options.wetness ?? 0;
  const jitter = 0.9 + Math.random() * 0.2;

  tone(ctx, pan, t, v.thump * jitter, v.thumpLevel * force * (1 - 0.6 * snow), v.decay);
  if (v.hollow) tone(ctx, pan, t, v.hollow * jitter, 0.12 * force, 0.12);
  const scuff = v.scuff * force * (1 - 0.8 * snow);
  burst(ctx, pan, t, v.band * jitter, v.q, scuff, v.length);
  burst(ctx, pan, t + 0.045 + Math.random() * 0.02, v.band * 1.15 * jitter, v.q, scuff * 0.55, v.length * 0.8);
  if (snow > 0) {
    const grains = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < grains; i++) burst(ctx, pan, t + i * (0.012 + Math.random() * 0.014), 1600 + Math.random() * 1800, 3, 0.14 * snow * force, 0.012);
  }
  if (wetness > 0.05 && snow < 0.5) burst(ctx, pan, t + 0.01, 3200 + Math.random() * 900, 1.1, 0.22 * wetness * force, 0.08 + 0.1 * wetness);
  window.setTimeout(() => pan.disconnect(), 600);
}

/** A pitched thump: a sine dropping in pitch, gone in `decay` seconds. */
function tone(ctx: AudioContext, out: AudioNode, t: number, frequency: number, level: number, decay: number): void {
  if (level <= 0.001) return;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(frequency * 1.4, t);
  osc.frequency.exponentialRampToValueAtTime(frequency, t + decay * 0.6);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0005, t + decay);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + decay + 0.02);
}

/** A burst of band-passed noise: a click, a scuff, a grain of snow, a splash. */
function burst(ctx: AudioContext, out: AudioNode, t: number, band: number, q: number, level: number, length: number): void {
  if (level <= 0.001) return;
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, 1);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = band;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + Math.min(0.006, length * 0.3));
  env.gain.exponentialRampToValueAtTime(0.0005, t + length);
  source.connect(filter).connect(env).connect(out);
  source.start(t, Math.random() * 0.8);
  source.stop(t + length + 0.02);
}
