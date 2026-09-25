import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { OccupancyAware } from '../Furniture';
import type { NeighbourTrades } from '@/economy/NeighbourTrades';
import { randomLook } from '../people/looks';
import { Prop } from '../props/Prop';
import { StairWalker } from './StairWalker';
import { doorKey } from './building';
import { doorSpot, liftGate, liftToStreet, routeDown, routeUp, streetDoorSpot, toLiftGate } from './stairRoutes';
import { STAIRWELL_PLAN as plan, STOREYS, STOREY, landingY } from './stairwellPlan';

type ResidentPlan = (typeof plan.residents)[number];

interface Resident {
  plan: ResidentPlan;
  who: string;
  door: string;
  walker: StairWalker;
  /** Where their day has them when nobody watches. */
  at: 'home' | 'out';
  /** On the way (the player sees them): where to. */
  going: 'home' | 'out' | null;
  /** Where they are stands until this game hour whatever their day says (met on the stairs early, an errand), or null. */
  hold: number | null;
  /** Said hello on this trip already. */
  greeted: boolean;
}

export interface NeighboursOptions {
  viewer: THREE.Object3D;
  /** The game clock's hour, 0..24. */
  hours: () => number;
  /** The staircase's floor under (x, z) for feet at `feet`, zone-local. */
  ground: (x: number, z: number, feet: number) => number | null;
  /** The swaps: a resident with a standing offer mentions it. */
  trades?: NeighbourTrades;
}

/** Nearer than this (m, level and across) and a resident says hello. */
const HELLO_RANGE = 2.2;
/** Seconds a ride in the lift takes between our landing and the hall. */
const RIDE_S = (STOREYS * STOREY) / plan.liftSpeed;
/** Chance that someone is about when the player comes onto the stairs, outside the rush hours. */
const ERRAND_ODDS = 0.35;
/** Chance that someone whose hour it is (going out, coming home) is met on the stairs. */
const RUSH_ODDS = 0.75;
/** How close to their hour (game hours) counts as "their hour". */
const RUSH_WINDOW = 2;
/** A hold further off than this (game hours) is an old one, gone by. */
const HOLD_MAX = 6;
/** Nobody goes out at night. */
const QUIET = { from: 22.5, to: 6.5 };
const scratch = new THREE.Vector3();

/**
 * The residents on the stairs. Each has a day (`STAIRWELL_PLAN.residents`): out in the morning,
 * home in the evening (a few take the lift, which stops at our landing and the hall). While the
 * player is on the stairs (the zone's occupancy) they are met walking it, an hour's trip at a time:
 * someone whose hour it is, or someone on an errand, comes out of their door and goes down to the
 * street, or comes in from it and up to their door; they say hello passing the player, and chat
 * when clicked (a word of their swap if they have one going, `NeighbourTrades`). Off the stairs
 * nobody walks: their day just says where they are. An empty prop: the walkers are its `walkers`,
 * placed by the builder.
 */
