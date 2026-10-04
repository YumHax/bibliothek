import { whiteNoise } from './noise';
import { random as liveRandom } from '@/random';

/*
 * The synth kit: the few building blocks every synthesised sound of the game is made of, each a handful of Web
 * Audio nodes laid on a clock. A sound file names its parameters and the kit plays them; the kit knows nothing of
 * where a sound is heard from (`hearing.ts`, `spatial.ts`) or on which bus it lands (`oneShot.ts`, `Voice`).
 *
 * Every envelope starts at `at` (context time), rises over `attack` seconds (0: set at once) along `curve` (a line
 * from silence, or an exponential from `floor`) to its level, holds `hold` seconds if any, and falls exponentially
 * to `floor` by `at + length`; the source stops `tail` seconds after that. The defaults are the kit's own; a sound
 * that was written with other constants (a floor of 0.0001, an exponential attack) names them, so it sounds as it did.
 */

interface Envelope {
  /** Seconds to the peak; 0 (default) sets it at once. */
  attack?: number;
  /** How the attack rises: a line from silence, or an exponential from `floor`. Default linear. */
  curve?: 'linear' | 'exponential';
  /** Seconds at the peak before the fall (default none). */
  hold?: number;
  /** Where the exponential fall ends (default 0.0005). */
  floor?: number;
  /** Seconds past the fall's end before the source stops (default 0.02). */
  tail?: number;
}

/** Lays `env` on `gain`: up to `level` from `at`, down to the floor by `at + length`. */
function envelope(gain: AudioParam, at: number, level: number, length: number, env: Envelope = {}): void {
  const attack = env.attack ?? 0;
  const floor = env.floor ?? 0.0005;
  if (attack <= 0) {
    gain.setValueAtTime(level, at);
  } else if (env.curve === 'exponential') {
    gain.setValueAtTime(floor, at);
    gain.exponentialRampToValueAtTime(level, at + attack);
  } else {
    gain.setValueAtTime(0, at);
    gain.linearRampToValueAtTime(level, at + attack);
  }
  if (env.hold) gain.setValueAtTime(level, at + attack + env.hold);
  gain.exponentialRampToValueAtTime(floor, at + length);
}

interface NoiseBurstOptions extends Envelope {
  /** The filter's centre (a bandpass by default) or cutoff (`filter: 'lowpass'`); none: the noise straight through. */
  band?: number;
  /** The centre or cutoff the filter sweeps to in a line (default: stays), by `sweep` seconds after `at` (default: the whole `length`). */
  bandTo?: number;
  sweep?: number;
  /** The filter's resonance (default 1). */
  q?: number;
  filter?: BiquadFilterType;
  level: number;
  /** Seconds from `at` to the fall's end. */
  length: number;
  /** The noise played (default one second of the shared white noise). */
  noise?: AudioBuffer;
  /** Where in the buffer to start (s); `'random'` picks a point that leaves `length` to play, so no two bursts are alike. Default 0. */
  offset?: number | 'random';
  /** Play exactly this long from the offset (Web Audio's `duration`) instead of stopping after the tail. */
  duration?: number;
}

/**
 * A burst of (filtered) noise into `out`: a scuff, a knock's grain, a click, a hiss. By default it rises over
 * `min(10 ms, 30 % of its length)` from a random point of the noise; `attack: 0` strikes at once.
 */
export function noiseBurst(ctx: BaseAudioContext, out: AudioNode, at: number, o: NoiseBurstOptions): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  const noise = o.noise ?? whiteNoise(ctx, 1);
  source.buffer = noise;
  const env = ctx.createGain();
  envelope(env.gain, at, o.level, o.length, { ...o, attack: o.attack ?? Math.min(0.01, o.length * 0.3) });
  if (o.band !== undefined) {
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter ?? 'bandpass';
    filter.frequency.setValueAtTime(o.band, at);
    if (o.bandTo !== undefined) filter.frequency.linearRampToValueAtTime(o.bandTo, at + (o.sweep ?? o.length));
    filter.Q.value = o.q ?? 1;
    source.connect(filter).connect(env).connect(out);
  } else {
    source.connect(env).connect(out);
  }
  const offset = (o.offset ?? 'random') === 'random' ? liveRandom() * Math.max(0, noise.duration - o.length - 0.01) : (o.offset as number);
  if (o.duration !== undefined) {
    source.start(at, offset, o.duration);
  } else {
    source.start(at, offset);
    source.stop(at + o.length + (o.tail ?? 0.02));
  }
  return source;
}

