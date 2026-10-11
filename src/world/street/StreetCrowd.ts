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
import { besideStart, besideSteps, planTrip, stopsOnRoute, stretchRoutes, type CrowdRoute, type RouteStop, type Step, type Stop, type StopKind } from './life/crowdTrips';
import type { DoorGaps } from './life/DoorGaps';
import type { TalkRole } from './life/streetTalk';
import { isShopOpen } from './shops/shopHours';
import type { RoadObstacle, StreetTraffic } from './traffic/StreetTraffic';
import { STREET_PLAN, type ShopDoor, type ShopKind, type Vec2 } from './streetPlan';
import { FRONT, KERB_HEIGHT, PARK_STREET } from '@/world/measures/street';
import { shopDoors } from '@/world/city/facades';
import { atCrossing, groundHeight } from './relief/ground';
import { fnv1a, pick, random, within } from '@/random';
import { smooth } from '@/math/scalar';
import type { SocialServices } from '@/social/talk';
import { shortName } from '@/social/people';
import { metName } from '../people/socialHook';
import { greets, knownFaceHook, outNow, personOf } from './townsfolk/knownFaces';

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
  residents?: { outs: readonly CrowdRoute[]; backs: readonly CrowdRoute[]; lateBy: number; backBefore: readonly [number, number] };
  day?: () => number;
  /** The people the player can know (docs/social.md): the residents and the regulars who keep hours open a conversation (`townsfolk/knownFaces`). */
  social?: SocialServices;
  /** What the player owns (a regular's lead is about a copy they lack). */
  owns?: (id: string) => boolean;
  /** The Grand Flea Fair is on today: some come for it, a visitor or two photographs the bunting. */
  fairDay?: () => boolean;
  /** The busker is between two songs (those listening clap). */
  buskerResting?: () => boolean;
  /** Places a dog in the zone (so it can be patted); without it the dogs are only the crowd's children. */
  placeDog?: (dog: Dog) => void;
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
/** Commuters in the rush: this much quicker; now and then one late, running for it. */
const RUSH_PACE = 1.2;
const LATE = { chance: 0.08, pace: 2.5 };
/** Caught out in a downpour (no umbrella, no hood) some run for it; on the road when the green man goes, they hurry across. */
const DOWNPOUR = { above: 0.5, runs: 0.6, pace: 2.3 };
const HURRY_ACROSS = 1.9;
/** Of a morning a commuter has a coffee to go or the paper; an elder a walking stick now and then; a visitor a camera. */
const MORNING_UNTIL = 10.5;
const CANE = 0.3;
const PRAM = 0.05;
/** Someone walking with a friend: beside them, this far to the right; a word between them every few seconds. */
const BESIDE = 0.42;
const CHAT_EVERY = [3, 8] as const;
/** The night (the bars' hours): routes marked `night` are walked, by pairs leaving the bars. */
const NIGHT = { from: 21, to: 4 };
/** A child is out with their grown-up only in these hours. */
const CHILD_HOURS = [8, 20] as const;
/** A shop's painted door is within this of the plan's (the painter places doors along the front). */
const SNAP = 3.5;
/** Two regulars (or residents) who cross this close stop for a word (this often), these seconds; or a wave in passing. */
const MEET = { within: 1.9, chance: 0.35, seconds: [5, 10] as const, wave: 0.4 };
/** Listening to the busker: a nod with the beat every few seconds; a clap at the end of a song, most of them. */
const NOD_EVERY = [1.4, 2.8] as const;
const CLAP = 0.7;
/** Where the busker stands (the ring of listeners is round him, a step apart). */
const BUSKER_AT = STREET_PLAN.busker.at;
const RING = [0, -0.45, 0.45, -0.9, 0.9];
/** On the Fair's day this share of passers-by come for it; a visitor with a camera now and then (weekends too). */
const FAIR_GOERS = 0.45;
const TOURISTS = 0.12;
/** Out of RETRO GAMES (or the arcade's prize counter) with a bag, this often. */
const RETRO_BAG = 0.6;
/** A walked dog strains towards another dog or the player this close, and stops to sniff now and then. */
const DOG_GREET = 2.6;
const PLAYER_DOG = 2.2;
const SNIFF = 0.5;
/** What a dog's walker says when someone pats it. */
const PAT_LINES = ['He likes you! He doesn’t like everyone.', 'Careful, he’ll follow you home.', 'She’s a softie, that one.', 'Say thank you to the nice person. … He won’t.'];
/** Pairs going home from the bars: what carries over the street (a laugh, a song). */
const NIGHT_BANTER = ['Ha! No, listen, listen…', '…and then he says…!', 'Shh! People are sleeping!', 'One more song!', 'You’re hopeless!'];

