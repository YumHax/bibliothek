import * as THREE from 'three';
import { audioBus, startedAudioContext } from './audioContext';
import { whiteNoise } from './noise';

/** Every sound an arcade machine makes; recipes below, no samples. */
export type Sfx =
  | 'blip' | 'hit' | 'score' | 'bonus' | 'time' | 'penalty' | 'lose' | 'shoot' | 'drop' | 'ready' | 'go' | 'over' | 'best'
  | 'ticket' | 'coin' | 'tilt' | 'bumper' | 'flipper' | 'launch' | 'drain' | 'whir' | 'clunk' | 'win' | 'roll' | 'thud'
  | 'letter' | 'confirm' | 'jingle' | 'eat'
  | 'kick' | 'snare' | 'hat' | 'bang' | 'reload' | 'empty' | 'tick' | 'swish' | 'rim' | 'jackpot';

/** A sound a game asked for this frame; `pitch` scales its notes (a combo climbs). */
export interface SfxEvent {
  sfx: Sfx;
  pitch?: number;
}

export interface ChipSpeakerOptions {
  /** Loudness at `refDistance` and closer, linear. Default 0.22. */
  volume?: number;
  /** Metres within which it plays at full volume; it falls off as 1/distance beyond. Default 1. */
  refDistance?: number;
}

type Wave = OscillatorType;

/** A note: waveform, start and end frequency (a sweep), start offset and length in seconds, level. */
interface Note {
  wave: Wave;
  from: number;
  to?: number;
  at: number;
  length: number;
  level?: number;
}

/** A burst of filtered noise: offset, length, filter, level. */
interface Hiss {
  at: number;
  length: number;
  filter: BiquadFilterType;
  frequency: number;
  level?: number;
}

const scale = (notes: number[], step: number, wave: Wave, length = step, level = 0.8): Note[] => notes.map((from, i) => ({ wave, from, at: i * step, length, level }));

