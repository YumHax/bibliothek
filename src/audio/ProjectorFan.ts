import { Voice } from './ambient';

/** Seconds for the fan to come up to speed, and to wind down after the lamp goes off. */
const SPIN_UP_S = 0.8;
const WIND_DOWN_S = 3;
/** Blade-pass tone at full speed (Hz); the hum and the air's hiss follow the speed down. */
const BLADE_HZ = 180;
const AIR_HZ = 900;

/**
 * A projector's cooling fan: a soft hum of moving air with the faint tone of its blades, heard
 * while the lamp is on and winding down (lower, then gone) for a few seconds after it goes off.
 * An `AmbientVoice` for a `PointSound`: the distance sets the level, `setRunning` the speed.
 */
export class ProjectorFan extends Voice {
  private running = false;
  /** 0 still .. 1 full speed. */
  private spin = 0;
  /** The level the `PointSound` last set (distance and walls), before the speed. */
  private where = 0;
  private blade: OscillatorNode | null = null;
  private air: BiquadFilterNode | null = null;

  constructor() {
    super(0.16);
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  override setLevel(level: number): void {
    this.where = level;
    super.setLevel(level * this.spin);
  }

  override update(dt: number): void {
    const target = this.running ? 1 : 0;
    if (this.spin !== target) {
      this.spin = this.running ? Math.min(1, this.spin + dt / SPIN_UP_S) : Math.max(0, this.spin - dt / WIND_DOWN_S);
      super.setLevel(this.where * this.spin);
    }
    super.update(dt);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    this.air = ctx.createBiquadFilter();
    this.air.type = 'bandpass';
    this.air.Q.value = 0.5;
    this.air.frequency.value = AIR_HZ;
    this.loop(ctx, this.noise(ctx, 2)).connect(this.air).connect(out);

    this.blade = this.keep(ctx.createOscillator());
    this.blade.type = 'triangle';
    this.blade.frequency.value = BLADE_HZ;
    const bladeLevel = ctx.createGain();
    bladeLevel.gain.value = 0.08;
    this.blade.connect(bladeLevel).connect(out);
  }

  /** The pitch follows the speed: a fan winding down drops as it slows. */
  protected override tick(ctx: AudioContext): void {
    const speed = 0.35 + 0.65 * this.spin;
    this.blade?.frequency.setTargetAtTime(BLADE_HZ * speed, ctx.currentTime, 0.1);
    this.air?.frequency.setTargetAtTime(AIR_HZ * speed, ctx.currentTime, 0.1);
  }
}
