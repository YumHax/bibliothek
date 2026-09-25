import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { wakefulnessAt } from '../../props/outdoors/wakefulness';
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
/** Where someone who got off walks to: along the far pavement and away down Park Street. */
const ALIGHT_ROUTE: Vec2[] = [[31, 10.2], [-26, 10.2], [-38.2, 10.2], [-38.2, -70]];
/** The bus's doors, from its stop point along its heading (+x), and the kerb they open onto. */
const DOORS_AHEAD = 3.5;
const KERB_Z = FRONT.farKerb + 0.35;

interface Phone {
  figure: Figure;
  pace: number;
  out: boolean;
}

/**
 * The people who stand about rather than pass: someone on the phone outside the grocer's,
 * pacing a step now and then; someone reading on the bench; someone waiting at the bus stop, who
 * walks to the bus's doors and gets on while it stands there (`traffic.busAtStop`), after which
 * another turns up a while later from along the pavement, and now and then someone gets off and
 * walks away. They keep their hours (fewer at night: `wakefulnessAt`), fade in and out as they come
 * and go, and at the edge of sight. Clicking one gets a word (`talk`).
 */
export class StandingPeople extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly phone: Phone | null = null;
  private readonly bench: Figure | null = null;
  private readonly waiter: Figure;
  private readonly alighter: Figure | null = null;
  private waiterState: 'waiting' | 'boarding' | 'gone' | 'arriving' = 'waiting';
  private waiterClock = 0;
  private wasAtStop = false;
  private readonly eye = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: StandingPeopleOptions) {
    super();
    this.name = 'StandingPeople';
    const make = (seed: number, label: string): Figure => {
      const walker = new Walker({ viewer: options.viewer, seed, speed: 1.1, talk: options.talk, label, fade: true });
      walker.traverse((o) => {
        o.castShadow = false;
      });
      options.place(walker, new THREE.Vector3());
      return new Figure(walker);
    };
    const { spots } = options;
    this.waiter = make(411, 'Click to ask about the bus');
    this.waiter.show(at(spots.busStop.at), true);
    this.waiter.walker.stand(spots.busStop.yaw, 'pockets');
    if (!options.busStopOnly) {
      this.phone = { figure: make(419, 'Click to interrupt the phone call'), pace: 6, out: false };
      this.bench = make(431, 'Click to say hello');
      this.alighter = make(443, 'Click to say hello');
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const awake = wakefulnessAt(s.hours);
    const { spots, drawDistance, fade } = this.options;
    this.options.viewer.getWorldPosition(this.eye);

    if (this.phone) this.updatePhone(dt, s.hours, spots.phone);
    if (this.bench) {
      const [from, to] = spots.bench.hours;
      const sits = s.hours >= from && s.hours < to && s.rain < 0.1 && s.snowCover < 0.3;
      if (sits && !this.bench.shown) {
        // Their back to the bench's backrest: the spot is the seat's middle.
        const yaw = spots.bench.yaw;
        this.bench.show(at(spots.bench.at).add(new THREE.Vector3(-Math.sin(yaw) * 0.3, 0, -Math.cos(yaw) * 0.3)));
        this.bench.walker.sit(spots.bench.yaw, 0.48, 'lap');
      } else if (!sits && this.bench.shown) this.bench.hide();
      this.bench.update(dt, this.eye, drawDistance, fade);
    }
    this.updateBusStop(dt, awake);
    this.waiter.update(dt, this.eye, drawDistance, fade);
    this.alighter?.update(dt, this.eye, drawDistance, fade);
  }

  private updatePhone(dt: number, hours: number, spot: Standing['phone']): void {
    const phone = this.phone!;
    const [from, to] = spot.hours;
    const due = hours >= from && hours < to;
    if (due && !phone.figure.shown) {
      phone.figure.show(at(spot.at));
      phone.figure.walker.stand(spot.yaw, 'phone');
    } else if (!due && phone.figure.shown) phone.figure.hide();
    if (phone.figure.shown) {
      // A step or two away and back, still talking.
      phone.pace -= dt;
      const walker = phone.figure.walker;
      if (phone.pace <= 0 && !walker.isWalking) {
        phone.pace = 8 + Math.random() * 10;
        phone.out = !phone.out;
        const target = at(spot.at).add(new THREE.Vector3(phone.out ? 1.3 : 0, 0, 0));
        walker.walk([target], () => walker.stand(spot.yaw + (phone.out ? 0.5 : 0), 'phone'));
      }
    }
    phone.figure.update(dt, this.eye, this.options.drawDistance, this.options.fade);
  }

  /** The passenger: waits, boards the bus while it stands at the stop, is replaced a while later. */
  private updateBusStop(dt: number, awake: number): void {
    const { traffic, spots, busStop } = this.options;
    const atStop = traffic.busAtStop;
    const doors = at([busStop[0] + DOORS_AHEAD, KERB_Z]);
    const walker = this.waiter.walker;
    if (atStop && !this.wasAtStop) {
      if (this.waiterState === 'waiting' || this.waiterState === 'arriving') {
        this.waiterState = 'boarding';
        walker.walk([doors], () => this.waiter.hide());
      }
      // Now and then someone gets off and walks away.
      if (this.alighter?.gone && Math.random() < 0.45) {
        const alighter = this.alighter;
        alighter.show(doors.clone());
        alighter.walker.walk(ALIGHT_ROUTE.map((p) => at(p)), () => alighter.hide(true));
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
