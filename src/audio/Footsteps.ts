import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { audioBus, startedAudioContext } from './audioContext';
import { OUTDOOR_SURFACES, type FootSurface } from './footSurface';

/** What the footsteps need to know of the player (the `FirstPersonController`, read-only). */
export interface Walking {
  readonly isLocked: boolean;
  readonly movementEnabled: boolean;
  readonly isSeated: boolean;
  readonly isCrouching: boolean;
  readonly isSprinting: boolean;
}

export interface FootstepsOptions {
  /** The camera: its horizontal movement is the walking. */
  camera: THREE.Object3D;
  player: Walking;
  /** What is underfoot at a world point. */
  surfaceAt: (world: THREE.Vector3) => FootSurface;
  /** How wet and how snowed-on the ground is (0..1 each), for the outdoor surfaces. */
  ground: () => { wetness: number; snowCover: number };
  /** True while the player is being moved rather than walking (a travel, a sleep): no steps. */
  suspended?: () => boolean;
}

/** Metres walked between two steps: walking, sprinting (longer strides), crouching (short ones). */
const STRIDE = { walk: 0.7, sprint: 0.95, crouch: 0.5 };
/** A jump further than this in one frame is a teleport (a travel, sitting down), never a step. */
const TELEPORT = 1.2;
/** Slower than this (m/s) is standing still, whatever the drift. */
const MIN_SPEED = 0.25;
const MASTER = 0.55;

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

/**
 * The player's own footsteps, everywhere: watches the camera's horizontal movement (the
 * controller is not touched) and plays a step every stride, heel then toe, a little to the left
 * then to the right, sprinting harder and crouching softer. The sound is synthesised from what is
 * underfoot (`surfaceAt`: parquet, carpet, tiles, concrete, paving, asphalt, grass); outdoors a wet
 * ground adds a splash and snow a crunch. Silent while seated, frozen, out of the room (menu open)
 * or `suspended` (travelling), and before the page's first gesture started the audio.
 */
export class Footsteps implements Updatable {
  private readonly last = new THREE.Vector3(NaN, 0, 0);
  private readonly here = new THREE.Vector3();
  private walked = 0;
  private side: 1 | -1 = 1;
  private noise: AudioBuffer | null = null;
  private out: GainNode | null = null;

  constructor(private readonly options: FootstepsOptions) {}

  update(dt: number): void {
    const { camera, player, suspended } = this.options;
    camera.getWorldPosition(this.here);
    const moved = Number.isNaN(this.last.x) ? 0 : Math.hypot(this.here.x - this.last.x, this.here.z - this.last.z);
    this.last.copy(this.here);
    const walking = player.isLocked && player.movementEnabled && !player.isSeated && !suspended?.();
    if (!walking || moved > TELEPORT || dt <= 0 || moved / dt < MIN_SPEED) {
      // Standing still: the next step comes half a stride after setting off again.
      if (!walking || moved > TELEPORT) this.walked = 0;
      this.walked = Math.min(this.walked, this.strideNow() * 0.5);
      return;
    }
    this.walked += moved;
    const stride = this.strideNow();
    if (this.walked < stride) return;
    this.walked -= stride;
    this.step();
  }

  private strideNow(): number {
    const { player } = this.options;
    return player.isCrouching ? STRIDE.crouch : player.isSprinting ? STRIDE.sprint : STRIDE.walk;
  }

  private step(): void {
    const ctx = startedAudioContext();
    if (!ctx) return;
    const out = this.output(ctx);
    const { player } = this.options;
    const surface = this.options.surfaceAt(this.here);
    const force = player.isCrouching ? 0.45 : player.isSprinting ? 1.35 : 1;
    this.side = this.side === 1 ? -1 : 1;
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.side * 0.12;
    pan.connect(out);
    const t = ctx.currentTime + 0.005;
    const v = VOICE[surface];
    const outdoor = OUTDOOR_SURFACES.has(surface);
    const { wetness, snowCover } = outdoor ? this.options.ground() : { wetness: 0, snowCover: 0 };
    const snow = THREE.MathUtils.smoothstep(snowCover, 0.15, 0.6);
    const jitter = 0.9 + Math.random() * 0.2;

    // The heel: a low thump (muffled by snow), and a wooden floor's hollow ring under it.
    this.tone(ctx, pan, t, v.thump * jitter, v.thumpLevel * force * (1 - 0.6 * snow), v.decay);
    if (v.hollow) this.tone(ctx, pan, t, v.hollow * jitter, 0.12 * force, 0.12);
    // Heel then toe: the scuff or click of the sole, twice, the toe softer.
    const scuff = v.scuff * force * (1 - 0.8 * snow);
    this.burst(ctx, pan, t, v.band * jitter, v.q, scuff, v.length);
    this.burst(ctx, pan, t + 0.045 + Math.random() * 0.02, v.band * 1.15 * jitter, v.q, scuff * 0.55, v.length * 0.8);
    // Snow: a crunch of tiny grains over the whole footfall.
    if (snow > 0) {
      const grains = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < grains; i++) this.burst(ctx, pan, t + i * (0.012 + Math.random() * 0.014), 1600 + Math.random() * 1800, 3, 0.14 * snow * force, 0.012);
    }
    // Wet ground: a splash, longer and brighter the wetter it is.
    if (wetness > 0.05 && snow < 0.5) this.burst(ctx, pan, t + 0.01, 3200 + Math.random() * 900, 1.1, 0.22 * wetness * force, 0.08 + 0.1 * wetness);
    window.setTimeout(() => pan.disconnect(), 600);
  }

  /** A pitched thump: a sine dropping in pitch, gone in `decay` seconds. */
  private tone(ctx: AudioContext, out: AudioNode, t: number, frequency: number, level: number, decay: number): void {
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
  private burst(ctx: AudioContext, out: AudioNode, t: number, band: number, q: number, level: number, length: number): void {
    if (level <= 0.001) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseOf(ctx);
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

  private output(ctx: AudioContext): GainNode {
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = MASTER;
      this.out.connect(audioBus(ctx, 'world'));
    }
    return this.out;
  }

  private noiseOf(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }
}
