import { startedAudioContext } from '@/audio/audioContext';
import { whiteNoise } from '@/audio/noise';
import { SpatialOut, type Spatial } from '@/audio/spatial';
import { streetInput } from './streetBus';
import { noiseBurst } from '@/audio/synth';
import { random } from '@/random';

/** One-shots a graph keeps sounding or scheduled at once at most (a shutter's rattle is ~70, the hammer's tenth 4). */
const MAX_SHOTS = 160;
/**
 * Positioned legs kept for one-shots (`shot`): a leg whose sound is over is set to the next one's place instead of a new
 * filter, panner and gain each footfall. Past this many sounding at once, a leg is made for the one shot and let go.
 */
const SHOT_LEGS = 48;

/**
 * One street sound's Web Audio graph, kept so it can be let go whole: a master gain into the
 * street's bus (`streetInput`), the shared white noise, and every looping source and oscillator
 * started for it. `stop()` stops them all and disconnects: called on dispose and while the zone
 * is dormant (a dormant street costs no audio processing; the graph is built again on the next
 * update). `create` gives null until a gesture started the audio. Its one-shots (`burst`, `shaped`) are capped at
 * `MAX_SHOTS` sounding or scheduled at once: past it a new one is dropped, so a pile of cues landing in one frame
 * (a dozen shutters rolling, a flock and a hammer) is thinned instead of summed into a roar.
 */
export class SoundGraph {
  readonly noise: AudioBuffer;
  readonly master: GainNode;
  private readonly running: AudioScheduledSourceNode[] = [];
  private readonly legs: SpatialOut[] = [];
  private readonly parts = new Set<SoundPart>();
  /** The one-shots' legs, each with the context time its last sound is over. */
  private readonly shotLegs: { leg: SpatialOut; until: number }[] = [];
  /** When each one-shot still sounding or scheduled ends (context time), pruned as they pass. */
  private shotEnds: number[] = [];
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
    source.start(0, random() * buffer.duration);
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

  /**
   * A positioned input into the master for a one-off sound lasting `seconds`: a kept leg whose last sound is over, set
   * to `spatial` at once, else a new one (kept while fewer than `SHOT_LEGS`, else let go after the sound).
   */
  shot(spatial: Spatial, seconds: number): AudioNode {
    const now = this.ctx.currentTime;
    const until = now + seconds + 0.1;
    const free = this.shotLegs.find((s) => s.until <= now);
    if (free) {
      free.leg.set(spatial.pan, spatial.walls, true, spatial.rear ?? 0);
      free.until = until;
      return free.leg.input;
    }
    const leg = new SpatialOut(this.ctx, this.master, spatial);
    if (this.shotLegs.length < SHOT_LEGS) this.shotLegs.push({ leg, until });
    else window.setTimeout(() => leg.disconnect(), (seconds + 0.5) * 1000);
    return leg.input;
  }

  /** A set of sources and legs started for one voice, stopped on its own (`SoundPart.release`) or with the graph. */
  part(): SoundPart {
    const part = new SoundPart(this, () => this.parts.delete(part));
    this.parts.add(part);
    return part;
  }

  /** A burst of the noise into `out`: up to `level` in a few ms, dying over `length` s, from `at` (context time). */
  burst(out: AudioNode, at: number, length: number, level: number): void {
    if (this.stopped || !this.admit(at + length + 0.02)) return;
    noiseBurst(this.ctx, out, at, { level, length, attack: Math.min(0.006, length / 4), noise: this.noise, duration: length + 0.02 });
  }

  /** A burst shaped by `envelope` ([seconds from `at`, gain] points, linear between), through `out`. */
  shaped(out: AudioNode, at: number, envelope: readonly (readonly [number, number])[]): void {
    const end = envelope[envelope.length - 1]?.[0] ?? 0.1;
    if (this.stopped || !this.admit(at + end + 0.02)) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, at);
    for (const [t, v] of envelope) env.gain.linearRampToValueAtTime(v, at + t);
    source.connect(env).connect(out);
    source.start(at, random() * 1.5);
    source.stop(at + end + 0.02);
  }

  /** Whether one more one-shot (ending at `end`, context time) fits under `MAX_SHOTS`; counts it if so. */
  private admit(end: number): boolean {
    if (this.shotEnds.length >= MAX_SHOTS) {
      const now = this.ctx.currentTime;
      this.shotEnds = this.shotEnds.filter((t) => t > now);
      if (this.shotEnds.length >= MAX_SHOTS) return false;
    }
    this.shotEnds.push(end);
    return true;
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
    for (const part of [...this.parts]) part.release();
    for (const leg of this.legs) leg.disconnect();
    this.legs.length = 0;
    for (const { leg } of this.shotLegs) leg.disconnect();
    this.shotLegs.length = 0;
    this.master.disconnect();
  }
}

/**
 * What one voice of a graph started (its looping noise, its oscillators, its leg), kept apart so the voice can let it go
 * while the graph plays on (a car slot nobody drives costs nothing), and let go with the graph anyway.
 */
export class SoundPart {
  private readonly running: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly legs: SpatialOut[] = [];
  private released = false;

  constructor(private readonly g: SoundGraph, private readonly onRelease: () => void) {}

  /** A looping source of `buffer` (the graph's white noise by default), from a random point. */
  loop(buffer: AudioBuffer = this.g.noise): AudioBufferSourceNode {
    const source = this.g.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start(0, random() * buffer.duration);
    this.running.push(source);
    return source;
  }

  /** An oscillator started now. */
  oscillator(type: OscillatorType, frequency: number): OscillatorNode {
    const osc = this.g.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.start();
    this.running.push(osc);
    return osc;
  }

  /** A filter, disconnected with the part. */
  filter(type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
    return this.own(this.g.filter(type, frequency, q));
  }

  /** A gain node, disconnected with the part. */
  gain(value = 0): GainNode {
    return this.own(this.g.gain(value));
  }

  /** A positioned leg into the graph's master, disconnected with the part. */
  leg(spatial?: Spatial): SpatialOut {
    const leg = new SpatialOut(this.g.ctx, this.g.master, spatial);
    this.legs.push(leg);
    return leg;
  }

  private own<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  /** Stops and disconnects everything of this part. */
  release(): void {
    if (this.released) return;
    this.released = true;
    for (const source of this.running) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      source.disconnect();
    }
    for (const node of this.nodes) node.disconnect();
    for (const leg of this.legs) leg.disconnect();
    this.onRelease();
  }
}
