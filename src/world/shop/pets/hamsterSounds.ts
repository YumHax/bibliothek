import { Voice } from '@/audio/ambient';

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/**
 * The hamster in its cage: the wheel's axle squeaking round while it runs (`setRunning`, driven by `HamsterCage`, so
 * what is heard is what is seen), and between runs a rustle in the shavings now and then. Synthesised like the shop's
 * other voices (`shopSounds`).
 */
export class HamsterVoice extends Voice {
  private running = false;
  private untilSqueak = 0;
  private untilRustle = rand(3, 8);

  constructor() {
    super(0.28);
  }

  setRunning(on: boolean): void {
    this.running = on;
  }

  protected build(): void {}

  protected tick(ctx: AudioContext, dt: number): void {
    if (!this.master) return;
    if (this.running) {
      this.untilSqueak -= dt;
      if (this.untilSqueak <= 0) {
        this.untilSqueak = rand(0.3, 0.38);
        this.squeak(ctx, this.master);
      }
      return;
    }
    this.untilRustle -= dt;
    if (this.untilRustle > 0) return;
    this.untilRustle = rand(4, 12);
    this.rustle(ctx, this.master);
  }

  /** The axle: a short dry squeak with a little bend. */
  private squeak(ctx: AudioContext, out: AudioNode): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(rand(1900, 2200), now);
    osc.frequency.linearRampToValueAtTime(rand(2300, 2600), now + 0.07);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(env).connect(out);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Scrabbling in the shavings: a few bursts of dry, high noise. */
  private rustle(ctx: AudioContext, out: AudioNode): void {
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 2500;
    high.connect(out);
    let at = ctx.currentTime + 0.02;
    const bursts = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < bursts; i++) {
      const source = ctx.createBufferSource();
      source.buffer = this.noise(ctx, 0.08);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(rand(0.05, 0.12), at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, at + rand(0.04, 0.08));
      source.connect(env).connect(high);
      source.start(at);
      at += rand(0.06, 0.16);
    }
  }
}
