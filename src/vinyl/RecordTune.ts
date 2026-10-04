import { Voice } from '@/audio/ambient';
import { fnv1a, mulberry32, pick, random as liveRandom } from '@/random';
import type { Era, Soundtrack } from './records';

/** How far ahead notes are put on the audio clock (s); the voice is ticked every frame while heard. */
const LOOKAHEAD = 0.25;
/** Bars per track: an A A B A form of eight bars each. */
const BARS = 32;
/** The run-in groove before the first track and the silent groove between two (s): crackle only. */
const RUN_IN = 2.2;
const GAP = 2.6;
/** Pops and ticks of the crackle, per second. */
const POPS_PER_S = 5;

/** How a console's sound chip is written for: the instruments, the tempo, the drums and the room. */
interface Style {
  bpm: [number, number];
  /** Lead, harmony and bass voices: a pulse of that duty (0.125, 0.25, 0.5) or a plain wave. */
  lead: Wave;
  harmony: Wave | null;
  bass: Wave;
  /** The harmony plays the chord as a fast arpeggio (the 8-bit way) or holds it as a pad. */
  arpeggio: boolean;
  /** Attack of the pad and lead (s): a chip's is instant, a sampled string's slow. */
  attack: number;
  /** Lead vibrato depth (cents) and the chance a sixteenth has a lead note. */
  vibrato: number;
  density: number;
  /** Sixteenths (0..15) of the kick, snare and hat; `hatOpen` the open ones. */
  kick: number[];
  snare: number[];
  hat: number[];
  /** Bass sixteenths; `octave` those an octave up. */
  bassAt: number[];
  octave: number[];
  /** Echo mix (the SNES's DSP, a room's) and the lowpass over everything (a Game Boy's speaker). */
  echo: number;
  cutoff: number;
  /** Bass note length in sixteenths, and how fast its filter closes (a slap). */
  bassLength: number;
  slap: boolean;
}

type Wave = { pulse: number } | { wave: OscillatorType };

const STYLES: Record<Era, Style> = {
  nes: { bpm: [132, 156], lead: { pulse: 0.25 }, harmony: { pulse: 0.125 }, bass: { wave: 'triangle' }, arpeggio: true, attack: 0.004, vibrato: 12, density: 0.7, kick: [0, 8, 10], snare: [4, 12], hat: [2, 6, 14], bassAt: [0, 2, 4, 6, 8, 10, 12, 14], octave: [2, 6, 10, 14], echo: 0.05, cutoff: 9000, bassLength: 1.8, slap: false },
  gb: { bpm: [116, 138], lead: { pulse: 0.125 }, harmony: { pulse: 0.5 }, bass: { pulse: 0.5 }, arpeggio: true, attack: 0.003, vibrato: 8, density: 0.6, kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14], bassAt: [0, 3, 6, 8, 11, 14], octave: [3, 11], echo: 0.02, cutoff: 4200, bassLength: 1.5, slap: false },
  snes: { bpm: [84, 108], lead: { wave: 'triangle' }, harmony: { wave: 'sine' }, bass: { wave: 'sine' }, arpeggio: false, attack: 0.09, vibrato: 18, density: 0.4, kick: [0, 10], snare: [8], hat: [4, 12], bassAt: [0, 6, 8, 14], octave: [14], echo: 0.38, cutoff: 7000, bassLength: 3.5, slap: false },
  megadrive: { bpm: [138, 160], lead: { pulse: 0.5 }, harmony: { wave: 'sawtooth' }, bass: { wave: 'sawtooth' }, arpeggio: false, attack: 0.006, vibrato: 10, density: 0.65, kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bassAt: [0, 2, 3, 6, 8, 10, 11, 14], octave: [3, 11], echo: 0.12, cutoff: 6500, bassLength: 1.2, slap: true },
  n64: { bpm: [92, 112], lead: { wave: 'sine' }, harmony: { wave: 'triangle' }, bass: { wave: 'triangle' }, arpeggio: false, attack: 0.15, vibrato: 14, density: 0.35, kick: [0, 8], snare: [12], hat: [4, 8, 12], bassAt: [0, 4, 8, 12], octave: [12], echo: 0.3, cutoff: 5200, bassLength: 3.8, slap: false },
  ps1: { bpm: [150, 170], lead: { pulse: 0.5 }, harmony: { wave: 'sawtooth' }, bass: { wave: 'sine' }, arpeggio: false, attack: 0.2, vibrato: 6, density: 0.3, kick: [0, 10], snare: [4, 12, 15], hat: [0, 2, 4, 6, 7, 8, 10, 12, 14], bassAt: [0, 7, 10], octave: [], echo: 0.25, cutoff: 4800, bassLength: 5, slap: false },
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
/** Four-chord progressions as scale degrees (I vi IV V...), per mood. */
const PROGRESSIONS: Record<Soundtrack['mood'], number[][]> = {
  major: [[0, 5, 3, 4], [0, 3, 4, 0], [0, 4, 5, 3], [3, 4, 0, 5], [0, 2, 3, 4]],
  minor: [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 6], [0, 5, 3, 4], [5, 6, 0, 0]],
};