export class Neighbours extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  readonly walkers: StairWalker[];
  private readonly residents: Resident[];
  private occupied = false;
  private primed = false;
  private readonly eye = new THREE.Vector3();

  constructor(private readonly options: NeighboursOptions) {
    super();
    this.name = 'Neighbours';
    this.residents = plan.residents.map((r) => {
      const who = r.k === 0 ? plan.ourNeighbour : plan.neighbours[r.k - 1]![r.i]!;
      const door = doorKey(r.k, r.i);
      const resident: Resident = { plan: r, who, door, at: 'home', going: null, hold: null, greeted: false } as Resident;
      resident.walker = new StairWalker({
        viewer: options.viewer,
        seed: r.seed,
        look: randomLook(r.seed + 900, 'shopper'),
        speed: 0.75 + (r.seed % 5) * 0.05,
        label: `${who} · ${plan.floorNames[r.k]}`,
        talk: () => this.chat(resident),
        ground: options.ground,
      });
      return resident;
    });
    this.walkers = this.residents.map((r) => r.walker);
    // Left standing (at their doors) until the first frame, so the start-up compile sees their materials.
    this.residents.forEach((r) => {
      const spot = doorSpot(r.plan.k, r.plan.i);
      r.walker.setPresent(true, spot);
      r.walker.position.y = landingY(r.plan.k);
    });
  }

  setOccupied(occupied: boolean): void {
    if (occupied === this.occupied) return;
    this.occupied = occupied;
    this.settle();
    if (occupied) this.meetSomeone();
  }

  update(): void {
    if (!this.primed) {
      this.primed = true;
      this.settle();
    }
    // A new day may bring a swap (a note under the flat's door), whether or not the player is on the stairs.
    this.options.trades?.refresh();
    if (!this.occupied) return;
    const hours = this.options.hours();
    this.options.viewer.getWorldPosition(this.eye);
    for (const r of this.residents) {
      if (!r.going) {
        // Home at any hour; out only by day.
        const due = this.expected(r, hours);
        if (due !== r.at && !(due === 'out' && this.quiet(hours))) this.startTrip(r, due);
      } else if (!r.greeted && r.walker.isPresent) this.greet(r, hours);
    }
  }

  /** Everyone where their day has them, off the stairs (nobody watches the way). */
  private settle(): void {
    const hours = this.options.hours();
    for (const r of this.residents) {
      if (r.going) r.at = r.going;
      else r.at = this.expected(r, hours);
      r.going = null;
      r.walker.away();
    }
  }

  /** Where `r` should be at `hours`: where they are while a hold stands, else out between their hours, home otherwise. */
  private expected(r: Resident, hours: number): 'home' | 'out' {
    if (r.hold !== null) {
      const left = (r.hold - hours + 24) % 24;
      if (left > 0 && left < HOLD_MAX) return r.going ?? r.at;
      r.hold = null;
    }
    return hours >= r.plan.out && hours < r.plan.back ? 'out' : 'home';
  }

  private quiet(hours: number): boolean {
    return hours >= QUIET.from || hours < QUIET.to;
  }

  /** The player just came onto the stairs: someone whose hour it is may be on their way, or out on an errand. */
  private meetSomeone(): void {
    const hours = this.options.hours();
    if (this.quiet(hours)) return;
    const near = (a: number) => Math.abs(hours - a) <= RUSH_WINDOW;
    const rush = this.residents.filter((r) => (r.at === 'home' && near(r.plan.out)) || (r.at === 'out' && near(r.plan.back)));
    if (rush.length && Math.random() < RUSH_ODDS) {
      const r = rush[Math.floor(Math.random() * rush.length)]!;
      this.startTrip(r, r.at === 'home' ? 'out' : 'home', hours + RUSH_WINDOW + 0.5);
      return;
    }
    if (Math.random() >= ERRAND_ODDS) return;
    const home = this.residents.filter((r) => r.at === 'home');
    const r = home[Math.floor(Math.random() * home.length)];
    if (!r) return;
    this.startTrip(r, 'out', hours + 1 + Math.random() * 1.5);
  }

  /** `r` (held there until `holdUntil`, a game hour, if given) comes out of their door (or in by the street door) and walks the stairs (or rides the lift) there. */
  private startTrip(r: Resident, to: 'home' | 'out', holdUntil: number | null = null): void {
    const { k, i, lift } = r.plan;
    r.hold = holdUntil === null ? null : holdUntil % 24;
    const door = doorSpot(k, i);
    const done = (): void => {
      r.at = to;
      r.going = null;
    };
    r.going = to;
    r.greeted = false;
    const walker = r.walker;
    const byLift = lift && Math.random() < 0.7;
    if (to === 'out') {
      walker.appear(door, landingY(k));
      if (byLift) {
        walker.walk(toLiftGate(door), () => walker.vanish(() => {
          window.setTimeout(() => {
            if (r.going !== to || !this.occupied) return;
            walker.appear(liftGate(), landingY(STOREYS));
            walker.walk(liftToStreet(), () => walker.vanish(done));
          }, RIDE_S * 1000);
        }));
      } else {
        walker.walk(routeDown(k, door), () => walker.vanish(done));
      }
      return;
    }
    if (byLift) {
      walker.appear(streetDoorSpot(), landingY(STOREYS));
      walker.walk([...liftToStreet().reverse().slice(1), liftGate()], () => walker.vanish(() => {
        window.setTimeout(() => {
          if (r.going !== to || !this.occupied) return;
          walker.appear(liftGate(), landingY(k));
          walker.walk([door.clone()], () => walker.vanish(done));
        }, RIDE_S * 1000);
      }));
      return;
    }
    walker.appear(streetDoorSpot(), landingY(STOREYS));
    walker.walk(routeUp(k, door), () => walker.vanish(done));
  }

  /** Passing the player (near, on the same flight or landing): a word for the time of day. */
  private greet(r: Resident, hours: number): void {
    r.walker.getWorldPosition(scratch);
    if (Math.hypot(scratch.x - this.eye.x, scratch.z - this.eye.z) > HELLO_RANGE || Math.abs(this.eye.y - 1.6 - scratch.y) > 1.2) return;
    r.greeted = true;
    const offer = this.options.trades?.offerAt(r.door);
    if (offer) r.walker.say('Did you see my note?', 2.5);
    else r.walker.say(hours < 12 ? 'Bonjour !' : hours < 18 ? 'Hello!' : 'Bonsoir !', 2.2);
  }

  /** A click: their swap if they have one going, else one of their lines in turn. */
  private chat(r: Resident): string {
    const offer = this.options.trades?.offerAt(r.door);
    if (offer) return `${r.who}: "Did you get my note? I'd swap my ${offer.gives.title} for your ${offer.wants.title}. Knock on my door, ${offer.floor}."`;
    const lines = r.plan.lines;
    const line = lines[Math.floor(Math.random() * lines.length)]!;
    return `${r.who}: "${line}"`;
  }
}
