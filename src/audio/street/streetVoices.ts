/*
 * The street's voices, synthesised: a car horn, a two-tone siren, a bird's note. Pure WebAudio
 * builders taking a context and where to play into, shared by the two soundscapes of the same
 * street (`StreetAmbience` through the windows, `street/StreetSound` down there); each caller
 * keeps its own parameters, timing and panning.
 */

/** A filter over a whole voice. */
interface VoiceFilter {
  type: BiquadFilterType;
  frequency: number;
  /** Default 1 (WebAudio's). */
  q?: number;
}

/** A horn: square waves at `pitches` sounding together, `blasts` times. */
interface HornSpec {
  pitches: readonly number[];
  /** Up to this many Hz added to each pitch at random (a horn is never quite in tune). */
  detune?: number;
  blasts: number;
  /** Each blast, rise to fall, seconds; the silence between two. */
  length: number;
  gap: number;
  /** Peak gain of a blast, its rise and fall times. */
  level: number;
  attack: number;
  release: number;
  filter: VoiceFilter;
}

/** A filter node for `spec`. */
function voiceFilter(ctx: BaseAudioContext, spec: VoiceFilter): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = spec.type;
  f.frequency.value = spec.frequency;
  f.Q.value = spec.q ?? 1;
  return f;
}

/** Sounds a horn into `out` from `at` (seconds, context time); returns when it has finished. */
export function horn(ctx: BaseAudioContext, out: AudioNode, spec: HornSpec, at = ctx.currentTime): number {
  const tone = voiceFilter(ctx, spec.filter);
  tone.connect(out);
  let end = at;
  for (let n = 0; n < spec.blasts; n++) {
    const start = at + n * (spec.length + spec.gap);
    end = start + spec.length;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(spec.level, start + spec.attack);
    env.gain.setValueAtTime(spec.level, end - spec.release);
    env.gain.linearRampToValueAtTime(0, end);
    env.connect(tone);
    for (const pitch of spec.pitches) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = pitch + Math.random() * (spec.detune ?? 0);
      osc.connect(env);
      osc.start(start);
      osc.stop(end + 0.05);
    }
  }
  return end;
}

/** A siren's voice: a triangle wave through a `lowpass` into a gain (silent), into `out`. Not started: the caller plays it and sets its pitch. */
export function sirenVoice(ctx: BaseAudioContext, out: AudioNode, lowpass: number): { osc: OscillatorNode; gain: GainNode } {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 440;
  osc.connect(voiceFilter(ctx, { type: 'lowpass', frequency: lowpass })).connect(gain).connect(out);
  return { osc, gain };
}

/** Which of a two-tone siren's `tones` sounds at `time` seconds, each held `step` seconds. */
export function twoTone(tones: readonly [number, number], step: number, time: number): number {
  return tones[Math.floor(time / step) % 2]!;
}

/** One note of a bird: a sine sliding from `from` to `to` Hz over `sweep` seconds, rising to `level` over `attack`, silent at `length`. */
interface BirdNote {
  at: number;
  from: number;
  to: number;
  sweep: number;
  attack: number;
  length: number;
  level: number;
}

/** Sings one note of a bird into `out`. */
export function birdNote(ctx: BaseAudioContext, out: AudioNode, note: BirdNote): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(note.from, note.at);
  osc.frequency.exponentialRampToValueAtTime(note.to, note.at + note.sweep);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, note.at);
  gain.gain.linearRampToValueAtTime(note.level, note.at + note.attack);
  gain.gain.linearRampToValueAtTime(0, note.at + note.length);
  osc.connect(gain).connect(out);
  osc.start(note.at);
  osc.stop(note.at + note.length + 0.02);
}