/** Where a sixteenth falls in its track: the step in the bar, the bar, the section and the chord under it, whether the bar is the last. */
interface Beat {
  index: number;
  /** The step in its bar, 0..15. */
  s: number;
  bar: number;
  section: 'a' | 'b';
  /** The chord's scale degree, and its three notes as semitones above the root. */
  degree: number;
  chord: number[];
  lastBar: boolean;
}

function beatOf(track: Track, index: number): Beat {
  const s = index % 16;
  const bar = Math.floor(index / 16);
  const section = bar >= 16 && bar < 24 ? 'b' : 'a';
  const progression = section === 'b' ? track.b : track.a;
  const degree = progression[bar % progression.length]!;
  const chord = [0, 2, 4].map((k) => scaleNote(track.scale, degree + k));
  return { index, s, bar, section, degree, chord, lastBar: bar === BARS - 1 };
}

/** One track, as it will be played: everything drawn from its seed up front. */
interface Track {
  sixteenth: number;
  root: number;
  scale: number[];
  /** Section A's and B's progressions. */
  a: number[];
  b: number[];
  /** Section A's and B's lead motifs: per sixteenth a scale step above the chord's root, or null for a rest. */
  motifA: (number | null)[];
  motifB: (number | null)[];
  seconds: number;
}

/**
 * A soundtrack record playing on the turntable (an `AmbientVoice` behind a `PointSound`: heard from the sideboard,
 * through the walls): the needle's crackle and pops all along, a thump when it drops, then each track of side A in
 * turn, made up from the record and the track (`seeded`: the same every time it is played), in its console's style
 * (`STYLES`: an NES's pulses and triangle, a Super Nintendo's echoing strings, a Mega Drive's slap bass...). Where it
 * is in the side follows the clock (`playingAt`), so a stretch unheard is a stretch skipped, like a record left on.
 */
export class RecordTune extends Voice {
  private record: Soundtrack | null = null;
  private tracks: Track[] = [];
  /** When the needle went down (ms, `performance.now`). */
  private startedAt = 0;
  /** Song time (s since the needle went down) up to which notes are scheduled. */
  private cursor = 0;
  private waves = new Map<number, PeriodicWave>();
  private echo: { send: GainNode; delay: DelayNode } | null = null;
  private tone: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private dropPending = false;
  private liftPending = false;

  constructor() {
    super(0.55, { watch: false });
  }

  /** The record on the platter, or null. */
  get playing(): Soundtrack | null {
    return this.record;
  }

