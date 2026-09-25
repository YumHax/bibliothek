import { audioBus, audioContext, type AudioChannel } from './audioContext';
import { whiteNoise } from './noise';

/**
 * A small sound a room makes on its own (the fridge's hum, a clock's tick, a dripping tap),
 * synthesised, never a sample. `setLevel` is the loudness where the listener stands (0..1, distance
 * and walls already applied by `PointSound`); `update` schedules what repeats. Nothing is built
 * before the level first rises to audible and the page has had a user gesture (a context cannot
 * start without one), so a room nobody walks into costs nothing.
 */
export interface AmbientVoice {
  setLevel(level: number): void;
  update(dt: number): void;
  dispose(): void;
  /**
   * Its zone left the engine loop (false) or came back (true), see `zone/lifecycle.ts`: silent
   * while inactive whatever the level, heard again at its level on return. A voice without it is
   * set to level 0 by its `PointSound` instead.
   */
  setZoneActive?(active: boolean): void;
}

export interface VoiceOptions {
  /** The mixer bus it plays on. Default `world`. */
  bus?: Exclude<AudioChannel, 'master'>;
  /** Time constant (s) of the level following. Default `FOLLOW`. */
  follow?: number;
  /**
   * Falls silent when nobody has set its level for `STALE_MS` (its room left the loop). Default
   * true; false for an owner that only sets the level when it changes.
   */
  watch?: boolean;
}

/** Time constant (s) of the level following the listener. */
const FOLLOW = 0.15;
/**
 * A voice nobody has set for this long falls silent: its owner stopped being ticked. A zone says so
 * at once (`setZoneActive`); this is the fallback for an owner nothing tells.
 */
const STALE_MS = 500;
/** Longest time constant (s) of the fade to silence when the voice's zone goes dormant. */
const DORMANT_FADE = 0.1;
/** Below this level (0..1) a voice is not heard: nothing is built for it. */
const AUDIBLE = 0.002;
/**
 * A voice this long below `AUDIBLE` (or six of its follow time constants, if longer) stops its
 * continuous sources and lets its graph go, rebuilt when it is heard again: the flat's rooms stay
 * loaded all session, and their fridge or radiator would otherwise loop noise behind every wall.
 */
const SUSPEND_MS = 5000;

/**
 * Shared plumbing: a master gain onto a mixer bus, built on first need, and the continuous sources
 * the voice started (`keep`, `loop`), stopped when it is let go (unheard a while, or disposed).
 * Exported for voices kept in their own file (`water.ts`, `CrowdMurmur.ts`...).
 */
export abstract class Voice implements AmbientVoice {
  protected ctx: AudioContext | null = null;
  protected master: GainNode | null = null;
  protected level = 0;
  /** Time constant (s) of the level following; a voice may change it before `setLevel`. */
  protected follow: number;
  private readonly bus: Exclude<AudioChannel, 'master'>;
  private readonly watch: boolean;
  private sources: AudioScheduledSourceNode[] = [];
  private failed = false;
  private lastSet = 0;
  private lastHeard = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /** False while its zone is dormant: silent whatever `level` says (see `setZoneActive`). */
  private zoneActive = true;

  constructor(
    private readonly peak: number,
    options: VoiceOptions = {},
  ) {
    this.bus = options.bus ?? 'world';
    this.follow = options.follow ?? FOLLOW;
    this.watch = options.watch ?? true;
  }

  setLevel(level: number): void {
    this.lastSet = performance.now();
    this.level = Math.max(0, Math.min(1, level));
    if (this.heard >= AUDIBLE) {
      this.lastHeard = this.lastSet;
      this.ensure();
    }
    this.applyLevel();
  }

  update(dt: number): void {
    // Heard but not built yet (the context was still starting when the level was set): try again.
    if (!this.ctx && this.heard >= AUDIBLE && this.ensure()) this.applyLevel();
    if (this.ctx && this.heard > 0) this.tick(this.ctx, dt);
  }

  /**
   * Dormant zone: fades out quickly and stays silent, whatever the owner set, so an owner that is
   * no longer ticked cannot leave it sounding; unheard, its sources are let go as usual. Back in
   * the loop, it is heard again at the level it was last given.
   */
  setZoneActive(active: boolean): void {
    if (active === this.zoneActive) return;
    this.zoneActive = active;
    if (active && this.heard >= AUDIBLE) {
      this.lastHeard = performance.now();
      this.ensure();
    }
    this.applyLevel(active ? this.follow : Math.min(this.follow, DORMANT_FADE));
  }

  /** What is heard: the level, or nothing while the zone is dormant. */
  private get heard(): number {
    return this.zoneActive ? this.level : 0;
  }

  dispose(): void {
    this.release();
    this.failed = true;
  }

  /** The continuous part of the sound, into `out`; run again after the voice was let go. */
  protected abstract build(ctx: AudioContext, out: GainNode): void;
  /** What repeats (a tick, a drop), while audible. */
  protected tick(_ctx: AudioContext, _dt: number): void {}

  /** `seconds` of the shared white noise (`noise.ts`). */
  protected noise(ctx: AudioContext, seconds: number): AudioBuffer {
    return whiteNoise(ctx, seconds);
  }

  /** Starts `source` (an oscillator that runs as long as the voice) now; stopped when the voice is let go. */
  protected keep<T extends AudioScheduledSourceNode>(source: T): T {
    source.start();
    this.sources.push(source);
    return source;
  }

  /** A looping source of `buffer`, started at a random point (beds sharing a buffer never line up); stopped when the voice is let go. */
  protected loop(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start(0, Math.random() * buffer.duration);
    this.sources.push(source);
    return source;
  }

  private applyLevel(timeConstant = this.follow): void {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.heard * this.peak, this.ctx.currentTime, timeConstant);
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
      this.master.connect(audioBus(ctx, this.bus));
      this.build(ctx, this.master);
      this.lastHeard = performance.now();
      if (this.watch || this.sources.length > 0) this.watchdog = setInterval(() => this.check(), STALE_MS);
      return true;
    } catch (err) {
      console.warn('[ambient]', err);
      this.release();
      this.failed = true;
      return false;
    }
  }

  /** Every `STALE_MS`: silences a voice nobody sets any more, lets go of one unheard for a while. */
  private check(): void {
    const now = performance.now();
    if (this.watch && this.level > 0 && now - this.lastSet > STALE_MS) this.setLevel(0);
    if (this.heard >= AUDIBLE) this.lastHeard = now;
    else if (this.sources.length > 0 && now - this.lastHeard > Math.max(SUSPEND_MS, 6000 * this.follow)) this.release();
  }

  /** Stops the continuous sources and drops the graph; the next audible level builds it afresh. */
  private release(): void {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources = [];
    this.master?.disconnect();
    this.master = null;
    this.ctx = null;
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
      this.keep(osc);
    }
    const rumble = this.loop(ctx, this.noise(ctx, 2));
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    rumble.connect(low).connect(gain).connect(this.motor);
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
