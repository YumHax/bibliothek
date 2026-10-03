import * as THREE from 'three';
import type { CatBody, CatVoiceLike } from './types';
import type { CatMotion } from './CatMotion';
import type { CatBrain } from './CatBrain';
import { CAT_OUTING as plan, type HideSpot } from './catOutingPlan';
import { STAIRWELL_PLAN as stairs, landingY, STOREYS } from '../stairwell/stairwellPlan';
import { liftGate, routeDown } from '../stairwell/stairRoutes';

/** The cat as its outing drives it: the group that moves, its body, its feet indoors, its voice, its mind to hand back to. */
export interface OutingCat {
  readonly group: THREE.Object3D;
  readonly body: CatBody;
  readonly motion: CatMotion;
  readonly brain: CatBrain;
  readonly voice?: CatVoiceLike;
}

/** The building the outing goes through. */
export interface OutingWorld {
  /** The floor's height (world) under (x, z) for feet at `feet`: the treads, the landings, the lift's car; the feet's own off the stairs. */
  ground(x: number, z: number, feet: number): number;
  /** World position of the stairwell zone's origin (the plan's points are local to it). */
  origin: THREE.Vector3;
  /** The flat's front door. */
  door: { readonly isOpen: boolean };
  /** The player's eye (world). */
  eye(out: THREE.Vector3): THREE.Vector3;
}

type Phase = 'toDoor' | 'out' | 'hidden' | 'visiting' | 'home' | 'waiting' | 'in' | 'done';

/** How it ended: home by itself (found and walked back, maybe with something in its mouth), or not (the door shut on it first). */
export type OutingEnd = 'home' | 'cancelled';

/** Seconds to reach the door before it thinks better of it. */
const TO_DOOR_S = 20;
/** The feet settle onto the next tread this fast (1/s), as a resident's do; past `SNAP` (m) they are put there. */
const TREAD_RATE = 14;
const SNAP = 0.5;
/** The body turns towards its way this fast (1/s). */
const TURN_RATE = 8;
/** Points either side of the front door (m off its plane). */
const DOOR_SIDE = 0.45;
/** Close enough to a waypoint (m). */
const ARRIVE = 0.06;
/** The lift's floor this far off the landing's (m): the car is not here. */
const CAR_AWAY = 0.3;

/**
 * One outing of the cat's into the stairwell: trotting to the open front door through the flat
 * (`CatMotion` on the flat's grid), then out, its feet on the stairs (`OutingWorld.ground`), down to
 * a hiding place of `CAT_OUTING.spots` (a doormat, the lift's car, the hall's mailboxes) where it
 * waits, miaowing now and then down the well, till the player finds it (a click, or C close by):
 * then it trots back up to the door, waits on the mat while it is shut, and walks in. Or it goes in
 * at a neighbour's (gone from sight) till they bring it back (`returned`). Nothing collides; nobody
 * else sees it. Built by `Cat.goOut`; the brain waits meanwhile and gets the cat back at the end.
 */
export class CatOuting {
  private phase: Phase = 'toDoor';
  private path: THREE.Vector3[] = [];
  private next = 0;
  private timer = 0;
  private meowIn = 2;
  private found = false;
  private readonly inside: THREE.Vector3;
  private readonly outside: THREE.Vector3;
  private readonly world = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();

  constructor(
    private readonly cat: OutingCat,
    private readonly building: OutingWorld,
    readonly spot: HideSpot,
    private readonly ended: (how: OutingEnd, found: boolean) => void,
  ) {
    const { strip, frontDoor } = stairs;
    this.inside = this.toWorld(strip.x0 - DOOR_SIDE, landingY(0), frontDoor.z);
    this.outside = this.toWorld(strip.x0 + DOOR_SIDE, landingY(0), frontDoor.z);
    // To the door through the flat, on its own grid (the inside point is the hallway's floor). No way there: no outing
    // (`active` false at once, nothing told: the brain carries on as if nothing happened).
    cat.motion.stop();
    if (!cat.motion.walkTo(this.toParent(this.inside.clone()).setY(0), plan.speed)) this.phase = 'done';
  }

  /** Where it is in the stairwell (out, hidden, on its way home), as the caption says it. */
  describe(): string {
    switch (this.phase) {
      case 'toDoor':
        return 'is heading for the door';
      case 'out':
        return 'is off down the stairs';
      case 'hidden':
        return '· take home';
      case 'home':
        return 'is going home';
      case 'waiting':
        return 'is waiting at the door';
      default:
        return '';
    }
  }

  /** Whether it is out of the flat (past the door, hidden, at a neighbour's, coming back). */
  get isOut(): boolean {
    return this.phase !== 'toDoor' && this.phase !== 'in' && this.phase !== 'done';
  }

  /** Whether the outing is still under way (false once the cat is back in, or gave it up). */
  get active(): boolean {
    return this.phase !== 'done';
  }

