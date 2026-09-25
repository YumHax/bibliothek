import { audioContext } from './audioContext';

/**
 * A small sound a room makes on its own (the fridge's hum, a clock's tick, a dripping tap),
 * synthesised, never a sample. `setLevel` is the loudness where the listener stands (0..1, distance
 * and walls already applied by `PointSound`); `update` schedules what repeats. Nothing is built
 * before the level first rises above 0 and the page has had a user gesture (a context cannot start
 * without one), so a room nobody walks into costs nothing.
 */
export interface AmbientVoice {
  setLevel(level: number): void;
  update(dt: number): void;
  dispose(): void;
}

/** Time constant (s) of the level following the listener. */
const FOLLOW = 0.15;
/**
 * A voice nobody has set for this long falls silent: its room left the loop (the player went out
 * of the flat), so nothing will ever tell it the listener is gone.
 */
const STALE_MS = 500;

/** Shared plumbing: a master gain into the speakers, built on first need. Exported for voices kept in their own file (`water.ts`). */
export abstract class Voice implements AmbientVoice {
  protected ctx: AudioContext | null = null;
  protected master: GainNode | null = null;
  protected level = 0;
  private failed = false;
  private lastSet = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly peak: number) {}

  setLevel(level: number): void {
    this.lastSet = performance.now();
    this.level = Math.max(0, Math.min(1, level));
    if (this.level > 0) this.ensure();
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level * this.peak, this.ctx.currentTime, FOLLOW);
  }

  update(dt: number): void {
    if (this.ctx && this.level > 0) this.tick(this.ctx, dt);
  }

  dispose(): void {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    this.master?.disconnect();
    this.master = null;
    this.ctx = null;
    this.failed = true;
  }

  /** Builds the graph once the context may run; false until then. */
  private ensure(): boolean {
    if (this.ctx) return true;
    if (this.failed || !userHasInteracted()) return false;
    try {
      const ctx = audioContext();
      if (ctx.state !== 'running') return false;
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);
      this.build(ctx, this.master);
      this.watchdog = setInterval(() => {
        if (this.level > 0 && performance.now() - this.lastSet > STALE_MS) this.setLevel(0);
      }, STALE_MS);
      return true;
    } catch (err) {
      console.warn('[ambient]', err);
      this.failed = true;
      return false;
    }
  }

  /** The continuous part of the sound, into `out`. */
  protected abstract build(ctx: AudioContext, out: GainNode): void;
  /** What repeats (a tick, a drop), while audible. */
  protected tick(_ctx: AudioContext, _dt: number): void {}

  protected noise(ctx: AudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}

/**
 * A fridge: the compressor's low hum (mains harmonics and a rumble of filtered noise) running for
 * a minute or so, then resting about as long, easing in and out; a faint relay click at each switch.
 */
export class FridgeHum extends Voice {
  private running = true;
  private cycleLeft = rand(30, 70);
  private motor: GainNode | null = null;

  constructor() {
    super(0.5);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    this.motor = ctx.createGain();
    this.motor.gain.value = this.running ? 1 : 0;
    this.motor.connect(out);
    for (const [frequency, level] of [
      [50, 0.05],
      [100, 0.08],
      [150, 0.02],
      [200, 0.012],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(this.motor);
      osc.start();
    }
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noise(ctx, 2);
    rumble.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    rumble.connect(low).connect(gain).connect(this.motor);
    rumble.start();
  }

  protected tick(ctx: AudioContext, dt: number): void {
    this.cycleLeft -= dt;
    if (this.cycleLeft > 0 || !this.motor) return;
    this.running = !this.running;
    this.cycleLeft = this.running ? rand(50, 90) : rand(30, 60);
    this.motor.gain.setTargetAtTime(this.running ? 1 : 0, ctx.currentTime, this.running ? 0.6 : 1.2);
    click(ctx, this.master!, 1800, 0.12, this.noise(ctx, 0.03));
  }
}

/** A wall clock's escapement: a tick every second, the tock a little lower. */
export class ClockTick extends Voice {
  private untilNext = Math.random();
  private tock = false;
  private burst: AudioBuffer | null = null;

  constructor() {
    super(0.35);
  }

  protected build(ctx: AudioContext): void {
    this.burst = this.noise(ctx, 0.02);
  }

  protected tick(ctx: AudioContext, dt: number): void {
    this.untilNext -= dt;
    if (this.untilNext > 0 || !this.burst || !this.master) return;
    this.untilNext += 1;
    if (this.untilNext < 0) this.untilNext = 1; // the tab slept: no burst of catch-up ticks
    this.tock = !this.tock;
    click(ctx, this.master, this.tock ? 2600 : 3400, 0.5, this.burst);
  }
}

/** A tap that does not quite shut: a drop into the basin every few seconds, a short rising "plink". */
export class TapDrip extends Voice {
  private untilNext = rand(2, 6);

  constructor() {
    super(0.3);
  }

  protected build(): void {}

  protected tick(ctx: AudioContext, dt: number): void {
    this.untilNext -= dt;
    if (this.untilNext > 0 || !this.master) return;
    this.untilNext = rand(3.5, 9);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const pitch = rand(900, 1400);
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 2.2, now + 0.06);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.4, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}

/** A short band-passed noise click (a relay, an escapement). */
function click(ctx: AudioContext, out: AudioNode, frequency: number, level: number, burst: AudioBuffer): void {
  const now = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = burst;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = frequency;
  band.Q.value = 4;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
  source.connect(band).connect(gain).connect(out);
  source.start(now);
}

/** Whether the page has had a gesture, so an AudioContext may start (`navigator.userActivation`, where the browser has it). */
function userHasInteracted(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : true;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
