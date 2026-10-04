import { outdoorsInput, startedAudioContext } from './audioContext';
import { seededRng } from '@/random';
import { dailySeed } from '@/time/daily';

/** Semitones of the notes used, from the key's root: a major pentatonic over two octaves, plus the fourth and seventh for colour. */
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 24];
/** Chord loops a song may go round (root offsets): I-vi-IV-V, I-V-vi-IV, vi-IV-I-V, I-IV-V-IV, I-iii-IV-V. */
const PROGRESSIONS: readonly (readonly number[])[] = [
  [0, 9, 5, 7],
  [0, 7, 9, 5],
  [9, 5, 0, 7],
  [0, 5, 7, 5],
  [0, 4, 5, 7],
];
const C4 = 261.63;
const LOOKAHEAD = 0.18;
/** Songs in a set: his own tune plus a few of the day's. */
const SET = 5;
/** Times round a song's loop, and the pause between two songs (s). */
const ROUNDS = [3, 5] as const;
const BREAK = [6, 16] as const;

interface Note {
  /** Semitones from the root, or null for a rest. */
  pitch: number | null;
  /** In steps. */
  length: number;
}

interface Song {
  chords: readonly number[];
  bars: Note[][];
  root: number;
  step: number;
  lead: OscillatorType;
  rounds: number;
}

/**
 * A street musician's chiptunes, synthesised: a lead over a triangle bass walking each song's
 * chord loop. His set is his own tune (drawn once from `seed`, the same busker always has it)
 * and four more drawn for the real day (`dailySeed`: a different set each day, the same all day),
 * each a few times round its loop at its own tempo and key, with a pause between songs to turn
 * the page. `update` schedules the notes a moment ahead on the audio clock; `setLevel` and
 * `setPan` place it (the caller works out the distance falloff and the side). `flourish()` plays
 * a quick run up the scale over the top (a thank-you). Through the street's own filter (muffled
 * from the sas). Silent until the page's first gesture started the audio context; nothing is
 * scheduled while the level is 0.
 */
export class BuskerTune {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private readonly songs: Song[];
  private song = 0;
  private round = 0;
  private step = 0;
  private nextTime = 0;
  private noteLeft = 0;
  private resting = 0;
  private level = 0;
  private pan = 0;

  constructor(seed = 1) {
    const day = dailySeed('busker-set');
    this.songs = [compose(seed)];
    for (let i = 1; i < SET; i++) this.songs.push(compose((seed * 31 + day + i * 7919) % 2147483646 || 1));
    // Today's set starts somewhere of its own.
    this.song = day % SET;
  }

  /** Between two songs (the musician can rest their hands). */
  get betweenSongs(): boolean {
    return this.resting > 0;
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
      const song = this.songs[this.song]!;
      if (this.resting > 0) {
        // The pause between songs runs on the same clock as the notes.
        this.resting -= song.step;
        if (this.resting <= 0) this.next();
      } else this.tick(ctx, song, this.nextTime);
      this.nextTime += this.songs[this.song]!.step;
    }
  }

  /** A quick run up the scale and a trill at the top, over the tune. */
  flourish(): void {
    const ctx = this.ctx ?? this.start();
    if (!ctx || !this.out) return;
    const song = this.songs[this.song]!;
    const t = ctx.currentTime + 0.03;
    SCALE.forEach((s, i) => this.voice(ctx, 'square', hz(song.root, s + 12), t + i * 0.045, 0.06, 0.5));
    for (let i = 0; i < 6; i++) this.voice(ctx, 'square', hz(song.root, 24 + 12 + (i % 2 ? 2 : 0)), t + SCALE.length * 0.045 + i * 0.05, 0.05, 0.45);
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
    this.out.connect(tone).connect(this.panner).connect(outdoorsInput(ctx));
    this.nextTime = ctx.currentTime + 0.05;
    return ctx;
  }

  /** On to the next song of the set. */
  private next(): void {
    this.song = (this.song + 1) % this.songs.length;
    this.round = 0;
    this.step = 0;
    this.noteLeft = 0;
  }

  /** One sixteenth: the bass on the beats, the melody's note when one starts here. */
  private tick(ctx: AudioContext, song: Song, time: number): void {
    const bar = Math.floor(this.step / 16) % song.chords.length;
    const inBar = this.step % 16;
    const chord = song.chords[bar]!;
    if (inBar % 4 === 0) this.voice(ctx, 'triangle', hz(song.root, chord - 12 + (inBar === 8 ? 7 : 0)), time, song.step * 3, 0.9);
    if (inBar % 2 === 1) this.voice(ctx, 'square', hz(song.root, chord + 7 + 12), time, song.step * 0.5, 0.12);
    if (this.noteLeft <= 0) {
      // Find the note starting at this step.
      let at = 0;
      for (const note of song.bars[bar]!) {
        if (at === inBar) {
          if (note.pitch !== null) this.voice(ctx, song.lead, hz(song.root, note.pitch), time, note.length * song.step * 0.9, song.lead === 'square' ? 0.5 : 0.75);
          this.noteLeft = note.length;
          break;
        }
        at += note.length;
      }
    }
    this.noteLeft--;
    this.step++;
    if (this.step >= 16 * song.chords.length) {
      this.step = 0;
      this.round++;
      // The last round played: a pause before the next song.
      if (this.round >= song.rounds) this.resting = BREAK[0] + ((this.song * 7 + song.rounds * 3) % (BREAK[1] - BREAK[0]));
    }
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

const hz = (root: number, semitones: number): number => root * Math.pow(2, semitones / 12);

/** A song drawn from `seed`: its loop, tempo, key, lead voice and melody (one bar per chord). */
function compose(seed: number): Song {
  const random = seededRng(seed);
  const chords = PROGRESSIONS[Math.floor(random() * PROGRESSIONS.length)]!;
  const bpm = 104 + Math.floor(random() * 36);
  const root = C4 * Math.pow(2, (Math.floor(random() * 9) - 4) / 12);
  const lead: OscillatorType = random() < 0.7 ? 'square' : 'triangle';
  const rounds = ROUNDS[0] + Math.floor(random() * (ROUNDS[1] - ROUNDS[0] + 1));
  // Four bars, one per chord: notes of the chord mostly, a passing note now and then, some rests.
  const bars = chords.map((chord) => {
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
  return { chords, bars, root, step: 60 / bpm / 4, lead, rounds };
}
