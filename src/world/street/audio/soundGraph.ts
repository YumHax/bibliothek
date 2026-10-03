import { startedAudioContext } from '@/audio/audioContext';
import { whiteNoise } from '@/audio/noise';
import { SpatialOut, type Spatial } from '@/audio/spatial';
import { streetInput } from './streetBus';

/**
 * One street sound's Web Audio graph, kept so it can be let go whole: a master gain into the
 * street's bus (`streetInput`), the shared white noise, and every looping source and oscillator
 * started for it. `stop()` stops them all and disconnects: called on dispose and while the zone
 * is dormant (a dormant street costs no audio processing; the graph is built again on the next
 * update). `create` gives null until a gesture started the audio.
 */
export class SoundGraph {
  readonly noise: AudioBuffer;
  readonly master: GainNode;
  private readonly running: AudioScheduledSourceNode[] = [];
  private readonly legs: SpatialOut[] = [];
  private stopped = false;

  private constructor(readonly ctx: AudioContext, level: number) {
    this.noise = whiteNoise(ctx, 2);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(level, ctx.currentTime, 0.6);
    this.master.connect(streetInput(ctx));
  }

  static create(level: number): SoundGraph | null {
    const ctx = startedAudioContext();
    return ctx ? new SoundGraph(ctx, level) : null;
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  /** Eases the master to `level`. */
  setLevel(level: number, seconds = 0.4): void {
    this.master.gain.setTargetAtTime(level, this.ctx.currentTime, seconds);
  }

  /** A looping source of `buffer` (the white noise by default), started at a random point, kept till `stop`. */
  loop(buffer: AudioBuffer = this.noise): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start(0, Math.random() * buffer.duration);
    this.running.push(source);
    return source;
  }

  /** An oscillator started now and kept till `stop`. */
  oscillator(type: OscillatorType, frequency: number): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.start();
    this.running.push(osc);
    return osc;
  }

  /** Starts `source` (made by someone else) and keeps it till `stop`. */
  keep(source: AudioScheduledSourceNode): void {
    source.start();
    this.running.push(source);
  }

  /** A filter of `type` at `frequency`. */
  filter(type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  /** A gain node at `value`. */
  gain(value = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }

  /** A positioned leg into the master for a continuous voice (side, behind the head), kept till `stop`. */
  leg(spatial?: Spatial): SpatialOut {
    const leg = new SpatialOut(this.ctx, this.master, spatial);
    this.legs.push(leg);
    return leg;
  }

  /** A positioned input into the master for a one-off sound, let go `seconds` later. */
  shot(spatial: Spatial, seconds: number): AudioNode {
    const leg = new SpatialOut(this.ctx, this.master, spatial);
    window.setTimeout(() => leg.disconnect(), (seconds + 0.5) * 1000);
    return leg.input;
  }

  /** A burst of the noise into `out`: up to `level` in a few ms, dying over `length` s, from `at` (context time). */
  burst(out: AudioNode, at: number, length: number, level: number): void {
    if (this.stopped) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + Math.min(0.006, length / 4));
    env.gain.exponentialRampToValueAtTime(0.0005, at + length);
    source.connect(env).connect(out);
    source.start(at, Math.random() * 1.5, length + 0.02);
  }

  /** A burst shaped by `envelope` ([seconds from `at`, gain] points, linear between), through `out`. */
  shaped(out: AudioNode, at: number, envelope: readonly (readonly [number, number])[]): void {
    if (this.stopped) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, at);
    for (const [t, v] of envelope) env.gain.linearRampToValueAtTime(v, at + t);
    source.connect(env).connect(out);
    const end = envelope[envelope.length - 1]?.[0] ?? 0.1;
    source.start(at, Math.random() * 1.5);
    source.stop(at + end + 0.02);
  }

  /** Stops every kept source and lets the graph go. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const source of this.running) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      source.disconnect();
    }
    this.running.length = 0;
    for (const leg of this.legs) leg.disconnect();
    this.legs.length = 0;
    this.master.disconnect();
  }
}
