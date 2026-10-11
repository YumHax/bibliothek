import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { inHours } from '@/time/clock';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { rushAt, wakefulnessAt, type Weekday } from '@/time/wakefulness';
import { Walker } from '../../people/Walker';
import type { Held } from '../../people/held';
import type { Pose } from '../../people/poses';
import type { StreetTraffic } from '../traffic/StreetTraffic';
import { STREET_PLAN, type Vec2 } from '../streetPlan';
import { FRONT } from '@/world/measures/street';
import { BUS } from '../carModel';
import { Figure } from './Figure';
import { rainGear, streetLook, umbrellaWeather } from './streetLook';
import type { TalkRole } from './streetTalk';
import { pick, random, within } from '@/random';

type Standing = typeof STREET_PLAN.standing;

/** Who sits on a bench a while: someone resting their legs, someone eating their lunch, a reader. */
export type SitterKind = 'elder' | 'lunch' | 'reader';

/** A bench taken in turns by the street's sitters (`STREET_PLAN.standing.sitters`). */
export interface SitterSpot {
  at: Vec2;
  yaw: number;
  hours: readonly [number, number];
  kinds: readonly SitterKind[];
}

interface StandingPeopleOptions {
  /** Where they stand, sit and wait (`STREET_PLAN.standing`). */
  spots: Standing;
  /** The bus stop's bus: where it stops (its doors are towards its front). */
  busStop: Vec2;
  /** The bus shelter's bench (its seat's middle, zone-local) and the way one faces sitting on it. */
  shelterSeat?: { at: Vec2; yaw: number };
  traffic: StreetTraffic;
  viewer: THREE.Object3D;
  /** What they say when clicked, by who they are. */
  talk: (role: TalkRole) => string;
  /** Today's weekday: in the rush more wait for the bus. */
  weekday: () => Weekday;
  /** Places a walker in the zone (ticked and clickable), zone-local. */
  place: (walker: Walker, at: THREE.Vector3) => void;
  /** Not drawn beyond this, faded over the last `fade` metres. */
  drawDistance: number;
  fade: number;
  /** Only the one at the bus stop (low quality). */
  busStopOnly?: boolean;
  /** Someone came out of or went into a door at `at` (a shop's bell). */
  onDoor?: (at: Vec2) => void;
}

/** Where the waiting passenger comes from when the stop is empty again: the pharmacy's door, just along. */
const FROM_DOOR: Vec2 = [32.5, 12];
/** The bus's front door (where they get on), from its stop point along its heading (+x), and the kerb it opens onto. */
const DOORS_AHEAD = BUS.doors[0];
const KERB_Z = FRONT.farKerb + 0.35;

/** A session on the phone or on the bench lasts this many game minutes; the spot then stays empty this long. */
const SESSION = [20, 60] as const;
const BREAK = [10, 40] as const;
/** Where someone comes from and goes to along the pavement (x metres from their spot, either way). */
const WALK_IN = 5;
const WALK_OFF = -7;
/** A stranger's caption shows only this close. */
const LABEL_WITHIN = 4;
/** The bench's seat height. */
const SEAT = 0.48;
/** The player sitting on a bench: their eye is this low, this close to its middle. */
const PLAYER_SEATED = { below: 1.4, within: 1.1 };
/** Someone sits down beside the player on a bench a while after they sat down (s), at this far along it. */
const BESIDE_AFTER = [12, 35] as const;
const BESIDE_ALONG = 0.55;
/** What someone sitting down beside the player says. */
const BESIDE_LINES = ['Mind if I sit? My feet are killing me.', 'Is this seat free? Lovely.', 'Ah, a bench. And company.'];
/** The lunch hour on the benches. */
const LUNCH = [12, 14] as const;
/** What a sitter says, by how they sit. */
/** Off the bus, this share pull a suitcase. */
const SUITCASE = 0.3;
const SITTER_ROLE: Record<SitterKind, TalkRole> = { reader: 'reader', lunch: 'lunch', elder: 'elder' };
/** The first passenger, now and then by day, waits sat on the shelter's bench. */
const SITS_IN_SHELTER = 0.45;