type State =
  | { kind: 'away'; wait: number }
  | { kind: 'walking' }
  | { kind: 'waiting'; crossing: number; look: number }
  | { kind: 'pausing'; left: number; what: StopKind; nod: number }
  | { kind: 'meeting'; left: number; other: Passer; chat: number }
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
  /** The points of the walk they are on (to take it up again after stopping for a word). */
  walkPoints: THREE.Vector3[];
  /** Stopped for a word (or waved) with someone they know on this trip already. */
  met: boolean;
  /** On a night route home from the bars. */
  night: boolean;
  /** A known face (`townsfolk/knownFaces`) nodded or waved to the player on this trip already. */
  greeted: boolean;
  /** What they set out with in the hand (a phone, a coffee, a camera), and their pace on this trip. */
  hand: Held | null;
  pace: number;
  /** Hurrying across the road as the lights change (their pace stepped up until the far kerb). */
  hurrying: boolean;
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
 * player brushing past and stop to say a word when clicked (`talk`, by role: home from the bars, out of a shop with a
 * bag, window-shopping, walking the dog, at the Fair, a visitor taking pictures). Two regulars (or residents) crossing
 * stop for a word now and then, or wave in passing; pairs laugh, point things out, and late at night carry on loud.
 * Those listening to the busker stand in a ring, nod along and clap at the end of a song. The dogs sniff about,
 * greet each other and the player, and take a pat (their walker has a word). Residents go out on their errand of the
 * day; on the stretch the works opened (once moved on) routes run between its doors. People are the costliest meshes here
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
  /** The residents' ways out (indices in `routes`), and back the same way. */
  private readonly residentOuts: number[] = [];
  private readonly residentBacks: number[] = [];
  /** The next place in the ring round the busker, and whether he was between songs when last looked. */
  private ring = 0;
  private buskerRested = false;

  constructor(private readonly dayNight: DayNight, private readonly options: StreetCrowdOptions) {
    super();
    this.name = 'StreetCrowd';
    // The plan's routes, and those on the stretch the works opened once they moved on (`stretchRoutes`).
    this.routes = [...options.routes, ...stretchRoutes(this.doors)].map((r) => this.snapRoute(r));
    this.general = this.routes.length;
    if (options.residents) {
      for (const out of options.residents.outs) this.residentOuts.push(this.routes.push(out) - 1);
      for (const back of options.residents.backs) this.residentBacks.push(this.routes.push(back) - 1);
    }
    this.routeStops = this.routes.map((r, i) => (i < this.general ? stopsOnRoute(r, options.stops ?? []) : []));
    options.cast.forEach((member, i) => {
      const obstacle = new Obstacle();
      options.traffic.obstacles.add(obstacle);
      const passer: Passer = {
        member, walker: null, state: { kind: 'away', wait: member.resident ? Infinity : 3 + 5 * i }, door: 1, obstacle, dog: null, lead: null, bark: null,
        steps: [], end: [0, 0], role: 'passer', carry: null, companion: null, leader: null, chat: 4, looking: 0, pauseFocus: null, wet: false,
        eyesOn: new THREE.Vector3(), walkPoints: [], met: false, night: false, greeted: false, hand: null, pace: 1, hurrying: false,
      };
      this.passers.push(passer);
      if (member.dog) this.addDog(passer, member.seed);
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
    const boost = this.options.boost?.() ?? 1;
    const busy = streetBusyAt(hours, this.options.weekday()) * boost;
    // A busier day than usual (the Fair, a new stock day) raises the most out at once too, not only the share of it.
    const allowed = Math.max(1, Math.min(Math.round(this.options.count * boost), Math.round(this.options.count * busy * (1 - (1 - RAIN_SHARE) * rain))));
    let out = 0;
    for (const passer of this.passers) if (passer.state.kind !== 'away' && !passer.leader) out++;
    // Whoever has waited longest past their time goes out first (the looks take turns); companions go with theirs.
    let next: Passer | null = null;
    let longest = 0;
    for (const passer of this.passers) {
      const state = passer.state;
      if (state.kind !== 'away') continue;
      state.wait -= dt;
      // A regular who keeps hours (`townsfolk/regularsPlan`) stays in outside them.
      if (passer.leader || passer.member.resident || !outNow(passer.member, hours)) continue;
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
        // Listening to the busker: nodding along while he plays.
        if (state.what === 'busker' && !this.buskerRested && (state.nod -= dt) <= 0) {
          state.nod = within(random, NOD_EVERY);
          passer.walker?.nod();
        }
        if (state.left <= 0) this.next(passer);
      } else if (state.kind === 'meeting') this.meeting(passer, state, dt);
      else if (state.kind === 'entering') {
        state.left -= dt;
        passer.door = Math.max(0, state.left / DOOR_FADE);
        if (state.left <= 0) this.leave(passer);
      } else if (passer.door < 1) passer.door = Math.min(1, passer.door + dt / DOOR_FADE);
      this.follow(passer, dt);
    }
    this.applause();
    this.cullClock += dt;
    if (this.cullClock >= CULL_EVERY) {
      this.cullClock = 0;
      this.cull();
      this.meetings();
      this.residentsOut(hours);
    }
  }

  /** The busker finished a song: those listening clap (most of them). */
  private applause(): void {
    const resting = this.options.buskerResting?.() ?? false;
    if (resting && !this.buskerRested) {
      for (const p of this.passers) if (p.state.kind === 'pausing' && p.state.what === 'busker' && random() < CLAP) p.walker?.gesture('clap');
    }
    this.buskerRested = resting;
  }

  /**
   * Two of the regulars or residents (people who know each other) crossing on the pavement: now and then they stop for
   * a word, facing each other, one waving as they meet; or they wave in passing. Once a trip each.
   */
  private meetings(): void {
    for (const a of this.passers) {
      if (!this.canMeet(a)) continue;
      const wa = a.walker!;
      for (const b of this.passers) {
        if (b === a || !this.canMeet(b)) continue;
        const wb = b.walker!;
        if (wa.position.distanceTo(wb.position) > MEET.within) continue;
        // Coming towards each other (not one overtaking the other).
        if (Math.cos(wa.facingYaw - wb.facingYaw) > -0.3) continue;
        a.met = true;
        b.met = true;
        if (random() < MEET.chance) this.meet(a, b);
        else if (random() < MEET.wave) {
          wa.gesture('wave');
          wb.nod();
        }
        break;
      }
    }
  }

  /** Someone who may stop for a word: a regular or a resident, walking alone on the pavement, not met anyone this trip. */
  private canMeet(p: Passer): boolean {
    if (p.met || p.state.kind !== 'walking' || p.companion || p.leader || p.dog || p.door < 1) return false;
    if (p.member.stranger && !p.member.resident) return false;
    const w = p.walker;
    return !!w && w.isPresent && w.drawn && !roadAt(w.position);
  }

  /** The two stop and face each other; one waves; they talk a while, then each goes on their way. */
  private meet(a: Passer, b: Passer): void {
    const seconds = within(random, MEET.seconds);
    for (const [me, other] of [[a, b], [b, a]] as const) {
      const w = me.walker!;
      me.state = { kind: 'meeting', left: seconds, other, chat: 0.6 + random() };
      other.walker!.getWorldPosition(me.eyesOn);
      me.eyesOn.y += other.member.look.height * 0.92;
      w.stand(Math.atan2(other.walker!.position.x - w.position.x, other.walker!.position.z - w.position.z), random() < 0.5 ? 'stand' : 'pockets', me.eyesOn.clone());
      w.react('good');
    }
    a.walker!.gesture('wave');
  }

  /** A word between two who met: by turns; then back onto the rest of the walk they were on. */
  private meeting(passer: Passer, state: Extract<State, { kind: 'meeting' }>, dt: number): void {
    const walker = passer.walker!;
    state.left -= dt;
    state.chat -= dt;
    if (state.chat <= 0 && passer.member.seed < state.other.member.seed) {
      // The one with the lower seed keeps the clock for both: one of them talks.
      state.chat = 1.6 + random() * 1.8;
      const talker = random() < 0.5 ? passer : state.other;
      talker.walker?.talkAlong(state.chat * 0.85);
    }
    if (state.left > 0) return;
    passer.state = { kind: 'walking' };
    if (random() < 0.5) walker.gesture('wave');
    const rest = passer.walkPoints.slice(walker.pointsPassed);
    passer.walkPoints = rest;
    if (rest.length) walker.walk(rest, () => this.next(passer));
    else this.next(passer);
  }

  /**
   * A resident due out (their hour, a little late at most) or due home (a while before theirs) sets off: their errand
   * of the day (the park, the bakery, the grocer's, down Park Street: drawn per resident and game day), home the same way.
   */
  private residentsOut(hours: number): void {
    const plan = this.options.residents;
    if (!plan) return;
    const day = this.options.day?.() ?? 0;
    for (const passer of this.passers) {
      const r = passer.member.resident;
      if (!r || passer.state.kind !== 'away') continue;
      const outKey = `${r.key}:out:${day}`;
      const backKey = `${r.key}:back:${day}`;
      const way = fnv1a(`${r.key}:${day}`) % Math.max(1, this.residentOuts.length);
      const out = this.residentOuts[way];
      const back = this.residentBacks[way] ?? this.residentBacks[0];
      if (out !== undefined && !this.residentsDone.has(outKey) && inHours(hours, [r.out, r.out + plan.lateBy])) {
        this.residentsDone.add(outKey);
        this.send(passer, out, 0);
      } else if (back !== undefined && !this.residentsDone.has(backKey) && hours >= r.back - plan.backBefore[0] && hours < r.back - plan.backBefore[1]) {
        this.residentsDone.add(backKey);
        this.send(passer, back, 0);
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

  /**
   * Makes the walkers of the first `count` of the cast ahead of need, one per step (a person costs a good tenth of a
   * second to build): run between the street's build steps, so nobody is built in a frame of the walk.
   */
  *prebuild(count: number): Generator<void, void, void> {
    let made = 0;
    for (const passer of this.passers) {
      if (made >= count) return;
      if (passer.walker) continue;
      this.ensure(passer);
      made++;
      yield;
    }
  }

  /** The walker for `passer`, made the first time they go out. */
  private ensure(passer: Passer): Walker {
    if (passer.walker) return passer.walker;
    const m = passer.member;
    const resident = m.resident;
    // Someone the player can know (a resident, a regular who keeps hours): a click is the conversation, their name once met.
    const person = personOf(m);
    const social = knownFaceHook(m, () => walker, this.options.social, this.options.owns ?? (() => false));
    const walker: Walker = new Walker({
      viewer: this.options.viewer,
      seed: m.seed,
      look: m.look,
      speed: m.speed,
      // A resident says their own lines, under their name.
      talk: resident ? undefined : () => this.options.talk(passer.role),
      lines: resident?.lines,
      speaker: person && social ? metName(person, resident?.name ?? shortName(person)) : resident?.name,
      label: resident ? `${resident.name} · say hello` : m.age === 'child' ? 'Child · say hi' : 'Passer-by · say hello',
      labelWithin: LABEL_WITHIN,
      corners: CORNER_RADIUS,
      fade: true,
      crowd: this.options.crowd,
      stopsToTalk: true,
      social,
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
    if (m.age === 'elder') return { role: 'elder', stops: random() < 0.6 ? 1 : 2, pace: 1, hand: random() < CANE ? 'cane' : random() < 0.15 ? 'newspaper' : null };
    const weekday = this.options.weekday();
    const rush = rushAt(hours, weekday);
    if (!m.dog && !passer.companion && random() < rush * 0.75) {
      // Late: running for the bus, the office.
      if (random() < LATE.chance) return { role: 'commuter', stops: 0, pace: LATE.pace, hand: null };
      const morning = hours < MORNING_UNTIL;
      const r = random();
      const hand: Held | null = morning && r < 0.3 ? 'cup' : morning && r < 0.45 ? 'newspaper' : r < 0.7 ? 'phone' : null;
      return { role: 'commuter', stops: 0, pace: RUSH_PACE, hand };
    }
    const r = random();
    const stops = r < 0.4 ? 0 : r < 0.85 ? 1 : 2;
    if (m.dog) return { role: 'dog', stops: Math.min(stops, 1), pace: 1, hand: null };
    const fair = this.options.fairDay?.() ?? false;
    // A visitor taking in the street (the Fair's day, weekends): phone out for pictures, in no hurry.
    if (m.stranger && !passer.companion && (fair || weekday >= 5) && random() < TOURISTS) return { role: 'tourist', stops: 2, pace: 0.85, hand: random() < 0.5 ? 'camera' : 'phone' };
    if (fair && random() < FAIR_GOERS) return { role: 'fair', stops, pace: 1.05, hand: null };
    // A teenager is on their phone more often than not.
    const phone = m.age === 'teen' ? 0.45 : 0.1;
    // Now and then a grown-up pushing a pram, in no hurry.
    if (!passer.companion && m.age === 'adult' && random() < PRAM) return { role: 'passer', stops: Math.min(stops, 1), pace: 0.85, hand: 'pram' };
    const hand: Held | null = passer.companion ? null : random() < phone ? 'phone' : random() < 0.04 ? 'book' : random() < 0.06 ? 'cup' : null;
    return { role: 'passer', stops, pace: 1, hand };
  }

  /** What someone comes out of a shop's door with. */
  private carried(start: Vec2, hours: number): Held | null {
    if (!this.isDoor(start)) return null;
    const kind = this.shopAt(start);
    if (kind === 'bakery') return hours < 13 && random() < 0.7 ? 'baguette' : 'shopping';
    if (kind === 'florist') return 'flowers';
    if (kind === 'tabac' && random() < 0.5) return 'newspaper';
    if (kind === 'cafe' && hours < 12 && random() < 0.5) return 'cup';
    if (kind === 'grocer' || kind === 'butcher' || kind === 'pharmacy' || kind === 'books' || kind === 'tabac' || kind === 'pets') return random() < 0.75 ? 'shopping' : null;
    // Out of RETRO GAMES (the flea market behind it) with a find in the shop's bag, or the arcade's prize.
    if (kind === 'retro') return random() < RETRO_BAG ? 'gamebag' : null;
    if (kind === 'arcade') return random() < RETRO_BAG / 2 ? 'gamebag' : null;
    return null;
  }

  /** The stops worth taking on `route` now, `count` of them at most (open hours, dry weather; a picture only for a visitor on the Fair's day). */
  private chooseStops(index: number, count: number, hours: number, role: TalkRole): RouteStop[] {
    if (count <= 0) return [];
    const wet = this.dayNight.state.rain > 0.05 || this.dayNight.state.snow > 0.1;
    const fair = this.options.fairDay?.() ?? false;
    const open = this.routeStops[index]!.filter(
      ({ stop }) => (!stop.dry || !wet) && (!stop.hours || (hours >= stop.hours[0] && hours < stop.hours[1])) && (stop.kind !== 'photo' || (role === 'tourist' && (!stop.fair || fair))),
    );
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
    const chosen = this.chooseStops(index, how.stops, hours, how.role);
    const steps = planTrip(route, from, t, chosen, (x) => this.crossingAt(x), (stop) => within(random, stop.seconds));
    this.ringBusker(steps);
    passer.end = route.path[route.path.length - 1]!;
    passer.greeted = false;
    passer.carry = from === 0 && t === 0 ? this.carried(start, hours) : null;
    passer.met = false;
    passer.night = route.night === true;
    // Who they are on this trip, for what they say: home from the bars, out of a shop with their bag, window-shopping.
    let role = how.role;
    if (passer.night && role !== 'child') role = 'night';
    else if (role === 'passer' && passer.carry) role = 'shopper';
    else if (role === 'passer' && chosen.some((c) => c.stop.kind === 'window')) role = 'window';
    passer.role = role;
    if (passer.dog) passer.dog.setSniffing(random() < SNIFF);
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
      // A child walks hand in hand with their grown-up.
      const hand = (companion.member.age === 'child') !== (passer.member.age === 'child');
      walker.holdHand(hand ? cw : null);
      cw.holdHand(hand ? walker : null);
    }
  }

  /**
   * Listeners at the busker stand in a ring round him, each a step along it from the last (not all on one spot): the
   * walk up to the stop ends at the next free place.
   */
  private ringBusker(steps: Step[]): void {
    for (let k = 1; k < steps.length; k++) {
      const step = steps[k]!;
      const before = steps[k - 1]!;
      if (step.kind !== 'pause' || step.what !== 'busker' || before.kind !== 'walk') continue;
      const spot = before.points[before.points.length - 1]!;
      const angle = RING[this.ring++ % RING.length]!;
      const dx = spot.x - BUSKER_AT[0];
      const dz = spot.z - BUSKER_AT[1];
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      spot.set(BUSKER_AT[0] + dx * c - dz * sn, 0, BUSKER_AT[1] + dx * sn + dz * c);
      // Facing him from there.
      step.yaw = Math.atan2(BUSKER_AT[0] - spot.x, BUSKER_AT[1] - spot.z);
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
    passer.hand = how.hand;
    passer.hurrying = false;
    this.dress(passer, true, how.hand);
    // Caught in a downpour with nothing over the head, most run for it.
    const sky = this.dayNight.state;
    const soaked = passer.wet && sky.rain > DOWNPOUR.above && !passer.member.umbrella && !passer.leader && !passer.companion && !passer.dog && random() < DOWNPOUR.runs;
    passer.pace = soaked ? DOWNPOUR.pace : (passer.wet ? RAIN_PACE : 1) * how.pace;
    walker.setPace(passer.pace);
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
      passer.walkPoints = step.points;
      walker.walk(step.points, () => this.next(passer));
    } else if (step.kind === 'kerb') {
      passer.state = { kind: 'waiting', crossing: step.crossing, look: LOOK_BOTH_WAYS };
      walker.stand(walker.rotation.y, 'stand');
    } else {
      passer.state = { kind: 'pausing', left: step.seconds, what: step.what, nod: within(random, NOD_EVERY) };
      passer.pauseFocus = this.localToWorld(step.focus.clone());
      if (step.what === 'photo') {
        // A picture: the camera up to the eye, or the phone held up at it.
        if (passer.hand === 'camera') {
          walker.stand(step.yaw, 'stand', passer.pauseFocus);
          walker.gesture('takePhoto');
          return;
        }
        walker.stand(step.yaw, 'phone', passer.pauseFocus);
        walker.hold('phone');
        return;
      }
      walker.stand(step.yaw, passer.carry || passer.dog ? 'stand' : random() < 0.5 ? 'pockets' : 'stand', passer.pauseFocus);
      // A coin for the busker now and then; a look at the watch after the clock's.
      if (step.gesture && (step.what === 'clock' || random() < 0.35)) walker.gesture(step.gesture);
      // Two walking together: one points something out in the window.
      if (step.what === 'window' && passer.companion?.walker && random() < 0.5) walker.gesture('point');
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

  /**
   * On the road at the lights as the green man goes (flashing, or red already): a quicker step, a run for the young,
   * until the far kerb; then their own pace again.
   */
  private hurryAcross(passer: Passer, walker: Walker): void {
    const onRoad = walker.isPresent && walker.isWalking && roadAt(walker.position);
    if (passer.hurrying && !onRoad) {
      passer.hurrying = false;
      walker.setPace(passer.pace);
      return;
    }
    if (!onRoad || passer.hurrying || passer.dog) return;
    const crossing = STREET_PLAN.crossings[this.crossingAt(walker.position.x)];
    if (!crossing?.signals || (this.options.traffic.walkersGreen && !this.options.traffic.walkersFlashing)) return;
    passer.hurrying = true;
    walker.setPace(Math.max(passer.pace, 1) * (passer.member.age === 'elder' ? 1.25 : HURRY_ACROSS));
  }

  private leave(passer: Passer): void {
    passer.walker?.setPresent(false);
    passer.walker?.setFade(0);
    passer.dog?.setFade(0);
    passer.dog?.putAway();
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
    this.hurryAcross(passer, walker);
    obstacle.position.copy(walker.position);
    obstacle.wantsToCross = state.kind === 'waiting' ? state.crossing : null;
    obstacle.active = walker.isPresent && (roadAt(walker.position) || obstacle.wantsToCross !== null);
    if (walker.isPresent) this.talkWithCompanion(passer, dt);
    const dog = passer.dog;
    if (!dog || !walker.isPresent) return;
    const target = this.scratch.copy(DOG_OFFSET).applyAxisAngle(Y, walker.rotation.y).add(walker.position);
    const bark = passer.bark!;
    // Straining towards a pigeon or the cat; to another dog (tails going); up to the player close by.
    const friend = this.dogNear(dog);
    const pull = bark.bait ?? friend?.position ?? (Math.hypot(this.eye.x - dog.position.x, this.eye.z - dog.position.z) < PLAYER_DOG ? this.eye : null);
    if (pull) {
      const dx = pull.x - target.x;
      const dz = pull.z - target.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) target.set(target.x + (dx / d) * Math.min(BAIT.pull, d), 0, target.z + (dz / d) * Math.min(BAIT.pull, d));
      if (!bark.bait) dog.excite(0.5);
    }
    dog.trot(dt, target, walker.isWalking);
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
    // The other looks back, mostly; laughs now and then. Home from the bars, a word carries over the street.
    const listener = talker === passer ? other : passer;
    if (random() < 0.7) listener.looking = seconds * 0.8;
    if (random() < 0.3) listener.walker?.react('good');
    if (passer.night && random() < 0.35) talker.walker!.say(pick(random, NIGHT_BANTER), 1.8);
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
      // A known face passing the player: a nod, a wave from a friend (once a trip).
      if (!passer.greeted && passer.door >= 1 && greets(passer.member, walker, this.eye)) passer.greeted = true;
      if (passer.bark && bait) this.eyeOnBait(passer, bait);
    }
  }

  /** Another walked dog close by `dog` (they greet each other), or null. */
  private dogNear(dog: Dog): Dog | null {
    if (!dog.visible) return null;
    for (const other of this.dogs) {
      if (other === dog || !other.visible) continue;
      if (Math.hypot(other.position.x - dog.position.x, other.position.z - dog.position.z) < DOG_GREET) return other;
    }
    return null;
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
    if (this.options.placeDog) this.options.placeDog(dog);
    else this.add(dog);
    // After placing (which sets its position): out of the crosshair's way until its walker sets off.
    dog.putAway();
    // A pat: its walker has a word (and stops a moment, if walking past).
    dog.onPat = () => passer.walker?.say(pick(random, PAT_LINES), 2.6);
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
