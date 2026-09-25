import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '../props/outdoors/wakefulness';
import { Walker } from '../people/Walker';
import { Dog } from './life/Dog';
import { distanceFade } from './life/fade';
import { isShopOpen } from './shops/shopHours';
import type { RoadObstacle, StreetTraffic } from './traffic/StreetTraffic';
import { FRONT, KERB_HEIGHT, PARK_STREET, STREET_PLAN, shopDoors, type Vec2 } from './streetPlan';

export interface CrowdRoute {
  path: readonly Vec2[];
  /** Index of the kerb point before a crossing: wait there before stepping off. */
  crossing?: number;
}

export interface StreetCrowdOptions {
  /** Where the passers-by go: they appear at a route's first point and vanish at its last. */
  routes: readonly CrowdRoute[];
  seeds: readonly number[];
  count: number;
  /** A passer-by further than this from the player is not drawn; they fade over the last `fade` metres. */
  drawDistance: number;
  fade: number;
  viewer: THREE.Object3D;
  /** The crossing's lights and the obstacles drivers stop for. */
  traffic: StreetTraffic;
  /** What a passer-by says when clicked (`life/streetTalk`). */
  talk: () => string;
  /** Places a walker in the zone (so it is ticked and clickable); zone-local position. */
  place: (walker: Walker, at: THREE.Vector3) => void;
  /** A passer-by went into, or came out of, a door at `at` (a shop's bell). */
  onDoor?: (at: Vec2) => void;
}

/** Seconds a passer-by takes to come out of a door, or to go in. */
const DOOR_FADE = 0.7;
/** Seconds between two looks at who is how far. */
const CULL_EVERY = 0.05;
/** At a plain zebra, a look both ways before stepping off. */
const LOOK_BOTH_WAYS = 1.2;
/** Points on a building line are doors; points this far down a side street are out of sight. */
const DOOR_LINE = 11.9;
/** The dog trots this far ahead and to the side of its walker (walker's frame: x right, z ahead). */
const DOG_OFFSET = new THREE.Vector3(0.45, 0, 0.6);
const LEAD_HAND = new THREE.Vector3(-0.22, 0.86, 0.22);

type State =
  | { kind: 'away'; wait: number }
  | { kind: 'walking' }
  | { kind: 'waiting'; crossing: number; rest: THREE.Vector3[]; look: number }
  | { kind: 'entering'; left: number };

class Obstacle implements RoadObstacle {
  readonly position = new THREE.Vector3();
  readonly radius = 0.5;
  active = false;
  wantsToCross: number | null = null;
}

interface Passer {
  walker: Walker;
  state: State;
  /** How far out of its door: 0 still inside .. 1 out on the pavement. */
  door: number;
  obstacle: Obstacle;
  dog: Dog | null;
  lead: THREE.Line | null;
}

/**
 * The passers-by on the pavements: people (`people/Walker`) coming out of a house or shop door,
 * or up Park Street from far off, walking a route along Front Street and going into another door
 * or away down Park Street, then turning up again a while later on another route. They fade in
 * and out through the doors and at the edge of sight (`drawDistance`, over its last `fade`
 * metres), never popping. A route through a crossing waits at the kerb: at the lights for the
 * green man, at the plain zebra for a look both ways (drivers give way to anyone waiting there or
 * on it: while on the road or at its kerb a passer-by is a `RoadObstacle`). Shops they go in and
 * out of are open (`isShopOpen`); fewer are out late at night (`wakefulnessAt`). One of them walks
 * a dog on a lead. They glance at the player brushing past and say what is going on when clicked
 * (`talk`). People are the costliest meshes here (about thirty draw calls each): they cast no
 * shadow of their own (their blob does) and are not drawn once faded.
 */
