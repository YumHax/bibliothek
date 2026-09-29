import * as THREE from 'three';
import type { Friend } from './Friend';
import { VISIT_RULES, WORDS, type Word } from './friendsPlan';

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
  /** Walked straight even when something stands in the way (the last step into an armchair: the armchair itself). */
  direct?: boolean;
}

/** An armchair on the round: how to get there from the hub, where to stand before sitting, where and which way to sit. */
export interface RouteSeat {
  via: THREE.Vector3[];
  approach: THREE.Vector3;
  at: THREE.Vector3;
  yaw: number;
  /** How high its seat is (m): where they sit down to. */
  height: number;
  /** Nobody (the player, the cat, another guest) is in it right now. */
  free: () => boolean;
  /** Marks it theirs from the moment they head for it until they get up (null): the cat and the player keep off. */
  claim: (guest: string | null) => void;
}

/** The whole way, zone-local floor points (see `HALLWAY_PLAN.visitor`, `ROOM_PLAN.visitor`). */
export interface VisitRoute {
  stairs: THREE.Vector3;
  /**
   * The flight down from the landing (the stairwell's flight A): its top tread's edge and a point `VISIT_RULES.stairs.treads`
   * treads down (its `y` below the landing). They come up it and go back down it, fading out on its last treads.
   */
  flight: { top: THREE.Vector3; bottom: THREE.Vector3 };
  landing: THREE.Vector3;
  inside: THREE.Vector3;
  hallDoor: THREE.Vector3;
  roomDoor: THREE.Vector3;
  hub: THREE.Vector3;
  browse: { at: THREE.Vector3; yaw: number; kind: 'shelf' | 'window'; via: THREE.Vector3[] }[];
  seats: RouteSeat[];
}

/** A game handed back, held out in both hands: the box, and its width (where the hands go). */
export interface HeldBox {
  box: THREE.Object3D;
  width: number;
}

/** What the visit asks of the one running it (`Visitors`): the lines, the loan, the bell. */
export interface VisitScript {
  /** A line said aloud (the host shows it to a player in earshot), with a word of `word`'s kind in the bubble out of it. */
  say(line: string, word: Word): void;
  /** At the landing: ring the bell. */
  arrived(): void;
  /** Just inside the front door, after the greeting: a line on coming in. */
  enterLine(): string;
  /** Just inside the front door, on a return visit: the game handed back (the line, the thanks), and the box to hold out, if any. */
  handBack(): HeldBox | null;
  /** The box held out goes back on its shelf (the loan closes). */
  shelve(): void;
  /**
   * Arrived at a stop, facing `yaw` from `at` (world): what they look at (a box on the nearest shelf, the street),
   * and what they will say about it, or null to stay quiet.
   */
  browse(kind: 'shelf' | 'window', at: THREE.Vector3, yaw: number): { look: THREE.Vector3 | null; line: string | null };
  /** At the second shelf: ask to borrow something, if anything suits. */
  ask(): void;
  /** The cat is near: a line for it, or null. */
  greetCat(): string | null;
  /** Sitting down: a line. */
  sitLine(): string;
  /** On the way out: a line. */
  leaveLine(): string;
  /** The player stands in their way: a word before stepping round. */
  excuse(): string;
  /** A footfall at `at` (world). */
  step(at: THREE.Vector3): void;
  /** They pulled the front door shut behind them (its sound). */
  shutFront(): void;
  /** Gone (down the stairs, or cut short). */
  left(): void;
}

/** Thrown into the script's awaits when the visit is cut short. */
const CANCELLED = Symbol('cancelled');
/** The player nearer than this (m) to the front doorway stands in it: the door is left open. */
const IN_DOORWAY = 1;
/** Where a held box is, in front of the chest (friend-local), and how far it tilts back. */
const HOLD = { y: 1.08, z: 0.3, tilt: -0.3 };
/**
 * A shut door on the way: the hand goes to its handle `ahead` m towards where they are going, `y` m over the floor,
 * `reach` s before it swings open (`VISIT_RULES.beats.doorOpens`), and comes off it `release` s after; the other hand
 * hangs by the hip (friend-local).
 */
