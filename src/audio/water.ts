import { Voice } from './ambient';

/*
 * The bathroom's water, synthesised like the other ambient voices (`ambient.ts`): a tap running
 * (into a basin or a tub), a plug pulled, a WC flushing and refilling. Each is an `AmbientVoice`
 * for a `PointSound`, switched by the fitting that makes it (`setRunning`, `flush`...).
 */

/** How long a flush lasts, rush and refill together: the WC blocks another flush for as long. */
export const FLUSH_SECONDS = 8;

export interface RunningWaterOptions {
  /** Shut, the tap still drips now and then (the basin's never quite closes). Default false. */
  drips?: boolean;
  /** Loudness at the fitting. Default 0.5. */
  peak?: number;
}

/**
 * A tap running and, for a tub, its drain: the stream is broadband noise through a band that
 * wanders a little (the splash), its centre falling as the water it lands in deepens (`setDepth`);
 * the drain is a low rumble with random "bloops" of air. Shut and with `drips`, a drop every few
 * seconds instead (as `TapDrip`).
 */
export class RunningWater extends Voice {
  private running = false;
  private draining = false;
  private depth = 0;
  private flow: GainNode | null = null;
  private drain: GainNode | null = null;
  private splash: BiquadFilterNode | null = null;
  private untilJitter = 0;
  private untilDrop = rand(2, 6);
  private untilBloop = 0;

  constructor(private readonly options: RunningWaterOptions = {}) {
    super(options.peak ?? 0.5);
  }

  setRunning(running: boolean): void {
    this.running = running;
    if (this.ctx && this.flow) this.flow.gain.setTargetAtTime(running ? 1 : 0, this.ctx.currentTime, running ? 0.05 : 0.12);
  }

  setDraining(draining: boolean): void {
    this.draining = draining;
    if (this.ctx && this.drain) this.drain.gain.setTargetAtTime(draining ? 1 : 0, this.ctx.currentTime, 0.3);
  }

  /** 0 = falling on bare enamel, 1 = into a full tub (a deeper, rounder pour). */
  setDepth(depth: number): void {
    this.depth = Math.max(0, Math.min(1, depth));
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise(ctx, 3);
    hiss.loop = true;
    this.splash = ctx.createBiquadFilter();
    this.splash.type = 'bandpass';
    this.splash.frequency.value = this.centre();
    this.splash.Q.value = 0.7;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.55;
    this.flow = ctx.createGain();
    this.flow.gain.value = this.running ? 1 : 0;
    this.flow.connect(out);
    hiss.connect(this.splash).connect(hissGain).connect(this.flow);
    // The body of the pour: the same noise, low-passed.
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 420;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.35;
    hiss.connect(low).connect(lowGain).connect(this.flow);
    hiss.start();

    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noise(ctx, 2);
    rumble.loop = true;
    const drainLow = ctx.createBiquadFilter();
    drainLow.type = 'lowpass';
    drainLow.frequency.value = 300;
    const drainGain = ctx.createGain();
    drainGain.gain.value = 0.5;
    this.drain = ctx.createGain();
    this.drain.gain.value = this.draining ? 1 : 0;
    this.drain.connect(out);
    rumble.connect(drainLow).connect(drainGain).connect(this.drain);
    rumble.start();
  }

  protected tick(ctx: AudioContext, dt: number): void {
    const now = ctx.currentTime;
    if (this.running && this.splash) {
      this.untilJitter -= dt;
      if (this.untilJitter <= 0) {
        this.untilJitter = rand(0.04, 0.1);
        this.splash.frequency.setTargetAtTime(this.centre() * rand(0.8, 1.25), now, 0.03);
      }
    }
    if (this.draining && this.drain) {
      this.untilBloop -= dt;
      if (this.untilBloop <= 0) {
        this.untilBloop = rand(0.15, 0.7);
        bloop(ctx, this.drain, rand(140, 320), 0.35);
      }
    }
    if (this.options.drips && !this.running && this.master) {
      this.untilDrop -= dt;
      if (this.untilDrop > 0) return;
      this.untilDrop = rand(3.5, 9);
      const pitch = rand(900, 1400);
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(pitch, now);
      osc.frequency.exponentialRampToValueAtTime(pitch * 2.2, now + 0.06);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  }

  private centre(): number {
    return 2200 - 1300 * this.depth;
  }
}

/**
 * A WC: the button's click, the rush of the cistern emptying (loud, its brightness falling), a
 * gurgle as the bowl clears, then the refill valve's hiss until the float shuts it with a soft thunk.
 * `flush()` schedules the whole of it; `FLUSH_SECONDS` long.
 */
export class ToiletFlush extends Voice {
  private burst: AudioBuffer | null = null;

  constructor() {
    super(0.75);
  }

  protected build(ctx: AudioContext): void {
    this.burst = this.noise(ctx, FLUSH_SECONDS);
  }

  flush(): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || !this.burst) return;
    const t = ctx.currentTime;

    // The button.
    noiseBand(ctx, out, this.burst, { at: t, frequency: 2600, q: 5, peak: 0.4, attack: 0.002, hold: 0, release: 0.03 });

    // The rush: a lowpass sweeping down from a bright gush to a drain's roar.
    const rush = ctx.createBufferSource();
    rush.buffer = this.burst;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(3200, t + 0.1);
    low.frequency.exponentialRampToValueAtTime(500, t + 2.8);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.9, t + 0.35);
    gain.gain.setValueAtTime(0.9, t + 1.4);
    gain.gain.exponentialRampToValueAtTime(0.03, t + 3.2);
    gain.gain.linearRampToValueAtTime(0, t + 3.4);
    rush.connect(low).connect(gain).connect(out);
    rush.start(t + 0.05);
    rush.stop(t + 3.5);

    // The bowl clearing its throat.
    for (let i = 0; i < 5; i++) bloopAt(ctx, out, t + 2.3 + i * rand(0.12, 0.25), rand(120, 260), 0.3);

    // The refill: a thin hiss through the valve, then its thunk.
    const end = FLUSH_SECONDS - 0.4;
    noiseBand(ctx, out, this.burst, { at: t + 2.9, frequency: 3400, q: 1.4, peak: 0.12, attack: 0.5, hold: end - 3.6, release: 0.2 });
    bloopAt(ctx, out, t + end, 90, 0.25);
  }
}

/** A burst of band-passed noise with an attack, a hold and a release (s). */
function noiseBand(
  ctx: AudioContext,
  out: AudioNode,
  buffer: AudioBuffer,
  { at, frequency, q, peak, attack, hold, release }: { at: number; frequency: number; q: number; peak: number; attack: number; hold: number; release: number },
): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = frequency;
  band.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.setValueAtTime(peak, at + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  source.connect(band).connect(gain).connect(out);
  source.start(at);
  source.stop(at + attack + hold + release + 0.05);
}

/** An air bubble through water: a short sine, its pitch rising. */
function bloop(ctx: AudioContext, out: AudioNode, pitch: number, level: number): void {
  bloopAt(ctx, out, ctx.currentTime, pitch, level);
}

function bloopAt(ctx: AudioContext, out: AudioNode, at: number, pitch: number, level: number): void {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(pitch, at);
  osc.frequency.exponentialRampToValueAtTime(pitch * 1.8, at + 0.08);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + 0.15);
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