/** The recipes: an arcade board's sound chip, more or less. */
const RECIPES: Record<Sfx, { notes?: Note[]; hiss?: Hiss[] }> = {
  blip: { notes: [{ wave: 'square', from: 880, at: 0, length: 0.035, level: 0.5 }] },
  hit: { notes: [{ wave: 'square', from: 560, to: 280, at: 0, length: 0.06, level: 0.6 }] },
  score: { notes: [{ wave: 'triangle', from: 660, at: 0, length: 0.05 }, { wave: 'triangle', from: 990, at: 0.035, length: 0.06 }] },
  eat: { notes: [{ wave: 'square', from: 700, to: 1100, at: 0, length: 0.05, level: 0.5 }] },
  bonus: { notes: scale([523, 659, 784, 1046], 0.06, 'square') },
  time: { notes: [{ wave: 'triangle', from: 600, to: 1300, at: 0, length: 0.14 }] },
  penalty: { notes: [{ wave: 'square', from: 300, to: 110, at: 0, length: 0.22, level: 0.6 }] },
  lose: { notes: [{ wave: 'square', from: 392, at: 0, length: 0.09, level: 0.5 }, { wave: 'square', from: 262, at: 0.09, length: 0.14, level: 0.5 }] },
  shoot: { notes: [{ wave: 'square', from: 1400, to: 420, at: 0, length: 0.045, level: 0.25 }] },
  drop: { notes: [{ wave: 'triangle', from: 220, to: 90, at: 0, length: 0.12 }], hiss: [{ at: 0, length: 0.03, filter: 'highpass', frequency: 2500, level: 0.3 }] },
  ready: { notes: [{ wave: 'square', from: 440, at: 0, length: 0.1, level: 0.5 }] },
  go: { notes: [{ wave: 'square', from: 880, at: 0, length: 0.22, level: 0.6 }] },
  over: { notes: scale([523, 392, 330, 262], 0.13, 'square', 0.12, 0.6) },
  best: { notes: scale([523, 659, 784, 1046, 784, 1046], 0.08, 'square', 0.08, 0.7) },
  ticket: { notes: [{ wave: 'square', from: 1700, at: 0, length: 0.012, level: 0.25 }] },
  coin: { notes: [{ wave: 'square', from: 988, at: 0, length: 0.07, level: 0.5 }, { wave: 'square', from: 1318, at: 0.07, length: 0.3, level: 0.5 }] },
  tilt: { notes: [{ wave: 'sawtooth', from: 110, at: 0, length: 0.6, level: 0.5 }] },
  bumper: { notes: [{ wave: 'square', from: 190, to: 95, at: 0, length: 0.07, level: 0.7 }], hiss: [{ at: 0, length: 0.02, filter: 'bandpass', frequency: 3000, level: 0.4 }] },
  flipper: { hiss: [{ at: 0, length: 0.04, filter: 'lowpass', frequency: 900, level: 0.9 }], notes: [{ wave: 'sine', from: 140, to: 70, at: 0, length: 0.05, level: 0.5 }] },
  launch: { hiss: [{ at: 0, length: 0.25, filter: 'bandpass', frequency: 1200, level: 0.5 }], notes: [{ wave: 'sine', from: 90, to: 50, at: 0, length: 0.15, level: 0.6 }] },
  drain: { notes: [{ wave: 'triangle', from: 320, to: 60, at: 0, length: 0.6 }] },
  whir: { notes: [{ wave: 'sawtooth', from: 85, to: 95, at: 0, length: 0.35, level: 0.18 }] },
  clunk: { hiss: [{ at: 0, length: 0.08, filter: 'lowpass', frequency: 600, level: 0.9 }], notes: [{ wave: 'sine', from: 130, to: 80, at: 0, length: 0.1, level: 0.6 }] },
  win: { notes: [...scale([784, 988, 1175, 1568], 0.07, 'square', 0.07, 0.6), ...scale([1175, 1568], 0.14, 'square', 0.14, 0.6).map((n) => ({ ...n, at: n.at + 0.3 }))] },
  roll: { hiss: [{ at: 0, length: 0.9, filter: 'lowpass', frequency: 350, level: 0.8 }] },
  thud: { notes: [{ wave: 'sine', from: 95, to: 45, at: 0, length: 0.16, level: 0.9 }], hiss: [{ at: 0, length: 0.04, filter: 'lowpass', frequency: 800, level: 0.5 }] },
  letter: { notes: [{ wave: 'square', from: 700, at: 0, length: 0.03, level: 0.4 }] },
  confirm: { notes: [{ wave: 'square', from: 1046, at: 0, length: 0.09, level: 0.5 }] },
  jingle: { notes: scale([392, 523, 659, 523, 587, 784, 659, 523], 0.11, 'square', 0.1, 0.45) },
  // A drum machine for the dance cabinet's beat.
  kick: { notes: [{ wave: 'sine', from: 150, to: 48, at: 0, length: 0.14, level: 0.9 }] },
  snare: { hiss: [{ at: 0, length: 0.11, filter: 'bandpass', frequency: 1800, level: 0.6 }], notes: [{ wave: 'triangle', from: 220, to: 160, at: 0, length: 0.05, level: 0.4 }] },
  hat: { hiss: [{ at: 0, length: 0.03, filter: 'highpass', frequency: 7000, level: 0.25 }] },
  // The light gun: a crack, the slide, a dry click.
  bang: { hiss: [{ at: 0, length: 0.12, filter: 'lowpass', frequency: 2400, level: 0.9 }], notes: [{ wave: 'square', from: 220, to: 60, at: 0, length: 0.09, level: 0.6 }] },
  reload: { hiss: [{ at: 0, length: 0.03, filter: 'highpass', frequency: 3000, level: 0.5 }, { at: 0.12, length: 0.04, filter: 'bandpass', frequency: 1500, level: 0.6 }] },
  empty: { hiss: [{ at: 0, length: 0.015, filter: 'highpass', frequency: 4000, level: 0.4 }] },
  // The ticket wheel's pointer ticking past a peg, and its jackpot.
  tick: { hiss: [{ at: 0, length: 0.012, filter: 'bandpass', frequency: 2600, level: 0.5 }] },
  jackpot: { notes: [...scale([523, 659, 784, 1046, 784, 1046, 1318, 1568], 0.07, 'square', 0.07, 0.7), ...scale([1046, 1318, 1568, 2093], 0.12, 'square', 0.12, 0.6).map((n) => ({ ...n, at: n.at + 0.6 }))] },
  // The hoops: the net taking the ball, the rim ringing.
  swish: { hiss: [{ at: 0, length: 0.25, filter: 'bandpass', frequency: 900, level: 0.45 }] },
  rim: { notes: [{ wave: 'triangle', from: 740, at: 0, length: 0.18, level: 0.5 }, { wave: 'sine', from: 1110, at: 0, length: 0.12, level: 0.3 }] },
};

