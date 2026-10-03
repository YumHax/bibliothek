import { audioBus, startedAudioContext } from './audioContext';
import { Voice } from './ambient';
import { spatialInput, type Spatial } from './spatial';
import { whiteNoise } from './noise';

/*
 * The building heard through the flat's floor and ceiling: a broom handle banging on the ceiling
 * below (the downstairs neighbour, the night the flat is too loud), someone walking about upstairs,
 * a student's music thumping through the attic floor. Synthesised, never a sample; heard dull (the
 * walls' low-pass of `spatial.ts`) and from no side in particular.
 */

/** Every through-the-floor sound is this muffled (walls' worth of low-pass). */
export const FLOOR_WALLS = 3;
const FLOOR: Spatial = { pan: 0, walls: FLOOR_WALLS };

/** A one-shot's output: a gain onto the world bus through the floor's low-pass, let go after `seconds`. */
function floorOut(ctx: AudioContext, level: number, seconds: number): GainNode {
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(spatialInput(ctx, audioBus(ctx, 'world'), FLOOR, seconds));
  window.setTimeout(() => out.disconnect(), seconds * 1000);
  return out;
}

/** A dull blow on a slab: a low sine dropping, a little noise for the wood of the handle. */
function blow(ctx: AudioContext, out: AudioNode, at: number, strength: number, pitch = 95): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(pitch, at);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.45, at + 0.12);
  const body = ctx.createGain();
  body.gain.setValueAtTime(0.0001, at);
  body.gain.exponentialRampToValueAtTime(strength, at + 0.006);
  body.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  osc.connect(body).connect(out);
  osc.start(at);
  osc.stop(at + 0.25);
  const tap = ctx.createBufferSource();
  tap.buffer = whiteNoise(ctx, 0.1);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 420;
  band.Q.value = 1.1;
  const env = ctx.createGain();
  env.gain.setValueAtTime(strength * 0.4, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  tap.connect(band).connect(env).connect(out);
  tap.start(at);
  tap.stop(at + 0.08);
}

/** Downstairs bangs on their ceiling with a broom handle: two bursts of three or four blows. Returns whether it played. */
export function playBroomThumps(level = 0.5): boolean {
  const ctx = startedAudioContext();
  if (!ctx || level < 0.002) return false;
  const out = floorOut(ctx, level, 4);
  let t = ctx.currentTime + 0.05;
  for (const burst of [3 + Math.floor(Math.random() * 2), 3]) {
    for (let i = 0; i < burst; i++) {
      blow(ctx, out, t, 0.8 + Math.random() * 0.2);
      t += 0.24 + Math.random() * 0.05;
    }
    t += 0.7;
  }
  return true;
}

/** Someone crossing the room upstairs: four to seven heavy, slow steps, a little irregular. */
export function playStepsAbove(level = 0.2): boolean {
  const ctx = startedAudioContext();
  if (!ctx || level < 0.002) return false;
  const steps = 4 + Math.floor(Math.random() * 4);
  const out = floorOut(ctx, level, steps * 0.7 + 1);
  let t = ctx.currentTime + 0.05;
  for (let i = 0; i < steps; i++) {
    blow(ctx, out, t, 0.35 + Math.random() * 0.2, 70 + Math.random() * 15);
    t += 0.55 + Math.random() * 0.12;
  }
  return true;
}

/**
 * Music through the attic floor (the student up there, `world/attic`): the kick and the bass line
 * only, the rest lost in the slab. 118 beats a minute, a four-bar loop of four bass notes.
 */
export class MusicUpstairs extends Voice {
  private untilBeat = 0;
  private beat = 0;
  private out: AudioNode | null = null;
  private static readonly BEAT_S = 60 / 118;
  /** The bass line's roots (Hz), a bar each. */
  private static readonly ROOTS = [55, 55, 49, 41.2];

  constructor() {
    super(0.5);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const slab = ctx.createBiquadFilter();
    slab.type = 'lowpass';
    slab.frequency.value = 160;
    slab.Q.value = 0.6;
    slab.connect(out);
    this.out = slab;
  }

  protected tick(ctx: AudioContext, dt: number): void {
    this.untilBeat -= dt;
    if (this.untilBeat > 0 || !this.out) return;
    this.untilBeat += MusicUpstairs.BEAT_S;
    if (this.untilBeat < 0) this.untilBeat = MusicUpstairs.BEAT_S; // a long frame: no burst of catching up
    const at = ctx.currentTime + 0.02;
    blow(ctx, this.out, at, 0.9, 110);
    // The bass on the off-beat, the bar's root.
    const root = MusicUpstairs.ROOTS[Math.floor(this.beat / 4) % MusicUpstairs.ROOTS.length]!;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = root;
    const env = ctx.createGain();
    const off = at + MusicUpstairs.BEAT_S / 2;
    env.gain.setValueAtTime(0.0001, off);
    env.gain.exponentialRampToValueAtTime(0.5, off + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, off + MusicUpstairs.BEAT_S * 0.45);
    osc.connect(env).connect(this.out);
    osc.start(off);
    osc.stop(off + MusicUpstairs.BEAT_S * 0.5);
    this.beat++;
  }
}
