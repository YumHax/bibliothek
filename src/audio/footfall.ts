import * as THREE from 'three';
import type { FootSurface } from './footSurface';
import { noiseBurst, tone } from './synth';
import { random } from '@/random';

/** Loose bits shifting under a sole (gravel's stones, dry leaves): how many, in which band (Hz), how loud and short each. */
interface Grains {
  count: [number, number];
  band: [number, number];
  level: number;
  length: number;
}

/** How each surface sounds: the heel's thump (pitch, level, decay), the click or scuff on top (band, level, length), what crunches. */
const VOICE: Record<FootSurface, { thump: number; thumpLevel: number; decay: number; band: number; q: number; scuff: number; length: number; hollow?: number; grains?: Grains }> = {
  wood: { thump: 95, thumpLevel: 0.5, decay: 0.09, band: 1400, q: 1.2, scuff: 0.18, length: 0.05, hollow: 210 },
  carpet: { thump: 75, thumpLevel: 0.28, decay: 0.07, band: 600, q: 0.7, scuff: 0.08, length: 0.07 },
  tiles: { thump: 120, thumpLevel: 0.25, decay: 0.05, band: 4200, q: 2.5, scuff: 0.3, length: 0.03 },
  concrete: { thump: 100, thumpLevel: 0.32, decay: 0.06, band: 2200, q: 1.5, scuff: 0.24, length: 0.04 },
  stone: { thump: 105, thumpLevel: 0.3, decay: 0.06, band: 2600, q: 1.3, scuff: 0.26, length: 0.045 },
  asphalt: { thump: 90, thumpLevel: 0.3, decay: 0.06, band: 1800, q: 0.9, scuff: 0.28, length: 0.06 },
  grass: { thump: 70, thumpLevel: 0.12, decay: 0.05, band: 1100, q: 0.6, scuff: 0.22, length: 0.13 },
  gravel: { thump: 85, thumpLevel: 0.18, decay: 0.05, band: 2600, q: 0.7, scuff: 0.2, length: 0.11, grains: { count: [7, 12], band: [1800, 5200], level: 0.16, length: 0.014 } },
  rubber: { thump: 62, thumpLevel: 0.2, decay: 0.045, band: 650, q: 0.6, scuff: 0.05, length: 0.05 },
  leaves: { thump: 100, thumpLevel: 0.22, decay: 0.05, band: 3200, q: 0.5, scuff: 0.2, length: 0.16, grains: { count: [6, 11], band: [2600, 7000], level: 0.11, length: 0.02 } },
  puddle: { thump: 100, thumpLevel: 0.26, decay: 0.06, band: 2600, q: 1.3, scuff: 0.22, length: 0.045 },
};
/** A puddle underfoot: from this wetness it holds water (below it, the paving under it), full by `full`. */
const PUDDLE = { from: 0.12, full: 0.45 };

interface FootfallOptions {
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
 * hollow ring under it, the sole's scuff or click twice (heel then toe), gravel's stones or dry leaves
 * crunching, a crunch of snow, a splash on wet ground and a real one in a puddle. Synthesised afresh each time, never a sample. The player's `Footsteps` and the
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
  const jitter = 0.9 + random() * 0.2;

  thump(ctx, pan, t, v.thump * jitter, v.thumpLevel * force * (1 - 0.6 * snow), v.decay);
  if (v.hollow) thump(ctx, pan, t, v.hollow * jitter, 0.12 * force, 0.12);
  const scuff = v.scuff * force * (1 - 0.8 * snow);
  sole(ctx, pan, t, v.band * jitter, v.q, scuff, v.length);
  sole(ctx, pan, t + 0.045 + random() * 0.02, v.band * 1.15 * jitter, v.q, scuff * 0.55, v.length * 0.8);
  if (snow > 0) {
    const grains = 5 + Math.floor(random() * 4);
    for (let i = 0; i < grains; i++) sole(ctx, pan, t + i * (0.012 + random() * 0.014), 1600 + random() * 1800, 3, 0.14 * snow * force, 0.012);
  }
  if (v.grains && snow < 0.5) {
    const g = v.grains;
    // Dry leaves crackle more than wet ones, which squelch.
    const dry = surface === 'leaves' ? 1 - 0.7 * wetness : 1;
    const count = g.count[0] + Math.floor(random() * (g.count[1] - g.count[0] + 1));
    for (let i = 0; i < count; i++) {
      sole(ctx, pan, t + random() * 0.09, g.band[0] + random() * (g.band[1] - g.band[0]), 2.5, g.level * force * dry * (0.5 + random() * 0.5), g.length * (0.6 + random() * 0.8));
    }
  }
  const puddle = surface === 'puddle' && snow < 0.5 ? THREE.MathUtils.smoothstep(wetness, PUDDLE.from, PUDDLE.full) : 0;
  if (puddle > 0) {
    // Into the water: a slap and a spray of droplets falling back, a plip or two.
    sole(ctx, pan, t + 0.01, 1400 + random() * 600, 0.8, 0.4 * puddle * force, 0.12);
    sole(ctx, pan, t + 0.03, 3600 + random() * 1200, 1, 0.3 * puddle * force, 0.22 + 0.1 * random());
    for (let i = 0; i < 2; i++) tone(ctx, pan, t + 0.06 + random() * 0.15, { frequency: 900 + random() * 900, toRatio: 1.7, glide: 0.03, level: 0.05 * puddle * force, length: 0.05, attack: 0.002 });
  } else if (wetness > 0.05 && snow < 0.5) sole(ctx, pan, t + 0.01, 3200 + random() * 900, 1.1, 0.22 * wetness * force, 0.08 + 0.1 * wetness);
  window.setTimeout(() => pan.disconnect(), 600);
}

/** The heel: a sine falling from 1.4x to its pitch over the first 60 % of the decay, up in 4 ms. Nothing below a whisper. */
function thump(ctx: AudioContext, out: AudioNode, t: number, frequency: number, level: number, decay: number): void {
  if (level <= 0.001) return;
  tone(ctx, out, t, { frequency: frequency * 1.4, to: frequency, glide: decay * 0.6, level, length: decay, attack: 0.004 });
}

/** The sole: a band of noise up in a few ms and dying over `length`. Nothing below a whisper. */
function sole(ctx: AudioContext, out: AudioNode, t: number, band: number, q: number, level: number, length: number): void {
  if (level <= 0.001) return;
  noiseBurst(ctx, out, t, { band, q, level, length, attack: Math.min(0.006, length * 0.3) });
}