interface ToneOptions extends Envelope {
  frequency: number;
  /** The pitch it glides to (default: stays), by `glide` seconds after `at` (default: the whole `length`). */
  to?: number;
  /** The pitch it glides to as a share of `frequency` (`0.5`: an octave down), for a frequency drawn once at the call. */
  toRatio?: number;
  glide?: number;
  /** How the pitch glides: an exponential (default) or a line. */
  glideCurve?: 'linear' | 'exponential';
  level: number;
  /** Seconds from `at` to the fall's end. */
  length: number;
  type?: OscillatorType;
}

/** A struck or blown tone into `out`: a ping, a thump's body, a drip, a squeak. By default it rises over 3 ms; `attack: 0` strikes at once. */
export function tone(ctx: BaseAudioContext, out: AudioNode, at: number, o: ToneOptions): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.frequency, at);
  const to = o.to ?? (o.toRatio !== undefined ? o.frequency * o.toRatio : undefined);
  if (to !== undefined) {
    const by = at + (o.glide ?? o.length);
    if (o.glideCurve === 'linear') osc.frequency.linearRampToValueAtTime(to, by);
    else osc.frequency.exponentialRampToValueAtTime(to, by);
  }
  const env = ctx.createGain();
  envelope(env.gain, at, o.level, o.length, { ...o, attack: o.attack ?? 0.003 });
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + o.length + (o.tail ?? 0.02));
  return osc;
}

interface PartialsOptions extends Envelope {
  /** Multiplies every partial's peak (default 1). */
  level?: number;
  /** Seconds from `at` to the fall's end, for a partial that names none of its own. */
  length: number;
  type?: OscillatorType;
  /** Each partial's pitch is moved by a random share within ±`spread` / 2 (a bell never twice the same). Default none. */
  spread?: number;
}

/** A struck set of partials ringing together (a bell, a till, a glass): `[frequency, peak]` each, or `[frequency, peak, length]` for one that rings its own time. */
export function partials(ctx: BaseAudioContext, out: AudioNode, at: number, list: readonly (readonly [frequency: number, peak: number, length?: number])[], o: PartialsOptions): void {
  const level = o.level ?? 1;
  for (const [frequency, peak, length] of list) {
    const detuned = o.spread ? frequency * (1 + (liveRandom() - 0.5) * o.spread) : frequency;
    tone(ctx, out, at, { ...o, frequency: detuned, level: peak * level, length: length ?? o.length, type: o.type ?? 'sine' });
  }
}

interface BedOptions {
  /** How long it runs (s), fades included. */
  seconds: number;
  band: number;
  q: number;
  level: number;
  /** The fade in and out (s). Default 0.25. */
  fade?: number;
  /** The noise looped (default two seconds of the shared white noise). */
  noise?: AudioBuffer;
}

/**
 * A bed of filtered noise that runs `seconds` (a dryer, a tap, a scrub): looped noise through a bandpass, faded in
 * and out. Returns the filter, for a caller that sweeps its centre while it runs.
 */
export function bed(ctx: BaseAudioContext, out: AudioNode, at: number, o: BedOptions): BiquadFilterNode {
  const fade = o.fade ?? 0.25;
  const source = ctx.createBufferSource();
  source.buffer = o.noise ?? whiteNoise(ctx, 2);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = o.band;
  filter.Q.value = o.q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(o.level, at + fade);
  env.gain.setValueAtTime(o.level, at + Math.max(fade, o.seconds - fade));
  env.gain.linearRampToValueAtTime(0, at + o.seconds);
  source.connect(filter).connect(env).connect(out);
  source.start(at, liveRandom());
  source.stop(at + o.seconds + 0.05);
  return filter;
}

/** A number between `min` and `max`: the little differences that keep a repeated sound from sounding sampled. */
export function rand(min: number, max: number): number {
  return min + liveRandom() * (max - min);
}

/** A random share in ±`amount`. */
export function jitter(amount: number): number {
  return (liveRandom() * 2 - 1) * amount;
}
