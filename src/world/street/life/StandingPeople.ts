import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import { Walker } from '../../people/Walker';
import type { StreetTraffic } from '../traffic/StreetTraffic';
import { FRONT, STREET_PLAN, type Vec2 } from '../streetPlan';
import { Figure } from './Figure';

type Standing = typeof STREET_PLAN.standing;

export interface StandingPeopleOptions {
  /** Where they stand, sit and wait (`STREET_PLAN.standing`). */
  spots: Standing;
  /** The bus stop's bus: where it stops (its doors are towards its front). */
  busStop: Vec2;
  traffic: StreetTraffic;
  viewer: THREE.Object3D;
  /** What they say when clicked. */
  talk: () => string;
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
 * stop, who walks to the bus's doors and gets on while it stands there (`traffic.busAtStop`),
 * after which another turns up a while later from along the pavement, and now and then someone
 * gets off and walks away. The caller and the reader take turns (`Rota`): 20 to 60 game minutes,
 * then off along the pavement, someone else later. They keep their hours (fewer at night:
 * `wakefulnessAt`), fade in and out as they come and go, and at the edge of sight. Clicking one gets a word (`talk`).
 */
export class StandingPeople extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly phone: Rota | null = null;
  private readonly bench: Rota | null = null;
  private readonly waiter: Figure;
  private readonly alighter: Figure | null = null;
  private waiterState: 'waiting' | 'boarding' | 'gone' | 'arriving' = 'waiting';
  private waiterClock = 0;
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
    const make = (seed: number, label: string): Figure => {
      const walker = new Walker({ viewer: options.viewer, seed, speed: 1.1, talk: options.talk, label, labelWithin: LABEL_WITHIN, corners: 0.5, fade: true });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3());
      return new Figure(walker);
    };
    const { spots } = options;
    this.waiter = make(411, 'Waiting for the bus · ask');
    this.waiter.show(at(spots.busStop.at), true);
    this.waiter.walker.stand(spots.busStop.yaw, 'pockets');
    if (!options.busStopOnly) {
      const rota = (a: Figure, b: Figure): Rota => ({ figures: [a, b], current: 1, state: 'away', until: 0, pace: 6, out: false });
      this.phone = rota(make(419, 'On the phone · interrupt'), make(457, 'On the phone · interrupt'));
      this.bench = rota(make(431, 'Reader · say hello'), make(461, 'Reader · say hello'));
      this.alighter = make(443, 'Passer-by · say hello');
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
    this.updateBusStop(dt, awake);
    this.waiter.update(dt, this.eye, drawDistance, fade);
    this.alighter?.update(dt, this.eye, drawDistance, fade);
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

  /** The passenger: waits, boards the bus while it stands at the stop, is replaced a while later. */
  private updateBusStop(dt: number, awake: number): void {
    const { traffic, spots, busStop } = this.options;
    const atStop = traffic.busAtStop;
    const doors = this.doors.set(busStop[0] + DOORS_AHEAD, 0, KERB_Z);
    const walker = this.waiter.walker;
    if (atStop && !this.wasAtStop) {
      if (this.waiterState === 'waiting' || this.waiterState === 'arriving') {
        this.waiterState = 'boarding';
        walker.walk([doors.clone()], () => this.waiter.hide());
      }
      // Now and then someone gets off and walks away.
      if (this.alighter?.gone && Math.random() < 0.45) {
        const alighter = this.alighter;
        alighter.show(doors.clone());
        alighter.walker.walk(this.options.spots.busStop.alight.map((p) => at(p)), () => alighter.hide(true));
      }
    }
    if (!atStop && this.wasAtStop && this.waiterState === 'boarding' && this.waiter.shown) {
      // The bus left without them: back to the shelter.
      this.waiterState = 'arriving';
      walker.walk([at(spots.busStop.at)], () => {
        this.waiterState = 'waiting';
        walker.stand(spots.busStop.yaw, 'pockets');
      });
    }
    this.wasAtStop = atStop;
    if (this.waiterState === 'boarding' && this.waiter.gone) {
      this.waiterState = 'gone';
      this.waiterClock = (30 + Math.random() * 60) / Math.max(0.15, awake);
    }
    if (this.waiterState === 'gone') {
      this.waiterClock -= dt;
      if (this.waiterClock <= 0 && !atStop) {
        this.waiterState = 'arriving';
        this.waiter.show(at(FROM_DOOR));
        this.options.onDoor?.(FROM_DOOR);
        walker.walk([at([FROM_DOOR[0], 10.3]), at(spots.busStop.at)], () => {
          this.waiterState = 'waiting';
          walker.stand(spots.busStop.yaw, 'pockets');
        });
      }
    }
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
