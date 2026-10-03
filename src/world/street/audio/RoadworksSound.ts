import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { SpatialOut } from '@/audio/spatial';
import type { Furniture, OccupancyAware } from '../../Furniture';
import type { ActivityAware } from '../../zone/lifecycle';
import type { DayNight } from '../../props/DayNight';
import { closures } from '../details/roadworks';
import { SoundGraph } from './soundGraph';
import { StreetEar, falloff } from './streetEar';

export interface RoadworksSoundOptions {
  listener: THREE.Object3D;
  /** The day of the week, 0 Monday .. 6 Sunday (the game's calendar): no work on a Sunday, the mornings only on a Saturday. */
  weekday: () => number;
}

const MASTER = 0.5;
/** How far past each closure's line the work goes on (closure-local x, m). */
const WORK_AT = 5;
/** Working hours (game): the morning and the afternoon, a break for lunch; Saturdays the morning only. */
const SHIFTS: readonly (readonly [number, number])[] = [[8, 12], [13, 17]];
/** Half as loud this far off (m): the hammer carries. */
const HALF = { hammer: 14, generator: 7, beeper: 12, shovel: 6 };

interface Site {
  at: THREE.Vector3;
  leg: SpatialOut | null;
  generator: GainNode | null;
  hammer: { left: number; pause: number; clock: number };
  beeper: { left: number; pause: number; clock: number };
  shovel: number;
}

/**
 * The roadworks heard (they were silent behind their hoardings): a generator droning while the
 * crew is on, a pneumatic hammer in bursts of a few seconds, an excavator's reversing beeper now
 * and then, a shovel's scrape. In working hours on working days only (none on a Sunday, the
 * Saturday morning only, nothing at night or over lunch); placed past each closure's line
 * (`details/roadworks.closures`), so they come from behind the hoarding.
 */
