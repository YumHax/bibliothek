import { startedAudioContext } from './audioContext';

/** Semitones of the notes used, from the key's root: a major pentatonic over two octaves, plus the fourth and seventh for colour. */
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 24];
/** The four chords of the loop (root offsets): I, vi, IV, V. */
const CHORDS = [0, 9, 5, 7];
const ROOT_HZ = 261.63; // C4
const BPM = 128;
const STEP = 60 / BPM / 4;
const LOOKAHEAD = 0.18;

interface Note {
  /** Semitones from the root, or null for a rest. */
  pitch: number | null;
  /** In steps. */
  length: number;
}

const hz = (semitones: number): number => ROOT_HZ * Math.pow(2, semitones / 12);

/**
 * A street musician's chiptune, synthesised: a square-wave lead over a triangle bass walking the
 * loop's four chords, 128 bpm, the melody drawn once from `seed` (the same busker always plays the
 * same tune). `update` schedules the notes a moment ahead on the audio clock; `setLevel` and
 * `setPan` place it (the caller works out the distance falloff and the side). `flourish()` plays
 * a quick run up the scale over the top (a thank-you). Silent until the page's first gesture
 * started the audio context; nothing is scheduled while the level is 0.
 */
export class BuskerTune {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private readonly melody: Note[][];
  private step = 0;
  private nextTime = 0;
  private noteLeft = 0;
  private level = 0;
  private pan = 0;

  constructor(seed = 1) {
    let state = (seed * 9301 + 49297) % 2147483647;
    const random = (): number => (state = (state * 16807) % 2147483647) / 2147483647;
    // Four bars, one per chord: notes of the chord mostly, a passing note now and then, some rests.
    this.melody = CHORDS.map((chord) => {
      const bar: Note[] = [];
      let used = 0;
      while (used < 16) {
        const length = Math.min(16 - used, [1, 2, 2, 2, 3, 4][Math.floor(random() * 6)]!);
        const rest = random() < 0.18;
        const tones = [chord, chord + 4, chord + 7, chord + 12].map((t) => SCALE.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a)));
        const pitch = random() < 0.75 ? tones[Math.floor(random() * tones.length)]! : SCALE[Math.floor(random() * SCALE.length)]!;
        bar.push({ pitch: rest ? null : pitch, length });
        used += length;
      }
      return bar;
    });
  }

  /** Output level 0..1 (already the distance falloff). */
  setLevel(level: number): void {
    this.level = level;
  }

  /** -1 left .. 1 right. */
  setPan(pan: number): void {
    this.pan = pan;
  }

  update(): void {
    const ctx = this.ctx ?? this.start();
    if (!ctx || !this.out || !this.panner) return;
    const now = ctx.currentTime;
    this.out.gain.setTargetAtTime(this.level * 0.22, now, 0.15);
    this.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, this.pan)), now, 0.1);
    if (this.level <= 0.001) {
      this.nextTime = now + 0.05;
      return;
    }
    if (this.nextTime < now) this.nextTime = now + 0.02;
    while (this.nextTime < now + LOOKAHEAD) {
      this.tick(ctx, this.nextTime);
      this.nextTime += STEP;
    }
  }

  /** A quick run up the scale and a trill at the top, over the tune. */
  flourish(): void {
    const ctx = this.ctx ?? this.start();
    if (!ctx || !this.out) return;
    const t = ctx.currentTime + 0.03;
    SCALE.forEach((s, i) => this.voice(ctx, 'square', hz(s + 12), t + i * 0.045, 0.06, 0.5));
    for (let i = 0; i < 6; i++) this.voice(ctx, 'square', hz(24 + 12 + (i % 2 ? 2 : 0)), t + SCALE.length * 0.045 + i * 0.05, 0.05, 0.45);
  }

  dispose(): void {
    this.out?.disconnect();
    this.panner?.disconnect();
    this.out = null;
    this.panner = null;
    this.ctx = null;
  }

  private start(): AudioContext | null {
    const ctx = startedAudioContext();
    if (!ctx) return null;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.panner = ctx.createStereoPanner();
    // A small practice amp: the lows and the fizz rolled off.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3800;
    this.out.connect(tone).connect(this.panner).connect(ctx.destination);
    this.nextTime = ctx.currentTime + 0.05;
    return ctx;
  }

  /** One sixteenth: the bass on the beats, the melody's note when one starts here. */
  private tick(ctx: AudioContext, time: number): void {
    const bar = Math.floor(this.step / 16) % CHORDS.length;
    const inBar = this.step % 16;
    const chord = CHORDS[bar]!;
    if (inBar % 4 === 0) this.voice(ctx, 'triangle', hz(chord - 12 + (inBar === 8 ? 7 : 0)), time, STEP * 3, 0.9);
    if (inBar % 2 === 1) this.voice(ctx, 'square', hz(chord + 7 + 12), time, STEP * 0.5, 0.12);
    if (this.noteLeft <= 0) {
      // Find the note starting at this step.
      let at = 0;
      for (const note of this.melody[bar]!) {
        if (at === inBar) {
          if (note.pitch !== null) this.voice(ctx, 'square', hz(note.pitch), time, note.length * STEP * 0.9, 0.5);
          this.noteLeft = note.length;
          break;
        }
        at += note.length;
      }
    }
    this.noteLeft--;
    this.step = (this.step + 1) % (16 * CHORDS.length);
  }

  private voice(ctx: AudioContext, type: OscillatorType, frequency: number, time: number, length: number, gain: number): void {
    if (!this.out) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(gain, time + 0.008);
    env.gain.setTargetAtTime(gain * 0.6, time + 0.02, 0.05);
    env.gain.setTargetAtTime(0, time + length, 0.03);
    osc.connect(env).connect(this.out);
    osc.start(time);
    osc.stop(time + length + 0.2);
  }
}
