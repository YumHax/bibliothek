import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import { Walker } from '../people/Walker';
import { Dog } from './life/Dog';
import { Lead } from './life/Lead';
import { distanceFade } from './life/fade';
import { isShopOpen } from './shops/shopHours';
import type { RoadObstacle, StreetTraffic } from './traffic/StreetTraffic';
import { FRONT, KERB_HEIGHT, PARK_STREET, STREET_PLAN, shopDoors, type Vec2 } from './streetPlan';
import { atCrossing, groundHeight } from './relief/ground';

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
/** Corners of the routes are swept round with this radius (metres), a little slower. */
const CORNER_RADIUS = 0.7;
/** A passer-by's caption shows only this close (a stranger across the street is just a passer-by). */
const LABEL_WITHIN = 4;
/** In the rain: fewer out (down to this share in a downpour), those out walk quicker; how hard it must rain for umbrellas. */
const RAIN_SHARE = 0.5;
const RAIN_PACE = 1.25;
const UMBRELLAS_ABOVE = 0.12;
/** Snow this heavy puts the hoods up. */
const HOODS_ABOVE = 0.15;
/** Walkers already on their way when the player arrives. */
const PREWARM = 2;
/** People in the pool beyond those out at once (up to one per look): they take turns. */
const SPARE = 2;
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
  lead: Lead | null;
  /** Whether they carry an umbrella when it rains (half of them). */
  umbrella: boolean;
  /** Their dog's barks so far (a counter, for the street's sound) and seconds to the next. */
  bark: { barks: number; position: THREE.Vector3; clock: number } | null;
}

