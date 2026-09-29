import { audioBus, audioContext } from './audioContext';
import { whiteNoise } from './noise';
import { SpatialOut } from './spatial';

/** Loudness at volume 1, right next to the set (linear). */
const MASTER = 0.16;
/** How far ahead notes are put on the audio clock (s); `update` must run more often than that. */
const LOOKAHEAD = 0.3;
/** Chord progressions, as semitones above the key's root, one chord per bar. */
const PROGRESSIONS = [
  [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]],
  [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
  [[9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14]],
  [[0, 4, 7], [5, 9, 12], [0, 4, 7], [7, 11, 14]],
  [[0, 4, 7], [4, 7, 11], [5, 9, 12], [7, 11, 14]],
  [[5, 9, 12], [7, 11, 14], [4, 7, 11], [9, 12, 16]],
  [[0, 4, 7], [2, 5, 9], [5, 9, 12], [7, 11, 14]],
];
/** Major pentatonic, for the tune's passing notes. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];
const BARS_PER_SONG = 16;
/** Between two songs: the last one fades over its final quarter bar, then half a bar of hiss only (eighth notes). */
const GAP_STEPS = 4;
/** Each song's hook: a two-bar motif (eighth notes) heard on the first two bars of every four. */
const MOTIF_STEPS = 16;
/** Share of the eighth notes that carry a tune note. */
const NOTE_CHANCE = 0.72;

/** One eighth of the tune: a pentatonic degree held short or long, or a rest (null). */
type TuneNote = { degree: number; long: boolean } | null;
/** A tiny speaker: no lows, no highs. */
const BAND = { low: 380, high: 2800 };
const HISS = 0.02;
/** How far the music dips under the announcer (dB), and how fast it goes down and comes back (s). */
const DUCK_DB = 8;
const DUCK_FALL = 0.25;
const DUCK_RISE = 0.8;
/** The station's jingle: a rising arpeggio of bells (MIDI notes), then the announcer's tone bed. */
const JINGLE = [72, 76, 79, 84];
const JINGLE_STEP = 0.14;

/**
 * A cheap transistor radio playing an endless stream of forgettable pop: a square-wave tune over
 * chords, a bass and a drum machine, all generated and squeezed through a tinny band with some
 * hiss. A new "song" (key, tempo, progression, a two-bar hook it keeps coming back to) every sixteen
 * bars, with a short fade and half a bar of hiss between two. The owner sets `setVolume`
 * from the listener's distance and calls `update` every frame to keep the notes coming.
 */
export class RadioTune {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  /** The music's own gain under the announcer (`duck`), and the jingle's way in, past it. */
  private music: GainNode | null = null;
  private voiceIn: GainNode | null = null;
  private spatialOut: SpatialOut | null = null;
  private readonly spatial = { pan: 0, walls: 0 };
  private hiss: AudioBufferSourceNode | null = null;
  private noise: AudioBuffer | null = null;
  private on = false;
  private volume = 0;
  private next = 0;
  private step = 0;
  private song = { root: 57, step: 0.28, progression: PROGRESSIONS[0]!, bars: 0, motif: makeMotif() };
  private note = 4;
  /** The song's own gain, ahead of `music`: faded out at a song's end, back up after the gap. */
  private songGain: GainNode | null = null;
  /** Eighth notes of silence left before the next song starts. */
  private gap = 0;

  get isOn(): boolean {
    return this.on;
  }

  setOn(on: boolean): void {
    this.on = on;
    if (on) {
      const ctx = this.build();
      this.next = ctx.currentTime + 0.05;
      this.step = 0;
      this.gap = 0;
      this.songGain?.gain.cancelScheduledValues(ctx.currentTime);
      this.songGain?.gain.setValueAtTime(1, ctx.currentTime);
    }
    this.follow();
  }