const DOOR_HAND = { ahead: 0.5, y: 1.0, reach: 0.35, release: 0.4, rest: [-0.22, 0.8, 0.05] as const };
/** How fast their feet settle onto the next tread of the flight (per second): a step up or down, not a slide. */
const TREAD_RATE = 14;
const scratch = new THREE.Vector3();
const eye = new THREE.Vector3();
const from = new THREE.Vector3();
const to = new THREE.Vector3();

/**
 * One friend's visit, played out as a script over the frames: up the stairs to the landing (the
 * bell), wait for the door, in, a word, a hand-back if a loan is due (the box held out a moment),
 * the collection room's door (opened if shut), a few stops at the shelves and the window with a
 * comment each on what they look at (and, at the second, a borrow request), a sit in a free
 * armchair (eyes on the TV if it plays, else on the player), and out the way they came: the front
 * door pulled shut behind them, down the flight until out of sight. Legs are walked one point at a
 * time so a player standing in the way makes them stop, say so and step round (only then, if still
 * blocked, pass through fading, never pushing); `cancel()` ends it wherever it is.
 */
export class Visit {
  private clock = 0;
  private readonly waits: { until: number; resolve: () => void; reject: (e: unknown) => void }[] = [];
  private legs: Leg[] = [];
  private walking: { resolve: () => void; reject: (e: unknown) => void } | null = null;
  private stepping = false;
  private blockedFor = 0;
  /** How long they have stood letting the cat pass on this leg. */
  private catWait = 0;
  private excused = false;
  private sidestepped = false;
  private openingDoor = 0;
  /** The door their hand is on, opened once the reach is done. */
  private pendingDoor: DoorLike | null = null;
  private doorHand = false;
  /** How many legs the friend was sent walking at once (up to the next shut door), and how many they had passed. */
  private batch = 0;
  private passed = 0;
  private fadeTarget = 1;
  private fade = 0;
  private cancelled = false;
  private catGreeted = false;
  private letInResolve: (() => void) | null = null;
  private letInReject: ((e: unknown) => void) | null = null;
  /** Down the stairs without coming in (nobody answered). */
  private turnedAway = false;
  private throughFront = false;
  private seated = false;
  /** What a seated friend watches (the TV playing, else the player), kept up to date every frame. */
  private readonly gaze = new THREE.Vector3();
  private held: HeldBox | null = null;
  /** The armchair claimed for the sit, let go when they get up or the visit ends. */
  private claimed: RouteSeat | null = null;
  /** Their footsteps: where the last one fell (zone-local) and how far they walked since. */
  private readonly lastStep = new THREE.Vector3(NaN, 0, 0);
  private walked = 0;

