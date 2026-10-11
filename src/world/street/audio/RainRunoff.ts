import * as THREE from 'three';
import { FRONT, PARK_STREET } from '@/world/measures/street';
import { DRAINS } from '../details/drains';
import type { SpatialOut } from '@/audio/spatial';
import { poisson } from './RainOnRoofs';
import type { SoundGraph } from './soundGraph';
import type { StreetEar } from './streetEar';
import { falloff } from './streetEar';
import { random } from '@/random';
import { damp } from '@/math/damp';

/** What the rain leaves running: the gutters from this wetness, a drain's gurgle this often (s) when one is close. */
const GUTTER = { from: 0.3, halfAt: 2.2, level: 0.12 };
const GURGLE = { every: [1.2, 4] as const, within: 9 };
/** Rain on a parked car's roof: drops a second at full rain, heard from this close. */
const CAR_ROOF = { drops: 26, within: 6, halfAt: 2 };
/** How fast a glug and a drop's ping strike (s). */
const STRIKE = { glug: 0.008, ping: 0.002 };

/** Where cars stand parked now: the nearest within `within` metres of (x, z), zone-local, into `out`. */
export interface ParkedNow {
  nearestParked(x: number, z: number, within: number, out: THREE.Vector2): boolean;
}

/**
 * The rain where it lands and runs (the street's own, beside the open hiss and the shelters' drumming): water running
 * in the gutter along the nearest kerb while the street is wet, swelling with the rain and lasting after it; a drain
 * gurgling and glugging now and then near one; drops ticking on the roofs and bonnets of the parked cars close by.
 * Positional through the street's ear (`StreetEar`): the gutter from the kerb beside the listener.
 */
export class RainRunoff {
  private gutter: { gain: GainNode; band: BiquadFilterNode; leg: SpatialOut } | null = null;
  private gurgleClock = 2;
  private gutterLevel = 0;
  private readonly kerb = new THREE.Vector3();
  private readonly drain = new THREE.Vector3();
  private readonly car = new THREE.Vector3();
  private readonly world = new THREE.Vector3();
  private readonly bay = new THREE.Vector2();

  /** `parked`: the bays a car stands in now (`StreetCars`); none, no drops on cars. */
  constructor(private readonly parked: ParkedNow | null = null) {}

  /** The gutter's running water (again after the graph is rebuilt). */
  build(g: SoundGraph): void {
    const leg = g.leg();
    const gain = g.gain();
    const band = g.filter('bandpass', 1700, 1.6);
    g.loop().connect(band).connect(gain).connect(leg.input);
    // The trickle's bubbling: a second band, wobbling.
    const bubble = g.filter('bandpass', 2600, 6);
    const bubbleGain = g.gain(0.5);
    const wobble = g.oscillator('sine', 3.3);
    wobble.connect(g.gain(500)).connect(bubble.frequency);
    g.loop().connect(bubble).connect(bubbleGain).connect(gain);
    this.gutter = { gain, band, leg };
  }

  reset(): void {
    this.gutter = null;
  }

  /** `local`: the ears, zone-local; `toWorld` takes a zone-local point to the world (the ear works in world space). */
  update(dt: number, g: SoundGraph, sky: { rain: number; wetness: number; snowCover: number }, local: THREE.Vector3, ear: StreetEar, toWorld: (v: THREE.Vector3) => THREE.Vector3): void {
    const now = g.now;
    const running = sky.snowCover > 0.5 ? 0 : THREE.MathUtils.smoothstep(sky.wetness, GUTTER.from, 0.9) * (0.4 + 0.6 * Math.min(1, sky.rain * 2));
    this.gutterLevel = damp(this.gutterLevel, running, 0.5, dt);
    const kerb = nearestKerb(local, this.kerb);
    const d = kerb ? Math.hypot(kerb.x - local.x, kerb.z - local.z) : Infinity;
    const gutter = this.gutter;
    if (gutter && kerb) {
      const side = ear.spatial(toWorld(this.world.copy(kerb)));
      gutter.leg.set(side.pan, side.walls, false, side.rear ?? 0);
      gutter.gain.gain.setTargetAtTime(GUTTER.level * this.gutterLevel * falloff(d, GUTTER.halfAt), now, 0.4);
      gutter.band.frequency.setTargetAtTime(1300 + 900 * this.gutterLevel, now, 1);
    } else gutter?.gain.gain.setTargetAtTime(0, now, 0.4);
    if (this.gutterLevel > 0.05) this.gurgle(dt, g, local, ear, toWorld);
    if (sky.rain > 0.05 && sky.snowCover < 0.5) this.onCars(dt, g, sky.rain, local, ear, toWorld);
  }

