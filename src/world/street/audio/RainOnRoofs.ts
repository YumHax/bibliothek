import type * as THREE from 'three';
import type { SoundGraph } from './soundGraph';
import { random } from '@/random';
import { damp } from '@/math/damp';

/** Drops a second on a roof overhead at full rain; drips off its edge a second. */
const DROPS = 28;
const DRIPS = 2.5;
/** Half the drumming at this many metres from a shelter's edge. */
const HALF_AT = 2.2;

/**
 * The rain on what keeps it off (the awnings, the bus shelter's roof, the kiosk's, the sas's
 * porch: `Precipitation`'s shelters, zone-local boxes): standing under one, the hiss of the open
 * street gives way to the drops drumming on the canvas or the glass overhead, drips falling off
 * its edge; walking by one, its drumming a little. `under` tells the street's hiss how much to
 * give way. Nothing while it is dry.
 */
export class RainOnRoofs {
  private roof: BiquadFilterNode | null = null;
  private drip: GainNode | null = null;
  private dripClock = 0;
  /** 0 out in the open .. 1 under a roof. */
  under = 0;

  constructor(private readonly shelters: readonly THREE.Box3[]) {}

  /** The graph's filters (again after the graph is rebuilt). */
  build(g: SoundGraph): void {
    this.roof = g.filter('bandpass', 1100, 0.9);
    const roofGain = g.gain(1);
    this.roof.connect(roofGain).connect(g.master);
    this.drip = g.gain(1);
    this.drip.connect(g.master);
  }

  update(dt: number, g: SoundGraph, rain: number, ear: THREE.Vector3): void {
    let nearest = Infinity;
    let inside = false;
    for (const box of this.shelters) {
      const dx = Math.max(box.min.x - ear.x, 0, ear.x - box.max.x);
      const dz = Math.max(box.min.z - ear.z, 0, ear.z - box.max.z);
      const d = Math.hypot(dx, dz);
      if (d === 0 && ear.y < box.max.y + 0.6) inside = true;
      nearest = Math.min(nearest, d);
    }
    this.under = damp(this.under, inside ? 1 : 0, 3, dt);
    const roof = this.roof;
    if (!roof || rain < 0.02 || !Number.isFinite(nearest)) return;
    const level = rain * (inside ? 1 : 0.6 / (1 + (nearest / HALF_AT) ** 2));
    if (level < 0.01) return;
    // The drops on the roof: short taps, a different pitch each (canvas thuds, glass ticks).
    const count = poisson(DROPS * rain * dt);
    for (let i = 0; i < count; i++) {
      const at = g.now + 0.02 + random() * dt;
      g.burst(roof, at, 0.015 + random() * 0.02, (0.05 + random() * 0.06) * level);
    }
    // Drips off the edge, close by only.
    if (nearest > 3 && !inside) return;
    this.dripClock -= dt;
    if (this.dripClock > 0 || !this.drip) return;
    this.dripClock = random() * (2 / DRIPS);
    const at = g.now + 0.02;
    const osc = g.ctx.createOscillator();
    const f = 900 + random() * 1400;
    osc.frequency.setValueAtTime(f, at);
    osc.frequency.exponentialRampToValueAtTime(f * 1.8, at + 0.04);
    const env = g.gain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.03 * level, at + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    osc.connect(env).connect(this.drip);
    osc.start(at);
    osc.stop(at + 0.08);
  }

  reset(): void {
    this.roof = null;
    this.drip = null;
  }
}

/** A Poisson draw with mean `mean` (small means: Knuth's). */
function poisson(mean: number): number {
  if (mean <= 0) return 0;
  const limit = Math.exp(-mean);
  let k = 0;
  let p = random();
  while (p > limit && k < 12) {
    k++;
    p *= random();
  }
  return k;
}