  /** Seconds since the needle went down. */
  get elapsed(): number {
    return this.record ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  /** The whole side, run-in to the last track's end (s). */
  get sideSeconds(): number {
    return RUN_IN + this.tracks.reduce((sum, t) => sum + t.seconds, 0) + GAP * Math.max(0, this.tracks.length - 1);
  }

  /** The track under the needle now (its index), or null in a silent groove. */
  get trackNow(): number | null {
    let t = this.elapsed - RUN_IN;
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i]!;
      if (t < 0) return null;
      if (t < track.seconds) return i;
      t -= track.seconds + GAP;
    }
    return null;
  }

  /** The needle goes down on `record`'s side A. */
  play(record: Soundtrack): void {
    this.record = record;
    this.tracks = record.tracks.map((_, i) => makeTrack(record, i));
    this.startedAt = performance.now();
    this.cursor = 0;
    this.dropPending = true;
  }

  /** The arm lifts: silence but the click. */
  stop(): void {
    if (!this.record) return;
    this.record = null;
    this.tracks = [];
    this.liftPending = true;
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    this.waves.clear();
    // The whole record through one tone control (the era's top end), and a little echo.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 8000;
    tone.connect(out);
    this.tone = tone;
    const send = ctx.createGain();
    send.gain.value = 0;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.28;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    tone.connect(send).connect(delay).connect(feedback).connect(delay);
    delay.connect(out);
    this.echo = { send, delay };
    this.noiseBuffer = this.noise(ctx, 2);
    // The crackle bed: the groove's hiss, quiet, only while a record turns.
    const hiss = this.loop(ctx, this.noiseBuffer);
    const band = ctx.createBiquadFilter();
    band.type = 'highpass';
    band.frequency.value = 3200;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.012;
    hiss.connect(band).connect(hissGain).connect(out);
    this.hissGain = hissGain;
  }

  private hissGain: GainNode | null = null;

  protected override tick(ctx: AudioContext, dt: number): void {
    const out = this.master;
    if (!out || !this.tone) return;
    const now = ctx.currentTime;
    if (this.dropPending) {
      this.dropPending = false;
      this.thump(ctx, out, now, 70, 0.5);
      for (let i = 0; i < 6; i++) this.pop(ctx, out, now + liveRandom() * 0.25, 0.25);
    }
    if (this.liftPending) {
      this.liftPending = false;
      this.thump(ctx, out, now, 140, 0.18);
    }
    this.hissGain?.gain.setTargetAtTime(this.record ? 0.012 : 0, now, 0.05);
    const record = this.record;
    if (!record) return;
    const style = STYLES[record.era];
    this.tone.frequency.setTargetAtTime(style.cutoff, now, 0.1);
    this.echo?.send.gain.setTargetAtTime(style.echo, now, 0.1);
    // The crackle's pops, random all along.
    if (liveRandom() < POPS_PER_S * dt) this.pop(ctx, out, now + liveRandom() * 0.05, 0.12 + liveRandom() * 0.15);
    // Notes up to the lookahead, in song time; a stretch nobody heard (the voice let go) is skipped.
    const songNow = this.elapsed;
    if (this.cursor < songNow) this.cursor = songNow;
    while (this.cursor < songNow + LOOKAHEAD) {
      const at = now + (this.cursor - songNow);
      const step = this.stepAt(this.cursor);
      if (step) this.playStep(ctx, this.tone, style, step.track, step.index, at);
      this.cursor = step ? step.next : this.cursor + 0.05;
    }
  }

  /** The sixteenth under song time `t` (which track, which step, when the next starts), null in a silent groove. */
  private stepAt(t: number): { track: Track; index: number; next: number } | null {
    let start = RUN_IN;
    for (const track of this.tracks) {
      if (t < start) return null;
      if (t < start + track.seconds) {
        const index = Math.floor((t - start) / track.sixteenth + 1e-6);
        return { track, index, next: start + (index + 1) * track.sixteenth };
      }
      start += track.seconds + GAP;
    }
    return null;
  }

  /** One sixteenth: drums, bass, the harmony (an arpeggio or a held chord), the lead from the section's motif. */
  private playStep(ctx: AudioContext, out: AudioNode, style: Style, track: Track, index: number, t: number): void {
    const beat = beatOf(track, index);
    this.drums(ctx, out, style, beat, t);
    this.bassNote(ctx, out, style, track, beat, t);
    this.harmonyNotes(ctx, out, style, track, beat, t);
    this.leadNote(ctx, out, style, track, beat, t);
  }

  /** The kick, snare and hat where the style puts them; the last bar keeps its first kick only. */
  private drums(ctx: AudioContext, out: AudioNode, style: Style, { s, lastBar }: Beat, t: number): void {
    if (style.kick.includes(s) && !(lastBar && s > 0)) this.kick(ctx, out, t);
    if (style.snare.includes(s) && !lastBar) this.hit(ctx, out, t, 2200, 0.12, 0.28, 'bandpass');
    if (style.hat.includes(s) && !lastBar) this.hit(ctx, out, t, 8500, 0.025, 0.07, 'highpass');
  }

  /** The bass on the chord's root two octaves down, an octave up on the style's octave steps. */
  private bassNote(ctx: AudioContext, out: AudioNode, style: Style, track: Track, { s, chord, lastBar }: Beat, t: number): void {
    if (!style.bassAt.includes(s) || (lastBar && s > 0)) return;
    const octave = style.octave.includes(s) ? 12 : 0;
    this.note(ctx, out, style.bass, midi(track.root - 24 + chord[0]! + octave), t, track.sixteenth * style.bassLength, 0.3, style.slap ? 1400 : 2400, 0.004, 0, style.slap);
  }

  /** The harmony: the chord as a fast arpeggio (the 8-bit way) or held as a pad from the bar's first step, longer on the last bar. */
  private harmonyNotes(ctx: AudioContext, out: AudioNode, style: Style, track: Track, { index, s, chord, lastBar }: Beat, t: number): void {
    if (!style.harmony) return;
    if (style.arpeggio && !lastBar) {
      const n = chord[(index % 3)]! + (s % 8 >= 4 ? 12 : 0);
      this.note(ctx, out, style.harmony, midi(track.root + n), t, track.sixteenth * 0.9, 0.05, 6000, 0.002, 0);
    } else if (s === 0) {
      for (const n of chord) this.note(ctx, out, style.harmony, midi(track.root + n), t, track.sixteenth * (lastBar ? 24 : 15), 0.045, 2600, style.attack * 2, 0);
    }
  }

  /** The lead from the section's motif; every fourth bar the phrase comes home (its last beat the chord's root, held), and the last bar holds one note. */
  private leadNote(ctx: AudioContext, out: AudioNode, style: Style, track: Track, { s, bar, section, degree, lastBar }: Beat, t: number): void {
    const motif = section === 'b' ? track.motifB : track.motifA;
    let step = motif[s];
    if (bar % 4 === 3 && s >= 12) step = s === 12 ? 0 : null;
    if (lastBar) step = s === 0 ? 0 : null;
    if (step === null || step === undefined) return;
    const pitch = scaleNote(track.scale, degree + step);
    const held = lastBar ? 12 : bar % 4 === 3 && s === 12 ? 4 : motif[s + 1] === null ? 2 : 1;
    this.note(ctx, out, style.lead, midi(track.root + 12 + pitch), t, track.sixteenth * held * 0.95, 0.085, 5200, style.attack, style.vibrato);
  }

  private note(ctx: AudioContext, out: AudioNode, wave: Wave, frequency: number, t: number, length: number, level: number, cutoff: number, attack: number, vibrato: number, slap = false): void {
    const osc = ctx.createOscillator();
    if ('pulse' in wave) osc.setPeriodicWave(this.pulseWave(ctx, wave.pulse));
    else osc.type = wave.wave;
    osc.frequency.value = frequency;
    if (vibrato > 0 && length > 0.18) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.value = vibrato;
      lfo.connect(depth).connect(osc.detune);
      lfo.start(t + 0.12);
      lfo.stop(t + length * 1.6);
    }
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(slap ? cutoff * 3 : cutoff, t);
    if (slap) filter.frequency.exponentialRampToValueAtTime(cutoff * 0.4, t + 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + Math.max(0.002, attack));
    env.gain.setTargetAtTime(0, t + length * 0.7, length * 0.2 + 0.01);
    osc.connect(filter).connect(env).connect(out);
    osc.start(t);
    osc.stop(t + length * 1.6 + attack);
    osc.onended = () => env.disconnect();
  }

  private kick(ctx: AudioContext, out: AudioNode, t: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.6, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
    osc.onended = () => env.disconnect();
  }

  private hit(ctx: AudioContext, out: AudioNode, t: number, frequency: number, length: number, level: number, type: BiquadFilterType): void {
    if (!this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + length);
    source.connect(filter).connect(env).connect(out);
    source.start(t, liveRandom() * 1.5);
    source.stop(t + length + 0.02);
    source.onended = () => env.disconnect();
  }

  /** A crackle's pop: a click of bright noise a few milliseconds long. */
  private pop(ctx: AudioContext, out: AudioNode, t: number, level: number): void {
    this.hit(ctx, out, t, 2500 + liveRandom() * 4000, 0.004 + liveRandom() * 0.006, level, 'highpass');
  }

  /** The needle landing (low) or the arm lifting (a click): a short dull sine knock. */
  private thump(ctx: AudioContext, out: AudioNode, t: number, frequency: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(frequency, t);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.5, t + 0.08);
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.14);
    osc.onended = () => env.disconnect();
  }

  /** A pulse wave of `duty` (the NES's and Game Boy's 12.5 %, 25 % and 50 %), from its Fourier series. */
  private pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
    let wave = this.waves.get(duty);
    if (wave) return wave;
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * Math.cos(k * Math.PI * duty);
      imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * Math.sin(k * Math.PI * duty);
    }
    wave = ctx.createPeriodicWave(real, imag);
    this.waves.set(duty, wave);
    return wave;
  }
}