  /** Sitting on a floor out there (its hiding place, our mat): its blob shadow may show. */
  get resting(): boolean {
    return this.phase === 'hidden' || this.phase === 'waiting';
  }

  /** Whether it is out of sight in a neighbour's flat. */
  get isVisiting(): boolean {
    return this.phase === 'visiting';
  }

  /** Found where it hides (clicked, or called close by): back up home it trots. False when it is not hiding. */
  takeHome(): boolean {
    if (this.phase !== 'hidden') return false;
    this.found = true;
    this.cat.voice?.meow('trill');
    this.cat.body.prick();
    this.startHome();
    return true;
  }

  /** Called (C): it answers from where it is, and comes when the player is close. Whether it comes. */
  called(): boolean {
    if (this.phase !== 'hidden') {
      this.cat.voice?.meow('greet');
      return this.phase === 'home' || this.phase === 'waiting';
    }
    this.building.eye(this.eye);
    this.cat.group.getWorldPosition(this.world);
    if (this.eye.distanceTo(this.world) <= plan.comesWithin) return this.takeHome();
    this.cat.voice?.meow('demand', 0.8);
    this.meowIn = THREE.MathUtils.randFloat(plan.meowEveryS.min, plan.meowEveryS.max);
    return false;
  }

  /** Brought back by the neighbour it was visiting: on the mat outside our door, and in when it is open. */
  returned(): void {
    if (this.phase !== 'visiting') return;
    this.cat.group.visible = true;
    this.place(this.outside);
    this.found = true;
    this.phase = 'waiting';
    this.timer = 0;
  }

  update(dt: number): void {
    this.timer += dt;
    const { motion, body } = this.cat;
    switch (this.phase) {
      case 'toDoor':
        if (!this.building.door.isOpen || motion.blocked || this.timer > TO_DOOR_S) return this.cancel();
        if (motion.reached && !motion.walking) this.goThrough();
        return;
      case 'out':
      case 'home':
        if (this.follow(dt)) this.arrive();
        return;
      case 'in':
        if (this.follow(dt)) this.finish('home');
        return;
      case 'hidden':
        this.settleOnGround(dt);
        this.calls(dt);
        this.gazeAtPlayer();
        return;
      case 'waiting':
        this.settleOnGround(dt);
        this.calls(dt);
        if (this.building.door.isOpen) {
          body.setPose('stand');
          this.walkPath([this.outside.clone(), this.inside.clone()]);
          this.phase = 'in';
        }
        return;
      case 'visiting':
      case 'done':
        return;
    }
  }

  // --- the way --------------------------------------------------------------------------------

  /** At the door: through it, onto the landing and down the stairs to its spot. */
  private goThrough(): void {
    this.cat.motion.stop();
    this.walkPath([this.inside.clone(), this.outside.clone(), ...this.wayTo(this.spot).map((p) => this.toWorld(p.x, 0, p.z))]);
    this.phase = 'out';
    this.cat.voice?.meow('chirp');
  }

  /** Reached the end of the way: the hiding spot (or in at the neighbour's), or home's door. */
  private arrive(): void {
    const { body } = this.cat;
    body.setSpeed(0);
    if (this.phase === 'home') {
      this.phase = 'waiting';
      this.timer = 0;
      body.setPose('sit');
      this.faceYaw(-Math.PI / 2);
      return;
    }
    if (this.spot.kind === 'neighbour') {
      // In it goes, through a door left ajar.
      this.cat.group.visible = false;
      this.phase = 'visiting';
      return;
    }
    this.phase = 'hidden';
    this.timer = 0;
    body.setPose(this.spot.pose);
    this.faceYaw(this.spot.yaw);
  }

  /** From where it hides, back up to the mat outside our door. */
  private startHome(): void {
    const k = this.landingNow();
    const up = this.spot.kind === 'lift' ? [liftGate(), ...this.downTo(k, false).reverse()] : [...this.wayTo(this.spot).reverse()];
    this.cat.body.setPose('stand');
    this.walkPath([...up.map((p) => this.toWorld(p.x, 0, p.z)), this.outside.clone()]);
    this.phase = 'home';
  }

  /** The stairwell-local way from our landing to `spot`. */
  private wayTo(spot: HideSpot): THREE.Vector3[] {
    const at = new THREE.Vector3(spot.at[0], 0, spot.at[1]);
    if (spot.kind === 'lift') return [new THREE.Vector3(-1.2, 0, stairs.walk.landingZ), liftGate(), at];
    return [...this.downTo(spot.k), at];
  }

  /** From our landing down to landing `k` (the hall: on into its middle, `intoHall`), stairwell-local, as the residents walk it. */
  private downTo(k: number, intoHall = true): THREE.Vector3[] {
    const all = routeDown(0, new THREE.Vector3(-1.2, 0, stairs.walk.landingZ));
    // A storey is eight points (across, down A, the half landing, down B); the hall's opening and middle after the last.
    return k >= STOREYS && intoHall ? all.slice(0, 1 + 8 * STOREYS + 2) : all.slice(0, 1 + 8 * Math.min(k, STOREYS));
  }

