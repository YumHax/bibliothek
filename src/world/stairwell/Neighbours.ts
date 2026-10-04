import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { Timers } from '@/core/Timers';
import type { OccupancyAware } from '../Furniture';
import type { NeighbourTrades } from '@/economy/NeighbourTrades';
import { randomLook } from '../people/looks';
import { Prop } from '../props/Prop';
import { mainsOn } from '@/building/mains';
import { COLD, friendship } from '@/building/friendship';
import { NEIGHBOUR_NOISE } from '@/building/neighbourNoisePlan';
import { StairWalker } from './StairWalker';
import { doorKey } from './building';
import { doorSpot, liftGate, liftToStreet, routeDown, routeUp, streetDoorSpot, toLiftGate } from './stairRoutes';
import { STAIRWELL_PLAN as plan, STOREYS, STOREY, landingY } from './stairwellPlan';
import type { LiftRides } from './Lift';
import { playMurmur } from '@/audio/murmur';
import { stereoPan } from '@/audio/spatial';
import { proximityVolume } from '@/video/proximityVolume';

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
  /** Where they are in their hellos and in their chat lines (each said in turn). */
  nextHello: number;
  nextLine: number;
}

interface NeighboursOptions {
  viewer: THREE.Object3D;
  /** The game clock's hour, 0..24. */
  hours: () => number;
  /** The staircase's floor under (x, z) for feet at `feet`, zone-local. */
  ground: (x: number, z: number, feet: number) => number | null;
  /** The swaps: a resident with a standing offer mentions it. */
  trades?: NeighbourTrades;
  /** The lift, to ride for real when it is free (else they fade at its gate and are gone the ride's time). */
  lift?: LiftRides;
  /** A resident's door opening or shutting as they go through it (landing `k`, door `i`): its latch, heard on the landing. */
  door?: (k: number, i: number) => void;
  /** Whether a cat lives in the flat (their word on it waits till then); always, when not given. */
  catHome?: () => boolean;
  /** Whether whoever lives behind door `key` has moved out of the building (Mrs Roux, `building/rouxMove`): never met, never in. */
  gone?: (key: string) => boolean;
  /** What the resident behind door `key` has to say of the moment before their own lines (her move), or null. */
  says?: (key: string) => string | null;
  /** The player chatted with the resident behind door `key` (a friendship's worth, `building/friendship`). */
  onChat?: (key: string) => void;
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
/** What they say is heard as a murmur at their mouth: this loud right by them (0..1), heard up to `maxDistance` m. */
const MURMUR = { level: 0.05, y: 1.6, maxDistance: 10 };

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
  /** The lift rides: on the stairwell's own time, dropped when it unloads. */
  private readonly timers = new Timers();
  private primed = false;
  private readonly eye = new THREE.Vector3();

