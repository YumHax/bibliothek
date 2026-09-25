import { Voice, type AmbientVoice } from './ambient';
import { RadioTune } from './RadioTune';

/*
 * The kitchen's appliances, synthesised like the room's other sounds (`ambient.ts`): each is an
 * `AmbientVoice` a `PointSound` places and levels, and the appliance that owns it says what it is
 * doing (boiling, ticking, playing). Nothing sounds before the page's first gesture; a click on
 * the appliance is one.
 */

/**
 * An electric kettle coming to the boil: a hiss of filtered noise that rises in pitch and
 * loudness, a rumble of bubbles that grows busier, then the thermostat's click as it switches off
 * and the boil dying away. The kettle sets `progress` (0 cold .. 1 boiling) while it runs.
 */
export class KettleBoil extends Voice {
  private progress = 0;
  private running = false;
  private hiss: BiquadFilterNode | null = null;
  private body: GainNode | null = null;
  private burst: AudioBuffer | null = null;
  private untilBubble = 0;

  constructor() {
    super(0.55);
  }

  /** Switched on (true) or off; `progress` is how close to the boil it is, 0..1. */
  setBoiling(running: boolean, progress: number): void {
    this.running = running;
    this.progress = Math.max(0, Math.min(1, progress));
    const ctx = this.ctx;
    if (!ctx || !this.hiss || !this.body) return;
    const p = this.progress;
    this.hiss.frequency.setTargetAtTime(350 + 2600 * p * p, ctx.currentTime, 0.3);
    this.body.gain.setTargetAtTime(running ? 0.05 + 0.5 * p : 0, ctx.currentTime, running ? 0.4 : 0.5);
  }

  /** The thermostat letting go: one sharp plastic click. */
  switchOff(): void {
    this.setBoiling(false, this.progress);
    if (this.ctx && this.master && this.burst) click(this.ctx, this.master, 1500, 1.2, this.burst);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    this.burst = this.noise(ctx, 0.04);
    this.body = ctx.createGain();
    this.body.gain.value = 0;
    this.body.connect(out);
    const source = this.loop(ctx, this.noise(ctx, 2));
    this.hiss = ctx.createBiquadFilter();
    this.hiss.type = 'bandpass';
    this.hiss.Q.value = 0.7;
    source.connect(this.hiss).connect(this.body);
    this.setBoiling(this.running, this.progress);
  }

  protected tick(ctx: AudioContext, dt: number): void {
    if (!this.running || !this.master) return;
    this.untilBubble -= dt;
    if (this.untilBubble > 0) return;
    // Bubbles: rare low blips at first, a busy patter near the boil.
    const p = this.progress;
    this.untilBubble = rand(0.02, 0.5) * (1.1 - p);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const pitch = rand(180, 420) * (1 + p);
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.8, now + 0.03);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05 + 0.12 * p, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.06);
  }
}

/**
 * A pop-up toaster: the clunk of the lever going down, the timer's quick clockwork ticking while
 * it toasts, and the spring throwing the slices up with a bright clack. The toaster calls
 * `press`, `setTicking` and `pop`.
 */
export class ToasterSound extends Voice {
  private ticking = false;
  private untilTick = 0;
  private burst: AudioBuffer | null = null;

  constructor() {
    super(0.5);
  }

  press(): void {
    if (!this.ctx || !this.master || !this.burst) return;
    click(this.ctx, this.master, 600, 1.2, this.burst);
    thump(this.ctx, this.master, 140, 0.35);
  }

  setTicking(ticking: boolean): void {
    this.ticking = ticking;
  }

  pop(): void {
    this.ticking = false;
    if (!this.ctx || !this.master || !this.burst) return;
    click(this.ctx, this.master, 2200, 1.4, this.burst);
    click(this.ctx, this.master, 900, 0.8, this.burst);
    // The spring's short twang.
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.25);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  protected build(ctx: AudioContext): void {
    this.burst = this.noise(ctx, 0.03);
  }

  protected tick(ctx: AudioContext, dt: number): void {
    if (!this.ticking || !this.master || !this.burst) return;
    this.untilTick -= dt;
    if (this.untilTick > 0) return;
    this.untilTick = Math.max(0.05, this.untilTick + 0.22);
    click(ctx, this.master, 3800, 0.35, this.burst);
  }
}

/** Nobody has levelled the radio for this long: its room left the loop, so it falls silent. */
const RADIO_STALE_MS = 500;

/**
 * A kitchen radio: the `RadioTune` stream of forgettable pop, levelled like any room sound. The
 * set switches it with `setOn` (a click, so the audio context may start); the `PointSound` sets
 * the level from the distance and the walls.
 */
export class RadioVoice implements AmbientVoice {
  private readonly tune = new RadioTune();
  private lastSet = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  get isOn(): boolean {
    return this.tune.isOn;
  }

  setOn(on: boolean): void {
    this.tune.setOn(on);
    if (on && this.watchdog === null) {
      this.watchdog = setInterval(() => {
        if (performance.now() - this.lastSet > RADIO_STALE_MS) this.tune.setVolume(0);
      }, RADIO_STALE_MS);
    }
  }

  setLevel(level: number): void {
    this.lastSet = performance.now();
    this.tune.setVolume(level);
  }

  update(): void {
    this.tune.update();
  }

  dispose(): void {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    this.tune.dispose();
  }
}

/** A short band-passed noise click (a thermostat, a lever, a timer). */
function click(ctx: AudioContext, out: AudioNode, frequency: number, level: number, burst: AudioBuffer): void {
  const now = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = burst;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = frequency;
  band.Q.value = 3;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
  source.connect(band).connect(gain).connect(out);
  source.start(now);
}

/** A low, dull knock (a lever hitting its stop). */
function thump(ctx: AudioContext, out: AudioNode, frequency: number, level: number): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(frequency, now);
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.5, now + 0.08);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  osc.connect(gain).connect(out);
  osc.start(now);
  osc.stop(now + 0.12);
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