/** Everything a track is, drawn from its record and number: the same tune every time. */
function makeTrack(record: Soundtrack, index: number): Track {
  const rand = mulberry32(fnv1a(`${record.id}:${index}`));
  const style = STYLES[record.era];
  const bpm = style.bpm[0] + rand() * (style.bpm[1] - style.bpm[0]);
  const sixteenth = 60 / bpm / 4;
  const progressions = PROGRESSIONS[record.mood];
  return {
    sixteenth,
    root: 55 + Math.floor(rand() * 9),
    scale: record.mood === 'major' ? MAJOR : MINOR,
    a: pick(rand, progressions),
    b: pick(rand, progressions),
    motifA: motif(rand, style.density),
    motifB: motif(rand, style.density * 0.8),
    seconds: BARS * 16 * sixteenth,
  };
}

/** A bar-long lead phrase: notes on the beats more often than off them, stepping round the chord. */
function motif(rand: () => number, density: number): (number | null)[] {
  const steps: (number | null)[] = [];
  let at = 0;
  for (let s = 0; s < 16; s++) {
    const onBeat = s % 4 === 0;
    if (rand() < (onBeat ? Math.min(1, density + 0.3) : density * 0.7)) {
      at = Math.max(-2, Math.min(7, at + Math.round((rand() - 0.5) * 4)));
      steps.push(onBeat && rand() < 0.5 ? [0, 2, 4][Math.floor(rand() * 3)]! : at);
    } else steps.push(null);
  }
  return steps;
}

/** Semitones above the key's root of scale step `step` (steps past the octave go up an octave). */
function scaleNote(scale: readonly number[], step: number): number {
  const n = scale.length;
  const octave = Math.floor(step / n);
  return scale[((step % n) + n) % n]! + 12 * octave;
}

function midi(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}
