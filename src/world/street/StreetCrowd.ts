import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { inHours } from '@/time/clock';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { rushAt, streetBusyAt, type Weekday } from '@/time/wakefulness';
import { Walker } from '../people/Walker';
import type { Held } from '../people/held';
import { Dog } from './life/Dog';
import { Lead } from './life/Lead';
import { distanceFade } from './life/fade';
import type { CastMember } from './life/crowdCast';
import { besideStart, besideSteps, planTrip, stopsOnRoute, type CrowdRoute, type RouteStop, type Step, type Stop } from './life/crowdTrips';
import type { DoorGaps } from './life/DoorGaps';
import type { TalkRole } from './life/streetTalk';
import { isShopOpen } from './shops/shopHours';
import type { RoadObstacle, StreetTraffic } from './traffic/StreetTraffic';
import { STREET_PLAN, type ShopDoor, type ShopKind, type Vec2 } from './streetPlan';
import { FRONT, KERB_HEIGHT, PARK_STREET } from '@/world/measures/street';
import { shopDoors } from '@/world/city/facades';
import { atCrossing, groundHeight } from './relief/ground';
import { random, within } from '@/random';
import { smooth } from '@/math/scalar';

interface StreetCrowdOptions {
  /** Where the passers-by go: they appear at a route's first point and vanish at its last. */
  routes: readonly CrowdRoute[];
  /** Who walks (`life/crowdCast`): made only when first sent out. */
  cast: readonly CastMember[];
  /** How many walk at once at the busiest (fewer as the hour, the day and the weather say). */
  count: number;
  /** A passer-by further than this from the player is not drawn; they fade over the last `fade` metres. */
  drawDistance: number;
  fade: number;
  viewer: THREE.Object3D;
  /** The crossing's lights and the obstacles drivers stop for. */
  traffic: StreetTraffic;
  /** What someone says when clicked, by who they are (`life/streetTalk`). */
  talk: (role?: TalkRole) => string;
  /** Places a walker in the zone (so it is ticked and clickable, and counted in the people budget); zone-local position. */
  place: (walker: Walker, at: THREE.Vector3) => void;
  /** Someone went into, or came out of, a shop's door at `at` (its bell). */
  onDoor?: (at: Vec2) => void;
  /** The painted doors: opened as people go through, and where a route's door really is (`DoorGaps`). */
  doors?: DoorGaps;
  /** Where a passer-by may stop on the way (`life/crowdTrips`). */
  stops?: readonly Stop[];
  /** Today's weekday (`Today.gameDay`, `weekdayOf`). */
  weekday: () => Weekday;
  /** A busier street than usual today (a new stock day at RETRO GAMES, the Grand Flea Fair): this times as many. */
  boost?: () => number;
  /** Everyone walking in the street (a live list): passers-by keep right of them. */
  crowd: () => readonly Walker[];
  /** What the dogs pull towards and bark at (the pigeons, the stray cat), zone-local, a live list. */
  dogBait?: () => Iterable<THREE.Vector3>;
  /** A dog barks at `at` now (`StreetCues.barkAt`). */
  barkAt?: (at: Vec2) => void;
  /**
   * The building's residents in the cast (`life/crowdCast.residentMember`): out of our door on `out` at the hour they
   * go out (up to `lateBy` game hours late), home on `back` before the hour they come back (between `backBefore`'s
   * hours before it). `day` is the game day (once each a day).
   */
  residents?: { out: CrowdRoute; back: CrowdRoute; lateBy: number; backBefore: readonly [number, number] };
  day?: () => number;
}