/** Someone at the bus stop: where they wait, and how far along they are. */
interface Waiter {
  figure: Figure;
  at: THREE.Vector3;
  state: 'waiting' | 'boarding' | 'gone' | 'arriving';
  /** Seconds before they turn up again once gone. */
  clock: number;
  /** Waiting sat on the shelter's bench (the first passenger, now and then). */
  seated: boolean;
  /** On the phone while they wait. */
  phone: boolean;
}

type RotaKind = 'phone' | 'bench';

/**
 * A spot taken in turns (the phone caller's, a bench): two people who come along, stay a
 * session of `SESSION` game minutes, walk off, and a while later one of them (the other, mostly)
 * turns up again.
 */
interface Rota {
  kind: RotaKind;
  spot: { readonly at: readonly [number, number]; readonly yaw: number };
  /** When they come (game hours) and what they are (a bench's sitters: each their own way of sitting). */
  hours: readonly [number, number];
  sitters: readonly SitterKind[];
  figures: readonly [Figure, Figure];
  current: number;
  state: 'away' | 'arriving' | 'there' | 'leaving';
  /** Game minutes (`StandingPeople.minutes`) at which the session or the break ends. */
  until: number;
  /** Phone only: seconds to the next step away and back, and which way they stand. */
  pace: number;
  out: boolean;
  /** The sitter on now (a bench's), and where along the bench they sat (m from its middle). */
  sitter: SitterKind;
  along: number;
  /** Sheltering from the rain (the caller, by the wall). */
  sheltered: boolean;
}

/**
 * The people who stand about rather than pass: someone on the phone outside the grocer's,
 * pacing a step now and then (stepping in by the wall out of the rain); someone reading on the bench, and on the far
 * pavement's bench someone resting their legs, eating their lunch at noon or reading, taking turns (and, when the
 * player has sat a while on that bench, someone sitting down at its other end); someone waiting at the bus stop (on
 * the shelter's bench now and then, and in the rush two more, `busQueue`, some on their phones), who walk to the
 * bus's doors and get on in turn while it stands there (`traffic.busAtStop`), after which others turn up a while
 * later from along the pavement, and as it pulls in up to `alightMax` get off and walk off their several ways
 * (`busStop.alights`). The caller and the sitters take turns (`Rota`): 20 to 60 game minutes, then off along the
 * pavement, someone else later. Everyone is dressed for the season (`streetLook`); out of the shelter an umbrella
 * goes up in the rain. They keep their hours (fewer at night: `wakefulnessAt`), fade in and out as they come and go,
 * and at the edge of sight. Clicking one gets a word (`talk`).
 */
