import type { Updatable } from '@/core/Engine';
import { CAT_EARSHOT, type CatCallKind, type CatNoiseKind, type CatVoiceLike } from '@/world/cat/types';
import { audioBus, audioContext } from './audioContext';
import { whiteNoise } from './noise';
import { playCatNoise } from './catNoises';
import { SpatialOut, spatialInput } from './spatial';

type MeowKind = Exclude<CatCallKind, 'hiss'>;

/**
 * Distance attenuation: `1 / (1 + (d / reference)^2)`, then a last fade to silence between `fadeFrom`
 * and `silent` (`CAT_EARSHOT`, shared with `Cat`'s wall count). The reference is generous so the cat
 * is still heard across the room.
 */
const DISTANCE = { reference: 1.6, fadeFrom: 6, silent: CAT_EARSHOT, follow: 0.07 };
/**
 * Walls between the listener and the cat: each lets `gain` of the level through (as `proximityVolume`'s
 * default); the dulling and the side are the flat's shared rule (`audio/spatial.ts`: `SpatialOut`).
 */
const WALLS = { gain: 0.3 };
/**
 * Who cuts in: a call more urgent than the one sounding (a startle's hiss or yowl, a grumble) fades
 * that one out in `cut` s and plays at once; anything else waits its turn (is dropped).
 */