/** A walked dog barks every this many seconds or so (at a pigeon, a bike, nothing). */
const BARK_EVERY = [25, 70] as const;

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
  /** The dogs out here, as the street's sound hears them bark (`StreetCues`). */
  readonly barkers: { readonly barks: number; readonly position: THREE.Vector3 }[] = [];
  private cullClock = 0;
  /** Reached on the next update after activation: a couple of walkers put mid-route (the street is never empty on arrival). */
  private prewarm = true;

  constructor(private readonly dayNight: DayNight, private readonly options: StreetCrowdOptions) {
    super();
    this.name = 'StreetCrowd';
    // A couple more people than walk at once, one per look (`seeds`): whoever has been away longest goes out
    // next, so over a day every look passes by, never the same four (each set off out of a door or far off).
    const pool = Math.min(Math.max(options.count, options.seeds.length), options.count + SPARE);
    for (let i = 0; i < pool; i++) {
      const walker = new Walker({
        viewer: options.viewer,
        seed: options.seeds[i % options.seeds.length]!,
        speed: 1.05 + 0.13 * (i % 4),
        talk: options.talk,
        label: 'Passer-by · say hello',
        labelWithin: LABEL_WITHIN,
        corners: CORNER_RADIUS,
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
      const passer: Passer = { walker, state: { kind: 'away', wait: 3 + 7 * i }, door: 1, obstacle, dog: null, lead: null, umbrella: i % 2 === 0, bark: null };
      if (i === 1) this.addDog(passer, options.seeds[i % options.seeds.length]!);
      this.passers.push(passer);
    }
  }

  setZoneActive(active: boolean): void {
    if (active) this.prewarm = true;
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
    if (this.prewarm) {
      this.prewarm = false;
      this.warmUp(hours);
    }
    // Fewer people out as the city sleeps, and in the rain.
    const rain = Math.min(1, this.dayNight.state.rain * 1.5);
    const allowed = Math.max(1, Math.ceil(this.options.count * (0.2 + 0.8 * awake) * (1 - (1 - RAIN_SHARE) * rain)));
    let out = 0;
    for (const passer of this.passers) if (passer.state.kind !== 'away') out++;
    // Whoever has waited longest past their time goes out first (the looks take turns).
    let next: Passer | null = null;
    let longest = 0;
    for (const passer of this.passers) {
      const state = passer.state;
      if (state.kind !== 'away') continue;
      state.wait -= dt;
      if (state.wait <= longest) {
        longest = state.wait;
        next = passer;
      }
    }
    if (next && out < allowed) {
      const route = this.pickRoute(hours);
      if (route) this.send(next, route, 0);
      else next.state = { kind: 'away', wait: 3 };
    }
    for (const passer of this.passers) {
      const state = passer.state;
      if (state.kind === 'away') {
        this.follow(passer, dt);
        continue;
      }
      if (state.kind === 'waiting') this.wait(passer, state, dt);
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

  /** A route's end in a door: on Front Street's building lines, on Park Street's (our side), or the park's gate. */
  private isDoor([x, z]: Vec2): boolean {
    if (Math.abs(z) >= DOOR_LINE && Math.abs(z) <= FRONT.farLine + 0.1) return true;
    if (Math.abs(x - PARK_STREET.line) < 0.15) return true;
    const [gx, gz] = STREET_PLAN.parkGate.at;
    return Math.hypot(x - gx, z - gz) < 0.5;
  }

  /** On arrival: a couple of the passers-by already somewhere along a route (not in a doorway, not on the road). */
  private warmUp(hours: number): void {
    let sent = 0;
    for (const passer of this.passers) {
      if (sent >= PREWARM) break;
      if (passer.state.kind !== 'away') continue;
      const route = this.pickRoute(hours);
      if (!route || route.path.length < 3) continue;
      // A leg between the first and the last (so neither in a doorway), never the one across the road.
      const legs: number[] = [];
      for (let i = 1; i < route.path.length - 1; i++) if (i !== route.crossing) legs.push(i);
      const leg = legs[Math.floor(Math.random() * legs.length)];
      if (leg === undefined) continue;
      this.send(passer, route, leg, 0.15 + Math.random() * 0.7);
      sent++;
    }
  }

  /** Sets off along `route` from point `from` (or `t` of the way on to the next): out of its door, fading in, if it starts at one. */
  private send(passer: Passer, route: CrowdRoute, from: number, t = 0): void {
    const a = route.path[from]!;
    const b = route.path[from + 1] ?? a;
    const start: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    passer.walker.setPresent(true, new THREE.Vector3(start[0], 0, start[1]));
    passer.door = from === 0 && t === 0 && this.isDoor(start) ? 0 : 1;
    if (passer.door === 0) this.options.onDoor?.(start);
    if (passer.dog) passer.dog.position.set(start[0], 0, start[1]);
    // Dressed for the weather they set out in: an umbrella up (half of them) and a quicker step in the rain, hoods up in the snow.
    const sky = this.dayNight.state;
    const wet = sky.rain > UMBRELLAS_ABOVE;
    const umbrella = wet && passer.umbrella && !passer.dog;
    passer.walker.hold(umbrella ? 'umbrella' : null);
    passer.walker.setHood(!umbrella && (sky.snow > HOODS_ABOVE || (wet && sky.rain > 0.5)));
    passer.walker.setPace(wet ? RAIN_PACE : 1);
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
    passer.lead?.setFade(0);
    passer.state = { kind: 'away', wait: 6 + Math.random() * 16 };
  }

  private crossingAt(x: number): number {
    const i = STREET_PLAN.crossings.findIndex((c) => x > c.from - 1.5 && x < c.to + 1.5);
    return Math.max(0, i);
  }

  /** Keeps the obstacle on the walker, and the dog and lead with them. */
  private follow(passer: Passer, dt: number): void {
    const { walker, obstacle, state } = passer;
    // Down a kerb onto the road while crossing it (a step eased over a few centimetres either side of the kerb's edge).
    if (walker.isPresent) walker.position.y = kerbY(walker.position);
    obstacle.position.copy(walker.position);
    obstacle.wantsToCross = state.kind === 'waiting' ? state.crossing : null;
    obstacle.active = walker.isPresent && (roadAt(walker.position) || obstacle.wantsToCross !== null);
    const dog = passer.dog;
    if (!dog || !walker.isPresent) return;
    const target = this.scratch.copy(DOG_OFFSET).applyAxisAngle(Y, walker.rotation.y).add(walker.position);
    dog.update(dt, target, walker.isWalking);
    dog.position.y = kerbY(dog.position);
    const bark = passer.bark!;
    bark.clock -= dt;
    if (bark.clock <= 0) {
      bark.clock = BARK_EVERY[0] + Math.random() * (BARK_EVERY[1] - BARK_EVERY[0]);
      if (passer.door >= 1) {
        bark.barks++;
        bark.position.copy(dog.position);
      }
    }
    const hand = this.spot.copy(LEAD_HAND).applyAxisAngle(Y, walker.rotation.y).add(walker.position);
    passer.lead!.string(hand, dog.collar);
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
      passer.lead?.setFade(amount);
    }
  }

  private addDog(passer: Passer, seed: number): void {
    const dog = new Dog(seed);
    dog.setFade(0);
    this.add(dog);
    const lead = new Lead(0x8a2a2a);
    lead.setFade(0);
    this.add(lead);
    passer.dog = dog;
    passer.lead = lead;
    passer.bark = { barks: 0, position: new THREE.Vector3(), clock: BARK_EVERY[0] };
    this.barkers.push(passer.bark);
  }
}

const Y = new THREE.Vector3(0, 1, 0);

/** Whether a point is on Front Street's road (a kerb below the pavements). */
function roadAt(p: THREE.Vector3): boolean {
  return Math.abs(p.z) < FRONT.farKerb && p.x > PARK_STREET.farKerb;
}

/** Half the width over which a foot goes down the kerb (so the 12 cm step is eased over 0.3 m, not snapped). */
const KERB_EASE = 0.15;

/** The feet's height at `p`: 0 on the pavement, a kerb below on Front Street's road, eased across the kerb's edge. */
function kerbY(p: THREE.Vector3): number {
  // Across a crossing the kerb is dropped: the pavement ramps down to it (`relief/ground`).
  if (atCrossing(p.x)) return groundHeight(p.x, p.z);
  // How far into the road (negative: out on the pavement), from the nearest kerb edge.
  const into = Math.min(FRONT.farKerb - Math.abs(p.z), p.x - PARK_STREET.farKerb);
  const t = Math.min(1, Math.max(0, (into + KERB_EASE) / (2 * KERB_EASE)));
  return -KERB_HEIGHT * t * t * (3 - 2 * t);
}