export class StandingPeople extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly rotas: Rota[] = [];
  private readonly bench: Rota | null = null;
  /** Those at the bus stop: the first always comes back; the others only in the rush and busy hours. */
  private readonly waiters: Waiter[] = [];
  private readonly alighters: Figure[] = [];
  private wasAtStop = false;
  private readonly eye = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private readonly doors = new THREE.Vector3();
  /** Game minutes gone by since the street was built (the rotas' clock), and the hour last seen. */
  private minutes = 0;
  private lastHours = NaN;
  /** The first update after activation seats whoever is due straight away (the player has only just arrived). */
  private fresh = true;
  /** It rained hard enough for umbrellas when last looked. */
  private wet = false;
  /** Seconds the player has sat on each bench rota's bench (to send someone to sit beside them). */
  private readonly playerSat = new Map<Rota, number>();

  constructor(private readonly dayNight: DayNight, private readonly options: StandingPeopleOptions) {
    super();
    this.name = 'StandingPeople';
    const make = (seed: number, label: string, role: TalkRole | (() => TalkRole), age?: 'elder'): Figure => {
      const walker = new Walker({ viewer: options.viewer, seed, look: streetLook(seed, age), speed: age === 'elder' ? 0.8 : 1.1, talk: () => options.talk(typeof role === 'function' ? role() : role), label, labelWithin: LABEL_WITHIN, corners: 0.5, fade: true, stopsToTalk: true });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3());
      return new Figure(walker);
    };
    const { spots } = options;
    const first: Waiter = { figure: make(411, 'Waiting for the bus · ask', 'bus'), at: at(spots.busStop.at), state: 'waiting', clock: 0, seated: false, phone: false };
    first.figure.show(first.at.clone(), true);
    first.figure.walker.stand(spots.busStop.yaw, 'pockets');
    this.waiters.push(first);
    if (!options.busStopOnly) {
      spots.busQueue.forEach((spot, i) => this.waiters.push({ figure: make(471 + i * 6, 'Waiting for the bus · ask', 'bus'), at: at(spot), state: 'gone', clock: 5 + i * 20, seated: false, phone: false }));
      const rota = (kind: RotaKind, spot: Rota['spot'], hours: readonly [number, number], sitters: readonly SitterKind[], a: Figure, b: Figure): Rota => {
        const r: Rota = { kind, spot, hours, sitters, figures: [a, b], current: 1, state: 'away', until: 0, pace: 6, out: false, sitter: sitters[0] ?? 'reader', along: 0, sheltered: false };
        this.rotas.push(r);
        return r;
      };
      rota('phone', spots.phone, spots.phone.hours, [], make(419, 'On the phone · interrupt', 'phone'), make(457, 'On the phone · interrupt', 'phone'));
      this.bench = rota('bench', spots.bench, spots.bench.hours, ['reader'], make(431, 'Reader · say hello', 'reader'), make(461, 'Reader · say hello', 'reader'));
      (spots.sitters as readonly SitterSpot[]).forEach((s, i) => {
        // What they say is who they are on the bench today.
        const holder: { rota: Rota | null } = { rota: null };
        const role = (): TalkRole => SITTER_ROLE[holder.rota?.sitter ?? 'reader'];
        const elder = s.kinds.includes('elder');
        holder.rota = rota('bench', s, s.hours, s.kinds, make(521 + i * 10, 'Sitting on the bench · say hello', role, elder ? 'elder' : undefined), make(527 + i * 10, 'Sitting on the bench · say hello', role));
      });
      for (let i = 0; i < spots.alightMax; i++) this.alighters.push(make(443 + i * 4, 'Passer-by · say hello', 'passer'));
    }
  }

  /** Someone is on the reader's bench, or on their way to or from it. */
  get benchTaken(): boolean {
    return this.bench !== null && this.bench.state !== 'away';
  }

  /** Someone of the street is on the bench at `at` (zone-local), or on their way to or from it. */
  benchTakenAt(spot: Vec2): boolean {
    return this.rotas.some((r) => r.kind === 'bench' && r.state !== 'away' && Math.hypot(r.spot.at[0] - spot[0], r.spot.at[1] - spot[1]) < 0.5);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setZoneActive(active: boolean): void {
    if (active) this.fresh = true;
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const awake = wakefulnessAt(s.hours);
    const { drawDistance, fade } = this.options;
    this.options.viewer.getWorldPosition(this.eye);
    this.local.copy(this.eye);
    this.worldToLocal(this.local);
    if (!Number.isNaN(this.lastHours)) this.minutes += (((s.hours - this.lastHours) % 24) + 24) % 24 * 60;
    this.lastHours = s.hours;
    const wet = umbrellaWeather(s);
    const rained = wet !== this.wet;
    this.wet = wet;

    for (const rota of this.rotas) {
      let due = inHours(s.hours, rota.hours);
      // Nobody sits out on a wet or snowy bench; the lunch crowd only round noon.
      if (rota.kind === 'bench') due = due && s.rain < 0.1 && s.snowCover < 0.3;
      this.updateRota(rota, dt, due, rained);
    }
    this.fresh = false;
    this.updateBusStop(dt, awake, rushAt(s.hours, this.options.weekday()));
    for (const w of this.waiters) w.figure.update(dt, this.eye, drawDistance, fade);
    for (const a of this.alighters) {
      // Walking off in the rain: an umbrella up.
      if (rained && a.shown) rainGear(a.walker, s, null);
      a.update(dt, this.eye, drawDistance, fade);
    }
  }

  /** One turn-taking spot: someone comes, stays a session, leaves; the spot stays empty a while; out of hours, nobody. */
  private updateRota(rota: Rota, dt: number, due: boolean, rained: boolean): void {
    const figure = rota.figures[rota.current]!;
    const walker = figure.walker;
    const { spot, kind } = rota;
    const besidePlayer = kind === 'bench' && rota !== this.bench && this.sitBeside(rota, dt);
    if (rota.state === 'away' && (due || besidePlayer) && (this.fresh || this.minutes >= rota.until || besidePlayer)) {
      // The other one of the two, mostly.
      rota.current = random() < 0.75 ? 1 - rota.current : rota.current;
      const next = rota.figures[rota.current]!;
      rota.sitter = this.sitterNow(rota);
      // The player sat on the bench already (sent beside them, or come at their hour): the other end, not on their lap.
      rota.along = besidePlayer || (kind === 'bench' && this.playerOn(rota)) ? this.besideAlong(rota) : 0;
      const seat = kind === 'bench' ? benchSeat(spot, rota.along) : at(spot.at);
      if (this.fresh) {
        // Just arrived: they are already there.
        next.show(seat, true);
        this.settleNow(rota);
      } else {
        const from = at(spot.at).add(new THREE.Vector3(WALK_IN * (random() < 0.5 ? 1 : -1), 0, 0));
        next.show(from);
        rainGear(next.walker, this.dayNight.state, null);
        rota.state = 'arriving';
        const path = kind === 'bench' ? [benchFront(spot, rota.along), seat] : [seat];
        next.walker.walk(path, () => {
          this.settleNow(rota);
          if (besidePlayer) next.walker.say(pick(random, BESIDE_LINES));
        });
      }
    } else if (rota.state === 'there' && (!due || this.minutes >= rota.until) && !(rota.along !== 0 && this.playerOn(rota))) {
      rota.state = 'leaving';
      rainGear(walker, this.dayNight.state, null);
      const off = at(spot.at).add(new THREE.Vector3(WALK_OFF, 0, 0));
      const path = kind === 'bench' ? [benchFront(spot, rota.along), off] : [off];
      walker.walk(path, () => {
        figure.hide();
        rota.state = 'away';
        rota.until = this.minutes + within(random, BREAK);
      });
    } else if (rota.state === 'there' && kind === 'phone') {
      this.phoneStep(rota, dt, rained);
    }
    for (const f of rota.figures) f.update(dt, this.eye, this.options.drawDistance, this.options.fade);
  }

  /** The caller: a step or two away and back, still talking; into the wall's shelter out of the rain, and back out after. */
  private phoneStep(rota: Rota, dt: number, rained: boolean): void {
    const walker = rota.figures[rota.current]!.walker;
    const shelter = this.options.spots.phone.shelter;
    const wet = this.wet;
    if (rained || wet !== rota.sheltered) {
      rota.sheltered = wet;
      walker.setHood(wet && this.dayNight.state.rain > 0.5);
      const target = wet ? at(shelter) : at(rota.spot.at);
      walker.walk([target], () => walker.stand(rota.spot.yaw, 'phone'));
      return;
    }
    if (rota.sheltered) return;
    rota.pace -= dt;
    if (rota.pace <= 0 && !walker.isWalking) {
      rota.pace = 8 + random() * 10;
      rota.out = !rota.out;
      const target = at(rota.spot.at).add(new THREE.Vector3(rota.out ? 1.3 : 0, 0, 0));
      walker.walk([target], () => walker.stand(rota.spot.yaw + (rota.out ? 0.5 : 0), 'phone'));
    }
  }

  /** Who sits down this time: the lunch crowd at noon, someone resting their legs or a reader otherwise. */
  private sitterNow(rota: Rota): SitterKind {
    const hours = this.dayNight.state.hours;
    const lunch = inHours(hours, LUNCH);
    if (lunch && rota.sitters.includes('lunch') && random() < 0.7) return 'lunch';
    const others = rota.sitters.filter((k) => k !== 'lunch');
    return others.length ? pick(random, others) : (rota.sitters[0] ?? 'reader');
  }

  /** The current one of `rota` takes up the spot: on the phone standing, or sat (reading, resting, eating). */
  private settleNow(rota: Rota): void {
    const walker = rota.figures[rota.current]!.walker;
    rota.state = 'there';
    rota.until = this.minutes + within(random, SESSION);
    walker.setHood(false);
    if (rota.kind === 'phone') {
      walker.stand(rota.spot.yaw, 'phone');
      walker.hold('phone');
      return;
    }
    const how: Record<SitterKind, { pose: Pose; held: Held | null }> = {
      reader: { pose: 'read', held: 'book' },
      lunch: { pose: 'lap', held: 'baguette' },
      elder: { pose: 'lap', held: null },
    };
    const { pose, held } = how[rota.sitter];
    walker.sit(rota.spot.yaw, SEAT, pose);
    walker.hold(held);
  }

  /** Whether the player sits on `rota`'s bench now (their eye low, over its seat). */
  private playerOn(rota: Rota): boolean {
    const [x, z] = rota.spot.at;
    return this.local.y < PLAYER_SEATED.below && Math.hypot(this.local.x - x, this.local.z - z) < PLAYER_SEATED.within;
  }

  /** The player has sat on this (empty) bench a while: someone comes to sit at its other end. */
  private sitBeside(rota: Rota, dt: number): boolean {
    if (rota.state !== 'away' || !this.playerOn(rota)) {
      this.playerSat.delete(rota);
      return false;
    }
    const s = this.dayNight.state;
    if (s.rain > 0.1 || wakefulnessAt(s.hours) < 0.5) return false;
    const sat = (this.playerSat.get(rota) ?? -within(random, BESIDE_AFTER)) + dt;
    this.playerSat.set(rota, sat);
    if (sat < 0) return false;
    this.playerSat.set(rota, -Infinity);
    return true;
  }

  /** The end of the bench away from the player (m along it from its middle, its right +). */
  private besideAlong(rota: Rota): number {
    const { yaw, at: [x, z] } = rota.spot;
    // The bench's right, seen sitting on it (facing `yaw`).
    const rightX = -Math.cos(yaw);
    const rightZ = Math.sin(yaw);
    const side = (this.local.x - x) * rightX + (this.local.z - z) * rightZ;
    return side > 0 ? -BESIDE_ALONG : BESIDE_ALONG;
  }

  /**
   * The passengers: wait, board the bus while it stands at the stop (one after another, through its front door), are
   * replaced a while later; in the rush two more wait beside the first. When the bus pulls in, up to `alightMax` get
   * off and walk away.
   */
  private updateBusStop(dt: number, awake: number, rush: number): void {
    const { traffic, spots, busStop } = this.options;
    const atStop = traffic.busAtStop;
    const doors = this.doors.set(busStop[0] + DOORS_AHEAD, 0, KERB_Z);
    if (atStop && !this.wasAtStop) this.busPulledIn(doors);
    for (const w of this.waiters) this.waiterStep(w, dt, atStop, awake, rush, spots.busStop.yaw);
    this.wasAtStop = atStop;
  }

  /** The bus pulled in: the waiters board in turn, each a step behind the one before at the doors; someone or other gets off and walks off their own way. */
  private busPulledIn(doors: THREE.Vector3): void {
    const { spots } = this.options;
    let queued = 0;
    for (const w of this.waiters) {
      if (w.state !== 'waiting' && w.state !== 'arriving') continue;
      w.state = 'boarding';
      w.seated = false;
      const behind = doors.clone().add(new THREE.Vector3(-0.7 * queued, 0, 0.25 * queued));
      queued++;
      w.figure.walker.walk([behind, doors.clone()], () => w.figure.hide());
    }
    let off = 0;
    const ways = spots.busStop.alights;
    for (const alighter of this.alighters) {
      if (!alighter.gone || random() > (off === 0 ? 0.55 : 0.3)) continue;
      const from = doors.clone().add(new THREE.Vector3(0.4 * off, 0, 0));
      alighter.show(from);
      // Off a train at the station, some with a case on wheels (kept in the hand, a hood up if it rains).
      const luggage = random() < SUITCASE ? 'suitcase' : null;
      rainGear(alighter.walker, this.dayNight.state, luggage, luggage !== null);
      const way = pick(random, ways);
      alighter.walker.walk(way.map((p, i) => at(p).add(new THREE.Vector3(0, 0, i < 2 ? 0 : 0.25 * off))), () => {
        if (way.length && isDoorPoint(way[way.length - 1]!)) this.options.onDoor?.(way[way.length - 1]!);
        alighter.hide();
      });
      off++;
    }
  }

  /** A waiter's frame: left behind by the bus, gone aboard, or due back at the shelter after a while away. */
  private waiterStep(w: Waiter, dt: number, atStop: boolean, awake: number, rush: number, yaw: number): void {
    const walker = w.figure.walker;
    if (!atStop && this.wasAtStop && w.state === 'boarding' && w.figure.shown) {
      // The bus left without them: back to the shelter.
      w.state = 'arriving';
      walker.walk([w.at.clone()], () => this.waitThere(w, yaw));
    }
    if (w.state === 'boarding' && w.figure.gone) {
      w.state = 'gone';
      w.clock = (30 + random() * 60) / Math.max(0.15, awake);
    }
    if (w.state !== 'gone') return;
    w.clock -= dt;
    if (w.clock > 0 || atStop) return;
    // The first always comes back; the others in the rush, and now and then by day.
    const first = w === this.waiters[0];
    if (!first && !(rush > 0.25 || (awake > 0.8 && random() < 0.25))) {
      w.clock = 20 + random() * 30;
      return;
    }
    this.comeBack(w, first, yaw);
  }

  /** Settled at the stop: standing in the shelter (on the phone, or hands in pockets), or the first sat on its bench. */
  private waitThere(w: Waiter, yaw: number): void {
    const walker = w.figure.walker;
    w.state = 'waiting';
    walker.setHood(false);
    if (w.seated && this.options.shelterSeat) {
      walker.sit(this.options.shelterSeat.yaw, SEAT, 'lap');
      walker.hold(null);
      return;
    }
    walker.stand(yaw, w.phone ? 'phone' : 'pockets');
    walker.hold(w.phone ? 'phone' : null);
  }

  /** Back to the shelter: the first out of the building's door, the others in along the pavement, half of them on the phone. */
  private comeBack(w: Waiter, first: boolean, yaw: number): void {
    const walker = w.figure.walker;
    w.state = 'arriving';
    w.phone = !first && random() < 0.5;
    w.seated = first && !!this.options.shelterSeat && random() < SITS_IN_SHELTER;
    const seat = w.seated && this.options.shelterSeat ? at(this.options.shelterSeat.at) : w.at.clone();
    rainGear(walker, this.dayNight.state, null);
    if (first) {
      w.figure.show(at(FROM_DOOR));
      this.options.onDoor?.(FROM_DOOR);
      walker.walk([at([FROM_DOOR[0], 10.3]), seat], () => this.waitThere(w, yaw));
    } else {
      w.figure.show(w.at.clone().add(new THREE.Vector3(-WALK_IN, 0, -0.3)));
      walker.walk([seat], () => this.waitThere(w, yaw));
    }
  }
}

function at([x, z]: readonly [number, number]): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z);
}

/** A point on a building line: a door they go in by (the bell rings). */
function isDoorPoint([, z]: Vec2): boolean {
  return Math.abs(z) >= FRONT.farLine - 0.15;
}

/** The bench's seat, `along` metres from its middle: the spot is its middle, the sitter's back to the backrest. */
function benchSeat(spot: { readonly at: readonly [number, number]; yaw: number }, along = 0): THREE.Vector3 {
  return at(spot.at).add(new THREE.Vector3(-Math.sin(spot.yaw) * 0.3 - Math.cos(spot.yaw) * along, 0, -Math.cos(spot.yaw) * 0.3 + Math.sin(spot.yaw) * along));
}

/** Half a metre in front of the bench, where one steps up to it from and away. */
function benchFront(spot: { readonly at: readonly [number, number]; yaw: number }, along = 0): THREE.Vector3 {
  return at(spot.at).add(new THREE.Vector3(Math.sin(spot.yaw) * 0.5 - Math.cos(spot.yaw) * along, 0, Math.cos(spot.yaw) * 0.5 + Math.sin(spot.yaw) * along));
}