  constructor(
    readonly friend: Friend,
    private readonly route: VisitRoute,
    private readonly viewer: THREE.Object3D,
    private readonly doors: { front: DoorLike | null; living: DoorLike | null },
    private readonly script: VisitScript,
    private readonly options: {
      returning: boolean;
      cat: () => THREE.Vector3 | null;
      /** How much longer than usual they linger at each stop (a cake on the kitchen table: `HOUSEHOLD.cake.linger`); read at each stop. */
      linger?: () => number;
      /** The screen playing a longplay (world, its middle), or null: a seated friend watches it. */
      watch?: () => THREE.Vector3 | null;
      /** Whether nothing solid stands between two world points (a sidestep's way); without it they never sidestep. */
      clear?: (a: THREE.Vector3, b: THREE.Vector3) => boolean;
      /**
       * A way round what stands between two floor points (zone-local, the furniture the player moved onto the round):
       * the points to walk through, ending at `to` (or the nearest free spot to it); null to walk straight.
       */
      detour?: (from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3[] | null;
    },
  ) {}

  /** Waiting on the landing for the door. */
  get atDoor(): boolean {
    return this.letInResolve !== null;
  }

  /** On the way through the front door (in, or out): it must not swing shut on them. */
  get passingFront(): boolean {
    return this.throughFront;
  }

  /** Starts it: the friend comes up the flight to the landing. */
  start(): void {
    this.friend.setPresent(true, this.route.flight.bottom);
    this.friend.position.y = this.route.flight.bottom.y;
    this.friend.setFade(0);
    this.fade = 0;
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

  /** `then` in `seconds` of the visit's own clock (paused with the frames); dropped if the visit ends first. */
  after(seconds: number, then: () => void): void {
    this.pause(seconds).then(then, () => undefined);
  }

  /** Clicked to chat: they turn to face the player (seated or walking, they only look). */
  faceViewer(): void {
    this.viewer.getWorldPosition(eye);
    if (this.seated || this.friend.isWalking || this.held) {
      this.friend.setFocus(this.seated ? this.gaze.copy(eye) : eye.clone());
      return;
    }
    this.friend.stand(this.yawToViewer(), 'stand', eye.clone());
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
    this.dropHeld();
    this.release();
    this.friend.request = null;
    this.friend.hold(null);
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
    // The feet settle onto each tread of the flight in turn (a lift over the riser), and onto the landing at once.
    const floor = this.floorY(this.friend.position);
    const y = this.friend.position.y;
    this.friend.position.y = Math.abs(floor - y) > 0.5 ? floor : y + (floor - y) * Math.min(1, dt * TREAD_RATE);
    this.footsteps();
    this.viewer.getWorldPosition(eye);
    if (this.seated) this.gaze.copy(this.options.watch?.() ?? eye);
    // The camera never ends up inside them: close enough, they thin out.
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
    const beats = VISIT_RULES.beats;
    this.fadeTarget = 1;
    this.friend.hold(null);
    await this.walk([{ at: r.flight.top }, { at: r.stairs }, { at: r.landing }]);
    // Facing the door, hands in pockets; a while after the bell, the phone comes out.
    this.friend.stand(this.yawTo(r.inside), 'pockets');
    this.script.arrived();
    this.after(between(VISIT_RULES.landing.phoneAfter), () => {
      if (!this.atDoor) return;
      this.friend.hold('phone');
      this.friend.setPose('phone');
    });
    await new Promise<void>((resolve, reject) => {
      this.letInResolve = resolve;
      this.letInReject = reject;
    });
    this.friend.hold(null);
    if (this.turnedAway) {
      await this.downstairs();
      return;
    }
    this.throughFront = true;
    await this.pause(beats.throughDoor);
    await this.walk([{ at: r.inside }]);
    this.throughFront = false;
    this.friend.stand(this.yawToViewer(), 'stand');
    if (this.options.returning) {
      const held = this.script.handBack();
      if (held) this.hold(held);
      await this.pause(VISIT_RULES.handBackFor);
      this.letGo();
    } else {
      await this.pause(beats.beforeEnter);
      this.script.say(this.script.enterLine(), 'hi');
      await this.pause(beats.afterEnter);
    }
    await this.walk([{ at: r.hallDoor }, { at: r.roomDoor, door: this.doors.living }, { at: r.hub }]);
    const stops = this.pickStops();
    let from: VisitRoute['browse'][number] | null = null;
    for (const [i, stop] of stops.entries()) {
      await this.walk(this.between(from, stop));
      from = stop;
      const { look, line } = this.script.browse(stop.kind, this.friend.getWorldPosition(new THREE.Vector3()), stop.yaw);
      this.friend.stand(stop.yaw, i % 2 ? 'pockets' : 'think', look);
      await this.pause(beats.lookFirst);
      if (line) this.script.say(line, stop.kind === 'window' ? 'nice' : 'ooh');
      if (i === 1 && stop.kind === 'shelf') {
        await this.pause(beats.askAfter);
        this.script.ask();
      }
      await this.pause(between(VISIT_RULES.linger.browse) * (this.options.linger?.() ?? 1));
    }
    if (from) await this.walk([...[...from.via].reverse().map((at) => ({ at })), { at: r.hub }]);
    await this.sitAWhile();
    this.script.say(this.script.leaveLine(), 'bye');
    await this.walk([{ at: r.roomDoor }, { at: r.hallDoor, door: this.doors.living }, { at: r.inside }]);
    this.throughFront = true;
    await this.walk([{ at: r.landing, door: this.doors.front }]);
    await this.shutBehind();
    this.throughFront = false;
    await this.downstairs();
  }

  /**
   * A free armchair, claimed from the moment they head for it: sat in facing the room (turned first,
   * then down to its seat's height), got up from after a while. Taken meanwhile (the player sat down,
   * the cat got there first): another free one, or no sit this time.
   */
  private async sitAWhile(): Promise<void> {
    const r = this.route;
    if (this.options.returning) return;
    let seat = r.seats.find((s) => s.free());
    while (seat) {
      this.claim(seat);
      await this.walk([...seat.via.map((at) => ({ at })), { at: seat.approach }]);
      if (seat.free()) break;
      this.release();
      const back = seat;
      await this.walk([...[...back.via].reverse().map((at) => ({ at })), { at: r.hub }]);
      seat = r.seats.find((s) => s !== back && s.free());
    }
    if (!seat) return;
    await this.walk([{ at: seat.at, direct: true }]);
    this.friend.stand(seat.yaw, 'stand');
    await this.until(() => Math.abs(angleDelta(seat.yaw, this.friend.rotation.y)) < 0.25, VISIT_RULES.sitTurnFor);
    this.seated = true;
    this.viewer.getWorldPosition(eye);
    this.gaze.copy(this.options.watch?.() ?? eye);
    // Down into it leaning forward, then back in the chair.
    const { sitLean, settleAfter, riseLean, riseFor } = VISIT_RULES.sitting;
    this.friend.sit(seat.yaw, seat.height, 'lap', this.gaze);
    this.friend.setLean(sitLean);
    this.after(settleAfter, () => {
      if (this.seated) this.friend.setLean(0);
    });
    this.script.say(this.script.sitLine(), 'ahh');
    const stay = between(VISIT_RULES.linger.seat) * (this.options.linger?.() ?? 1);
    // Watching a longplay: a word at the screen, some way into it.
    this.after(stay * between(VISIT_RULES.sitting.tvWordAt), () => {
      if (this.seated && this.options.watch?.()) this.friend.say(pick(WORDS.ooh));
    });
    await this.pause(stay);
    this.seated = false;
    // Up out of the chair: lean forward, push up, and only then walk.
    this.friend.stand(seat.yaw, 'stand');
    this.friend.setLean(riseLean);
    await this.pause(riseFor);
    this.friend.setLean(0);
    await this.walk([{ at: seat.approach, direct: true }]);
    this.release();
    await this.walk([...[...seat.via].reverse().map((at) => ({ at })), { at: r.hub }]);
  }

  private claim(seat: RouteSeat): void {
    this.release();
    this.claimed = seat;
    seat.claim(this.friend.plan.name);
  }

  private release(): void {
    this.claimed?.claim(null);
    this.claimed = null;
  }

  /**
   * The way from one stop to the next: straight from stop to stop when nothing stands between (the shelves side by
   * side), else back through the hub and out along the next one's `via`. From the hub (`from` null): its `via`.
   */
  private between(from: VisitRoute['browse'][number] | null, to: VisitRoute['browse'][number]): Leg[] {
    const out = [...to.via.map((at) => ({ at })), { at: to.at }];
    if (!from) return out;
    const back = [...from.via].reverse();
    const direct = [...back, ...to.via, to.at];
    const start = from.at;
    // Straight across when every new stretch of the shortcut is clear; else by the hub.
    let a = start;
    let clear = true;
    for (const b of direct) {
      if (!this.isClear(a, b)) {
        clear = false;
        break;
      }
      a = b;
    }
    if (clear) return direct.map((at) => ({ at }));
    return [...back.map((at) => ({ at })), { at: this.route.hub }, ...out];
  }

  /** On the landing, on the way out: they turn and pull the front door shut, unless the player stands in the doorway. */
  private async shutBehind(): Promise<void> {
    const front = this.doors.front;
    if (!front?.isOpen || this.playerInDoorway()) return;
    this.friend.stand(this.yawTo(this.route.inside), 'stand');
    await this.pause(VISIT_RULES.beats.turnToShut);
    if (!front.isOpen || this.playerInDoorway()) return;
    front.close();
    this.script.shutFront();
    await this.pause(VISIT_RULES.beats.afterShut);
  }

  /** Down the flight, fading out on its last treads, and gone. */
  private async downstairs(): Promise<void> {
    const { stairs, flight } = this.route;
    const { treads, fadeTreads } = VISIT_RULES.stairs;
    const fadeFrom = flight.top.clone().lerp(flight.bottom, 1 - fadeTreads / treads);
    await this.walk([{ at: stairs }, { at: flight.top }, { at: fadeFrom }]);
    this.fadeTarget = 0;
    await this.walk([{ at: flight.bottom }]);
    await this.pause(VISIT_RULES.beats.offStairs);
    this.throughFront = false;
    this.cancelled = true;
    this.dropHeld();
    this.release();
    this.friend.request = null;
    this.friend.hold(null);
    this.friend.setPresent(false);
    this.script.left();
  }

  /**
   * The stops of this visit: `browseStops` of the plan's, the shelves (a draw of them, walked nearest first from the
   * hub, one to the next), then the window maybe; fewer when returning a game.
   */
  private pickStops(): VisitRoute['browse'] {
    const shelves = this.route.browse.filter((b) => b.kind === 'shelf');
    const others = this.route.browse.filter((b) => b.kind !== 'shelf');
    const count = this.options.returning ? 2 : VISIT_RULES.browseStops;
    const drawn = shuffle(shelves).slice(0, Math.max(1, count - (others.length ? 1 : 0)));
    const picked: VisitRoute['browse'] = [];
    let at = this.route.hub;
    while (drawn.length) {
      let best = 0;
      for (let i = 1; i < drawn.length; i++) if (drawn[i]!.at.distanceToSquared(at) < drawn[best]!.at.distanceToSquared(at)) best = i;
      const [next] = drawn.splice(best, 1);
      picked.push(next!);
      at = next!.at;
    }
    if (others.length && picked.length < count) picked.push(others[Math.floor(Math.random() * others.length)]!);
    return picked;
  }

  /** Resolves once `done()` holds (checked every frame of the visit's clock), or after `timeout` s whatever. */
  private async until(done: () => boolean, timeout: number): Promise<void> {
    const end = this.clock + timeout;
    while (!done() && this.clock < end) await this.pause(0);
  }

  private pause(seconds: number): Promise<void> {
    if (this.cancelled) return Promise.reject(CANCELLED);
    return new Promise((resolve, reject) => this.waits.push({ until: this.clock + seconds, resolve, reject }));
  }

  private walk(legs: Leg[]): Promise<void> {
    if (this.cancelled) return Promise.reject(CANCELLED);
    this.legs = this.roundFurniture(legs);
    this.stepping = false;
    this.resetBlocked();
    return new Promise((resolve, reject) => (this.walking = { resolve, reject }));
  }

  /**
   * Walks the legs, as many at once as run to the next shut door (so the walk flows through its points and round
   * its corners): a shut door on the way is opened, hand on the handle first; a player in the way makes them stop,
   * say a word, step aside, and only then go through; the cat in the way, they let it pass.
   */
  private drive(dt: number): void {
    if (!this.walking) return;
    if (this.stepping) {
      if (this.friend.isWalking) {
        const passed = this.friend.pointsPassed;
        if (passed !== this.passed) {
          this.passed = passed;
          this.resetBlocked();
        }
        const ahead = this.legs[passed]?.at;
        // A door on the way shut again since they set off (by the player): stop, and open it first.
        const door = this.legs[passed]?.door;
        if (door && !door.isOpen) {
          this.stopHere();
          return;
        }
        if (this.catInTheWay(ahead, dt)) {
          this.stopHere();
          return;
        }
        if (this.inTheWay(ahead)) {
          this.blockedFor += dt;
          if (this.blockedFor < VISIT_RULES.blocked.waitFor) this.stopHere();
        }
        return;
      }
      this.stepping = false;
      this.legs.splice(0, this.batch);
      this.resetBlocked();
    }
    const leg = this.legs[0];
    if (!leg) {
      const done = this.walking;
      this.walking = null;
      done.resolve();
      return;
    }
    if (leg.door && !leg.door.isOpen && this.openingDoor <= 0) this.reachForDoor(leg);
    if (this.openingDoor > 0) {
      this.openingDoor -= dt;
      const { doorOpens } = VISIT_RULES.beats;
      if (this.pendingDoor && this.openingDoor <= doorOpens) {
        this.pendingDoor.open();
        this.pendingDoor = null;
      }
      if (this.doorHand && this.openingDoor <= doorOpens - DOOR_HAND.release) {
        this.doorHand = false;
        this.friend.stand(this.friend.rotation.y, 'stand');
      }
      if (this.openingDoor > 0) return;
    }
    if (this.catInTheWay(leg.at, dt)) return;
    if (this.blockedFor < VISIT_RULES.blocked.waitFor && this.inTheWay(leg.at)) {
      this.blockedFor += dt;
      this.makeWay(leg);
      return;
    }
    // Every leg up to the next shut door, in one walk.
    let count = 1;
    while (count < this.legs.length) {
      const door = this.legs[count]!.door;
      if (door && !door.isOpen) break;
      count++;
    }
    this.batch = count;
    this.passed = 0;
    this.stepping = true;
    this.friend.walk(this.legs.slice(0, count).map((l) => l.at));
  }

  /** Stopped where they are: the legs already walked are done with. */
  private stopHere(): void {
    this.legs.splice(0, Math.min(this.friend.pointsPassed, this.batch));
    this.friend.stand(this.friend.rotation.y, 'stand');
    this.stepping = false;
  }

  /** A shut door ahead: turned to it, a hand on its handle, and it swings open a moment later. */
  private reachForDoor(leg: Leg): void {
    const door = leg.door!;
    const p = this.friend.position;
    const hx = leg.at.x - p.x;
    const hz = leg.at.z - p.z;
    const h = Math.hypot(hx, hz);
    this.pendingDoor = door;
    this.openingDoor = VISIT_RULES.beats.doorOpens + DOOR_HAND.reach;
    const parent = this.friend.parent;
    if (h < 0.05 || !parent) {
      this.friend.stand(this.friend.rotation.y, 'stand');
      return;
    }
    const handle = parent.localToWorld(new THREE.Vector3(p.x + (hx / h) * DOOR_HAND.ahead, p.y + DOOR_HAND.y, p.z + (hz / h) * DOOR_HAND.ahead));
    const rest = new THREE.Vector3();
    const hands: readonly [THREE.Vector3, THREE.Vector3] = [rest, handle];
    this.doorHand = true;
    this.friend.stand(Math.atan2(hx, hz), 'stand', handle.clone(), () => {
      this.friend.localToWorld(rest.set(...DOOR_HAND.rest));
      return hands;
    });
  }

  /**
   * The cat just ahead, towards `next`: they stop and let it pass (eyes on it), for `blocked.catFor` s at most, then
   * go on (it will move). Counts the wait.
   */
  private catInTheWay(next: THREE.Vector3 | undefined, dt: number): boolean {
    const { catAhead, catFor } = VISIT_RULES.blocked;
    if (!next || this.catWait >= catFor) return false;
    const cat = this.options.cat();
    const parent = this.friend.parent;
    if (!cat || !parent || cat.y > 0.3) return false;
    const local = parent.worldToLocal(scratch.copy(cat));
    const p = this.friend.position;
    const dx = local.x - p.x;
    const dz = local.z - p.z;
    const dist = Math.hypot(dx, dz);
    const hx = next.x - p.x;
    const hz = next.z - p.z;
    const h = Math.hypot(hx, hz);
    if (dist > catAhead || dist < 1e-3 || h < 0.05 || (dx * hx + dz * hz) / (dist * h) < 0.4) return false;
    this.catWait += dt;
    this.friend.setFocus(cat.clone());
    return true;
  }

  private resetBlocked(): void {
    this.catWait = 0;
    this.blockedFor = 0;
    this.excused = false;
    this.sidestepped = false;
  }

  /** Blocked a while: a word to the player, then a step to the side away from them (if nothing is there). */
  private makeWay(leg: Leg): void {
    const { excuseAfter, sidestepAfter, sidestep } = VISIT_RULES.blocked;
    if (!this.excused && this.blockedFor > excuseAfter) {
      this.excused = true;
      this.viewer.getWorldPosition(eye);
      this.friend.setFocus(eye.clone());
      this.script.say(this.script.excuse(), 'sorry');
    }
    if (this.sidestepped || this.blockedFor <= sidestepAfter) return;
    this.sidestepped = true;
    const p = this.friend.position;
    const hx = leg.at.x - p.x;
    const hz = leg.at.z - p.z;
    const h = Math.hypot(hx, hz);
    if (h < 0.05) return;
    const player = this.playerLocal();
    // The side of the heading the player is on: step to the other.
    const side = (player.x - p.x) * hz - (player.z - p.z) * hx > 0 ? -1 : 1;
    const nx = (hz / h) * side;
    const nz = (-hx / h) * side;
    for (const s of [1, -1]) {
      const at = new THREE.Vector3(p.x + nx * sidestep * s, 0, p.z + nz * sidestep * s);
      if (this.isClear(p, at)) {
        this.legs.unshift({ at });
        this.blockedFor = 0;
        return;
      }
    }
  }

  /**
   * The legs with a way round what stands across one (an armchair moved onto the round, a lamp): each leg through
   * no door, not `direct`, whose straight line is blocked, is replaced by the detour's points.
   */
  private roundFurniture(legs: readonly Leg[]): Leg[] {
    const detour = this.options.detour;
    if (!detour) return [...legs];
    const out: Leg[] = [];
    let at = this.friend.position.clone().setY(0);
    for (const leg of legs) {
      const target = leg.at.clone().setY(0);
      const way = leg.door || leg.direct || this.isClear(at, target) ? null : detour(at, target);
      if (way?.length) {
        const y = leg.at.y;
        out.push(...way.map((point) => ({ at: point.clone().setY(y) })));
        at = way[way.length - 1]!.clone().setY(0);
      } else {
        out.push(leg);
        at = target;
      }
    }
    return out;
  }

  private isClear(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const clear = this.options.clear;
    const parent = this.friend.parent;
    if (!clear || !parent) return false;
    from.set(a.x, 1, a.z);
    to.set(b.x, 1, b.z);
    return clear(parent.localToWorld(from), parent.localToWorld(to));
  }

  /** Whether the player stands just ahead of the friend, towards `next`. */
  private inTheWay(next: THREE.Vector3 | undefined): boolean {
    if (!next) return false;
    const local = this.playerLocal();
    const dx = local.x - this.friend.position.x;
    const dz = local.z - this.friend.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VISIT_RULES.blocked.ahead || dist < 1e-3) return false;
    const hx = next.x - this.friend.position.x;
    const hz = next.z - this.friend.position.z;
    const h = Math.hypot(hx, hz);
    return h > 0.05 && (dx * hx + dz * hz) / (dist * h) > 0.3;
  }

  /** The player's eye in the friend's zone's coordinates. */
  private playerLocal(): THREE.Vector3 {
    this.viewer.getWorldPosition(eye);
    const parent = this.friend.parent;
    return parent ? parent.worldToLocal(eye.clone()) : eye.clone();
  }

  private playerInDoorway(): boolean {
    const local = this.playerLocal();
    const { inside, landing } = this.route;
    return Math.hypot(local.x - (inside.x + landing.x) / 2, local.z - (inside.z + landing.z) / 2) < IN_DOORWAY;
  }

  private yawToViewer(): number {
    return this.yawTo(this.playerLocal());
  }

  private yawTo(local: THREE.Vector3): number {
    return Math.atan2(local.x - this.friend.position.x, local.z - this.friend.position.z);
  }

  /** The floor under a zone-local point: the landing's, or the top of the tread of the flight they stand on. */
  private floorY(p: THREE.Vector3): number {
    const { top, bottom } = this.route.flight;
    const ax = bottom.x - top.x;
    const az = bottom.z - top.z;
    const length2 = ax * ax + az * az;
    if (length2 < 1e-6) return top.y;
    const t = ((p.x - top.x) * ax + (p.z - top.z) * az) / length2;
    if (t <= 0) return top.y;
    const side = Math.hypot(p.x - (top.x + ax * t), p.z - (top.z + az * t));
    if (side > 1) return top.y;
    const { treads } = VISIT_RULES.stairs;
    const tread = Math.min(treads, Math.max(1, Math.ceil(t * treads)));
    return top.y + ((bottom.y - top.y) * tread) / treads;
  }

  /** A footfall every stride walked, while seen or about to be. */
  private footsteps(): void {
    const p = this.friend.position;
    if (Number.isNaN(this.lastStep.x) || !this.friend.isWalking) {
      this.lastStep.copy(p);
      if (!this.friend.isWalking) this.walked = Math.min(this.walked, VISIT_RULES.steps.stride * 0.5);
      return;
    }
    this.walked += Math.hypot(p.x - this.lastStep.x, p.z - this.lastStep.z);
    this.lastStep.copy(p);
    if (this.walked < VISIT_RULES.steps.stride) return;
    this.walked -= VISIT_RULES.steps.stride;
    if (this.fadeTarget > 0 || this.fade > 0.3) this.script.step(this.friend.getWorldPosition(scratch));
  }

  /** The returned game in both hands, held out to the player. */
  private hold(held: HeldBox): void {
    this.held = held;
    held.box.position.set(0, HOLD.y, HOLD.z);
    held.box.rotation.set(HOLD.tilt, 0, 0);
    this.friend.add(held.box);
    const half = held.width / 2 + 0.01;
    const hands: readonly [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
    this.viewer.getWorldPosition(eye);
    this.friend.stand(this.yawToViewer(), 'stand', eye.clone(), () => {
      this.friend.localToWorld(hands[0].set(-half, HOLD.y, HOLD.z));
      this.friend.localToWorld(hands[1].set(half, HOLD.y, HOLD.z));
      return hands;
    });
  }

  /** The held box goes back on its shelf. */
  private letGo(): void {
    if (!this.held) return;
    this.dropHeld();
    this.friend.stand(this.friend.rotation.y, 'stand');
  }

  private dropHeld(): void {
    const held = this.held;
    if (!held) return;
    this.held = null;
    held.box.removeFromParent();
    this.script.shelve();
  }

  /** Once a visit, standing still with the cat close by: a word for it, eyes on it. */
  private watchCat(): void {
    if (this.catGreeted || this.friend.isWalking || this.atDoor || this.fade < 0.9 || this.held) return;
    const cat = this.options.cat();
    if (!cat) return;
    this.friend.getWorldPosition(scratch);
    if (Math.hypot(cat.x - scratch.x, cat.z - scratch.z) > 2.2 || Math.abs(cat.y - scratch.y) > 1.5) return;
    this.catGreeted = true;
    const line = this.script.greetCat();
    if (!line) return;
    this.friend.setFocus(cat.clone().setY(cat.y + 0.2));
    this.script.say(line, 'kitty');
  }
}

/** Signed shortest angle from `from` to `to`, in (-π, π]. */
function angleDelta(to: number, from: number): number {
  const d = (((to - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return d;
}

function between([min, max]: readonly [number, number]): number {
  return min + Math.random() * (max - min);
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
