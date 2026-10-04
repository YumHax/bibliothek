import type { DemoSound } from './MoonpostDemo';
import { random } from '@/random';

/*
 * MOONPOST's sound, as an NES would make it: Hana's tune on a pulse wave over a triangle bass (scheduled
 * a moment ahead on the audio clock), a noise channel's hiss for the jet pack, and the jingles. All of it
 * goes into the output the set gives the program (`ProgramContext.audio.out`).
 */

const STEP = 60 / 132 / 2;
const LOOKAHEAD = 0.25;
/** The tune in eighth notes (MIDI; `0` a rest, `-1` holds the note before), A then B, looped. */
const MELODY = [
  76, -1, 79, 76, 74, -1, 72, -1, 74, -1, 76, 79, 81, -1, 79, -1, 76, -1, 79, 76, 74, -1, 72, 69, 72, -1, 74, -1, 72, -1, -1, 0,
  81, -1, 79, 76, 79, -1, 76, 74, 76, -1, 74, 72, 74, -1, -1, 0, 69, -1, 72, 74, 76, -1, 79, -1, 81, 79, 76, 74, 72, -1, -1, 0,
];
/** The bass, a note a bar (eight steps): C, A minor, F, G, twice over. */
const BASS = [48, 45, 41, 43, 48, 45, 41, 43];

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export class MoonpostSound {
  private readonly music: GainNode;
  private readonly hiss: GainNode;
  private noise: AudioBufferSourceNode | null = null;
  private step = 0;
  private next = 0;
  private playing = false;

  constructor(private readonly ctx: AudioContext, private readonly out: AudioNode) {
    this.music = ctx.createGain();
    this.music.gain.value = 0.22;
    this.music.connect(out);
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    this.hiss.connect(out);
    this.noise = ctx.createBufferSource();
    this.noise.buffer = noiseBuffer(ctx);
    this.noise.loop = true;
    this.noise.connect(filter).connect(this.hiss);
    this.noise.start();
  }

  /** Schedules the tune ahead while it plays; the hiss follows the jet pack. */
  update(musicOn: boolean, thrusting: boolean): void {
    const now = this.ctx.currentTime;
    this.hiss.gain.setTargetAtTime(thrusting ? 0.12 : 0, now, 0.03);
    if (!musicOn) {
      this.playing = false;
      return;
    }
    if (!this.playing) {
      this.playing = true;
      this.next = now + 0.05;
    }
    while (this.next < now + LOOKAHEAD) {
      this.note(this.step, this.next);
      this.step = (this.step + 1) % MELODY.length;
      this.next += STEP;
    }
  }

  play(sound: DemoSound): void {
    const t = this.ctx.currentTime + 0.01;
    switch (sound) {
      case 'start':
        this.blip('square', 523, t, 0.08, 0.3);
        this.blip('square', 1046, t + 0.08, 0.14, 0.3);
        break;
      case 'deliver':
        [784, 988, 1175, 1568].forEach((f, i) => this.blip('square', f, t + i * 0.06, 0.07, 0.3));
        break;
      case 'refuel':
        this.blip('triangle', 300, t, 0.25, 0.5, 900);
        break;
      case 'land':
        this.blip('triangle', 140, t, 0.06, 0.5, 80);
        break;
      case 'crash':
        this.burst(t, 0.4);
        this.blip('square', 220, t, 0.3, 0.35, 55);
        break;
      case 'end':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.blip('square', f, t + i * 0.09, 0.09, 0.3));
    }
  }

  /** Silent while held still (the pointer unlocked): the tune picks up where the clock is. */
  setPaused(paused: boolean): void {
    const now = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(paused ? 0 : 0.22, now, 0.02);
    if (paused) {
      this.hiss.gain.setTargetAtTime(0, now, 0.02);
      this.playing = false;
    }
  }

  dispose(): void {
    try {
      this.noise?.stop();
    } catch {
      // Never started.
    }
    this.noise?.disconnect();
    this.noise = null;
    this.music.disconnect();
    this.hiss.disconnect();
  }

  private note(step: number, at: number): void {
    const midi = MELODY[step]!;
    if (midi > 0) {
      let length = 1;
      while (MELODY[(step + length) % MELODY.length] === -1) length++;
      this.voice('square', hz(midi), at, length * STEP * 0.95, 0.5, this.music);
    }
    if (step % 8 === 0) this.voice('triangle', hz(BASS[(step / 8) % BASS.length]!), at, STEP * 7.6, 0.9, this.music);
  }

  private blip(wave: OscillatorType, from: number, at: number, length: number, level: number, to?: number): void {
    this.voice(wave, from, at, length, level, this.out, to);
  }

  private voice(wave: OscillatorType, from: number, at: number, length: number, level: number, into: AudioNode, to?: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, at);
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(level, at + 0.005);
    env.gain.setValueAtTime(level, at + length * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(env).connect(into);
    osc.start(at);
    osc.stop(at + length + 0.02);
    osc.onended = () => env.disconnect();
  }

  private burst(at: number, length: number): void {
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer(this.ctx);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.5, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(env).connect(this.out);
    source.start(at);
    source.stop(at + length + 0.02);
    source.onended = () => env.disconnect();
  }
}

let shared: { ctx: AudioContext; buffer: AudioBuffer } | null = null;

/** A second of white noise, made once per audio context. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (shared?.ctx === ctx) return shared.buffer;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  shared = { ctx, buffer };
  return buffer;
}