/** Seconds a passer-by takes to come out of a door, or to go in. */
const DOOR_FADE = 0.7;
/** Seconds between two looks at who is how far (and at the weather). */
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
const PREWARM = 3;
/** The dog trots this far ahead and to the side of its walker (walker's frame: x right, z ahead). */
const DOG_OFFSET = new THREE.Vector3(0.45, 0, 0.6);
const LEAD_HAND = new THREE.Vector3(-0.22, 0.86, 0.22);
/** A walked dog barks every this many seconds or so, and at once at a pigeon or the cat this close; it pulls towards them. */
const BARK_EVERY = [40, 110] as const;
const BAIT = { within: 4.5, pull: 0.45 };
/** Commuters in the rush: this much quicker. */
const RUSH_PACE = 1.2;
/** Someone walking with a friend: beside them, this far to the right; a word between them every few seconds. */
const BESIDE = 0.42;
const CHAT_EVERY = [3, 8] as const;
/** The night (the bars' hours): routes marked `night` are walked, by pairs leaving the bars. */
const NIGHT = { from: 21, to: 4 };
/** A child is out with their grown-up only in these hours. */
const CHILD_HOURS = [8, 20] as const;
/** A shop's painted door is within this of the plan's (the painter places doors along the front). */
const SNAP = 3.5;

type State =
  | { kind: 'away'; wait: number }
  | { kind: 'walking' }
  | { kind: 'waiting'; crossing: number; look: number }
  | { kind: 'pausing'; left: number }
  | { kind: 'entering'; left: number };

class Obstacle implements RoadObstacle {
  readonly position = new THREE.Vector3();
  readonly radius = 0.5;
  active = false;
  wantsToCross: number | null = null;
}

interface Passer {
  member: CastMember;
  walker: Walker | null;
  state: State;
  /** How far out of its door: 0 still inside .. 1 out on the pavement. */
  door: number;
  obstacle: Obstacle;
  dog: Dog | null;
  lead: Lead | null;
  /** Their dog's barks so far (a counter, for the street's sound) and seconds to the next; what it has its eye on. */
  bark: { barks: number; position: THREE.Vector3; clock: number; bait: THREE.Vector3 | null } | null;
  /** The rest of this trip, and where it ends. */
  steps: Step[];
  end: Vec2;
  role: TalkRole;
  /** What they came out of a shop with (a bag, flowers), shown unless the umbrella is up. */
  carry: Held | null;
  /** Walking with them: their companion (or, for a companion, whom they follow). */
  companion: Passer | null;
  leader: Passer | null;
  /** Seconds to the next word between the two, and how long the one talking looks at the other. */
  chat: number;
  looking: number;
  /** Where they look during a pause (a window), back to after a word with their companion. */
  pauseFocus: THREE.Vector3 | null;
  /** The umbrella is up (it rained when last looked). */
  wet: boolean;
  /** Where their eyes go in a word with their companion (world). */
  eyesOn: THREE.Vector3;
}

/**
 * The passers-by on the pavements: people (`people/Walker`, cast by `life/crowdCast`: regulars, the day's strangers,
 * some old, a child or a friend walking alongside, a couple of dogs) coming out of a house or shop door, or up Park
 * Street from far off, walking a route along Front Street and going into another door or away down Park Street, then
 * turning up again a while later on another route. How many are out follows the hour and the day (`streetBusyAt`:
 * the rushes, Saturday's shopping, a quiet Sunday morning), the weather, and a busy market day (`boost`); in the rush
 * most are commuters, hurrying, some on the phone; by night pairs leave the bars (`night` routes). On the way some
 * stop at a shop window, the newsstand, the busker, the Morris column (`stops`); out of a shop they carry what they
 * bought. The doors open for them (`doors`, shop bells only on shops), they keep right to pass each other
 * (`crowd`) and step round the player. They fade in and out through the doors and at the edge of sight
 * (`drawDistance`, over its last `fade` metres), never popping. A route through a crossing waits at the kerb: at the
 * lights for the green man, at the plain zebra for a look both ways (drivers give way to anyone waiting there or on
 * it: while on the road or at its kerb a passer-by is a `RoadObstacle`). Shops they go in and out of are open
 * (`isShopOpen`). Dogs on leads pull towards the pigeons and the stray cat and bark at them. They glance at the
 * player brushing past and stop to say a word when clicked (`talk`, by role). People are the costliest meshes here
 * (about thirty draw calls each): they cast no shadow of their own (their blob does), are not drawn once faded, and
 * the street's `PeopleBudget` draws only the nearest few.
 */
