import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { rushAt, wakefulnessAt, type Weekday } from '@/time/wakefulness';
import { Walker } from '../../people/Walker';
import type { StreetTraffic } from '../traffic/StreetTraffic';
import { FRONT, STREET_PLAN, type Vec2 } from '../streetPlan';
import { Figure } from './Figure';
import type { TalkRole } from './streetTalk';

type Standing = typeof STREET_PLAN.standing;

interface StandingPeopleOptions {
  /** Where they stand, sit and wait (`STREET_PLAN.standing`). */
  spots: Standing;
  /** The bus stop's bus: where it stops (its doors are towards its front). */
  busStop: Vec2;
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
/** The bus's doors, from its stop point along its heading (+x), and the kerb they open onto. */
const DOORS_AHEAD = 3.5;
const KERB_Z = FRONT.farKerb + 0.35;

/** A session on the phone or on the bench lasts this many game minutes; the spot then stays empty this long. */
const SESSION = [20, 60] as const;
const BREAK = [10, 40] as const;
/** Where someone comes from and goes to along the pavement (x metres from their spot, either way). */
const WALK_IN = 5;
const WALK_OFF = -7;
/** A stranger's caption shows only this close. */
const LABEL_WITHIN = 4;

/** Someone at the bus stop: where they wait, and how far along they are. */
interface Waiter {
  figure: Figure;
  at: THREE.Vector3;
  state: 'waiting' | 'boarding' | 'gone' | 'arriving';
  /** Seconds before they turn up again once gone. */
  clock: number;
}

/**
 * A spot taken in turns (the phone caller's, the bench): two people who come along, stay a
 * session of `SESSION` game minutes, walk off, and a while later one of them (the other, mostly)
 * turns up again.
 */
interface Rota {
  figures: readonly [Figure, Figure];
  current: number;
  state: 'away' | 'arriving' | 'there' | 'leaving';
  /** Game minutes (`StandingPeople.minutes`) at which the session or the break ends. */
  until: number;
  /** Phone only: seconds to the next step away and back, and which way they stand. */
  pace: number;
  out: boolean;
}

/**
 * The people who stand about rather than pass: someone on the phone outside the grocer's,
 * pacing a step now and then; someone reading a book on the bench; someone waiting at the bus
 * stop (and in the rush two more, `busQueue`, some on their phones), who walk to the bus's doors and
 * get on in turn while it stands there (`traffic.busAtStop`), after which others turn up a while
 * later from along the pavement, and as it pulls in up to `alightMax` get off and walk away. The caller and the reader take turns (`Rota`): 20 to 60 game minutes,
 * then off along the pavement, someone else later. They keep their hours (fewer at night:
 * `wakefulnessAt`), fade in and out as they come and go, and at the edge of sight. Clicking one gets a word (`talk`).
 */
export class StandingPeople extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly phone: Rota | null = null;
  private readonly bench: Rota | null = null;
  /** Those at the bus stop: the first always comes back; the others only in the rush and busy hours. */
  private readonly waiters: Waiter[] = [];
  private readonly alighters: Figure[] = [];
  private wasAtStop = false;
  private readonly eye = new THREE.Vector3();
  private readonly doors = new THREE.Vector3();
  /** Game minutes gone by since the street was built (the rotas' clock), and the hour last seen. */
  private minutes = 0;
  private lastHours = NaN;
  /** The first update after activation seats whoever is due straight away (the player has only just arrived). */
  private fresh = true;

