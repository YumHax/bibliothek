import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { Walker } from '../../people/Walker';
import { randomLook } from '../../people/looks';
import type { Season } from '@/time/season';
import type { Vec2 } from '../streetPlan';
import type { DoorGaps } from './DoorGaps';
import { Figure } from './Figure';
import type { TalkRole } from './streetTalk';
import { random, within } from '@/random';

/** A queue outside a shop (`STREET_PLAN.shopQueues`). */
interface ShopQueueSpec {
  /** Near the shop's door (the painted one is found from it). */
  door: Vec2;
  /** The way the queue runs from the door along the wall (-1: towards -x). */
  dir: 1 | -1;
  /** How far out from the road's middle they stand (the wall side). */
  z: number;
  spots: number;
  hours: readonly [number, number];
  /** Real seconds between one going in and the next. */
  every: readonly [number, number];
}

interface ShopQueueOptions {
  queues: readonly ShopQueueSpec[];
  viewer: THREE.Object3D;
  place: (walker: Walker, at: THREE.Vector3) => void;
  talk: (role: TalkRole) => string;
  drawDistance: number;
  fade: number;
  season: Season['name'];
  doors?: DoorGaps;
  /** Someone went in at `at` (the shop's bell). */
  onDoor?: (at: Vec2) => void;
}

/** The first spot is this far along from the door's middle, the next ones this far apart. */
const FIRST = 0.75;
const GAP = 0.65;
/** Newcomers walk up along the pavement's lane from this far off. */
const COME_FROM = 5;
const LANE_Z = 10.1;
/** Seconds between two looks at the clock. */
const CHECK_EVERY = 1;

type Place = { kind: 'away' } | { kind: 'coming'; spot: number } | { kind: 'queued'; spot: number } | { kind: 'going' };

interface Queuer {
  figure: Figure;
  place: Place;
}

interface Queue {
  spec: ShopQueueSpec;
  door: THREE.Vector3;
  spots: THREE.Vector3[];
  queuers: Queuer[];
  /** Real seconds until the one at the front goes in. */
  clock: number;
  /** How long a queue the morning has now (it grows and shrinks). */
  wanted: number;
  fresh: boolean;
}

/**
 * A queue on the pavement outside a shop in its busy hours (the bakery in the morning): a few people along the wall
 * from its door, facing it; every so often the one at the front goes in (the door opens, the bell rings) and the
 * rest shuffle up a place, while newcomers walk up along the pavement to the back. Whoever went in comes out later
 * with what they bought, as a passer-by (`StreetCrowd`'s routes from that door). Out of its hours the queue goes.
 */
