import * as THREE from 'three';
import type { Friend } from './Friend';
import { VISIT_RULES } from './friendsPlan';

/** A door on the way: opened by the friend when it is shut. */
export interface DoorLike {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
}

/** A floor point of the round (zone-local to the friend's zone), and the door to open before walking to it. */
export interface Leg {
  at: THREE.Vector3;
  door?: DoorLike | null;
}

/** An armchair on the round: how to get there from the hub, where to stand before sitting, where and which way to sit. */
export interface RouteSeat {
  via: THREE.Vector3[];
  approach: THREE.Vector3;
  at: THREE.Vector3;
  yaw: number;
  /** Nobody (the player, the cat) is in it right now. */
  free: () => boolean;
}

/** The whole way, zone-local floor points (see `HALLWAY_PLAN.visitor`, `ROOM_PLAN.visitor`). */
export interface VisitRoute {
  stairs: THREE.Vector3;
  landing: THREE.Vector3;
  inside: THREE.Vector3;
  hallDoor: THREE.Vector3;
  roomDoor: THREE.Vector3;
  hub: THREE.Vector3;
  browse: { at: THREE.Vector3; yaw: number; kind: 'shelf' | 'window'; via: THREE.Vector3[] }[];
  seats: RouteSeat[];
}

/** What the visit asks of the one running it (`Visitors`): the lines, the loan, the bell. */
export interface VisitScript {
  /** A line said aloud (the host shows it to a player in earshot) with a word in the bubble. */
  say(line: string, word: string): void;
  /** At the landing: ring the bell. */
  arrived(): void;
  /** Just inside the front door, on a return visit: hand the game back. */
  handBack(): void;
  /** Looking at the shelves: a comment for the stop (`kind`), or null to stay quiet. */
  comment(kind: 'shelf' | 'window'): string | null;
  /** At the second shelf: ask to borrow something, if anything suits. */
  ask(): void;
  /** The cat is near: a line for it, or null. */
  greetCat(): string | null;
  /** Sitting down: a line. */
  sitLine(): string;
  /** On the way out: a line. */
  leaveLine(): string;
  /** Gone (down the stairs, or cut short). */
  left(): void;
}

/** Thrown into the script's awaits when the visit is cut short. */
const CANCELLED = Symbol('cancelled');
const scratch = new THREE.Vector3();
const eye = new THREE.Vector3();

/**
 * One friend's visit, played out as a script over the frames: up the stairs to the landing (the
 * bell), wait for the door, in, a word, a hand-back if a loan is due, the collection room's door
 * (opened if shut), a few stops at the shelves and the window with a comment each (and, at the
 * second, a borrow request), a sit in a free armchair, and out the way they came, down the stairs.
 * Legs are walked one point at a time so a player standing in the way makes them wait (then fade
 * and pass through, never pushing); `cancel()` ends it wherever it is (the friend is taken away).
 */
export class Visit {
  private clock = 0;
  private readonly waits: { until: number; resolve: () => void; reject: (e: unknown) => void }[] = [];
  private legs: Leg[] = [];
  private walking: { resolve: () => void; reject: (e: unknown) => void } | null = null;
  private stepping = false;
  private blockedFor = 0;
  private openingDoor = 0;
  private fadeTarget = 1;
  private fade = 0;
  private cancelled = false;
  private catGreeted = false;
  private letInResolve: (() => void) | null = null;
  private letInReject: ((e: unknown) => void) | null = null;
  /** Down the stairs without coming in (nobody answered). */
  private turnedAway = false;
  private throughFront = false;

  constructor(
    readonly friend: Friend,
    private readonly route: VisitRoute,
    private readonly viewer: THREE.Object3D,
    private readonly doors: { front: DoorLike | null; living: DoorLike | null },
    private readonly script: VisitScript,
    private readonly options: { returning: boolean; cat: () => THREE.Vector3 | null },
  ) {}

  /** Waiting on the landing for the door. */
  get atDoor(): boolean {
    return this.letInResolve !== null;
  }

  /** On the way through the front door (in, or out): it must not swing shut on them. */
  get passingFront(): boolean {
    return this.throughFront;
  }

  /** Starts it: the friend appears at the top of the stairs. */
  start(): void {
    this.friend.setPresent(true, this.route.stairs);
    this.friend.setFade(0);
    void this.run().catch((e: unknown) => {
      if (e !== CANCELLED) console.warn('[visitors]', e);
    });
  }

  /** The door opened to them. */
  letIn(): void {
    const resolve = this.letInResolve;
    this.letInResolve = null;
    this.letInReject = null;
    resolve?.();
  }