  /** 0..1, from the listener's distance. */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.follow();
  }

  /** Where the set is heard from (`spatial.ts`): the side and the walls in between. */
  setSpatial(pan: number, walls: number): void {
    this.spatial.pan = pan;
    this.spatial.walls = walls;
    this.spatialOut?.set(pan, walls);
  }

  /** The music dips `DUCK_DB` under the announcer (true), or comes back up (false). */
  duck(down: boolean): void {
    if (!this.ctx || !this.music) return;
    const gain = down ? Math.pow(10, -DUCK_DB / 20) : 1;
    this.music.gain.setTargetAtTime(gain, this.ctx.currentTime, down ? DUCK_FALL / 3 : DUCK_RISE / 3);
  }

  /** The station's jingle over the music (a few bells, then the announcer's hum), through the same little speaker. */
  jingle(): void {
    const ctx = this.ctx;
    const into = this.voiceIn;
    if (!ctx || !into || !this.on) return;
    let t = ctx.currentTime + 0.05;
    for (const note of JINGLE) {
      this.tone(ctx, into, 'triangle', midi(note), t, JINGLE_STEP * 2.2, 0.45);
      this.tone(ctx, into, 'sine', midi(note + 12), t, JINGLE_STEP * 1.4, 0.18);
      t += JINGLE_STEP;
    }
    // The announcer taking the mike: a warm, wobbling hum in a voice's range, under the card.
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.setValueAtTime(140, t);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 4.5;
    const depth = ctx.createGain();
    depth.gain.value = 18;
    wobble.connect(depth).connect(hum.frequency);
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 800;
    formant.Q.value = 2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.12, t + 0.08);
    env.gain.setValueAtTime(0.12, t + 1.2);
    env.gain.linearRampToValueAtTime(0, t + 1.6);
    hum.connect(formant).connect(env).connect(into);
    hum.start(t);
    wobble.start(t);
    hum.stop(t + 1.7);
    wobble.stop(t + 1.7);
  }

  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.on || !this.out) return;
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.02; // the tab was asleep
    while (this.next < ctx.currentTime + LOOKAHEAD) {
      if (this.gap > 0) {
        // Between two songs: only the hiss; the new one comes in on the gap's last beat.
        this.next += this.song.step;
        if (--this.gap === 0) this.songGain?.gain.setTargetAtTime(1, this.next - 0.02, 0.008);
        continue;
      }
      this.playStep(ctx, this.songGain ?? this.music ?? this.out, this.next);
      this.next += this.song.step;
      this.step++;
      if (this.step % 8 === 0 && ++this.song.bars >= BARS_PER_SONG) {
        // The song fades over its last quarter bar, then half a bar of hiss.
        this.songGain?.gain.setTargetAtTime(0, this.next - this.song.step * 2, this.song.step * 0.5);
        this.newSong();
        this.gap = GAP_STEPS;
      }
    }
  }

  dispose(): void {
    this.on = false;
    this.hiss?.stop();
    this.hiss = null;
    this.out?.disconnect();
    this.out = null;
    this.music = null;
    this.songGain = null;
    this.voiceIn = null;
    this.spatialOut?.disconnect();
    this.spatialOut = null;
    this.ctx = null;
  }

  private follow(): void {
    if (!this.ctx || !this.out) return;
    this.out.gain.setTargetAtTime(this.on ? this.volume * MASTER : 0, this.ctx.currentTime, 0.1);
  }

  private newSong(): void {
    this.song = {
      root: 55 + Math.floor(Math.random() * 7),
      step: 60 / (92 + Math.random() * 40) / 2,
      progression: PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)]!,
      bars: 0,
      motif: makeMotif(),
    };
    this.step = 0;
  }

  /** One eighth note: drums, bass on the beat, the tune (with rests), a chord stab on the offbeats. */
  private playStep(ctx: AudioContext, out: AudioNode, t: number): void {
    const inBar = this.step % 8;
    const chord = this.song.progression[Math.floor(this.step / 8) % this.song.progression.length]!;
    const { root, step } = this.song;
    if (inBar % 4 === 0) this.kick(ctx, out, t);
    if (inBar % 4 === 2) this.noiseHit(ctx, out, t, 1800, 0.12, 0.35);
    this.noiseHit(ctx, out, t + (inBar % 2 ? 0 : step / 2), 7000, 0.03, 0.08);
    if (inBar % 2 === 0) this.tone(ctx, out, 'triangle', midi(root - 24 + chord[0]! + (inBar === 6 ? 7 : 0)), t, step * 1.8, 0.5);
    else for (const n of chord) this.tone(ctx, out, 'sawtooth', midi(root + n), t, step * 0.5, 0.05);
    // The hook on the first two bars of every four, a random walk on the others.
    const hook = this.song.bars % 4 < 2;
    let note: TuneNote;
    if (hook) note = this.song.motif[(this.song.bars % 2) * 8 + inBar] ?? null;
    else {
      this.note = walk(this.note);
      note = Math.random() < NOTE_CHANCE ? { degree: this.note, long: Math.random() < 0.3 } : null;
    }
    if (note) {
      let pitch = PENTATONIC[note.degree]!;
      // Pulled towards the chord on the beat, so the hook still fits when the chord under it changes.
      if (inBar % 4 === 0) pitch = chord.reduce((best, c) => (Math.abs(c - pitch) < Math.abs(best - pitch) ? c : best), chord[0]!);
      this.tone(ctx, out, 'square', midi(root + 12 + pitch), t, step * (note.long ? 1.9 : 0.9), 0.12);
    }
  }

  private tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, frequency: number, t: number, length: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.01);
    env.gain.setTargetAtTime(0, t + length * 0.7, length * 0.2);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + length * 1.6);
  }

  private kick(ctx: AudioContext, out: AudioNode, t: number): void {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private noiseHit(ctx: AudioContext, out: AudioNode, t: number, frequency: number, length: number, level: number): void {
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = frequency;
    band.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + length);
    source.connect(band).connect(env).connect(out);
    source.start(t, Math.random() * 0.5);
    source.stop(t + length + 0.02);
  }

  private build(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = audioContext();
    this.ctx = ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    // The speaker: band-limited and a little driven.
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = BAND.low;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = BAND.high;
    const drive = ctx.createWaveShaper();
    drive.curve = softClip();
    // The loudness (`out`) is ahead of everything; the music's own dip (`music`) is ahead of the speaker,
    // and the jingle joins behind it, so ducking never takes the announcer down with the song.
    const music = ctx.createGain();
    const songGain = ctx.createGain();
    songGain.connect(music);
    this.songGain = songGain;
    const voiceIn = ctx.createGain();
    this.spatialOut = new SpatialOut(ctx, audioBus(ctx, 'screens'), this.spatial);
    out.connect(high).connect(low).connect(drive).connect(this.spatialOut.input);
    music.connect(out);
    voiceIn.connect(out);
    this.out = out;
    this.music = music;
    this.voiceIn = voiceIn;

    this.noise = whiteNoise(ctx, 1);
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const hissGain = ctx.createGain();
    hissGain.gain.value = HISS;
    hiss.connect(hissGain).connect(music);
    hiss.start(0, Math.random() * this.noise.duration);
    this.hiss = hiss;
    return ctx;
  }
}

/** One step of the tune's random walk on the scale. */
function walk(degree: number): number {
  return Math.max(0, Math.min(PENTATONIC.length - 1, degree + Math.round((Math.random() - 0.5) * 3)));
}

/** A song's two-bar hook: the same random walk, drawn once and repeated. */
function makeMotif(): TuneNote[] {
  const motif: TuneNote[] = [];
  let degree = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < MOTIF_STEPS; i++) {
    degree = walk(degree);
    motif.push(Math.random() < NOTE_CHANCE || i % 8 === 0 ? { degree, long: Math.random() < 0.3 } : null);
  }
  return motif;
}

function midi(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function softClip(): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(2 * x) / Math.tanh(2);
  }
  return curve;
}
