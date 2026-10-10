import { oneShot } from './oneShot';
import { partials, tone } from './synth';

/*
 * THE OPENING'S MUSIC (docs/story.md "The opening"): a music box over a soft pad, a waltz in D for the dream; the
 * same tune again during the sale, slower and sagging out of tune while the room empties; a chime for each thing that
 * goes; one chord under the title in the morning. All on the foreground bus (the world's volume, past the duck that
 * silences the room meanwhile), laid on the audio clock at the start; `stop` fades whatever is left.
 */

/** A note: on which beat (from the tune's start), its MIDI pitch, how many beats it rings. */
type Note = readonly [beat: number, midi: number, beats: number];

/** The tune: eight bars of three beats (D, Bm, G, A twice over). */
const TUNE: readonly Note[] = [
  [0, 81, 1], [1, 78, 1], [2, 74, 1],
  [3, 78, 1], [4, 83, 2],
  [6, 83, 1], [7, 81, 1], [8, 79, 1],
  [9, 76, 2], [11, 73, 1],
  [12, 74, 1], [13, 78, 1], [14, 81, 1],
  [15, 86, 2], [17, 83, 1],
  [18, 81, 1], [19, 79, 1], [20, 76, 1],
  [21, 78, 1.5], [22.5, 76, 0.5], [23, 74, 1],
];
/** The chords under it, one a bar: the bass note, then the chord's tones an octave or two up. */
const CHORDS: readonly (readonly number[])[] = [
  [50, 62, 66, 69],
  [47, 59, 62, 66],
  [43, 59, 62, 67],
  [45, 61, 64, 69],
];
/** Seconds a beat in the dream, and during the sale (slower). */
const BEAT_S = 1;
const SALE_BEAT_S = 1.35;
/** The sale plays the tune's first bars this far out of tune by their end (a share of the pitch). */
const SAG = 0.045;
/** The bus level the whole score is laid on. */
const LEVEL = 0.55;
/** The sale's chimes, one at most this often (s). */
const CHIME_GAP = 0.22;

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** One note of the music box: a struck fundamental, its bright tine partial, a breath of the octave. */
function musicBox(ctx: BaseAudioContext, out: AudioNode, at: number, midi: number, seconds: number, level: number, sagTo = 1): void {
  const f = hz(midi);
  const glide = sagTo === 1 ? {} : { toRatio: sagTo, glide: seconds };
  tone(ctx, out, at, { frequency: f, level: 0.16 * level, length: Math.max(1.4, seconds * 1.8), attack: 0.002, ...glide });
  tone(ctx, out, at, { frequency: f * 2, level: 0.05 * level, length: 0.7, attack: 0.002, ...glide });
  partials(ctx, out, at, [[f * 4.2, 0.018 * level, 0.25]], { length: 0.25, attack: 0.001 });
}

/** One note of a chip's square lead (the arcade's memory): short, thin, a little bright. */
function chip(ctx: BaseAudioContext, out: AudioNode, at: number, midi: number, seconds: number, level: number): void {
  tone(ctx, out, at, { frequency: hz(midi), type: 'square', level: 0.035 * level, length: Math.min(seconds * 0.85, 0.5), attack: 0.002 });
}

/** A bar's pad: the bass note and the chord, slow in and out, on triangles. */
function pad(ctx: BaseAudioContext, out: AudioNode, at: number, chord: readonly number[], seconds: number, level: number): void {
  chord.forEach((midi, i) => {
    tone(ctx, out, at, { frequency: hz(midi), type: 'triangle', level: (i === 0 ? 0.06 : 0.014) * level, length: seconds * 1.15, attack: seconds * 0.35, curve: 'linear' });
  });
}

/**
 * A memory's music (`MemoryReel.score`, docs/story.md "Adding a memory"): the opening's waltz recoloured. `waltz` is
 * the dream's own; `lullaby` an octave down and slower (a child's evening); `minor` in D minor (the row, the sale);
 * `chiptune` quicker on a square lead (the arcade).
 */
export type MemoryScoreName = 'waltz' | 'lullaby' | 'minor' | 'chiptune';

/** A variant: seconds a beat, semitones the tune moves, whether it is in the minor, its voice, the tune's and the pad's level. */
interface ScoreVariant {
  beat: number;
  shift: number;
  minor: boolean;
  voice: 'box' | 'chip';
  level: number;
  pad: number;
}

const MEMORY_SCORES: Record<MemoryScoreName, ScoreVariant> = {
  waltz: { beat: BEAT_S, shift: 0, minor: false, voice: 'box', level: 1, pad: 1 },
  lullaby: { beat: 1.3, shift: -12, minor: false, voice: 'box', level: 0.85, pad: 0.7 },
  minor: { beat: 1.15, shift: 0, minor: true, voice: 'box', level: 0.85, pad: 0.9 },
  chiptune: { beat: 0.75, shift: 0, minor: false, voice: 'chip', level: 0.8, pad: 0.5 },
};
/** The beats the tune runs (eight bars of three): a memory longer than that plays it again. */
const TUNE_BEATS = 24;
/** Seconds before the memory's end that its tune eases off over, and the last note's start ahead of the end. */
const MEMORY_FADE = 6;
const MEMORY_LAST_NOTE = 1.5;

/** `midi` in the variant: moved, and in D minor the major's F sharp and B flattened (the A chord keeps its C sharp). */
function inVariant(midi: number, variant: ScoreVariant): number {
  const pc = ((midi % 12) + 12) % 12;
  const flat = variant.minor && (pc === 6 || pc === 11) ? -1 : 0;
  return midi + flat + variant.shift;
}

