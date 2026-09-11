import type { Updatable } from '@/core/Engine';
import type { CatVoiceLike } from '@/world/cat/types';
import { audioContext } from './audioContext';

type MeowKind = Parameters<CatVoiceLike['meow']>[0];

/**
 * Distance attenuation: `1 / (1 + (d / reference)^2)`, then a last fade to silence between `fadeFrom`
 * and `silent`. The reference is generous so the cat is still heard across the room.
 */
const DISTANCE = { reference: 1.6, fadeFrom: 6, silent: 7.5, follow: 0.07 };
/** Overall level of the voice at 0 m, on top of the per-sound peaks below; a soft-knee compressor on the master keeps it from clipping. */
const VOICE_LEVEL = 2.2;

/**
 * The purr bed. `level` is the gain at 0 m (a purr is quiet). The two breath phases alternate
 * every `breath.min..max` seconds: the exhale is lower and louder, the inhale brighter and softer.
 */
const PURR = {
  level: 0.15,
  fadeIn: 0.4,
  fadeOut: 0.6,
  /** Lowpassed noise mixed under the sawtooth for the fur-and-throat grain. */
  noise: 0.35,
  /** Depth of the amplitude modulation at the purr rate (1 = fully chopped). */
  amDepth: 0.45,
  exhale: { hz: 25, lowpass: 150, gain: 1.0 },
  inhale: { hz: 29, lowpass: 350, gain: 0.65 },
  breath: { min: 0.8, max: 1.2, glide: 0.2 },
};

interface Keyframe {
  /** Fraction of the meow duration. */
  at: number;
  hz: number;
}

interface MeowSpec {
  duration: number;
  pitch: Keyframe[];
  formant: Keyframe[];
  formantQ: number;
  /** Frequency ceiling of the whole voice; lower = darker. */
  lowpass: number;
  vibrato: { rate: number; depth: number } | null;
  /** Level of the bandpassed noise burst mixed in (0 = clean voice). */
  rasp: number;
  /** Peak gain at 0 m. */
  level: number;
  attack: number;
  release: number;
}

const MEOWS: Record<MeowKind, MeowSpec> = {
  demand: {
    duration: 0.7,
    pitch: [
      { at: 0, hz: 500 },
      { at: 0.45, hz: 750 },
      { at: 1, hz: 450 },
    ],
    formant: [
      { at: 0, hz: 900 },
      { at: 0.45, hz: 1400 },
      { at: 1, hz: 800 },
    ],
    formantQ: 4,
    lowpass: 5000,
    vibrato: { rate: 6, depth: 14 },
    rasp: 0,
    level: 0.35,
    attack: 0.05,
    release: 0.12,
  },
  greet: {
    duration: 0.3,
    pitch: [
      { at: 0, hz: 650 },
      { at: 1, hz: 800 },
    ],
    formant: [
      { at: 0, hz: 1300 },
      { at: 1, hz: 1900 },
    ],
    formantQ: 3,
    lowpass: 7000,
    vibrato: null,
    rasp: 0,
    level: 0.22,
    attack: 0.03,
    release: 0.08,
  },
  grumble: {
    duration: 0.5,
    pitch: [
      { at: 0, hz: 380 },
      { at: 1, hz: 300 },
    ],
    formant: [
      { at: 0, hz: 700 },
      { at: 1, hz: 500 },
    ],
    formantQ: 2.5,
    lowpass: 1800,
    vibrato: { rate: 5, depth: 8 },
    rasp: 0.5,
    level: 0.3,
    attack: 0.06,
    release: 0.1,
  },
};
/** Randomisation so repeated meows differ: ±5 % pitch, ±10 % duration. */
const MEOW_JITTER = { pitch: 0.05, duration: 0.1 };
/** How much of the raw oscillators bypasses the formant so the fundamental stays audible. */
const MEOW_BODY = 0.3;
const RASP_BAND = { frequency: 450, q: 0.8 };
/** Retry interval (s) while a wanted purr waits for the context to be allowed to run. */
const RETRY_EVERY = 1;

/** Length of the shared white-noise buffer: looped under the purr, played once for a grumble's rasp. */
const NOISE_SECONDS = 1;

/**
 * The cat's voice, entirely synthesized with Web Audio (no samples, no network).
 *
 * Purr: a sawtooth at the purr rate (25–29 Hz) plus a little noise, through a lowpass whose cutoff
 * breathes between ~150 Hz (exhale, lower and louder) and ~350 Hz (inhale, brighter and softer),
 * amplitude-modulated by a sine at the same rate for the "rrr" grain. The breath phases alternate
 * every 0.8–1.2 s; `setPurring` fades the bed in over 0.4 s and out over 0.6 s.
 *
 * Meows: two oscillators (sawtooth + triangle an octave above) with a pitch envelope and optional
 * vibrato, through a bandpass "formant" whose centre sweeps with the call, a lowpass that sets the
 * timbre's darkness and an attack/release envelope. `demand` is the long hungry "meeeow" rising then
 * falling, `greet` a short bright "mew", `grumble` a low descending "mrrow" with a bandpassed noise
 * rasp mixed in. Pitch and duration are jittered slightly so repeats differ; a meow already playing
 * blocks new ones.
 *
 * Everything goes through one master gain following the listener distance
 * (`1 / (1 + (d/0.8)^2)`, silent beyond 5 m, smoothed over ~0.2 s). The graph is built lazily on
 * first use and only when the shared AudioContext is running (i.e. after a user gesture); a wanted
 * purr is retried every second until then, a meow that cannot start is simply dropped. Any failure
 * is warned once and the voice goes quiet rather than breaking the room.
 */