  /** A drain near the listener swallowing the gutter's water: glugs and a hollow gurgle. */
  private gurgle(dt: number, g: SoundGraph, local: THREE.Vector3, ear: StreetEar, toWorld: (v: THREE.Vector3) => THREE.Vector3): void {
    this.gurgleClock -= dt;
    if (this.gurgleClock > 0) return;
    this.gurgleClock = GURGLE.every[0] + random() * (GURGLE.every[1] - GURGLE.every[0]);
    // The nearest grate the street lays (`details/drains`, jittered along both streets' kerbs).
    let d = Infinity;
    for (const drain of DRAINS) {
      const dd = Math.hypot(drain.at[0] - local.x, drain.at[1] - local.z);
      if (dd < d) {
        d = dd;
        this.drain.set(drain.at[0], 0, drain.at[1]);
      }
    }
    if (d > GURGLE.within) return;
    const level = this.gutterLevel * falloff(d, 2.5);
    const out = g.shot(ear.spatial(toWorld(this.world.copy(this.drain))), 1.6);
    const t = g.now + 0.02;
    // Bubbles of air coming up through the grate: quick sine chirps, low and hollow, two to five.
    const glugs = 2 + Math.floor(random() * 4);
    for (let i = 0; i < glugs; i++) {
      const at = t + i * (0.08 + random() * 0.12);
      const osc = g.ctx.createOscillator();
      const f = 180 + random() * 260;
      osc.frequency.setValueAtTime(f, at);
      osc.frequency.exponentialRampToValueAtTime(f * (1.6 + random() * 0.8), at + 0.06);
      const env = g.gain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.09 * level, at + STRIKE.glug);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + 0.1);
    }
    const hollow = g.filter('bandpass', 420, 3);
    hollow.connect(out);
    g.shaped(hollow, t, [[0.1, 0.2 * level], [0.5, 0.06 * level], [0.8, 0]]);
    window.setTimeout(() => hollow.disconnect(), 2000); // convention-ok: audio
  }

  /** Drops ticking on the nearest parked car: metal pings on the roof, duller on the glass. */
  private onCars(dt: number, g: SoundGraph, rain: number, local: THREE.Vector3, ear: StreetEar, toWorld: (v: THREE.Vector3) => THREE.Vector3): void {
    // The cars standing in their bays now (one may have pulled out since the morning, another parked).
    if (!this.parked?.nearestParked(local.x, local.z, CAR_ROOF.within, this.bay)) return;
    this.car.set(this.bay.x, 1.4, this.bay.y);
    const best = Math.hypot(this.bay.x - local.x, this.bay.y - local.z);
    const count = poisson(CAR_ROOF.drops * rain * dt);
    if (count === 0) return;
    const level = falloff(best, CAR_ROOF.halfAt);
    const out = g.shot(ear.spatial(toWorld(this.world.copy(this.car))), dt + 0.3);
    for (let i = 0; i < count; i++) {
      const at = g.now + 0.02 + random() * dt;
      const glass = random() < 0.3;
      const ping = g.ctx.createOscillator();
      ping.frequency.value = glass ? 2400 + random() * 800 : 3800 + random() * 2600;
      const env = g.gain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime((glass ? 0.012 : 0.02) * level, at + STRIKE.ping);
      env.gain.exponentialRampToValueAtTime(0.0001, at + (glass ? 0.02 : 0.05));
      ping.connect(env).connect(out);
      ping.start(at);
      ping.stop(at + 0.06);
      g.burst(out, at, 0.01, 0.03 * level);
    }
  }
}

/** The kerb point nearest the listener (zone-local, gutter height) on Front Street or Park Street; null far from any. */
function nearestKerb(local: THREE.Vector3, into: THREE.Vector3): THREE.Vector3 | null {
  const options: [number, number][] = [];
  if (local.x > PARK_STREET.farKerb - 2 && Math.abs(local.z) < FRONT.farLine + 1) {
    options.push([local.x, FRONT.nearKerb], [local.x, FRONT.farKerb]);
  }
  if (local.z < FRONT.nearKerb + 2 && local.x < PARK_STREET.line + 1 && local.x > PARK_STREET.hedge - 1) {
    options.push([PARK_STREET.nearKerb, local.z], [PARK_STREET.farKerb, local.z]);
  }
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const [x, z] of options) {
    const d = Math.hypot(x - local.x, z - local.z);
    if (d < bestD) {
      bestD = d;
      best = [x, z];
    }
  }
  return best ? into.set(best[0], 0.05, best[1]) : null;
}