export class StreetCrowd extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly passers: Passer[] = [];
  private readonly eye = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly doors = shopDoors();
  private cullClock = 0;

  constructor(private readonly dayNight: DayNight, private readonly options: StreetCrowdOptions) {
    super();
    this.name = 'StreetCrowd';
    for (let i = 0; i < options.count; i++) {
      const walker = new Walker({
        viewer: options.viewer,
        seed: options.seeds[i % options.seeds.length]!,
        speed: 1.05 + 0.13 * (i % 4),
        talk: options.talk,
        label: 'Click to say hello',
        fade: true,
      });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3(0, 0, 0));
      walker.setPresent(false);
      walker.setFade(0);
      const obstacle = new Obstacle();
      options.traffic.obstacles.add(obstacle);
      const passer: Passer = { walker, state: { kind: 'away', wait: 3 + 7 * i }, door: 1, obstacle, dog: null, lead: null };
      if (i === 1) this.addDog(passer, options.seeds[i % options.seeds.length]!);
      this.passers.push(passer);
    }
    // The first one is already on their way when the player arrives.
    const first = this.passers[0];
    const route = options.routes[0];
    if (first && route) this.send(first, route, 1);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  dispose(): void {
    for (const p of this.passers) this.options.traffic.obstacles.delete(p.obstacle);
  }

  update(dt: number): void {
    const hours = this.dayNight.state.hours;
    const awake = wakefulnessAt(hours);
    // Fewer people out as the city sleeps.
    const allowed = Math.max(1, Math.ceil(this.passers.length * (0.2 + 0.8 * awake)));
    let out = this.passers.filter((p) => p.state.kind !== 'away').length;
    for (const passer of this.passers) {
      const state = passer.state;
      if (state.kind === 'away') {
        state.wait -= dt;
        if (state.wait <= 0 && out < allowed) {
          const route = this.pickRoute(hours);
          if (route) {
            this.send(passer, route, 0);
            out++;
          } else state.wait = 3;
        }
      } else if (state.kind === 'waiting') this.wait(passer, state, dt);
      else if (state.kind === 'entering') {
        state.left -= dt;
        passer.door = Math.max(0, state.left / DOOR_FADE);
        if (state.left <= 0) this.leave(passer);
      } else if (passer.door < 1) passer.door = Math.min(1, passer.door + dt / DOOR_FADE);
      this.follow(passer, dt);
    }
    this.cullClock += dt;
    if (this.cullClock >= CULL_EVERY) {
      this.cullClock = 0;
      this.cull();
    }
  }

  /** A route whose doors are open now (shops shut for the night are left out). */
  private pickRoute(hours: number): CrowdRoute | null {
    const { routes } = this.options;
    const start = Math.floor(Math.random() * routes.length);
    for (let k = 0; k < routes.length; k++) {
      const route = routes[(start + k) % routes.length]!;
      const ends = [route.path[0]!, route.path[route.path.length - 1]!];
      if (ends.every((end) => this.doorOpen(end, hours))) return route;
    }
    return null;
  }

  /** A shop's door is open in its hours; a house door, the arcade's, a point far down a street always. */
  private doorOpen([x, z]: Vec2, hours: number): boolean {
    if (Math.abs(z) < DOOR_LINE) return true;
    const shop = this.doors.find((d) => Math.hypot(d.at[0] - x, d.at[1] - z) < 1.3);
    return !shop || isShopOpen(shop.shop.kind, hours);
  }

  private isDoor([, z]: Vec2): boolean {
    return Math.abs(z) >= DOOR_LINE && Math.abs(z) <= FRONT.farLine + 0.1;
  }

  /** Sets off along `route` from point `from`: out of its door, fading in, if it starts at one. */
  private send(passer: Passer, route: CrowdRoute, from: number): void {
    const start = route.path[from]!;
    passer.walker.setPresent(true, new THREE.Vector3(start[0], 0, start[1]));
    passer.door = from === 0 && this.isDoor(start) ? 0 : 1;
    if (passer.door === 0) this.options.onDoor?.(start);
    if (passer.dog) passer.dog.position.set(start[0], 0, start[1]);
    const points = route.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const kerb = route.crossing;
    if (kerb !== undefined && kerb > from) {
      const index = this.crossingAt(route.path[kerb]![0]);
      passer.state = { kind: 'walking' };
      passer.walker.walk(points.slice(from + 1, kerb + 1), () => {
        passer.state = { kind: 'waiting', crossing: index, rest: points.slice(kerb + 1), look: LOOK_BOTH_WAYS };
        passer.walker.stand(passer.walker.rotation.y, 'stand');
      });
      return;
    }
    this.walkOn(passer, points.slice(from + 1), route.path[route.path.length - 1]!);
  }

  private walkOn(passer: Passer, path: THREE.Vector3[], end: Vec2): void {
    passer.state = { kind: 'walking' };
    passer.walker.walk(path, () => {
      if (this.isDoor(end)) {
        this.options.onDoor?.(end);
        passer.state = { kind: 'entering', left: DOOR_FADE };
      } else this.leave(passer);
    });
  }

  /** At the kerb: the lights' green man, or a look both ways at the zebra; then across and on. */
  private wait(passer: Passer, state: Extract<State, { kind: 'waiting' }>, dt: number): void {
    const crossing = STREET_PLAN.crossings[state.crossing];
    const go = crossing?.signals ? this.options.traffic.walkersGreen : (state.look -= dt) <= 0;
    if (!go) return;
    const rest = state.rest;
    const last = rest[rest.length - 1]!;
    this.walkOn(passer, rest, [last.x, last.z]);
  }

  private leave(passer: Passer): void {
    passer.walker.setPresent(false);
    passer.walker.setFade(0);
    passer.dog?.setFade(0);
    if (passer.lead) passer.lead.visible = false;
    passer.state = { kind: 'away', wait: 6 + Math.random() * 16 };
  }

  private crossingAt(x: number): number {
    const i = STREET_PLAN.crossings.findIndex((c) => x > c.from - 1.5 && x < c.to + 1.5);
    return Math.max(0, i);
  }

  /** Keeps the obstacle on the walker, and the dog and lead with them. */
  private follow(passer: Passer, dt: number): void {
    const { walker, obstacle, state } = passer;
    // Down a kerb onto the road while crossing it.
    if (walker.isPresent) walker.position.y = roadAt(walker.position) ? -KERB_HEIGHT : 0;
    obstacle.position.copy(walker.position);
    obstacle.wantsToCross = state.kind === 'waiting' ? state.crossing : null;
    obstacle.active = walker.isPresent && (roadAt(walker.position) || obstacle.wantsToCross !== null);
    const dog = passer.dog;
    if (!dog || !walker.isPresent) return;
    const target = this.scratch.copy(DOG_OFFSET).applyAxisAngle(Y, walker.rotation.y).add(walker.position);
    dog.update(dt, target, walker.isWalking);
    dog.position.y = roadAt(dog.position) ? -KERB_HEIGHT : 0;
    const lead = passer.lead!;
    const positions = lead.geometry.getAttribute('position') as THREE.BufferAttribute;
    const hand = this.spot.copy(LEAD_HAND).applyAxisAngle(Y, walker.rotation.y).add(walker.position);
    positions.setXYZ(0, hand.x, hand.y, hand.z);
    positions.setXYZ(1, (hand.x + dog.collar.x) / 2, Math.min(hand.y, dog.collar.y) - 0.12, (hand.z + dog.collar.z) / 2);
    positions.setXYZ(2, dog.collar.x, dog.collar.y, dog.collar.z);
    positions.needsUpdate = true;
  }

  /** How much of each passer-by shows: their door's fade times the distance's. */
  private cull(): void {
    this.options.viewer.getWorldPosition(this.eye);
    const { drawDistance, fade } = this.options;
    for (const passer of this.passers) {
      const { walker } = passer;
      if (!walker.isPresent) continue;
      walker.getWorldPosition(this.spot);
      const amount = passer.door * distanceFade(this.spot.distanceTo(this.eye), drawDistance, fade);
      walker.setFade(amount);
      passer.dog?.setFade(amount);
      if (passer.lead) {
        passer.lead.visible = amount > 0.3;
        (passer.lead.material as THREE.LineBasicMaterial).opacity = amount;
      }
    }
  }

  private addDog(passer: Passer, seed: number): void {
    const dog = new Dog(seed);
    dog.setFade(0);
    this.add(dog);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    const lead = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x8a2a2a, transparent: true }));
    lead.frustumCulled = false;
    lead.visible = false;
    this.add(lead);
    passer.dog = dog;
    passer.lead = lead;
  }
}

const Y = new THREE.Vector3(0, 1, 0);

/** Whether a point is on Front Street's road (a kerb below the pavements). */
function roadAt(p: THREE.Vector3): boolean {
  return Math.abs(p.z) < FRONT.farKerb && p.x > PARK_STREET.farKerb;
}