  constructor(private readonly dayNight: DayNight, private readonly options: StandingPeopleOptions) {
    super();
    this.name = 'StandingPeople';
    const make = (seed: number, label: string, role: TalkRole): Figure => {
      const walker = new Walker({ viewer: options.viewer, seed, speed: 1.1, talk: () => options.talk(role), label, labelWithin: LABEL_WITHIN, corners: 0.5, fade: true, stopsToTalk: true });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3());
      return new Figure(walker);
    };
    const { spots } = options;
    const first: Waiter = { figure: make(411, 'Waiting for the bus · ask', 'bus'), at: at(spots.busStop.at), state: 'waiting', clock: 0 };
    first.figure.show(first.at.clone(), true);
    first.figure.walker.stand(spots.busStop.yaw, 'pockets');
    this.waiters.push(first);
    if (!options.busStopOnly) {
      spots.busQueue.forEach((spot, i) => this.waiters.push({ figure: make(471 + i * 6, 'Waiting for the bus · ask', 'bus'), at: at(spot), state: 'gone', clock: 5 + i * 20 }));
      const rota = (a: Figure, b: Figure): Rota => ({ figures: [a, b], current: 1, state: 'away', until: 0, pace: 6, out: false });
      this.phone = rota(make(419, 'On the phone · interrupt', 'phone'), make(457, 'On the phone · interrupt', 'phone'));
      this.bench = rota(make(431, 'Reader · say hello', 'reader'), make(461, 'Reader · say hello', 'reader'));
      for (let i = 0; i < spots.alightMax; i++) this.alighters.push(make(443 + i * 4, 'Passer-by · say hello', 'passer'));
    }
  }

  /** Someone is on the bench, or on their way to or from it. */
  get benchTaken(): boolean {
    return this.bench !== null && this.bench.state !== 'away';
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
    const { spots, drawDistance, fade } = this.options;
    this.options.viewer.getWorldPosition(this.eye);
    if (!Number.isNaN(this.lastHours)) this.minutes += (((s.hours - this.lastHours) % 24) + 24) % 24 * 60;
    this.lastHours = s.hours;

    if (this.phone) {
      const [from, to] = spots.phone.hours;
      this.updateRota(this.phone, dt, s.hours >= from && s.hours < to, spots.phone, 'phone');
    }
    if (this.bench) {
      const [from, to] = spots.bench.hours;
      const sits = s.hours >= from && s.hours < to && s.rain < 0.1 && s.snowCover < 0.3;
      this.updateRota(this.bench, dt, sits, spots.bench, 'bench');
    }
    this.fresh = false;
    this.updateBusStop(dt, awake, rushAt(s.hours, this.options.weekday()));
    for (const w of this.waiters) w.figure.update(dt, this.eye, drawDistance, fade);
    for (const a of this.alighters) a.update(dt, this.eye, drawDistance, fade);
  }

  /** One turn-taking spot: someone comes, stays a session, leaves; the spot stays empty a while; out of hours, nobody. */
  private updateRota(rota: Rota, dt: number, due: boolean, spot: { readonly at: readonly [number, number]; yaw: number }, kind: 'phone' | 'bench'): void {
    const figure = rota.figures[rota.current]!;
    const walker = figure.walker;
    if (rota.state === 'away' && due && (this.fresh || this.minutes >= rota.until)) {
      // The other one of the two, mostly.
      rota.current = Math.random() < 0.75 ? 1 - rota.current : rota.current;
      const next = rota.figures[rota.current]!;
      const seat = kind === 'bench' ? benchSeat(spot) : at(spot.at);
      if (this.fresh) {
        // Just arrived: they are already there.
        next.show(seat, true);
        this.settleNow(rota, spot, kind);
      } else {
        const from = at(spot.at).add(new THREE.Vector3(WALK_IN, 0, 0));
        next.show(from);
        next.walker.hold(null);
        rota.state = 'arriving';
        const path = kind === 'bench' ? [benchFront(spot), seat] : [seat];
        next.walker.walk(path, () => this.settleNow(rota, spot, kind));
      }
    } else if (rota.state === 'there' && (!due || this.minutes >= rota.until)) {
      rota.state = 'leaving';
      walker.hold(null);
      const off = at(spot.at).add(new THREE.Vector3(WALK_OFF, 0, 0));
      const path = kind === 'bench' ? [benchFront(spot), off] : [off];
      walker.walk(path, () => {
        figure.hide();
        rota.state = 'away';
        rota.until = this.minutes + between(BREAK);
      });
    } else if (rota.state === 'there' && kind === 'phone') {
      // A step or two away and back, still talking.
      rota.pace -= dt;
      if (rota.pace <= 0 && !walker.isWalking) {
        rota.pace = 8 + Math.random() * 10;
        rota.out = !rota.out;
        const target = at(spot.at).add(new THREE.Vector3(rota.out ? 1.3 : 0, 0, 0));
        walker.walk([target], () => walker.stand(spot.yaw + (rota.out ? 0.5 : 0), 'phone'));
      }
    }
    for (const f of rota.figures) f.update(dt, this.eye, this.options.drawDistance, this.options.fade);
  }

  /** The current one of `rota` takes up the spot: on the phone standing, or sat reading. */
  private settleNow(rota: Rota, spot: { yaw: number }, kind: 'phone' | 'bench'): void {
    const walker = rota.figures[rota.current]!.walker;
    rota.state = 'there';
    rota.until = this.minutes + between(SESSION);
    if (kind === 'phone') {
      walker.stand(spot.yaw, 'phone');
      walker.hold('phone');
    } else {
      walker.sit(spot.yaw, 0.48, 'read');
      walker.hold('book');
    }
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
    const yaw = spots.busStop.yaw;
    if (atStop && !this.wasAtStop) {
      let queued = 0;
      for (const w of this.waiters) {
        if (w.state !== 'waiting' && w.state !== 'arriving') continue;
        w.state = 'boarding';
        // In turn: each a step behind the one before at the doors.
        const behind = doors.clone().add(new THREE.Vector3(-0.7 * queued, 0, 0.25 * queued));
        queued++;
        w.figure.walker.walk([behind, doors.clone()], () => w.figure.hide());
      }
      // Someone or other gets off and walks away.
      let off = 0;
      for (const alighter of this.alighters) {
        if (!alighter.gone || Math.random() > (off === 0 ? 0.55 : 0.3)) continue;
        const from = doors.clone().add(new THREE.Vector3(0.4 * off, 0, 0));
        alighter.show(from);
        alighter.walker.walk(spots.busStop.alight.map((p, i) => at(p).add(new THREE.Vector3(0, 0, i < 2 ? 0 : 0.25 * off))), () => alighter.hide(true));
        off++;
      }
    }
    for (const w of this.waiters) {
      const walker = w.figure.walker;
      if (!atStop && this.wasAtStop && w.state === 'boarding' && w.figure.shown) {
        // The bus left without them: back to the shelter.
        w.state = 'arriving';
        walker.walk([w.at.clone()], () => {
          w.state = 'waiting';
          walker.stand(yaw, 'pockets');
        });
      }
      if (w.state === 'boarding' && w.figure.gone) {
        w.state = 'gone';
        w.clock = (30 + Math.random() * 60) / Math.max(0.15, awake);
      }
      if (w.state !== 'gone') continue;
      w.clock -= dt;
      if (w.clock > 0 || atStop) continue;
      // The first always comes back; the others in the rush, and now and then by day.
      const first = w === this.waiters[0];
      if (!first && !(rush > 0.25 || (awake > 0.8 && Math.random() < 0.25))) {
        w.clock = 20 + Math.random() * 30;
        continue;
      }
      w.state = 'arriving';
      const phone = !first && Math.random() < 0.5;
      const settle = (): void => {
        w.state = 'waiting';
        walker.stand(yaw, phone ? 'phone' : 'pockets');
        walker.hold(phone ? 'phone' : null);
      };
      walker.hold(null);
      if (first) {
        w.figure.show(at(FROM_DOOR));
        this.options.onDoor?.(FROM_DOOR);
        walker.walk([at([FROM_DOOR[0], 10.3]), w.at.clone()], settle);
      } else {
        w.figure.show(w.at.clone().add(new THREE.Vector3(-WALK_IN, 0, -0.3)));
        walker.walk([w.at.clone()], settle);
      }
    }
    this.wasAtStop = atStop;
  }
}

function at([x, z]: readonly [number, number]): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z);
}

/** The bench's seat: the spot is its middle, the sitter's back to the backrest. */
function benchSeat(spot: { readonly at: readonly [number, number]; yaw: number }): THREE.Vector3 {
  return at(spot.at).add(new THREE.Vector3(-Math.sin(spot.yaw) * 0.3, 0, -Math.cos(spot.yaw) * 0.3));
}

/** Half a metre in front of the bench, where one steps up to it from and away. */
function benchFront(spot: { readonly at: readonly [number, number]; yaw: number }): THREE.Vector3 {
  return at(spot.at).add(new THREE.Vector3(Math.sin(spot.yaw) * 0.5, 0, Math.cos(spot.yaw) * 0.5));
}

function between([lo, hi]: readonly [number, number]): number {
  return lo + Math.random() * (hi - lo);
}
