import { Voice, type AmbientVoice } from './ambient';
import { RadioTune } from './RadioTune';
import { noiseBurst, rand, tone } from './synth';

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
    if (this.ctx && this.master && this.burst) noiseBurst(this.ctx, this.master, this.ctx.currentTime, { band: 1500, q: 3, level: 1.2, length: 0.025, attack: 0, floor: 0.0001, noise: this.burst, offset: 0 });
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

  protected override tick(ctx: AudioContext, dt: number): void {
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
    noiseBurst(this.ctx, this.master, this.ctx.currentTime, { band: 600, q: 3, level: 1.2, length: 0.025, attack: 0, floor: 0.0001, noise: this.burst, offset: 0 });
    tone(this.ctx, this.master, this.ctx.currentTime, { frequency: 140, toRatio: 0.5, glide: 0.08, level: 0.35, length: 0.1, attack: 0, floor: 0.0001 });
  }

  setTicking(ticking: boolean): void {
    this.ticking = ticking;
  }

  pop(): void {
    this.ticking = false;
    if (!this.ctx || !this.master || !this.burst) return;
    noiseBurst(this.ctx, this.master, this.ctx.currentTime, { band: 2200, q: 3, level: 1.4, length: 0.025, attack: 0, floor: 0.0001, noise: this.burst, offset: 0 });
    noiseBurst(this.ctx, this.master, this.ctx.currentTime, { band: 900, q: 3, level: 0.8, length: 0.025, attack: 0, floor: 0.0001, noise: this.burst, offset: 0 });
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

  protected override tick(ctx: AudioContext, dt: number): void {
    if (!this.ticking || !this.master || !this.burst) return;
    this.untilTick -= dt;
    if (this.untilTick > 0) return;
    this.untilTick = Math.max(0.05, this.untilTick + 0.22);
    noiseBurst(ctx, this.master, ctx.currentTime, { band: 3800, q: 3, level: 0.35, length: 0.025, attack: 0, floor: 0.0001, noise: this.burst, offset: 0 });
  }
}

/** Nobody has levelled the radio for this long: its room left the loop, so it falls silent. */
const RADIO_STALE_MS = 500;

/**
 * A kitchen radio: the `RadioTune` easy-listening station, levelled like any room sound. The
 * set switches it with `setOn` (a click, so the audio context may start); the `PointSound` sets
 * the level from the distance and the walls.
 */
export class RadioVoice implements AmbientVoice {
  private readonly tune = new RadioTune();
  private lastSet = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private unduck: ReturnType<typeof setTimeout> | null = null;

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

  setSpatial(pan: number, walls: number): void {
    this.tune.setSpatial(pan, walls);
  }

  /** The station's jingle, then the music ducked under the announcer for `seconds` (a chronicle being read). */
  announce(seconds: number): void {
    if (!this.tune.isOn) return;
    this.tune.jingle();
    this.tune.duck(true);
    if (this.unduck !== null) clearTimeout(this.unduck);
    this.unduck = setTimeout(() => {
      this.unduck = null;
      this.tune.duck(false);
    }, seconds * 1000);
  }

  update(): void {
    this.tune.update();
  }

  dispose(): void {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    if (this.unduck !== null) clearTimeout(this.unduck);
    this.unduck = null;
    this.tune.dispose();
  }
}

