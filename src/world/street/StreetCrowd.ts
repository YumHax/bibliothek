import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '../props/outdoors/wakefulness';
import { Walker } from '../people/Walker';
import type { Vec2 } from './streetPlan';

export interface StreetCrowdOptions {
  /** Where the passers-by go: they appear at a route's first point and vanish at its last. */
  routes: readonly (readonly Vec2[])[];
  seeds: readonly number[];
  count: number;
  /** A passer-by further than this from the player is not drawn. */
  drawDistance: number;
  viewer: THREE.Object3D;
  /** Places a walker in the zone (so it is ticked and clickable); zone-local position. */
  place: (walker: Walker, at: THREE.Vector3) => void;
}

const LINES = [
  'Lovely day for it.',
  'Have you been to the market yet? Get there before the dealers do.',
  'That arcade still eats my coins.',
  'Mind the bikes.',
  'The busker was here yesterday too. Same tune.',
  'Sorry, in a hurry!',
];
/** Seconds between two looks at who should be drawn. */
const CULL_EVERY = 0.5;

interface Passer {
  walker: Walker;
  /** Seconds until they set off again, while away. */
  wait: number;
  walking: boolean;
}

/**
 * The passers-by on the pavements: a couple of people (`people/Walker`, read-only use) walking a
 * route round the corner and along Front Street, vanishing at its far end, coming back a while
 * later on another route; fewer late at night, as the city sleeps (`wakefulnessAt`). They never
 * collide, glance at the player brushing past, have a word when clicked. People are the costliest
 * meshes in the street (about thirty draw calls each), so they cast no shadow of their own (their
 * blob does) and are not drawn beyond `drawDistance`.
 */
export class StreetCrowd extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly passers: Passer[] = [];
  private readonly eye = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();
  private cullClock = 0;
  private routeIndex = 0;

  constructor(private readonly dayNight: DayNight, private readonly options: StreetCrowdOptions) {
    super();
    this.name = 'StreetCrowd';
    for (let i = 0; i < options.count; i++) {
      const walker = new Walker({ viewer: options.viewer, seed: options.seeds[i % options.seeds.length]!, speed: 1.15 + 0.2 * i, lines: LINES, label: 'Click to say hello' });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      const route = options.routes[i % options.routes.length]!;
      // The first one is already on its way when the player arrives; the others follow later.
      const start = i === 0 ? 1 : 0;
      options.place(walker, new THREE.Vector3(route[start]![0], 0, route[start]![1]));
      const passer: Passer = { walker, wait: 0, walking: false };
      this.passers.push(passer);
      if (i === 0) this.send(passer, route, start);
      else {
        walker.setPresent(false);
        passer.wait = 4 + 6 * i;
      }
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const awake = wakefulnessAt(this.dayNight.state.hours);
    for (const passer of this.passers) {
      if (passer.walking) continue;
      passer.wait -= dt * Math.max(0.1, awake);
      if (passer.wait > 0) continue;
      const route = this.options.routes[this.routeIndex++ % this.options.routes.length]!;
      this.send(passer, route, 0);
    }
    this.cullClock += dt;
    if (this.cullClock < CULL_EVERY) return;
    this.cullClock = 0;
    this.options.viewer.getWorldPosition(this.eye);
    for (const { walker, walking } of this.passers) {
      if (!walking) continue;
      walker.getWorldPosition(this.spot);
      walker.visible = this.spot.distanceTo(this.eye) < this.options.drawDistance;
    }
  }

  /** Sets off along `route` from point `from`; at the end they go (and come back later). */
  private send(passer: Passer, route: readonly Vec2[], from: number): void {
    const start = route[from]!;
    passer.walker.setPresent(true, new THREE.Vector3(start[0], 0, start[1]));
    passer.walking = true;
    const path = route.slice(from + 1).map(([x, z]) => new THREE.Vector3(x, 0, z));
    passer.walker.walk(path, () => {
      passer.walking = false;
      passer.walker.setPresent(false);
      passer.wait = 6 + Math.random() * 14;
    });
  }
}
