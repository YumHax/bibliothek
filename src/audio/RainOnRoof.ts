import { Voice } from './ambient';
import { whiteNoise } from './noise';

/** Loudness of a downpour at level 1 (linear). */
const MASTER = 0.09;
/** The roar: noise through a broad band, the drumming on the roof light higher up. */
const ROAR = { frequency: 900, q: 0.6 };
const PATTER = { frequency: 3200, q: 1.2, level: 0.45 };
/** Drops: short clicks on the glass, this many a second at level 1. */
const DROPS_PER_SECOND = 14;
const SMOOTH = 1.5;

/**
 * Rain on a big roof, heard from inside a hall: a broad band of noise (the roar), a brighter one
 * (the patter on the roof light) and single drops ticking on the glass. Generated, no samples.
 * `setLevel` follows how hard it rains (0 dry .. 1 a downpour; eased, set only when it changes);
 * `update` places the drops.
 */
export class RainOnRoof extends Voice {
  private dropBus: GainNode | null = null;
  private nextDrop = 0;

  constructor() {
    super(MASTER, { follow: SMOOTH, watch: false });
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const noise = whiteNoise(ctx, 3);
    for (const { frequency, q, level } of [{ ...ROAR, level: 1 }, PATTER]) {
      const source = this.loop(ctx, noise);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = frequency;
      band.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = level;
      source.connect(band).connect(gain).connect(out);
    }
    const drops = ctx.createGain();
    drops.gain.value = 0.6;
    drops.connect(out);
    this.dropBus = drops;
  }

  protected tick(ctx: AudioContext, dt: number): void {
    if (!this.dropBus || this.level < 0.05) return;
    this.nextDrop -= dt;
    while (this.nextDrop <= 0) {
      this.nextDrop += (0.3 + Math.random() * 1.4) / (DROPS_PER_SECOND * this.level);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 1800 + Math.random() * 2600;
      const env = ctx.createGain();
      const t = ctx.currentTime + Math.random() * 0.05;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.1 + Math.random() * 0.25, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
      osc.connect(env).connect(this.dropBus);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }
}
