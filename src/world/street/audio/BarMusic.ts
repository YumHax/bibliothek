import type { SoundGraph } from './soundGraph';

/** Chord loops a bar's jukebox goes round (semitones from the key's root, minor for m). */
const LOOPS: readonly (readonly [number, boolean][])[] = [
  [[0, false], [9, true], [5, false], [7, false]],
  [[0, true], [8, false], [3, false], [10, false]],
  [[0, false], [5, false], [0, false], [7, false]],
  [[2, true], [7, false], [0, false], [0, false]],
  [[0, true], [5, true], [10, false], [3, false]],
];
const LOOKAHEAD = 0.2;
/** Seconds of a song, and the gap between two (the jukebox changing record). */
const SONG = [120, 200] as const;
const GAP = [3, 7] as const;

/**
 * What a bar plays through its door in the evening, synthesised and as heard from the pavement:
 * the bass and the kick come through, the chords only as a muffled pad, the highs gone (the door,
 * the glass, the talk inside). A song is a chord loop, a tempo and a key drawn from the bar's
 * seed and the song's number; between two, a few seconds' silence. `update` schedules a moment
 * ahead into `out` while `level` is above nothing.
 */
export class BarMusic {
  private song = 0;
  private bpm = 100;
  private root = 45;
  private loop: readonly (readonly [number, boolean])[] = LOOPS[0]!;
  private step = 0;
  private nextTime = 0;
  private songLeft = 0;
  private gapLeft = 0;
  private draws = 0;

  constructor(private readonly seed: number) {
    this.pickSong();
  }

  update(dt: number, g: SoundGraph, out: AudioNode, level: number): void {
    const now = g.now;
    if (level < 0.005) {
      this.nextTime = now + 0.05;
      return;
    }
    if (this.gapLeft > 0) {
      this.gapLeft -= dt;
      if (this.gapLeft <= 0) this.pickSong();
      this.nextTime = now + 0.05;
      return;
    }
    this.songLeft -= dt;
    if (this.songLeft <= 0) {
      this.gapLeft = GAP[0] + this.random() * (GAP[1] - GAP[0]);
      return;
    }
    if (this.nextTime < now) this.nextTime = now + 0.02;
    const sixteenth = 60 / this.bpm / 4;
    while (this.nextTime < now + LOOKAHEAD) {
      this.tick(g, out, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
    }
  }

  private pickSong(): void {
    this.song++;
    const r = this.random();
    this.bpm = 88 + Math.floor(r * 36);
    this.root = 40 + Math.floor(this.random() * 8);
    this.loop = LOOPS[Math.floor(this.random() * LOOPS.length)]!;
    this.songLeft = SONG[0] + this.random() * (SONG[1] - SONG[0]);
    this.step = 0;
  }

  /** One sixteenth: the kick on the beats, the bass walking the chord, a pad at each bar. */
  private tick(g: SoundGraph, out: AudioNode, time: number, sixteenth: number): void {
    const bar = Math.floor(this.step / 16) % this.loop.length;
    const inBar = this.step % 16;
    const [chord, minor] = this.loop[bar]!;
    if (inBar % 4 === 0) this.kick(g, out, time);
    if (inBar === 4 || inBar === 12) g.burst(out, time, 0.05, 0.08);
    if (inBar % 2 === 0) {
      const walk = [0, 0, 7, 0, 12, 0, 7, 10][inBar / 2]!;
      this.note(g, out, 'triangle', midi(this.root + chord + walk), time, sixteenth * 1.8, 0.35);
    }
    if (inBar === 0) {
      for (const interval of [12, minor ? 15 : 16, 19]) this.note(g, out, 'sawtooth', midi(this.root + chord + interval), time, sixteenth * 15, 0.04);
    }
    this.step = (this.step + 1) % (16 * this.loop.length);
  }

  private kick(g: SoundGraph, out: AudioNode, time: number): void {
    const osc = g.ctx.createOscillator();
    osc.frequency.setValueAtTime(110, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const env = g.gain();
    env.gain.setValueAtTime(0.7, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.connect(env).connect(out);
    osc.start(time);
    osc.stop(time + 0.27);
  }

  private note(g: SoundGraph, out: AudioNode, type: OscillatorType, frequency: number, time: number, length: number, level: number): void {
    const osc = g.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const env = g.gain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + 0.01);
    env.gain.setTargetAtTime(0, time + length, 0.04);
    osc.connect(env).connect(out);
    osc.start(time);
    osc.stop(time + length + 0.25);
  }

  /** The bar's own draws, song after song. */
  private random(): number {
    const x = Math.sin(this.seed * 12.9898 + this.song * 78.233 + ++this.draws * 0.37) * 43758.5453;
    return x - Math.floor(x);
  }
}

function midi(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}