  /** The landing it is on now (the lift's car may have taken it elsewhere). */
  private landingNow(): number {
    this.cat.group.getWorldPosition(this.world);
    const local = this.world.y - this.building.origin.y;
    let best = 0;
    for (let k = 0; k <= STOREYS; k++) if (Math.abs(landingY(k) - local) < Math.abs(landingY(best) - local)) best = k;
    return best;
  }

  private walkPath(points: THREE.Vector3[]): void {
    this.path = points;
    this.next = 0;
  }

  /** One frame along the path, the feet on the stone; true at its end. */
  private follow(dt: number): boolean {
    const { group, body } = this.cat;
    const target = this.path[this.next];
    if (!target) return true;
    group.getWorldPosition(this.world);
    // The lift's car elsewhere: no stepping into the empty shaft, it waits by the gate instead.
    if (this.phase === 'out' && this.spot.kind === 'lift' && this.next === this.path.length - 1 && Math.abs(this.building.ground(target.x, target.z, this.world.y) - this.world.y) > CAR_AWAY) {
      this.path.length = this.next;
      body.setSpeed(0);
      return true;
    }
    const dx = target.x - this.world.x;
    const dz = target.z - this.world.z;
    const distance = Math.hypot(dx, dz);
    const step = plan.speed * dt;
    if (distance <= Math.max(ARRIVE, step)) {
      this.world.x = target.x;
      this.world.z = target.z;
      this.next++;
    } else {
      this.world.x += (dx / distance) * step;
      this.world.z += (dz / distance) * step;
      this.turnTowards(Math.atan2(dx, dz), dt);
    }
    body.setPose('stand');
    body.setSpeed(plan.speed);
    this.world.y = this.feetAt(this.world, dt);
    this.place(this.world);
    if (this.next < this.path.length) return false;
    body.setSpeed(0);
    return true;
  }

  /** The feet's height at `p` (world), eased onto the next tread. */
  private feetAt(p: THREE.Vector3, dt: number): number {
    const floor = this.building.ground(p.x, p.z, p.y);
    const gap = floor - p.y;
    return Math.abs(gap) > SNAP ? floor : p.y + gap * Math.min(1, dt * TREAD_RATE);
  }

  /** Sitting where it is: in the lift's car, the floor under it may ride off (it rides with it, no easing). */
  private settleOnGround(dt: number): void {
    this.cat.group.getWorldPosition(this.world);
    this.world.y = this.spot.kind === 'lift' ? this.building.ground(this.world.x, this.world.z, this.world.y) : this.feetAt(this.world, dt);
    this.place(this.world);
  }

  /** A miaow down the well every so often, so it can be found by ear. */
  private calls(dt: number): void {
    this.meowIn -= dt;
    if (this.meowIn > 0) return;
    this.meowIn = THREE.MathUtils.randFloat(plan.meowEveryS.min, plan.meowEveryS.max);
    this.cat.voice?.meow('demand', 0.55 + Math.random() * 0.3);
  }

  private gazeAtPlayer(): void {
    this.building.eye(this.eye);
    this.cat.group.getWorldPosition(this.world);
    this.cat.body.gaze(this.eye.distanceTo(this.world) < 5 ? this.eye : null);
  }

  /** Back indoors: the brain has the cat again where it stands. */
  private finish(how: OutingEnd): void {
    const { group, motion, brain, body } = this.cat;
    group.visible = true;
    body.gaze(null);
    this.local.copy(group.position).setY(0);
    motion.teleport(this.local, group.rotation.y);
    brain.resume();
    this.phase = 'done';
    this.ended(how, this.found);
  }

  /** The door shut before it got there, or no way to it: it forgets the idea. */
  private cancel(): void {
    this.cat.motion.stop();
    this.cat.brain.resume();
    this.phase = 'done';
    this.ended('cancelled', false);
  }

  // --- frames ---------------------------------------------------------------------------------

  /** A stairwell-local point in world space. */
  private toWorld(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).add(this.building.origin);
  }

  /** A world point in the cat's parent's frame (its zone's). */
  private toParent(p: THREE.Vector3): THREE.Vector3 {
    return this.cat.group.parent ? this.cat.group.parent.worldToLocal(p) : p;
  }

  private place(world: THREE.Vector3): void {
    this.cat.group.position.copy(this.toParent(this.local.copy(world)));
  }

  private turnTowards(yaw: number, dt: number): void {
    const group = this.cat.group;
    let delta = yaw - group.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    group.rotation.y += delta * Math.min(1, dt * TURN_RATE);
  }

  private faceYaw(yaw: number): void {
    this.cat.group.rotation.y = yaw;
  }
}