const PRIORITY: Record<CatCallKind, number> = { demand: 1, greet: 1, trill: 1, chirp: 1, chatter: 1, yawn: 1, grumble: 2, hiss: 3, yowl: 3 };
const CUT_S = 0.04;
/** How much longer, higher and louder a fully insistent demand is (the begging meow's `insistence` 1). */
const INSIST = { duration: 0.35, pitch: 0.12, level: 0.3 };
/** The fly's buzz: a faint rasp round the cat's head while it chases one (a flapping sawtooth through a band). */
const BUZZ = { level: 0.01, hz: 205, wobble: { rate: 7, depth: 30 }, band: 420, q: 1.4, fade: 0.15 };
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
  /** Amplitude chopping (rate Hz, depth 0..1): the chatter's stutter. */
  tremolo?: { rate: number; depth: number };
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
  trill: {
    // A rolled "brrrp" going up: the friendly hello.
    duration: 0.38,
    pitch: [
      { at: 0, hz: 520 },
      { at: 0.6, hz: 690 },
      { at: 1, hz: 620 },
    ],
    formant: [
      { at: 0, hz: 1000 },
      { at: 1, hz: 1500 },
    ],
    formantQ: 3,
    lowpass: 5000,
    vibrato: { rate: 26, depth: 45 },
    rasp: 0,
    level: 0.2,
    attack: 0.02,
    release: 0.08,
  },
  chatter: {
    // At a bird it cannot reach: a fast stutter of little "ek-ek-ek" clicks, chopped by the tremolo.
    duration: 0.55,
    pitch: [
      { at: 0, hz: 760 },
      { at: 0.5, hz: 880 },
      { at: 1, hz: 720 },
    ],
    formant: [
      { at: 0, hz: 1500 },
      { at: 1, hz: 1900 },
    ],
    formantQ: 3,
    lowpass: 6000,
    vibrato: null,
    tremolo: { rate: 14, depth: 0.9 },
    rasp: 0.15,
    level: 0.11,
    attack: 0.02,
    release: 0.06,
  },
  yawn: {
    // The little squeak at the top of a stretch: breathy, rising a touch, then sagging.
    duration: 0.6,
    pitch: [
      { at: 0, hz: 430 },
      { at: 0.35, hz: 560 },
      { at: 1, hz: 300 },
    ],
    formant: [
      { at: 0, hz: 700 },
      { at: 0.35, hz: 1100 },
      { at: 1, hz: 500 },
    ],
    formantQ: 2,
    lowpass: 2600,
    vibrato: null,
    rasp: 0.3,
    level: 0.08,
    attack: 0.12,
    release: 0.25,
  },
  chirp: {
    // A quick bright upward chirp, as at a bird (or a fly).
    duration: 0.14,
    pitch: [
      { at: 0, hz: 700 },
      { at: 1, hz: 1150 },
    ],
    formant: [
      { at: 0, hz: 1500 },
      { at: 1, hz: 2400 },
    ],
    formantQ: 3,
    lowpass: 8000,
    vibrato: null,
    rasp: 0,
    level: 0.16,
    attack: 0.01,
    release: 0.05,
  },
  yowl: {
    // Startled: a short strained "mrrOW!".
    duration: 0.5,
    pitch: [
      { at: 0, hz: 560 },
      { at: 0.35, hz: 900 },
      { at: 1, hz: 480 },
    ],
    formant: [
      { at: 0, hz: 900 },
      { at: 0.35, hz: 1600 },
      { at: 1, hz: 700 },
    ],
    formantQ: 2.5,
    lowpass: 4000,
    vibrato: { rate: 7, depth: 25 },
    rasp: 0.35,
    level: 0.38,
    attack: 0.03,
    release: 0.12,
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
/** The hiss: breath noise through a high band, a sharp attack and a long-ish fall. */
const HISS = { duration: 0.6, band: 4200, q: 0.9, highpass: 1800, level: 0.3, attack: 0.02 };
/**
 * Snoring (fast asleep): lowpassed breath noise, one breath every `cycle` s: a soft inhale, a
 * slightly louder and lower exhale, a pause.
 */
const SNORE = { level: 0.05, cycle: { min: 3.2, max: 3.8 }, inhale: { hz: 520, gain: 0.55, s: 1.2 }, exhale: { hz: 260, gain: 1, s: 1.5 }, fade: 1 };
/**
 * Randomisation so repeated meows differ: ±5 % pitch, ±10 % duration, the call's inner turning
 * points ±`at` of its length (the rise peaks earlier or later), ±8 % formant, ±30 % vibrato depth.
 */
const MEOW_JITTER = { pitch: 0.05, duration: 0.1, at: 0.08, formant: 0.08, vibrato: 0.3 };
/** Each sleeping breath a little different: ±10 % loud, ±8 % pitch of its band, its length ±`s`. */
const SNORE_JITTER = { gain: 0.1, hz: 0.08, s: 0.12 };
/** Nothing continuous wanted (no purr, snore or buzz) and no call sounding for this long (s): the graph stops, rebuilt on the next sound. */
const SUSPEND_AFTER_S = 5;
/** How much of the raw oscillators bypasses the formant so the fundamental stays audible. */
const MEOW_BODY = 0.3;
const RASP_BAND = { frequency: 450, q: 0.8 };
/** Retry interval (s) while a wanted purr waits for the context to be allowed to run. */
const RETRY_EVERY = 1;

/**
 * Length of the shared white-noise buffer: looped under the purr and the snore (each from its own
 * random offset, long enough that no period is heard), played once for a grumble's rasp.
 */
const NOISE_SECONDS = 4;

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
 * rasp mixed in. Pitch and duration are jittered slightly so repeats differ; a call already playing
 * blocks new ones unless the new one is more urgent (`PRIORITY`: a startle's hiss or yowl, a grumble
 * fade the sounding one out in 40 ms and cut in). A demand's `insistence` makes it longer, higher and
 * louder (the begging cat, meow after meow). `chatter` stutters at a bird, `yawn` squeaks mid-stretch. `trill` is a rolled rising "brrrp" (called, on the lap), `chirp` a quick bright
 * upward chirp (prey), `yowl` a strained startled cry, `hiss` a burst of high breath noise.
 *
 * Snoring: lowpassed breath noise, a soft inhale and a lower exhale every ~3.5 s. Body noises
 * (lapping, licking, crunching, claws, landing, the ball) come from `catNoises.ts` into the same
 * output; `noiseAt` plays one of its things elsewhere (the ball's bounce tick), placed by the caller.
 * `setBuzzing`: a faint wingbeat rasp while the fly it chases is about.
 *
 * Everything goes through one master gain following the listener distance
 * (`1 / (1 + (d/1.6)^2)`, fading out between 6 m and `CAT_EARSHOT`, smoothed over ~0.2 s), then the
 * flat's shared `SpatialOut` (`audio/spatial.ts`: a low-pass per wall, the side from `stereoPan`);
 * each wall also lets 0.3 of the level through. The graph is built lazily on
 * first use and only when the shared AudioContext is running (i.e. after a user gesture); a wanted
 * purr is retried every second until then, a meow that cannot start is simply dropped. Any failure
 * is warned once and the voice goes quiet rather than breaking the room.
 */
export class CatVoice implements CatVoiceLike, Updatable {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The walls' low-pass and the side, the flat's shared rule. */
  private spatial: SpatialOut | null = null;
  /** The call sounding now: a more urgent one fades it out. */
  private current: { envelope: GainNode; sources: AudioScheduledSourceNode[]; priority: number } | null = null;
  private buzzGain: GainNode | null = null;
  private buzzing = false;
  private buzzSources: OscillatorNode[] = [];
  private snoreGain: GainNode | null = null;
  private snoreBreath: GainNode | null = null;
  private snoreFilter: BiquadFilterNode | null = null;
  private purrGain: GainNode | null = null;
  private purrLowpass: BiquadFilterNode | null = null;
  private purrBreath: GainNode | null = null;
  private purrSources: OscillatorNode[] = [];
  /** The purr's noise grain, looping as long as the bed. */
  private purrGrain: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private snoreSource: AudioBufferSourceNode | null = null;

  private loudness = VOICE_LEVEL;
  private pan = 0;
  private walls = 0;
  private rear = 0;
  private purring = false;
  private snoring = false;
  private snoreLeft = 0;
  private breathPhase: 'inhale' | 'exhale' = 'exhale';
  private breathLeft = 0;
  private retryIn = 0;
  /** Context time until which a meow is still sounding. */
  private meowUntil = 0;
  private failed = false;
  /** How long nothing has needed the graph (s): past `SUSPEND_AFTER_S` it is taken down. */
  private quietFor = 0;
  /** This cat's own voice: every call a little higher or lower than another cat's (`setPitch`). */
  private pitchBase = 1;

  /** This cat's own pitch (1 = the table's), e.g. from its name: two cats never sound alike. */
  setPitch(scale: number): void {
    this.pitchBase = scale;
  }

  setPurring(on: boolean): void {
    if (on === this.purring) return;
    this.purring = on;
    const ctx = this.ensureGraph();
    if (!ctx) return;
    this.applyPurr(ctx);
  }

  setSnoring(on: boolean): void {
    if (on === this.snoring) return;
    this.snoring = on;
    const ctx = on ? this.ensureGraph() : this.ctx;
    if (!ctx || !this.snoreGain) return;
    const gain = this.snoreGain.gain;
    // Held where it is first: cancelling a ramp mid-way would jump the level (a click).
    hold(gain, ctx.currentTime);
    gain.setTargetAtTime(on ? SNORE.level : 0, ctx.currentTime, SNORE.fade / 3);
    this.snoreLeft = 0;
  }

  meow(kind: CatCallKind, insistence = 0): void {
    const ctx = this.ensureGraph();
    if (!ctx || !this.master) return;
    const priority = PRIORITY[kind];
    if (ctx.currentTime < this.meowUntil) {
      if (!this.current || priority <= this.current.priority) return;
      this.cutCurrent(ctx);
    }
    try {
      if (kind === 'hiss') this.playHiss(ctx, this.master, priority);
      else this.playMeow(ctx, this.master, MEOWS[kind], priority, kind === 'demand' ? insistence : 0);
    } catch (err) {
      this.fail(err);
    }
  }

  setBuzzing(on: boolean): void {
    if (on === this.buzzing) return;
    this.buzzing = on;
    const ctx = on ? this.ensureGraph() : this.ctx;
    if (!ctx || !this.master) return;
    try {
      if (on && !this.buzzGain) this.buildBuzz(ctx, this.master);
      const gain = this.buzzGain?.gain;
      if (!gain) return;
      hold(gain, ctx.currentTime);
      gain.setTargetAtTime(on ? BUZZ.level : 0, ctx.currentTime, BUZZ.fade);
    } catch (err) {
      this.fail(err);
    }
  }

  noiseAt(kind: CatNoiseKind, strength: number, metres: number, pan: number, walls: number): void {
    const loudness = loudnessAt(metres, walls);
    if (loudness <= 0) return;
    const ctx = this.ensureGraph();
    if (!ctx) return;
    try {
      const out = ctx.createGain();
      out.gain.value = loudness;
      out.connect(spatialInput(ctx, audioBus(ctx, 'world'), { pan, walls }, 1));
      playCatNoise(ctx, out, kind, strength);
      window.setTimeout(() => out.disconnect(), 1000);
    } catch (err) {
      this.fail(err);
    }
  }

  noise(kind: CatNoiseKind, strength = 1): void {
    // Out of earshot: nothing to build or play.
    if (this.loudness <= 0) return;
    const ctx = this.ensureGraph();
    if (!ctx || !this.master) return;
    // Sounding through the graph: it is not taken down under it.
    this.quietFor = 0;
    try {
      playCatNoise(ctx, this.master, kind, strength);
    } catch (err) {
      this.fail(err);
    }
  }

  setDistance(metres: number, pan = 0, walls = 0, rear = 0): void {
    const loudness = loudnessAt(metres, walls);
    this.loudness = loudness;
    this.pan = Math.max(-1, Math.min(1, pan));
    this.walls = walls;
    this.rear = rear;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(loudness, this.ctx.currentTime, DISTANCE.follow);
    this.spatial?.set(this.pan, walls, false, rear);
  }

  update(dt: number): void {
    if (this.failed) return;
    if (!this.ctx) {
      // A purr (or a snore) asked for before the context was allowed to run: keep trying, gently.
      if (!this.purring && !this.snoring) return;
      this.retryIn -= dt;
      if (this.retryIn > 0) return;
      this.retryIn = RETRY_EVERY;
      const ctx = this.ensureGraph();
      if (ctx) this.applyPurr(ctx);
      return;
    }
    if (!this.purring && !this.snoring && !this.buzzing && this.ctx.currentTime > this.meowUntil + 0.5) {
      this.quietFor += dt;
      if (this.quietFor > SUSPEND_AFTER_S) this.suspend();
      return;
    }
    this.quietFor = 0;
    if (this.snoring) {
      this.snoreLeft -= dt;
      if (this.snoreLeft <= 0) this.nextSnore(this.ctx);
    }
    if (!this.purring) return;
    this.breathLeft -= dt;
    if (this.breathLeft <= 0) this.nextBreath(this.ctx);
  }

  /** Takes the idle graph down (its oscillators and loops cost even at gain 0); the next sound builds it again. */
  private suspend(): void {
    this.stopSources();
    this.master?.disconnect();
    this.spatial?.disconnect();
    this.master = null;
    this.spatial = null;
    this.ctx = null;
    this.current = null;
    this.buzzGain = null;
    this.snoreGain = this.snoreBreath = this.snoreFilter = null;
    this.purrGain = this.purrLowpass = this.purrBreath = null;
    this.quietFor = 0;
  }

  private stopSources(): void {
    for (const source of [...this.purrSources, ...this.buzzSources, this.purrGrain, this.snoreSource]) {
      try {
        source?.stop();
      } catch {
        // already stopped
      }
    }
    this.purrSources = [];
    this.buzzSources = [];
    this.purrGrain = null;
    this.snoreSource = null;
  }

  /** Stops every source and detaches from the destination. The instance is unusable afterwards. */
  dispose(): void {
    this.stopSources();
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
    // Behind a wall it goes dull; placed left or right of the listener's heading (the flat's shared rule).
    limiter.connect(audioBus(ctx, 'world'));
    this.spatial = new SpatialOut(ctx, limiter, { pan: this.pan, walls: this.walls, rear: this.rear });
    this.master.connect(this.spatial.input);
    if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) this.noiseBuffer = whiteNoise(ctx, NOISE_SECONDS);
    this.buildPurr(ctx, this.master);
    this.buildSnore(ctx, this.master);
  }

  /** looping noise -> breathing band -> breath gain -> snore gain (0 unless asleep). */
  private buildSnore(ctx: AudioContext, master: GainNode): void {
    this.snoreGain = ctx.createGain();
    this.snoreGain.gain.value = this.snoring ? SNORE.level : 0;
    this.snoreGain.connect(master);
    this.snoreBreath = ctx.createGain();
    this.snoreBreath.gain.value = 0;
    this.snoreBreath.connect(this.snoreGain);
    this.snoreFilter = ctx.createBiquadFilter();
    this.snoreFilter.type = 'lowpass';
    this.snoreFilter.frequency.value = SNORE.exhale.hz;
    this.snoreFilter.Q.value = 2;
    this.snoreFilter.connect(this.snoreBreath);
    this.snoreSource = this.noiseSource(ctx, true);
    this.snoreSource.connect(this.snoreFilter);
  }

  /** One sleeping breath: in, out, a pause, scheduled from now. */
  private nextSnore(ctx: AudioContext): void {
    if (!this.snoreBreath || !this.snoreFilter) return;
    const now = ctx.currentTime;
    const { inhale, exhale } = SNORE;
    const gain = this.snoreBreath.gain;
    const band = this.snoreFilter.frequency;
    // From wherever the last breath has got to: a cancel without a hold would jump (a click).
    hold(gain, now);
    hold(band, now);
    const loud = 1 + jitter(SNORE_JITTER.gain);
    const pitch = 1 + jitter(SNORE_JITTER.hz);
    const inS = inhale.s * (1 + jitter(SNORE_JITTER.s));
    const outS = exhale.s * (1 + jitter(SNORE_JITTER.s));
    gain.setTargetAtTime(inhale.gain * loud, now, inS / 3);
    band.setTargetAtTime(inhale.hz * pitch, now, inS / 3);
    gain.setTargetAtTime(exhale.gain * loud, now + inS, 0.15);
    band.setTargetAtTime(exhale.hz * pitch, now + inS, 0.2);
    gain.setTargetAtTime(0, now + inS + outS * 0.6, outS / 4);
    this.snoreLeft = SNORE.cycle.min + Math.random() * (SNORE.cycle.max - SNORE.cycle.min);
  }

  /** noise -> highpass -> band at the hiss -> envelope -> master. */
  private playHiss(ctx: AudioContext, master: GainNode, priority: number): void {
    const now = ctx.currentTime;
    const end = now + HISS.duration * (1 + (Math.random() * 2 - 1) * MEOW_JITTER.duration);
    this.meowUntil = end;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(HISS.level, now + HISS.attack);
    envelope.gain.exponentialRampToValueAtTime(HISS.level * 0.5, now + (end - now) * 0.6);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.connect(master);
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = HISS.highpass;
    const band = ctx.createBiquadFilter();
    band.type = 'peaking';
    band.frequency.value = HISS.band * (1 + (Math.random() * 2 - 1) * MEOW_JITTER.pitch);
    band.Q.value = HISS.q;
    band.gain.value = 9;
    const source = this.noiseSource(ctx, false);
    source.connect(highpass).connect(band).connect(envelope);
    source.stop(end + 0.02);
    source.onended = () => envelope.disconnect();
    this.current = { envelope, sources: [source], priority };
  }

  /** The call sounding now fades out fast (a startle cuts in). */
  private cutCurrent(ctx: AudioContext): void {
    const current = this.current;
    this.current = null;
    if (!current) return;
    const now = ctx.currentTime;
    hold(current.envelope.gain, now);
    current.envelope.gain.linearRampToValueAtTime(0, now + CUT_S);
    for (const source of current.sources) {
      try {
        source.stop(now + CUT_S + 0.01);
      } catch {
        // already stopped
      }
    }
    this.meowUntil = now;
  }

  /** sawtooth at a fly's wingbeat, wobbling -> band -> buzz gain (0 unless a fly is about). */
  private buildBuzz(ctx: AudioContext, master: GainNode): void {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = BUZZ.band;
    band.Q.value = BUZZ.q;
    band.connect(gain);
    const wing = ctx.createOscillator();
    wing.type = 'sawtooth';
    wing.frequency.value = BUZZ.hz;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = BUZZ.wobble.rate;
    const depth = ctx.createGain();
    depth.gain.value = BUZZ.wobble.depth;
    wobble.connect(depth).connect(wing.frequency);
    wing.connect(band);
    wing.start();
    wobble.start();
    this.buzzSources = [wing, wobble];
    this.buzzGain = gain;
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
    this.purrGrain = this.noiseSource(ctx, true);
    this.purrGrain.connect(grain).connect(this.purrLowpass);

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
  private playMeow(ctx: AudioContext, master: GainNode, spec: MeowSpec, priority: number, insistence: number): void {
    const now = ctx.currentTime;
    const insist = Math.max(0, Math.min(1, insistence));
    const pitchScale = this.pitchBase * (1 + jitter(MEOW_JITTER.pitch)) * (1 + INSIST.pitch * insist);
    // The call's shape moves a little each time: its turning points earlier or later, its vowel brighter or darker.
    const shift = jitter(MEOW_JITTER.at);
    const pitch = shiftKeyframes(spec.pitch, shift);
    const formantKeys = shiftKeyframes(spec.formant, shift);
    const formantScale = 1 + jitter(MEOW_JITTER.formant);
    const vibratoScale = 1 + jitter(MEOW_JITTER.vibrato);
    const duration = spec.duration * (1 + (Math.random() * 2 - 1) * MEOW_JITTER.duration) * (1 + INSIST.duration * insist);
    const level = spec.level * (1 + INSIST.level * insist);
    const end = now + duration;
    this.meowUntil = end;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(level, now + spec.attack);
    envelope.gain.setValueAtTime(level, Math.max(now + spec.attack, end - spec.release));
    envelope.gain.linearRampToValueAtTime(0, end);
    envelope.connect(master);
    const sources: AudioScheduledSourceNode[] = [];

    let voiceOut: AudioNode = envelope;
    if (spec.tremolo) {
      const chop = ctx.createGain();
      chop.gain.value = 1 - spec.tremolo.depth / 2;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = spec.tremolo.rate;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = spec.tremolo.depth / 2;
      lfo.connect(lfoDepth).connect(chop.gain);
      lfo.start(now);
      lfo.stop(end + 0.02);
      sources.push(lfo);
      chop.connect(envelope);
      voiceOut = chop;
    }

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = spec.lowpass;
    lowpass.connect(voiceOut);

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.Q.value = spec.formantQ;
    this.sweep(formant.frequency, formantKeys, now, duration, formantScale);
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
    this.sweep(saw.frequency, pitch, now, duration, pitchScale);
    const tri = ctx.createOscillator();
    tri.type = 'triangle';
    this.sweep(tri.frequency, pitch, now, duration, pitchScale * 2);
    saw.connect(mix);
    tri.connect(mix);

    const stopAt = end + 0.02;
    if (spec.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = spec.vibrato.rate;
      const depth = ctx.createGain();
      depth.gain.value = spec.vibrato.depth * vibratoScale;
      const depthOctave = ctx.createGain();
      depthOctave.gain.value = spec.vibrato.depth * vibratoScale * 2;
      lfo.connect(depth).connect(saw.frequency);
      lfo.connect(depthOctave).connect(tri.frequency);
      lfo.start(now);
      lfo.stop(stopAt);
      sources.push(lfo);
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
      sources.push(rasp);
    }

    saw.start(now);
    tri.start(now);
    saw.stop(stopAt);
    tri.stop(stopAt);
    saw.onended = () => envelope.disconnect();
    sources.push(saw, tri);
    this.current = { envelope, sources, priority };
  }

  /** Runs `param` through `keyframes` (scaled by `scale`) over `duration` seconds from `start`. */
  private sweep(param: AudioParam, keyframes: Keyframe[], start: number, duration: number, scale: number): void {
    const [first, ...rest] = keyframes;
    param.setValueAtTime(first.hz * scale, start + first.at * duration);
    for (const frame of rest) param.exponentialRampToValueAtTime(frame.hz * scale, start + frame.at * duration);
  }

  // --- helpers -----------------------------------------------------------------------------------

  private noiseSource(ctx: AudioContext, loop: boolean): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = loop;
    // A loop starts anywhere in the buffer: the purr's grain and the snore never breathe in phase.
    source.start(0, loop && this.noiseBuffer ? Math.random() * this.noiseBuffer.duration : 0);
    return source;
  }

  private fail(err: unknown): void {
    if (!this.failed) console.warn('[cat-voice]', err);
    this.failed = true;
  }
}

/** The voice's level at `metres` through `walls` walls: generous across the room, gone past `CAT_EARSHOT`. */
function loudnessAt(metres: number, walls: number): number {
  const d = Math.max(0, metres);
  if (!(d < DISTANCE.silent)) return 0;
  let loudness = VOICE_LEVEL / (1 + (d / DISTANCE.reference) ** 2);
  if (d > DISTANCE.fadeFrom) loudness *= (DISTANCE.silent - d) / (DISTANCE.silent - DISTANCE.fadeFrom);
  return loudness * Math.pow(WALLS.gain, walls);
}

/** A random share in ±`amount`. */
function jitter(amount: number): number {
  return (Math.random() * 2 - 1) * amount;
}

/** The inner keyframes (not the first or last) moved by `shift` of the length, kept in order and inside the call. */
function shiftKeyframes(keyframes: Keyframe[], shift: number): Keyframe[] {
  if (keyframes.length < 3 || shift === 0) return keyframes;
  return keyframes.map((frame, i) => (i === 0 || i === keyframes.length - 1 ? frame : { at: Math.min(0.9, Math.max(0.1, frame.at + shift)), hz: frame.hz }));
}

/** Freezes an automated param at its value now, so what is scheduled next starts from there (no jump). */
function hold(param: AudioParam, at: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(at);
  } else {
    param.cancelScheduledValues(at);
    param.setValueAtTime(param.value, at);
  }
}