  constructor(private readonly options: NeighboursOptions) {
    super();
    this.name = 'Neighbours';
    this.residents = plan.residents.map((r) => {
      const who = r.k === 0 ? plan.ourNeighbour : plan.neighbours[r.k - 1]![r.i]!;
      const door = doorKey(r.k, r.i);
      // Each starts somewhere of their own in their lines, so two neighbours never open alike.
      const resident: Resident = { plan: r, who, door, at: 'home', going: null, hold: null, greeted: false, nextHello: r.seed % r.hello.length, nextLine: r.seed % r.lines.length } as Resident;
      resident.walker = new StairWalker({
        viewer: options.viewer,
        seed: r.seed,
        look: randomLook(r.seed + 900, 'shopper'),
        speed: 0.75 + (r.seed % 5) * 0.05,
        label: `${who} · ${plan.floorNames[r.k]} floor`,
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

  update(dt: number): void {
    this.timers.update(dt);
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
      if (this.options.gone?.(r.door)) continue;
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

  /** Nobody sets off: at night, and in a power cut (they are out on the landings with candles: `powerCut/`). */
  private quiet(hours: number): boolean {
    return hours >= QUIET.from || hours < QUIET.to || !mainsOn();
  }

  /** The player just came onto the stairs: someone whose hour it is may be on their way, or out on an errand. */
  private meetSomeone(): void {
    const hours = this.options.hours();
    if (this.quiet(hours)) return;
    const near = (a: number) => Math.abs(hours - a) <= RUSH_WINDOW;
    const here = this.residents.filter((r) => !this.options.gone?.(r.door));
    const rush = here.filter((r) => (r.at === 'home' && near(r.plan.out)) || (r.at === 'out' && near(r.plan.back)));
    if (rush.length && Math.random() < RUSH_ODDS) {
      const r = rush[Math.floor(Math.random() * rush.length)]!;
      this.startTrip(r, r.at === 'home' ? 'out' : 'home', hours + RUSH_WINDOW + 0.5);
      return;
    }
    if (Math.random() >= ERRAND_ODDS) return;
    const home = here.filter((r) => r.at === 'home');
    const r = home[Math.floor(Math.random() * home.length)];
    if (!r) return;
    this.startTrip(r, 'out', hours + 1 + Math.random() * 1.5);
  }

  /** Whether whoever lives behind door `key` is in (no resident on the stairs lives there: someone always is). */
  isHome(key: string): boolean {
    if (this.options.gone?.(key)) return false;
    const r = this.residents.find((resident) => resident.door === key);
    return !r || (r.going === null && r.at === 'home');
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
    const going = (): boolean => r.going === to && this.occupied;
    const intoDoor = (): void => {
      this.options.door?.(k, i);
      walker.vanish(done);
    };
    if (to === 'out') {
      walker.appear(door, landingY(k));
      this.options.door?.(k, i);
      if (byLift) {
        const outOfLift = (): void => {
          if (!going()) return;
          walker.appear(liftGate(), landingY(STOREYS));
          walker.walk(liftToStreet(), () => walker.vanish(done));
        };
        this.ride(r, k, STOREYS, toLiftGate(door), outOfLift);
      } else {
        walker.walk(routeDown(k, door), () => walker.vanish(done));
      }
      return;
    }
    if (byLift) {
      walker.appear(streetDoorSpot(), landingY(STOREYS));
      const outOfLift = (): void => {
        if (!going()) return;
        walker.appear(liftGate(), landingY(k));
        walker.walk([door.clone()], intoDoor);
      };
      this.ride(r, STOREYS, k, [...liftToStreet().reverse().slice(1), liftGate()], outOfLift);
      return;
    }
    walker.appear(streetDoorSpot(), landingY(STOREYS));
    walker.walk(routeUp(k, door), intoDoor);
  }

  /**
   * `r` walks `toGate` to the lift's gate on landing `from` and rides to `to`, then `outOfLift`. The lift is called
   * for them as they set off (a real ride: the car comes, they step in, it goes); busy (the player in it, another
   * ride), they fade at the gate and step out at `to` the ride's time later.
   */
  private ride(r: Resident, from: number, to: number, toGate: THREE.Vector3[], outOfLift: () => void): void {
    const walker = r.walker;
    const trip = r.going;
    let atGate = false;
    const riding = this.options.lift?.carry(from, to, {
      ready: () => atGate,
      board: () => {
        if (r.going === trip) walker.vanish();
      },
      arrive: outOfLift,
    });
    walker.walk(toGate, () => {
      atGate = true;
      if (riding) return;
      walker.vanish(() => this.timers.after(RIDE_S, outOfLift));
    });
  }

  /** Passing the player (near, on the same flight or landing): a word for the time of day. */
  private greet(r: Resident, hours: number): void {
    r.walker.getWorldPosition(scratch);
    if (Math.hypot(scratch.x - this.eye.x, scratch.z - this.eye.z) > HELLO_RANGE || Math.abs(this.eye.y - 1.6 - scratch.y) > 1.2) return;
    r.greeted = true;
    const offer = this.options.trades?.offerAt(r.door);
    const hello = offer ? 'Did you see my note?' : this.hello(r, hours);
    r.walker.say(hello, offer ? 2.5 : 2.2);
    this.murmur(r, hello);
  }

  /** Their hellos in turn, the time of day's among them. */
  private hello(r: Resident, hours: number): string {
    // Cross with the player (the noise after ten, `building/noiseComplaints`): a curt word, no more.
    if (friendship(r.door) <= COLD) return NEIGHBOUR_NOISE.coldHellos[r.nextHello++ % NEIGHBOUR_NOISE.coldHellos.length]!;
    const pool = [hours < 12 ? 'Good morning!' : hours < 18 ? 'Hello!' : 'Good evening!', ...r.plan.hello];
    const line = pool[r.nextHello % pool.length]!;
    r.nextHello++;
    return line;
  }

  /** A click: their swap if they have one going, else the next of their lines that fits the hour (and the cat). */
  private chat(r: Resident): string {
    const offer = this.options.trades?.offerAt(r.door);
    const text = offer ? `Did you get my note? I’d swap my ${offer.gives.title} for your ${offer.wants.title}. Knock on my door, ${offer.floor}.` : (this.options.says?.(r.door) ?? this.nextLine(r));
    this.murmur(r, text);
    this.options.onChat?.(r.door);
    return `${r.who}: “${text}”`;
  }

  private nextLine(r: Resident): string {
    const lines = r.plan.lines;
    const hours = this.options.hours();
    const now = hours < 12 ? 'morning' : hours < 18 ? 'day' : 'evening';
    const cat = this.options.catHome?.() ?? true;
    for (let tries = 0; tries < lines.length; tries++) {
      const line = lines[r.nextLine % lines.length]!;
      r.nextLine++;
      if (typeof line === 'string') return line;
      if ((!line.when || line.when === now) && (!line.needsCat || cat)) return line.text;
    }
    return r.plan.hello[0] ?? 'Hello.';
  }

  /** What `r` says, heard faintly from where they stand (by distance, and the side). */
  private murmur(r: Resident, text: string): void {
    r.walker.getWorldPosition(scratch);
    scratch.y += MURMUR.y;
    this.options.viewer.getWorldPosition(this.eye);
    const level = proximityVolume(this.eye.distanceTo(scratch), { referenceDistance: 1, maxDistance: MURMUR.maxDistance }) / 100;
    playMurmur(text, MURMUR.level * level, { pan: stereoPan(this.options.viewer, scratch), walls: 0 }, r.plan.voice.pitch);
  }
}