export class StreetCrowd extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly passers: Passer[] = [];
  private readonly routes: CrowdRoute[];
  private readonly routeStops: RouteStop[][];
  private readonly eye = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly doors = shopDoors();
  /** The dogs out here, as the street's sound hears them bark (`StreetCues`). */
  readonly barkers: { readonly barks: number; readonly position: THREE.Vector3 }[] = [];
  /** The dogs, for the pigeons to fly off from (a live list). */
  readonly dogs: Dog[] = [];
  private cullClock = 0;
  /** How many of `routes` are the passers-by's (the residents' two follow). */
  private readonly general: number;
  /** The residents' comings and goings done today (`key:out:day`). */
  private readonly residentsDone = new Set<string>();
  /** Reached on the next update after activation: a few walkers put mid-route (the street is never empty on arrival). */
  private prewarm = true;

  constructor(private readonly dayNight: DayNight, private readonly options: StreetCrowdOptions) {
    super();
    this.name = 'StreetCrowd';
    this.routes = options.routes.map((r) => this.snapRoute(r));
    this.general = this.routes.length;
    if (options.residents) this.routes.push(options.residents.out, options.residents.back);
    this.routeStops = this.routes.map((r, i) => (i < this.general ? stopsOnRoute(r, options.stops ?? []) : []));
    options.cast.forEach((member, i) => {
      const obstacle = new Obstacle();
      options.traffic.obstacles.add(obstacle);
      const passer: Passer = {
        member, walker: null, state: { kind: 'away', wait: member.resident ? Infinity : 3 + 5 * i }, door: 1, obstacle, dog: null, lead: null, bark: null,
        steps: [], end: [0, 0], role: 'passer', carry: null, companion: null, leader: null, chat: 4, looking: 0, pauseFocus: null, wet: false,
        eyesOn: new THREE.Vector3(),
      };
      if (member.dog) this.addDog(passer, member.seed);
      this.passers.push(passer);
    });
    options.cast.forEach((member, i) => {
      if (member.companion === null) return;
      const leader = this.passers[i]!;
      const companion = this.passers[member.companion]!;
      leader.companion = companion;
      companion.leader = leader;
    });
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
    if (this.prewarm) {
      this.prewarm = false;
      this.warmUp(hours);
    }
    // As many out as the hour and the day make busy, fewer in the rain.
    const rain = Math.min(1, this.dayNight.state.rain * 1.5);
    const busy = streetBusyAt(hours, this.options.weekday()) * (this.options.boost?.() ?? 1);
    const allowed = Math.max(1, Math.min(this.options.count, Math.round(this.options.count * busy * (1 - (1 - RAIN_SHARE) * rain))));
    let out = 0;
    for (const passer of this.passers) if (passer.state.kind !== 'away' && !passer.leader) out++;
    // Whoever has waited longest past their time goes out first (the looks take turns); companions go with theirs.
    let next: Passer | null = null;
    let longest = 0;
    for (const passer of this.passers) {
      const state = passer.state;
      if (state.kind !== 'away') continue;
      state.wait -= dt;
      if (passer.leader || passer.member.resident) continue;
      if (state.wait <= longest) {
        longest = state.wait;
        next = passer;
      }
    }
    if (next && out < allowed) {
      const route = this.pickRoute(hours);
      if (route !== null) this.send(next, route, 0);
      else next.state = { kind: 'away', wait: 3 };
    }
    for (const passer of this.passers) {
      const state = passer.state;
      if (state.kind === 'away') {
        this.follow(passer, dt);
        continue;
      }
      if (state.kind === 'waiting') this.wait(passer, state, dt);
      else if (state.kind === 'pausing') {
        state.left -= dt;
        if (state.left <= 0) this.next(passer);
      } else if (state.kind === 'entering') {
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
      this.residentsOut(hours);
    }
  }

  /** A resident due out (their hour, a little late at most) or due home (a while before theirs) sets off. */
  private residentsOut(hours: number): void {
    const plan = this.options.residents;
    if (!plan) return;
    const day = this.options.day?.() ?? 0;
    for (const passer of this.passers) {
      const r = passer.member.resident;
      if (!r || passer.state.kind !== 'away') continue;
      const outKey = `${r.key}:out:${day}`;
      const backKey = `${r.key}:back:${day}`;
      if (!this.residentsDone.has(outKey) && inHours(hours, [r.out, r.out + plan.lateBy])) {
        this.residentsDone.add(outKey);
        this.send(passer, this.general, 0);
      } else if (!this.residentsDone.has(backKey) && hours >= r.back - plan.backBefore[0] && hours < r.back - plan.backBefore[1]) {
        this.residentsDone.add(backKey);
        this.send(passer, this.general + 1, 0);
      }
    }
  }

  /** The route's ends at a shop's door moved onto the door the painter put there (with the step out to the lane). */
  private snapRoute(route: CrowdRoute): CrowdRoute {
    const doors = this.options.doors;
    if (!doors) return route;
    const path = route.path.map((p) => [p[0], p[1]] as Vec2);
    for (const [end, step] of [[0, 1], [path.length - 1, path.length - 2]] as const) {
      const at = path[end]!;
      const snapped = doors.snap(at, SNAP);
      if (!snapped) continue;
      const dx = snapped[0] - at[0];
      const dz = snapped[1] - at[1];
      path[end] = snapped;
      // The step straight out of the door goes with it (along the wall).
      const out = path[step];
      if (out && Math.hypot(out[0] - at[0], out[1] - at[1]) < 2.5) path[step] = [out[0] + dx, out[1] + dz];
    }
    return { ...route, path };
  }

  private isNight(hours: number): boolean {
    return inHours(hours, NIGHT);
  }

  /** A route whose doors are open now (shops shut for the night are left out); at night, half the time from a bar. */
  private pickRoute(hours: number): number | null {
    const routes = this.routes;
    const night = this.isNight(hours);
    const preferNight = night && random() < 0.5;
    const start = Math.floor(random() * this.general);
    let fallback: number | null = null;
    for (let k = 0; k < this.general; k++) {
      const i = (start + k) % this.general;
      const route = routes[i]!;
      if (route.night && !night) continue;
      const ends = [route.path[0]!, route.path[route.path.length - 1]!];
      if (!ends.every((end) => this.doorOpen(end, hours))) continue;
      if (!preferNight || route.night) return i;
      fallback ??= i;
    }
    return fallback;
  }

  /** A shop's door is open in its hours; a house door, the arcade's, a point far down a street always. */
  private doorOpen(at: Vec2, hours: number): boolean {
    if (Math.abs(at[1]) < DOOR_LINE && Math.abs(at[0] - PARK_STREET.line) > 0.3) return true;
    const shop = this.shopAt(at);
    return !shop || isShopOpen(shop, hours);
  }

  /** The kind of shop whose door is at `at`, if any (the plan's doors, or the painted one nearby). */
  private shopAt([x, z]: Vec2): ShopKind | null {
    let best: ShopDoor | null = null;
    let bestD = SNAP;
    for (const d of this.doors) {
      if (Math.abs(d.at[1] - z) > 0.3 && Math.abs(d.at[0] - x) > 0.3) continue;
      const dist = Math.hypot(d.at[0] - x, d.at[1] - z);
      // Within the shop's own front.
      const lo = Math.min(d.from[0], d.to[0]) - 0.2;
      const hi = Math.max(d.from[0], d.to[0]) + 0.2;
      const loZ = Math.min(d.from[1], d.to[1]) - 0.2;
      const hiZ = Math.max(d.from[1], d.to[1]) + 0.2;
      if (x < lo || x > hi || z < loZ || z > hiZ) continue;
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best?.shop.kind ?? null;
  }

  /** A route's end in a door: on Front Street's building lines, on Park Street's (our side), or the park's gate. */
  private isDoor([x, z]: Vec2): boolean {
    if (Math.abs(z) >= DOOR_LINE && Math.abs(z) <= FRONT.farLine + 0.1) return true;
    if (Math.abs(x - PARK_STREET.line) < 0.15) return true;
    const [gx, gz] = STREET_PLAN.parkGate.at;
    return Math.hypot(x - gx, z - gz) < 0.5;
  }

  /** On arrival: a few of the passers-by already somewhere along a route (not in a doorway, not on the road). */
  private warmUp(hours: number): void {
    let sent = 0;
    const busy = streetBusyAt(hours, this.options.weekday());
    const wanted = Math.min(PREWARM, Math.max(1, Math.round(this.options.count * busy * 0.6)));
    for (const passer of this.passers) {
      if (sent >= wanted) break;
      if (passer.state.kind !== 'away' || passer.leader || passer.member.resident) continue;
      const index = this.pickRoute(hours);
      if (index === null) continue;
      const route = this.routes[index]!;
      if (route.path.length < 3) continue;
      // A leg between the first and the last (so neither in a doorway), never the one across the road.
      const legs: number[] = [];
      for (let i = 1; i < route.path.length - 1; i++) if (i !== route.crossing) legs.push(i);
      const leg = legs[Math.floor(random() * legs.length)];
      if (leg === undefined) continue;
      this.send(passer, index, leg, 0.15 + random() * 0.7);
      sent++;
    }
  }

  /** The walker for `passer`, made the first time they go out. */
  private ensure(passer: Passer): Walker {
    if (passer.walker) return passer.walker;
    const m = passer.member;
    const resident = m.resident;
    const walker = new Walker({
      viewer: this.options.viewer,
      seed: m.seed,
      look: m.look,
      speed: m.speed,
      // A resident says their own lines, under their name.
      talk: resident ? undefined : () => this.options.talk(passer.role),
      lines: resident?.lines,
      speaker: resident?.name,
      label: resident ? `${resident.name} · say hello` : m.age === 'child' ? 'Child · say hi' : 'Passer-by · say hello',
      labelWithin: LABEL_WITHIN,
      corners: CORNER_RADIUS,
      fade: true,
      crowd: this.options.crowd,
      stopsToTalk: true,
    });
    walker.traverse((o) => {
      o.castShadow = false;
    });
    this.options.place(walker, new THREE.Vector3(0, 0, 0));
    walker.setPresent(false);
    walker.setFade(0);
    passer.walker = walker;
    const partner = passer.companion?.walker ?? passer.leader?.walker;
    if (partner) {
      walker.partner = partner;
      partner.partner = walker;
    }
    return walker;
  }

  /** Who they are on this trip, and how they go about it: the rush's commuters hurry, others may stop on the way. */
  private castRole(passer: Passer, hours: number): { role: TalkRole; stops: number; pace: number; hand: Held | null } {
    const m = passer.member;
    if (m.resident) return { role: 'passer', stops: 0, pace: 1, hand: null };
    if (passer.leader) return { role: m.age === 'child' ? 'child' : m.age === 'elder' ? 'elder' : 'passer', stops: 0, pace: 1, hand: null };
    if (m.age === 'elder') return { role: 'elder', stops: random() < 0.6 ? 1 : 2, pace: 1, hand: null };
    const rush = rushAt(hours, this.options.weekday());
    if (!m.dog && !passer.companion && random() < rush * 0.75) return { role: 'commuter', stops: 0, pace: RUSH_PACE, hand: random() < 0.35 ? 'phone' : null };
    const r = random();
    const stops = r < 0.4 ? 0 : r < 0.85 ? 1 : 2;
    const hand: Held | null = m.dog || passer.companion ? null : random() < 0.1 ? 'phone' : random() < 0.04 ? 'book' : null;
    return { role: 'passer', stops, pace: 1, hand };
  }

  /** What someone comes out of a shop's door with. */
  private carried(start: Vec2, hours: number): Held | null {
    if (!this.isDoor(start)) return null;
    const kind = this.shopAt(start);
    if (kind === 'bakery') return hours < 13 && random() < 0.7 ? 'baguette' : 'shopping';
    if (kind === 'florist') return 'flowers';
    if (kind === 'grocer' || kind === 'butcher' || kind === 'pharmacy' || kind === 'books' || kind === 'tabac' || kind === 'pets') return random() < 0.75 ? 'shopping' : null;
    return null;
  }

  /** The stops worth taking on `route` now, `count` of them at most (open hours, dry weather). */
  private chooseStops(index: number, count: number, hours: number): RouteStop[] {
    if (count <= 0) return [];
    const wet = this.dayNight.state.rain > 0.05 || this.dayNight.state.snow > 0.1;
    const open = this.routeStops[index]!.filter(({ stop }) => (!stop.dry || !wet) && (!stop.hours || (hours >= stop.hours[0] && hours < stop.hours[1])));
    const chosen: RouteStop[] = [];
    while (chosen.length < count && open.length) chosen.push(open.splice(Math.floor(random() * open.length), 1)[0]!);
    return chosen;
  }

  /** Sets off along route `index` from point `from` (or `t` of the way on to the next): out of its door, fading in, if it starts at one. */
  private send(passer: Passer, index: number, from: number, t = 0): void {
    const route = this.routes[index]!;
    const hours = this.dayNight.state.hours;
    const walker = this.ensure(passer);
    const a = route.path[from]!;
    const b = route.path[from + 1] ?? a;
    const start: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const how = this.castRole(passer, hours);
    passer.role = how.role;
    const steps = planTrip(route, from, t, this.chooseStops(index, how.stops, hours), (x) => this.crossingAt(x), (stop) => within(random, stop.seconds));
    passer.end = route.path[route.path.length - 1]!;
    passer.carry = from === 0 && t === 0 ? this.carried(start, hours) : null;
    this.setOff(passer, walker, new THREE.Vector3(start[0], 0, start[1]), steps, from === 0 && t === 0 && this.isDoor(start), how);
    // Their companion beside them (a child only by day), on the same trip a step to the right.
    const companion = passer.companion;
    if (companion && companion.state.kind === 'away' && (companion.member.age !== 'child' || (hours >= CHILD_HOURS[0] && hours < CHILD_HOURS[1]))) {
      const there = new THREE.Vector3(start[0], 0, start[1]);
      const cw = this.ensure(companion);
      const role = this.castRole(companion, hours);
      companion.role = role.role;
      companion.end = passer.end;
      companion.carry = null;
      this.setOff(companion, cw, besideStart(there, steps, BESIDE), besideSteps(steps, there, BESIDE), passer.door === 0, { ...role, pace: how.pace * (passer.member.speed / companion.member.speed) });
    }
  }

  private setOff(passer: Passer, walker: Walker, at: THREE.Vector3, steps: Step[], fromDoor: boolean, how: { pace: number; hand: Held | null }): void {
    walker.setPresent(true, at);
    passer.door = fromDoor ? 0 : 1;
    if (fromDoor && !passer.leader) this.throughDoor([at.x, at.z]);
    if (passer.dog) passer.dog.position.set(at.x, 0, at.z);
    passer.steps = steps;
    passer.chat = within(random, CHAT_EVERY);
    passer.looking = 0;
    passer.pauseFocus = null;
    // Dressed for the weather they set out in: an umbrella up (half of them) and a quicker step in the rain, hoods up in the snow.
    this.dress(passer, true, how.hand);
    walker.setPace((passer.wet ? RAIN_PACE : 1) * how.pace);
    this.next(passer);
  }

  /** Umbrella up or down, hood, what is in the hand, for the weather now; `fresh` on setting off (else only on a change of weather). */
  private dress(passer: Passer, fresh: boolean, hand: Held | null = null): void {
    const walker = passer.walker;
    if (!walker) return;
    const sky = this.dayNight.state;
    const wet = sky.rain > UMBRELLAS_ABOVE;
    if (!fresh && wet === passer.wet) return;
    passer.wet = wet;
    const umbrella = wet && passer.member.umbrella && !passer.dog && !passer.carry;
    walker.hold(umbrella ? 'umbrella' : (passer.carry ?? (fresh ? hand : null)));
    walker.setHood(!umbrella && (sky.snow > HOODS_ABOVE || (wet && sky.rain > 0.5)) && passer.member.age !== 'child');
  }

  /** The next step of their trip, or their door (or the edge of the street) once it is done. */
  private next(passer: Passer): void {
    const walker = passer.walker!;
    const step = passer.steps.shift();
    if (!step) {
      const end = passer.end;
      if (this.isDoor(end)) {
        if (!passer.leader) this.throughDoor(end);
        passer.state = { kind: 'entering', left: DOOR_FADE };
      } else this.leave(passer);
      return;
    }
    if (step.kind === 'walk') {
      passer.state = { kind: 'walking' };
      passer.pauseFocus = null;
      walker.walk(step.points, () => this.next(passer));
    } else if (step.kind === 'kerb') {
      passer.state = { kind: 'waiting', crossing: step.crossing, look: LOOK_BOTH_WAYS };
      walker.stand(walker.rotation.y, 'stand');
    } else {
      passer.state = { kind: 'pausing', left: step.seconds };
      passer.pauseFocus = this.localToWorld(step.focus.clone());
      walker.stand(step.yaw, passer.carry || passer.dog ? 'stand' : random() < 0.5 ? 'pockets' : 'stand', passer.pauseFocus);
      // A coin for the busker, now and then.
      if (step.gesture && random() < 0.35) walker.gesture(step.gesture);
    }
  }

  /** A door opens for them; a shop's bell rings. */
  private throughDoor(at: Vec2): void {
    this.options.doors?.open(at);
    const shop = this.options.doors ? this.options.doors.isShopDoor(at) : this.shopAt(at) !== null;
    if (shop) this.options.onDoor?.(at);
  }

  /** At the kerb: the lights' green man, or a look both ways at the zebra; then across and on. */
  private wait(passer: Passer, state: Extract<State, { kind: 'waiting' }>, dt: number): void {
    const crossing = STREET_PLAN.crossings[state.crossing];
    const go = crossing?.signals ? this.options.traffic.walkersGreen : (state.look -= dt) <= 0;
    if (go) this.next(passer);
  }

  private leave(passer: Passer): void {
    passer.walker?.setPresent(false);
    passer.walker?.setFade(0);
    passer.dog?.setFade(0);
    passer.lead?.setFade(0);
    passer.steps = [];
    passer.state = { kind: 'away', wait: 6 + random() * 16 };
  }

  private crossingAt(x: number): number {
    const i = STREET_PLAN.crossings.findIndex((c) => x > c.from - 1.5 && x < c.to + 1.5);
    return Math.max(0, i);
  }

  /** Keeps the obstacle on the walker, the dog and lead with them, their eyes on each other in a word. */
  private follow(passer: Passer, dt: number): void {
    const { walker, obstacle, state } = passer;
    if (!walker) return;
    // Down a kerb onto the road while crossing it (a step eased over a few centimetres either side of the kerb's edge).
    if (walker.isPresent) walker.position.y = kerbY(walker.position);
    obstacle.position.copy(walker.position);
    obstacle.wantsToCross = state.kind === 'waiting' ? state.crossing : null;
    obstacle.active = walker.isPresent && (roadAt(walker.position) || obstacle.wantsToCross !== null);
    if (walker.isPresent) this.talkWithCompanion(passer, dt);
    const dog = passer.dog;
    if (!dog || !walker.isPresent) return;
    const target = this.scratch.copy(DOG_OFFSET).applyAxisAngle(Y, walker.rotation.y).add(walker.position);
    const bark = passer.bark!;
    // Straining towards a pigeon or the cat.
    if (bark.bait) {
      const dx = bark.bait.x - target.x;
      const dz = bark.bait.z - target.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) target.set(target.x + (dx / d) * Math.min(BAIT.pull, d), 0, target.z + (dz / d) * Math.min(BAIT.pull, d));
    }
    dog.update(dt, target, walker.isWalking);
    dog.position.y = kerbY(dog.position);
    bark.clock -= dt;
    if (bark.clock <= 0) {
      bark.clock = BARK_EVERY[0] + random() * (BARK_EVERY[1] - BARK_EVERY[0]);
      if (passer.door >= 1) {
        bark.barks++;
        bark.position.copy(dog.position);
      }
    }
    const hand = this.spot.copy(LEAD_HAND).applyAxisAngle(Y, walker.rotation.y).add(walker.position);
    passer.lead!.string(hand, dog.collar);
  }

  /** Two walking together: one says something to the other now and then, eyes on them while they do. */
  private talkWithCompanion(passer: Passer, dt: number): void {
    const other = passer.companion ?? passer.leader;
    const walker = passer.walker!;
    if (!other?.walker?.isPresent || other.state.kind === 'away') return;
    if (passer.looking > 0) {
      passer.looking -= dt;
      other.walker.getWorldPosition(passer.eyesOn);
      passer.eyesOn.y += other.member.look.height * 0.92;
      walker.setFocus(passer.eyesOn);
      if (passer.looking <= 0) walker.setFocus(passer.pauseFocus);
    }
    // The leader keeps the clock for both.
    if (passer.leader) return;
    passer.chat -= dt;
    if (passer.chat > 0) return;
    passer.chat = within(random, CHAT_EVERY);
    const talker = random() < 0.55 ? passer : other;
    const seconds = 1.2 + random() * 2;
    talker.walker!.talkAlong(seconds);
    talker.looking = seconds;
    // The other looks back, mostly.
    const listener = talker === passer ? other : passer;
    if (random() < 0.7) listener.looking = seconds * 0.8;
  }

  /** How much of each passer-by shows (their door's fade times the distance's), the weather they walk in, what their dog sees. */
  private cull(): void {
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    const { drawDistance, fade } = this.options;
    const bait = this.options.dogBait?.();
    for (const passer of this.passers) {
      const { walker } = passer;
      if (!walker?.isPresent) continue;
      // A companion fades with whoever they are with (the door, the distance).
      const door = passer.leader && passer.leader.walker?.isPresent ? Math.min(passer.door, passer.leader.door) : passer.door;
      const amount = door * distanceFade(walker.position.distanceTo(this.eye), drawDistance, fade);
      walker.setFade(amount);
      passer.dog?.setFade(amount * walker.shownShare);
      passer.lead?.setFade(amount * walker.shownShare);
      this.dress(passer, false);
      if (passer.bark && bait) this.eyeOnBait(passer, bait);
    }
  }

  /** A walked dog spots a pigeon or the cat close by: it barks at once (once per sighting) and strains after it. */
  private eyeOnBait(passer: Passer, bait: Iterable<THREE.Vector3>): void {
    const bark = passer.bark!;
    const dog = passer.dog!;
    let nearest: THREE.Vector3 | null = null;
    let best = BAIT.within;
    for (const b of bait) {
      const d = Math.hypot(b.x - dog.position.x, b.z - dog.position.z);
      if (d < best) {
        best = d;
        nearest = b;
      }
    }
    if (nearest && !bark.bait && passer.door >= 1) {
      this.options.barkAt?.([dog.position.x, dog.position.z]);
      bark.clock = Math.max(bark.clock, BARK_EVERY[0]);
    }
    bark.bait = nearest;
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
    passer.bark = { barks: 0, position: new THREE.Vector3(), clock: BARK_EVERY[0], bait: null };
    this.barkers.push(passer.bark);
    this.dogs.push(dog);
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
  return -KERB_HEIGHT * smooth((into + KERB_EASE) / (2 * KERB_EASE));
}