export class CatVoice implements CatVoiceLike, Updatable {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private purrGain: GainNode | null = null;
  private purrLowpass: BiquadFilterNode | null = null;
  private purrBreath: GainNode | null = null;
  private purrSources: OscillatorNode[] = [];
  private noise: AudioBuffer | null = null;

  private loudness = VOICE_LEVEL;
  private purring = false;
  private breathPhase: 'inhale' | 'exhale' = 'exhale';
  private breathLeft = 0;
  private retryIn = 0;
  /** Context time until which a meow is still sounding. */
  private meowUntil = 0;
  private failed = false;

  setPurring(on: boolean): void {
    if (on === this.purring) return;
    this.purring = on;
    const ctx = this.ensureGraph();
    if (!ctx) return;
    this.applyPurr(ctx);
  }

  meow(kind: MeowKind): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.master) return;
    if (ctx.currentTime < this.meowUntil) return;
    try {
      this.playMeow(ctx, this.master, MEOWS[kind]);
    } catch (err) {
      this.fail(err);
    }
  }

  setDistance(metres: number): void {
    const d = Math.max(0, metres);
    let loudness = VOICE_LEVEL / (1 + (d / DISTANCE.reference) ** 2);
    if (d >= DISTANCE.silent) loudness = 0;
    else if (d > DISTANCE.fadeFrom) loudness *= (DISTANCE.silent - d) / (DISTANCE.silent - DISTANCE.fadeFrom);
    this.loudness = loudness;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(loudness, this.ctx.currentTime, DISTANCE.follow);
  }

  update(dt: number): void {
    if (this.failed) return;
    if (!this.ctx) {
      // A purr asked for before the context was allowed to run: keep trying, gently.
      if (!this.purring) return;
      this.retryIn -= dt;
      if (this.retryIn > 0) return;
      this.retryIn = RETRY_EVERY;
      const ctx = this.ensureGraph();
      if (ctx) this.applyPurr(ctx);
      return;
    }
    if (!this.purring) return;
    this.breathLeft -= dt;
    if (this.breathLeft <= 0) this.nextBreath(this.ctx);
  }

  /** Stops every source and detaches from the destination. The instance is unusable afterwards. */
  dispose(): void {
    for (const source of this.purrSources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.purrSources = [];
    this.master?.disconnect();
    this.master = null;
    this.ctx = null;
    this.failed = true;
  }

  // --- graph -------------------------------------------------------------------------------------

  /** Builds the graph once the context is running; null while it is not (or after a failure). */
  private ensureGraph(): AudioContext | null {
    if (this.failed) return null;
    if (this.ctx && this.master) return this.ctx;
    try {
      const ctx = audioContext();
      if (ctx.state !== 'running') return null;
      this.build(ctx);
      return ctx;
    } catch (err) {
      this.fail(err);
      return null;
    }
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.loudness;
    // Nose to the speaker, purr plus a demand meow would clip: a gentle compressor catches the peaks.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    this.master.connect(limiter).connect(ctx.destination);
    this.noise = this.noiseBuffer(ctx, NOISE_SECONDS);
    this.buildPurr(ctx, this.master);
  }

  /**
   * sawtooth (purr rate) + noise -> breathing lowpass -> AM at the purr rate -> breath gain -> purr gain.
   * The sawtooth's harmonics under the lowpass are the rumble; the AM chops it into the grain.
   */
  private buildPurr(ctx: AudioContext, master: GainNode): void {
    const exhale = PURR.exhale;
    this.purrGain = ctx.createGain();
    this.purrGain.gain.value = 0;
    this.purrGain.connect(master);

    this.purrBreath = ctx.createGain();
    this.purrBreath.gain.value = exhale.gain;
    this.purrBreath.connect(this.purrGain);

    const am = ctx.createGain();
    am.gain.value = 1 - PURR.amDepth;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = exhale.hz;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = PURR.amDepth;
    lfo.connect(lfoDepth).connect(am.gain);
    lfo.start();
    am.connect(this.purrBreath);

    this.purrLowpass = ctx.createBiquadFilter();
    this.purrLowpass.type = 'lowpass';
    this.purrLowpass.frequency.value = exhale.lowpass;
    this.purrLowpass.Q.value = 0.9;
    this.purrLowpass.connect(am);

    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = exhale.hz;
    saw.connect(this.purrLowpass);
    saw.start();

    const grain = ctx.createGain();
    grain.gain.value = PURR.noise;
    this.noiseSource(ctx, true).connect(grain).connect(this.purrLowpass);

    this.purrSources = [saw, lfo];
  }

  /** Fades the bed to the wanted state and (re)starts the breathing. */
  private applyPurr(ctx: AudioContext): void {
    if (!this.purrGain) return;
    const now = ctx.currentTime;
    const gain = this.purrGain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    if (this.purring) {
      gain.linearRampToValueAtTime(PURR.level, now + PURR.fadeIn);
      this.breathPhase = 'inhale';
      this.breathLeft = 0;
      this.nextBreath(ctx);
    } else {
      gain.linearRampToValueAtTime(0, now + PURR.fadeOut);
    }
  }

  /** Switches to the other breath phase: cutoff, level and purr rate glide to the phase's timbre. */
  private nextBreath(ctx: AudioContext): void {
    if (!this.purrLowpass || !this.purrBreath) return;
    this.breathPhase = this.breathPhase === 'exhale' ? 'inhale' : 'exhale';
    const phase = this.breathPhase === 'exhale' ? PURR.exhale : PURR.inhale;
    const now = ctx.currentTime;
    const glide = PURR.breath.glide;
    this.purrLowpass.frequency.setTargetAtTime(phase.lowpass, now, glide);
    this.purrBreath.gain.setTargetAtTime(phase.gain, now, glide);
    for (const source of this.purrSources) source.frequency.setTargetAtTime(phase.hz, now, glide);
    this.breathLeft = PURR.breath.min + Math.random() * (PURR.breath.max - PURR.breath.min);
  }

  /**
   * [sawtooth f0, triangle 2·f0] (+ vibrato) -> mix -> formant bandpass (+ a little direct body)
   *   -> lowpass -> envelope -> master; `rasp` adds a bandpassed noise burst before the lowpass.
   */
  private playMeow(ctx: AudioContext, master: GainNode, spec: MeowSpec): void {
    const now = ctx.currentTime;
    const pitchScale = 1 + (Math.random() * 2 - 1) * MEOW_JITTER.pitch;
    const duration = spec.duration * (1 + (Math.random() * 2 - 1) * MEOW_JITTER.duration);
    const end = now + duration;
    this.meowUntil = end;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(spec.level, now + spec.attack);
    envelope.gain.setValueAtTime(spec.level, Math.max(now + spec.attack, end - spec.release));
    envelope.gain.linearRampToValueAtTime(0, end);
    envelope.connect(master);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = spec.lowpass;
    lowpass.connect(envelope);

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.Q.value = spec.formantQ;
    this.sweep(formant.frequency, spec.formant, now, duration, 1);
    formant.connect(lowpass);

    const body = ctx.createGain();
    body.gain.value = MEOW_BODY;
    body.connect(lowpass);

    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    mix.connect(formant);
    mix.connect(body);

    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    this.sweep(saw.frequency, spec.pitch, now, duration, pitchScale);
    const tri = ctx.createOscillator();
    tri.type = 'triangle';
    this.sweep(tri.frequency, spec.pitch, now, duration, pitchScale * 2);
    saw.connect(mix);
    tri.connect(mix);

    const stopAt = end + 0.02;
    if (spec.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = spec.vibrato.rate;
      const depth = ctx.createGain();
      depth.gain.value = spec.vibrato.depth;
      const depthOctave = ctx.createGain();
      depthOctave.gain.value = spec.vibrato.depth * 2;
      lfo.connect(depth).connect(saw.frequency);
      lfo.connect(depthOctave).connect(tri.frequency);
      lfo.start(now);
      lfo.stop(stopAt);
    }

    if (spec.rasp > 0) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = RASP_BAND.frequency;
      band.Q.value = RASP_BAND.q;
      const raspGain = ctx.createGain();
      raspGain.gain.value = spec.rasp;
      const rasp = this.noiseSource(ctx, false);
      rasp.connect(band).connect(raspGain).connect(lowpass);
      rasp.stop(stopAt);
    }

    saw.start(now);
    tri.start(now);
    saw.stop(stopAt);
    tri.stop(stopAt);
    saw.onended = () => envelope.disconnect();
  }

  /** Runs `param` through `keyframes` (scaled by `scale`) over `duration` seconds from `start`. */
  private sweep(param: AudioParam, keyframes: Keyframe[], start: number, duration: number, scale: number): void {
    const [first, ...rest] = keyframes;
    param.setValueAtTime(first.hz * scale, start + first.at * duration);
    for (const frame of rest) param.exponentialRampToValueAtTime(frame.hz * scale, start + frame.at * duration);
  }

  // --- helpers -----------------------------------------------------------------------------------

  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noiseSource(ctx: AudioContext, loop: boolean): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = loop;
    source.start();
    return source;
  }

  private fail(err: unknown): void {
    if (!this.failed) console.warn('[cat-voice]', err);
    this.failed = true;
  }
}