export class RoadworksSound extends THREE.Group implements Furniture, Updatable, OccupancyAware, ActivityAware {
  readonly contactShadow = false;
  private graph: SoundGraph | null = null;
  private occupied = false;
  private active = true;
  private readonly sites: Site[];
  private readonly ear: StreetEar;
  private readonly world = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: RoadworksSoundOptions) {
    super();
    this.name = 'RoadworksSound';
    this.ear = new StreetEar(options.listener);
    // Where the works stand for this build of the street (`syncWorks` ran before it).
    this.sites = closures().map((c) => {
      const mid = (c.lanes[0] + c.lanes[1]) / 2;
      return {
        at: new THREE.Vector3(WORK_AT, 0.8, mid).applyMatrix4(c.frame),
        leg: null,
        generator: null,
        hammer: { left: 0, pause: 3 + Math.random() * 8, clock: 0 },
        beeper: { left: 0, pause: 20 + Math.random() * 60, clock: 0 },
        shovel: 4 + Math.random() * 6,
      };
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.graph?.setLevel(occupied ? MASTER : 0, 0.4);
  }

  setZoneActive(active: boolean): void {
    this.active = active;
    if (!active) this.teardown();
  }

  dispose(): void {
    this.teardown();
  }

  /** Whether the crew is at it now. */
  private working(): boolean {
    const day = this.options.weekday();
    if (day === 6) return false;
    const h = this.dayNight.state.hours;
    const shifts = day === 5 ? SHIFTS.slice(0, 1) : SHIFTS;
    return shifts.some(([a, b]) => h >= a && h < b);
  }

  update(dt: number): void {
    if (!this.active || !this.occupied) return;
    const g = this.graph ?? this.build();
    if (!g) return;
    this.ear.update();
    const on = this.working();
    const now = g.now;
    for (const site of this.sites) {
      this.localToWorld(this.world.copy(site.at));
      const d = this.ear.distance(this.world);
      const side = this.ear.spatial(this.world);
      site.leg?.set(side.pan, 0, false, side.rear ?? 0);
      site.generator?.gain.setTargetAtTime(on ? 0.05 * falloff(d, HALF.generator) : 0, now, 1.5);
      if (!on || d > 70) continue;
      this.hammer(g, site, dt, falloff(d, HALF.hammer));
      this.beeper(g, site, dt, falloff(d, HALF.beeper));
      site.shovel -= dt;
      if (site.shovel <= 0) {
        site.shovel = 5 + Math.random() * 12;
        const level = falloff(d, HALF.shovel);
        if (level > 0.02 && site.leg) {
          // A spade into gravel: a gritty scrape and the stones tipped off it.
          const band = g.filter('bandpass', 1500, 1.2);
          band.connect(site.leg.input);
          g.shaped(band, now + 0.02, [[0.12, 0.12 * level], [0.35, 0.05 * level], [0.45, 0]]);
          for (let i = 0; i < 5; i++) g.burst(band, now + 0.7 + i * 0.03 + Math.random() * 0.05, 0.02, 0.08 * level);
          window.setTimeout(() => band.disconnect(), 2000);
        }
      }
    }
  }

  /** The pneumatic hammer: bursts of a few seconds, 18 blows a second, then a rest. */
  private hammer(g: SoundGraph, site: Site, dt: number, level: number): void {
    const h = site.hammer;
    if (h.left <= 0) {
      h.pause -= dt;
      if (h.pause > 0) return;
      h.left = 1.5 + Math.random() * 5;
      h.pause = 4 + Math.random() * 18;
    }
    h.left -= dt;
    h.clock -= dt;
    if (h.clock > 0 || !site.leg || level < 0.01) return;
    // Schedule the next tenth of a second of blows at once.
    const blows = g.filter('bandpass', 520, 1.1);
    blows.connect(site.leg.input);
    const crack = g.filter('highpass', 2200, 0.7);
    crack.connect(site.leg.input);
    for (let t = 0; t < 0.1; t += 1 / 18) {
      const at = g.now + 0.02 + t;
      g.burst(blows, at, 0.035, 0.35 * level);
      g.burst(crack, at, 0.012, 0.12 * level);
    }
    window.setTimeout(() => {
      blows.disconnect();
      crack.disconnect();
    }, 800);
    h.clock = 0.1;
  }

  /** An excavator backing up: the beeper, half a second on and off, for a few seconds. */
  private beeper(g: SoundGraph, site: Site, dt: number, level: number): void {
    const b = site.beeper;
    if (b.left <= 0) {
      b.pause -= dt;
      if (b.pause > 0) return;
      b.left = 3 + Math.random() * 5;
      b.pause = 35 + Math.random() * 90;
    }
    b.left -= dt;
    b.clock -= dt;
    if (b.clock > 0 || !site.leg || level < 0.01) return;
    b.clock = 1;
    const t = g.now + 0.02;
    const osc = g.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1040;
    const env = g.gain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.04 * level, t + 0.01);
    env.gain.setValueAtTime(0.04 * level, t + 0.48);
    env.gain.linearRampToValueAtTime(0, t + 0.5);
    osc.connect(env).connect(site.leg.input);
    osc.start(t);
    osc.stop(t + 0.52);
  }

  private teardown(): void {
    this.graph?.stop();
    this.graph = null;
    for (const site of this.sites) {
      site.leg = null;
      site.generator = null;
    }
  }

  private build(): SoundGraph | null {
    const g = SoundGraph.create(this.occupied ? MASTER : 0);
    if (!g) return null;
    this.graph = g;
    for (const site of this.sites) {
      site.leg = g.leg();
      // The generator: a small engine's lumpy drone, a little rattle on it.
      site.generator = g.gain();
      site.generator.connect(site.leg.input);
      const engine = g.oscillator('sawtooth', 50 + Math.random() * 6);
      engine.connect(g.filter('lowpass', 420, 1.2)).connect(site.generator);
      const lump = g.oscillator('sine', 6.2);
      lump.connect(g.gain(8)).connect(engine.frequency);
      g.loop().connect(g.filter('bandpass', 1800, 2)).connect(g.gain(0.15)).connect(site.generator);
    }
    return g;
  }
}
