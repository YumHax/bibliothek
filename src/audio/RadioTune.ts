import { audioContext } from './audioContext';

/** Loudness at volume 1, right next to the set (linear). */
const MASTER = 0.16;
/** How far ahead notes are put on the audio clock (s); `update` must run more often than that. */
const LOOKAHEAD = 0.3;
/** Chord progressions, as semitones above the key's root, one chord per bar. */
const PROGRESSIONS = [
  [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]],
  [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
  [[9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14]],
];
/** Major pentatonic, for the tune's passing notes. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];
const BARS_PER_SONG = 16;
/** A tiny speaker: no lows, no highs. */
const BAND = { low: 380, high: 2800 };
const HISS = 0.02;

/**
 * A cheap transistor radio playing an endless stream of forgettable pop: a square-wave tune over
 * chords, a bass and a drum machine, all generated and squeezed through a tinny band with some
 * hiss. A new "song" (key, tempo, progression) every sixteen bars. The owner sets `setVolume`
 * from the listener's distance and calls `update` every frame to keep the notes coming.
 */
export class RadioTune {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private hiss: AudioBufferSourceNode | null = null;
  private noise: AudioBuffer | null = null;
  private on = false;
  private volume = 0;
  private next = 0;
  private step = 0;
  private song = { root: 57, step: 0.28, progression: PROGRESSIONS[0]!, bars: 0 };
  private note = 4;

  get isOn(): boolean {
    return this.on;
  }

  setOn(on: boolean): void {
    this.on = on;
    if (on) {
      const ctx = this.build();
      this.next = ctx.currentTime + 0.05;
      this.step = 0;
    }
    this.follow();
  }

  /** 0..1, from the listener's distance. */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.follow();
  }

  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.on || !this.out) return;
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.02; // the tab was asleep
    while (this.next < ctx.currentTime + LOOKAHEAD) {
      this.playStep(ctx, this.out, this.next);
      this.next += this.song.step;
      this.step++;
      if (this.step % 8 === 0 && ++this.song.bars >= BARS_PER_SONG) this.newSong();
    }
  }

  dispose(): void {
    this.on = false;
    this.hiss?.stop();
    this.hiss = null;
    this.out?.disconnect();
    this.out = null;
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
    };
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
    if (Math.random() < 0.72) {
      // A random walk on the scale, pulled towards the chord.
      this.note = Math.max(0, Math.min(PENTATONIC.length - 1, this.note + Math.round((Math.random() - 0.5) * 3)));
      let pitch = PENTATONIC[this.note]!;
      if (inBar % 4 === 0) pitch = chord.reduce((best, c) => (Math.abs(c - pitch) < Math.abs(best - pitch) ? c : best), chord[0]!);
      this.tone(ctx, out, 'square', midi(root + 12 + pitch), t, step * (Math.random() < 0.3 ? 1.9 : 0.9), 0.12);
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
    const level = ctx.createGain();
    level.gain.value = 1;
    out.connect(high).connect(low).connect(drive).connect(level).connect(ctx.destination);
    this.out = out;

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const hissGain = ctx.createGain();
    hissGain.gain.value = HISS;
    hiss.connect(hissGain).connect(out);
    hiss.start();
    this.hiss = hiss;
    return ctx;
  }
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