export class ShopQueue extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly queues: Queue[] = [];
  private readonly eye = new THREE.Vector3();
  private checkClock = CHECK_EVERY;

  constructor(private readonly dayNight: DayNight, private readonly options: ShopQueueOptions) {
    super();
    this.name = 'ShopQueue';
    let seed = 7400;
    for (const spec of options.queues) {
      const [dx, dz] = options.doors?.snap(spec.door, 3.5) ?? spec.door;
      const door = new THREE.Vector3(dx, 0, dz);
      const spots = Array.from({ length: spec.spots }, (_, i) => new THREE.Vector3(dx + spec.dir * (FIRST + i * GAP), 0, spec.z + (i % 2 ? 0.06 : 0)));
      const queuers = Array.from({ length: spec.spots + 1 }, () => {
        const s = seed++;
        const walker = new Walker({
          viewer: options.viewer,
          seed: s,
          look: randomLook(s + 200, 'shopper', { season: options.season, age: s % 4 === 0 ? 'elder' : 'adult' }),
          speed: 1.0,
          talk: () => options.talk('bakery'),
          label: 'In the queue · say hello',
          labelWithin: 4,
          corners: 0.4,
          fade: true,
        });
        walker.traverse((o) => {
          o.castShadow = false;
        });
        options.place(walker, new THREE.Vector3());
        return { figure: new Figure(walker), place: { kind: 'away' } as Place };
      });
      this.queues.push({ spec, door, spots, queuers, clock: within(random, spec.every), wanted: 1, fresh: true });
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setZoneActive(active: boolean): void {
    if (!active) return;
    for (const q of this.queues) q.fresh = true;
    this.checkClock = CHECK_EVERY;
  }

  update(dt: number): void {
    this.options.viewer.getWorldPosition(this.eye);
    const hours = this.dayNight.state.hours;
    this.checkClock += dt;
    const check = this.checkClock >= CHECK_EVERY;
    if (check) this.checkClock = 0;
    for (const q of this.queues) {
      const open = hours >= q.spec.hours[0] && hours < q.spec.hours[1];
      if (check) this.tend(q, open);
      if (open) {
        q.clock -= dt;
        if (q.clock <= 0) {
          q.clock = within(random, q.spec.every);
          this.serve(q);
        }
      }
      for (const queuer of q.queuers) queuer.figure.update(dt, this.eye, this.options.drawDistance, this.options.fade);
    }
  }

  /** Newcomers to the back while the queue is shorter than the morning wants; everyone off once it is over. */
  private tend(q: Queue, open: boolean): void {
    if (!open) {
      for (const queuer of q.queuers) {
        if (queuer.place.kind === 'away' || queuer.place.kind === 'going') continue;
        queuer.place = { kind: 'going' };
        queuer.figure.hide();
      }
      q.fresh = false;
      return;
    }
    if (random() < 0.08) q.wanted = 1 + Math.floor(random() * q.spots.length);
    const taken = new Set<number>();
    for (const queuer of q.queuers) if (queuer.place.kind === 'coming' || queuer.place.kind === 'queued') taken.add(queuer.place.spot);
    for (const queuer of q.queuers) {
      if (queuer.place.kind === 'going' && queuer.figure.gone) queuer.place = { kind: 'away' };
    }
    while (taken.size < Math.min(q.wanted, q.spots.length)) {
      // The back of the queue: the first free place from the door.
      let spot = 0;
      while (taken.has(spot)) spot++;
      const free = q.queuers.find((x) => x.place.kind === 'away');
      if (!free || spot >= q.spots.length) break;
      taken.add(spot);
      this.join(q, free, spot, q.fresh);
    }
    q.fresh = false;
  }

  /** `queuer` comes to `spot` (from along the pavement), or is there already (just arrived in the street). */
  private join(q: Queue, queuer: Queuer, spot: number, instantly: boolean): void {
    const at = q.spots[spot]!;
    const walker = queuer.figure.walker;
    if (instantly) {
      queuer.figure.show(at.clone(), true);
      this.settle(q, queuer, spot);
      return;
    }
    const side = Math.sign(q.spec.z);
    const from = new THREE.Vector3(at.x + q.spec.dir * COME_FROM, 0, side * LANE_Z);
    queuer.figure.show(from);
    queuer.place = { kind: 'coming', spot };
    walker.walk([new THREE.Vector3(at.x + q.spec.dir * 0.8, 0, side * LANE_Z), at.clone()], () => this.settle(q, queuer, spot));
  }

  private settle(q: Queue, queuer: Queuer, spot: number): void {
    queuer.place = { kind: 'queued', spot };
    // Facing the door, along the wall.
    queuer.figure.walker.stand(q.spec.dir < 0 ? Math.PI / 2 : -Math.PI / 2, spot % 2 ? 'pockets' : 'stand');
  }

  /** The one at the front goes in; the rest move up a place. */
  private serve(q: Queue): void {
    const front = q.queuers.find((x) => x.place.kind === 'queued' && x.place.spot === 0);
    if (!front) return;
    front.place = { kind: 'going' };
    const walker = front.figure.walker;
    const step = q.door.clone().setZ(q.door.z - Math.sign(q.spec.z) * 0.25);
    walker.walk([step], () => {
      this.options.doors?.open([q.door.x, q.door.z]);
      this.options.onDoor?.([q.door.x, q.door.z]);
      front.figure.hide();
    });
    for (const queuer of q.queuers) {
      const place = queuer.place;
      if ((place.kind !== 'queued' && place.kind !== 'coming') || place.spot === 0) continue;
      const spot = place.spot - 1;
      queuer.place = { kind: 'coming', spot };
      queuer.figure.walker.walk([q.spots[spot]!.clone()], () => this.settle(q, queuer, spot));
    }
  }
}