export class IntroScore {
  /** A memory's variant once `startMemory` laid it (the title's chord follows it); null for the opening. */
  private variant: ScoreVariant | null = null;
  private out: GainNode | null = null;
  private ctx: AudioContext | null = null;
  private lastChime = -Infinity;
  /** The audio clock's time at the score's 0. */
  private zero = 0;

  /**
   * Seconds since the score's 0 on the audio clock, or null without running audio: the film follows it, so a frame
   * that stalls (a shader compiled, a cover uploaded) never leaves the picture behind the music.
   */
  elapsed(): number | null {
    const { ctx } = this;
    return ctx && ctx.state === 'running' ? ctx.currentTime - this.zero : null;
  }

  /**
   * Lays the score from now: the dream from `dreamIn` seconds, the sale from `saleIn` until `silenceAt`.
   * Nothing plays without audio (no gesture yet, a headless run).
   */
  start(times: { dreamIn: number; saleIn: number; silenceAt: number }): void {
    const shot = oneShot(LEVEL, times.silenceAt + 4, { channel: 'foreground' });
    if (!shot) return;
    const { ctx, out, t } = shot;
    this.ctx = ctx;
    this.out = out;
    this.zero = t;
    // The dream: the waltz, its chords under it.
    const dream = t + times.dreamIn;
    for (const [beat, midi, beats] of TUNE) musicBox(ctx, out, dream + beat * BEAT_S, midi, beats * BEAT_S, 1);
    for (let bar = 0; bar < 8; bar++) pad(ctx, out, dream + bar * 3 * BEAT_S, CHORDS[bar % 4]!, 3 * BEAT_S, 1);
    // The sale: the first four bars, slower, quieter, each note sagging a little further out of tune.
    const sale = t + times.saleIn;
    const saleBeats = Math.min(12, (times.silenceAt - times.saleIn) / SALE_BEAT_S);
    for (const [beat, midi, beats] of TUNE) {
      if (beat >= saleBeats) break;
      const sag = 1 - SAG * (beat / saleBeats);
      musicBox(ctx, out, sale + beat * SALE_BEAT_S, midi, beats * SALE_BEAT_S, 0.7 * (1 - 0.5 * (beat / saleBeats)), sag);
    }
    for (let bar = 0; bar * 3 < saleBeats; bar++) pad(ctx, out, sale + bar * 3 * SALE_BEAT_S, CHORDS[bar % 4]!, 3 * SALE_BEAT_S, 0.6);
    // A low D left ringing into the black.
    tone(ctx, out, t + times.silenceAt - 2.5, { frequency: hz(38), type: 'sine', level: 0.07, length: 6, attack: 1.5, curve: 'linear' });
  }

  /**
   * Lays a memory's music from now (`MemoryFilm`): the tune of `score` from `from` seconds, again as often as it takes
   * to fill the film, easing off towards `until`, where a low D is left ringing into the black. No sale in it.
   */
  startMemory(times: { score: MemoryScoreName; from: number; until: number }): void {
    const variant = MEMORY_SCORES[times.score];
    const shot = oneShot(LEVEL, times.until + 4, { channel: 'foreground' });
    if (!shot) return;
    const { ctx, out, t } = shot;
    this.ctx = ctx;
    this.out = out;
    this.zero = t;
    this.variant = variant;
    const last = t + times.until - MEMORY_LAST_NOTE;
    const fade = (at: number) => Math.max(0.3, Math.min(1, (last - at) / MEMORY_FADE));
    const voice = variant.voice === 'chip' ? chip : musicBox;
    for (let pass = t + times.from; pass < last; pass += TUNE_BEATS * variant.beat) {
      for (const [beat, midi, beats] of TUNE) {
        const at = pass + beat * variant.beat;
        if (at >= last) break;
        voice(ctx, out, at, inVariant(midi, variant), beats * variant.beat, variant.level * fade(at));
      }
      for (let bar = 0; bar < 8; bar++) {
        const at = pass + bar * 3 * variant.beat;
        if (at >= last) break;
        pad(ctx, out, at, CHORDS[bar % 4]!.map((midi) => inVariant(midi, { ...variant, shift: 0 })), 3 * variant.beat, variant.pad * fade(at));
      }
    }
    tone(ctx, out, t + times.until - 2.5, { frequency: hz(38), type: 'sine', level: 0.07, length: 6, attack: 1.5, curve: 'linear' });
  }

  /** A thing of the dream goes: a small high chime, falling. */
  vanish(): void {
    const { ctx, out } = this;
    if (!ctx || !out) return;
    // A few at once would be a jangle: one chime at most every so often.
    if (ctx.currentTime - this.lastChime < CHIME_GAP) return;
    this.lastChime = ctx.currentTime;
    const at = ctx.currentTime + 0.01;
    tone(ctx, out, at, { frequency: hz(93 + Math.round((ctx.currentTime * 7) % 5)), toRatio: 0.7, level: 0.02, length: 0.6, attack: 0.002 });
  }

  /** Under the title: the tune's chord spread up the music box, once. */
  title(): void {
    const shot = oneShot(LEVEL, 6, { channel: 'foreground' });
    if (!shot) return;
    const { ctx, out, t } = shot;
    // A memory's title in its own key (the box's chord either way: the arcade's ends on the box too).
    const key = this.variant ? { ...this.variant, shift: 0 } : null;
    const inKey = (midi: number) => (key ? inVariant(midi, key) : midi);
    [74, 78, 81, 86].forEach((midi, i) => musicBox(ctx, out, t + i * 0.14, inKey(midi), 2.4, 0.9));
    pad(ctx, out, t, CHORDS[0]!.map(inKey), 4.5, 0.8);
  }

  /** Fades what is still playing out over `seconds` (a skip). */
  stop(seconds = 0.6): void {
    const { ctx, out } = this;
    this.out = null;
    if (!ctx || !out) return;
    out.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
  }
}