/**
 * A machine's little speaker: plays `Sfx` recipes (square and triangle notes, bursts of filtered
 * noise) through one gain and a stereo pan that follow where the listener stands relative to the
 * speaker's `anchor`, so a cabinet across the hall is faint and on the right. Silent until a
 * gesture has started the page's audio (it never starts it itself). Call `follow()` from the
 * owner's `update` so the level tracks the player.
 */
export class ChipSpeaker {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private readonly volume: number;
  private readonly refDistance: number;
  private readonly here = new THREE.Vector3();
  private readonly ear = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  /** Scales every sound (a machine playing itself is quieter than one the player plays). */
  level = 1;

  constructor(
    private readonly anchor: THREE.Object3D,
    private readonly listener: THREE.Object3D,
    options: ChipSpeakerOptions = {},
  ) {
    this.volume = options.volume ?? 0.22;
    this.refDistance = options.refDistance ?? 1;
  }

  play(sfx: Sfx, pitch = 1): void {
    const ctx = this.build();
    if (!ctx || !this.out) return;
    const recipe = RECIPES[sfx];
    const t0 = ctx.currentTime + 0.005;
    for (const note of recipe.notes ?? []) {
      const osc = ctx.createOscillator();
      osc.type = note.wave;
      const start = t0 + note.at;
      osc.frequency.setValueAtTime(note.from * pitch, start);
      if (note.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, note.to * pitch), start + note.length);
      const env = ctx.createGain();
      const peak = (note.level ?? 0.8) * this.level;
      env.gain.setValueAtTime(0.0001, start);
      env.gain.linearRampToValueAtTime(peak, start + 0.004);
      env.gain.setValueAtTime(peak, start + note.length * 0.6);
      env.gain.exponentialRampToValueAtTime(0.0001, start + note.length);
      osc.connect(env).connect(this.out);
      osc.start(start);
      osc.stop(start + note.length + 0.02);
      osc.onended = () => env.disconnect();
    }
    for (const hiss of recipe.hiss ?? []) {
      const source = ctx.createBufferSource();
      source.buffer = whiteNoise(ctx, 1);
      const filter = ctx.createBiquadFilter();
      filter.type = hiss.filter;
      filter.frequency.value = hiss.frequency;
      const env = ctx.createGain();
      const start = t0 + hiss.at;
      const peak = (hiss.level ?? 0.6) * this.level;
      env.gain.setValueAtTime(peak, start);
      env.gain.exponentialRampToValueAtTime(0.0001, start + hiss.length);
      source.connect(filter).connect(env).connect(this.out);
      source.start(start, Math.random() * 0.5);
      source.stop(start + hiss.length + 0.02);
      source.onended = () => env.disconnect();
    }
  }

  /** Plays every event a game queued this frame. */
  playAll(events: readonly SfxEvent[]): void {
    for (const e of events) this.play(e.sfx, e.pitch);
  }

  /** Level and pan from where the listener is: 1/distance past `refDistance`, panned by the side the speaker is on. */
  follow(immediate = false): void {
    if (!this.ctx || !this.out || !this.pan) return;
    this.anchor.getWorldPosition(this.here);
    this.listener.getWorldPosition(this.ear);
    const distance = this.here.distanceTo(this.ear);
    const gain = this.volume * Math.min(1, this.refDistance / Math.max(0.01, distance));
    this.right.set(1, 0, 0).applyQuaternion(this.listener.getWorldQuaternion(this.turn));
    const side = distance > 0.01 ? this.here.sub(this.ear).normalize().dot(this.right) : 0;
    const pan = THREE.MathUtils.clamp(side * 0.8, -0.8, 0.8);
    if (immediate) {
      this.out.gain.value = gain;
      this.pan.pan.value = pan;
      return;
    }
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(gain, now, 0.05);
    this.pan.pan.setTargetAtTime(pan, now, 0.05);
  }

  dispose(): void {
    this.out?.disconnect();
    this.pan?.disconnect();
    this.out = null;
    this.pan = null;
    this.ctx = null;
  }

  private build(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = startedAudioContext();
    if (!ctx) return null;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.out.connect(this.pan).connect(audioBus(ctx, 'arcade'));
    this.follow(true);
    return ctx;
  }
}