  /** Nobody answered: back down the stairs. */
  turnAway(): void {
    if (!this.letInReject) return;
    this.turnedAway = true;
    this.letIn();
  }

  /** Ends the visit on the spot: the friend is gone. */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.throughFront = false;
    for (const wait of this.waits.splice(0)) wait.reject(CANCELLED);
    this.walking?.reject(CANCELLED);
    this.walking = null;
    this.letInReject?.(CANCELLED);
    this.letInResolve = this.letInReject = null;
    this.friend.request = null;
    this.friend.setPresent(false);
    this.script.left();
  }

  update(dt: number): void {
    if (this.cancelled) return;
    this.clock += dt;
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const wait = this.waits[i]!;
      if (this.clock >= wait.until) {
        this.waits.splice(i, 1);
        wait.resolve();
      }
    }
    this.drive(dt);
    // The camera never ends up inside them: close enough, they thin out.
    this.viewer.getWorldPosition(eye);
    this.friend.getWorldPosition(scratch);
    const near = Math.hypot(eye.x - scratch.x, eye.z - scratch.z) < VISIT_RULES.blocked.through && Math.abs(eye.y - scratch.y - 1.6) < 1;
    const target = near ? Math.min(this.fadeTarget, 0.3) : this.fadeTarget;
    this.fade += Math.sign(target - this.fade) * Math.min(Math.abs(target - this.fade), dt * 2.5);
    this.friend.setFade(this.fade);
    this.watchCat();
  }

  // --- the script -------------------------------------------------------------------------------

  private async run(): Promise<void> {
    const r = this.route;
    this.fadeTarget = 1;
    await this.walk([{ at: r.landing }]);
    this.friend.stand(-Math.PI / 2, 'pockets');
    this.script.arrived();
    await new Promise<void>((resolve, reject) => {
      this.letInResolve = resolve;
      this.letInReject = reject;
    });
    if (this.turnedAway) {
      await this.walk([{ at: r.stairs }]);
      await this.goAway();
      return;
    }
    this.throughFront = true;
    await this.pause(0.6);
    await this.walk([{ at: r.inside }]);
    this.throughFront = false;
    if (this.options.returning) {
      this.friend.stand(this.yawToViewer(), 'stand');
      this.script.handBack();
      await this.pause(3);
    }
    await this.walk([{ at: r.hallDoor }, { at: r.roomDoor, door: this.doors.living }, { at: r.hub }]);
    const stops = this.pickStops();
    for (const [i, stop] of stops.entries()) {
      await this.walk([...stop.via.map((at) => ({ at })), { at: stop.at }]);
      this.friend.stand(stop.yaw, i % 2 ? 'pockets' : 'think');
      await this.pause(1.2);
      const line = this.script.comment(stop.kind);
      if (line) this.script.say(line, stop.kind === 'window' ? 'Nice!' : 'Ooh!');
      if (i === 1 && stop.kind === 'shelf') {
        await this.pause(2.5);
        this.script.ask();
      }
      await this.pause(between(VISIT_RULES.linger.browse));
      await this.walk([...[...stop.via].reverse().map((at) => ({ at })), { at: r.hub }]);
    }
    const seat = this.options.returning ? undefined : r.seats.find((s) => s.free());
    if (seat) {
      await this.walk([...seat.via.map((at) => ({ at })), { at: seat.approach }, { at: seat.at }]);
      this.friend.sit(seat.yaw, 0.46, 'lap');
      this.script.say(this.script.sitLine(), 'Ahh');
      await this.pause(between(VISIT_RULES.linger.seat));
      this.friend.stand(seat.yaw, 'stand');
      await this.walk([{ at: seat.approach }, ...[...seat.via].reverse().map((at) => ({ at })), { at: r.hub }]);
    }
    this.script.say(this.script.leaveLine(), 'Bye!');
    await this.walk([{ at: r.roomDoor }, { at: r.hallDoor, door: this.doors.living }, { at: r.inside }]);
    this.throughFront = true;
    await this.walk([{ at: r.landing, door: this.doors.front }, { at: r.stairs }]);
    await this.goAway();
  }

  /** Fades out at the top of the stairs, shuts the front door behind them unless the player stands in it, and is gone. */
  private async goAway(): Promise<void> {
    this.fadeTarget = 0;
    await this.pause(0.6);
    const front = this.doors.front;
    if (front?.isOpen) {
      this.viewer.getWorldPosition(eye);
      const door = this.friend.parent ? this.friend.parent.localToWorld(this.route.landing.clone()) : this.route.landing;
      if (Math.hypot(eye.x - door.x, eye.z - door.z) > 2.2) front.close();
    }
    this.throughFront = false;
    this.cancelled = true;
    this.friend.request = null;
    this.friend.setPresent(false);
    this.script.left();
  }

  /** The stops of this visit: `browseStops` of the plan's, the shelves first, the window maybe; fewer when returning a game. */
  private pickStops(): VisitRoute['browse'] {
    const shelves = this.route.browse.filter((b) => b.kind === 'shelf');
    const others = this.route.browse.filter((b) => b.kind !== 'shelf');
    const count = this.options.returning ? 2 : VISIT_RULES.browseStops;
    const picked = shuffle(shelves).slice(0, Math.max(1, count - (others.length ? 1 : 0)));
    if (others.length && picked.length < count) picked.push(others[Math.floor(Math.random() * others.length)]!);
    return picked;
  }

  private pause(seconds: number): Promise<void> {
    if (this.cancelled) return Promise.reject(CANCELLED);
    return new Promise((resolve, reject) => this.waits.push({ until: this.clock + seconds, resolve, reject }));
  }

  private walk(legs: Leg[]): Promise<void> {
    if (this.cancelled) return Promise.reject(CANCELLED);
    this.legs = [...legs];
    this.stepping = false;
    return new Promise((resolve, reject) => (this.walking = { resolve, reject }));
  }

  /** Walks the legs one point at a time: opens a shut door on the way, waits for a player in the way (then goes through). */
  private drive(dt: number): void {
    if (!this.walking) return;
    if (this.stepping) {
      if (this.friend.isWalking) {
        if (this.inTheWay(this.legs[0]?.at)) {
          this.blockedFor += dt;
          if (this.blockedFor < VISIT_RULES.blocked.waitFor) this.friend.stand(this.friend.rotation.y, 'stand');
          else return;
          this.stepping = false;
        }
        return;
      }
      this.stepping = false;
      this.legs.shift();
      this.blockedFor = 0;
    }
    const leg = this.legs[0];
    if (!leg) {
      const done = this.walking;
      this.walking = null;
      done.resolve();
      return;
    }
    if (leg.door && !leg.door.isOpen) {
      leg.door.open();
      this.openingDoor = 0.9;
      this.friend.stand(this.friend.rotation.y, 'stand');
    }
    if (this.openingDoor > 0) {
      this.openingDoor -= dt;
      return;
    }
    if (this.blockedFor < VISIT_RULES.blocked.waitFor && this.inTheWay(leg.at)) {
      this.blockedFor += dt;
      return;
    }
    this.stepping = true;
    this.friend.walk([leg.at]);
  }

  /** Whether the player stands just ahead of the friend, towards `next`. */
  private inTheWay(next: THREE.Vector3 | undefined): boolean {
    if (!next) return false;
    this.viewer.getWorldPosition(eye);
    const parent = this.friend.parent;
    const local = parent ? parent.worldToLocal(eye.clone()) : eye.clone();
    const dx = local.x - this.friend.position.x;
    const dz = local.z - this.friend.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VISIT_RULES.blocked.ahead || dist < 1e-3) return false;
    const hx = next.x - this.friend.position.x;
    const hz = next.z - this.friend.position.z;
    const h = Math.hypot(hx, hz);
    return h > 0.05 && (dx * hx + dz * hz) / (dist * h) > 0.3;
  }

  private yawToViewer(): number {
    this.viewer.getWorldPosition(eye);
    const local = this.friend.parent ? this.friend.parent.worldToLocal(eye.clone()) : eye.clone();
    return Math.atan2(local.x - this.friend.position.x, local.z - this.friend.position.z);
  }

  /** Once a visit, standing still with the cat close by: a word for it, eyes on it. */
  private watchCat(): void {
    if (this.catGreeted || this.friend.isWalking || this.atDoor || this.fade < 0.9) return;
    const cat = this.options.cat();
    if (!cat) return;
    this.friend.getWorldPosition(scratch);
    if (Math.hypot(cat.x - scratch.x, cat.z - scratch.z) > 2.2 || Math.abs(cat.y - scratch.y) > 1.5) return;
    this.catGreeted = true;
    const line = this.script.greetCat();
    if (!line) return;
    this.friend.setFocus(cat.clone().setY(cat.y + 0.2));
    this.script.say(line, 'Kitty!');
  }
}

function between([min, max]: readonly [number, number]): number {
  return min + Math.random() * (max - min);
}

function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
