import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import { Walker } from '../../people/Walker';
import { PARK_PATHS } from '../../city/park';
import { FLAT_IN_STREET, PARK_STREET, type Vec2 } from '../streetPlan';
import { Figure } from './Figure';

export interface ParkStrollersOptions {
  viewer: THREE.Object3D;
  place: (walker: Walker, at: THREE.Vector3) => void;
  /** How many walk the paths at once (by day, dry). */
  count: number;
  /** Seen this far (they are across the hedge), faded over the last `fade` metres. */
  drawDistance: number;
  fade: number;
  /** How far into the park they go (street x): the lawn's end. */
  reach: number;
}

/** Seconds a stroller waits before setting off again, and their pace. */
const PAUSE = [8, 30] as const;
const SEEDS = [701, 709, 719];

/**
 * A walker or two on the park's gravel paths beyond the hedge, as the window view has them: from
 * the gate (and the corner) along `PARK_PATHS` into the park as far as the lawn runs, and back,
 * by day in dry weather. They never come out onto the street; seen over the hedge, faded with distance.
 */
export class ParkStrollers extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly strollers: { figure: Figure; wait: number; out: boolean }[] = [];
  private readonly routes: THREE.Vector3[][];
  private readonly eye = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: ParkStrollersOptions) {
    super();
    this.name = 'ParkStrollers';
    // Each path from its start on the hedge line in, cut where the lawn ends.
    this.routes = PARK_PATHS.slice(0, 2).map((path) => {
      const points = path.map(([x, z]): Vec2 => [x + FLAT_IN_STREET.x, z + FLAT_IN_STREET.z]);
      const kept = points.filter(([x]) => x > options.reach);
      // Start a step inside the hedge.
      const [x0, z0] = kept[0]!;
      return [new THREE.Vector3(Math.min(x0, PARK_STREET.hedge - 1.5), 0, z0), ...kept.slice(1).map(([x, z]) => new THREE.Vector3(x, 0, z))];
    });
    for (let i = 0; i < options.count; i++) {
      const walker = new Walker({ viewer: options.viewer, seed: SEEDS[i % SEEDS.length]!, speed: 0.9 + 0.15 * i, corners: 1.5, fade: true });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3());
      this.strollers.push({ figure: new Figure(walker), wait: 2 + i * 12, out: false });
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const out = s.daylight > 0.25 && s.rain < 0.1 && wakefulnessAt(s.hours) > 0.5;
    this.options.viewer.getWorldPosition(this.eye);
    for (let i = 0; i < this.strollers.length; i++) {
      const st = this.strollers[i]!;
      if (!st.out) {
        st.wait -= dt;
        if (st.wait <= 0 && out) {
          const route = this.routes[i % this.routes.length]!;
          st.out = true;
          st.figure.show(route[0]!.clone());
          // In along the path and back out to the hedge, where they fade away.
          const back = [...route].reverse().slice(1);
          st.figure.walker.walk([...route.slice(1), ...back], () => {
            st.figure.hide();
            st.out = false;
            st.wait = PAUSE[0] + Math.random() * (PAUSE[1] - PAUSE[0]);
          });
        }
      }
      st.figure.update(dt, this.eye, this.options.drawDistance, this.options.fade);
    }
  }
}
