import * as THREE from 'three';
import type { Seat } from '../Seat';
import type { CatBedLike, CatBody, CatClock, CatPlayerView, CatToyLike, CatVoiceLike, FoodBowlLike, ScratcherLike, WaterBowlLike } from './types';
import type { CatNav } from './CatNav';
import { CatMotion, RUB_SPEED, TROT_SPEED, WALK_SPEED } from './CatMotion';
import { isElevated, pickRestingSpot, pickWeighted, type RestingSpot, type WindowLookout } from './spots';

/** The screen the cat may watch (the TV): whether it is on, where to sit, and optionally what to look at. */
export interface CatScreen {
  isPlaying(): boolean;
  /** Floor point on the rug in front of the screen. */
  watchingSpot(out: THREE.Vector3): THREE.Vector3;
  /** Optional: a point on the picture; without it the cat faces away from the room centre. */
  screenPoint?(out: THREE.Vector3): THREE.Vector3;
}

export interface CatBrainContext {
  cat: THREE.Object3D;
  body: CatBody;
  nav: CatNav;
  motion: CatMotion;
  bounds: THREE.Box2;
  player: CatPlayerView;
  clock: CatClock;
  seats: readonly Seat[];
  bowl: FoodBowlLike;
  water?: WaterBowlLike;
  bed?: CatBedLike;
  scratcher?: ScratcherLike;
  toy?: CatToyLike;
  windows?: readonly WindowLookout[];
  tv?: CatScreen;
  voice?: CatVoiceLike;
}

export type CatState =
  | 'idle'
  | 'lookAround'
  | 'walk'
  | 'flee'
  | 'hop'
  | 'mount'
  | 'mountLap'
  | 'begin'
  | 'lie'
  | 'sleep'
  | 'halfWake'
  | 'stretch'
  | 'eat'
  | 'beg'
  | 'drink'
  | 'groom'
  | 'window'
  | 'tvWatch'
  | 'sunbathe'
  | 'scratch'
  | 'rugScratch'
  | 'rub'
  | 'toyStalk'
  | 'toyPounce'
  | 'toyWatch'
  | 'flyStalk'
  | 'flyPounce'
  | 'startle'
  | 'petted'
  | 'lap'
  | 'called';

/** What the cat decides to do next when idle (or is made to do). */
type Activity =
  | 'none'
  | 'sleep'
  | 'eat'
  | 'beg'
  | 'drink'
  | 'groom'
  | 'wander'
  | 'window'
  | 'scratch'
  | 'rugScratch'
  | 'toy'
  | 'tvWatch'
  | 'chase'
  | 'rub'
  | 'sunbathe'
  | 'lap'
  | 'call'
  | 'flee'
  | 'fleeMild';

export type PetOutcome = 'purr' | 'woke' | 'annoyed' | 'busy';
export type CallOutcome = 'coming' | 'ignored' | 'asleep';

/** Real seconds of one in-game hour (a day lasts 600 s). Rhythm constants below are in real seconds. */
const HUNGER_FULL_S = 240; // empty stomach to starving in ~10 in-game hours
const THIRST_FULL_S = 320;
const PLAYER_NEAR = 2.5;
const PLAYER_TOO_CLOSE = 0.35;
const SPRINT_SCARE = 1.5;
const PET_WINDOW_S = 10;
const PETS_BEFORE_ANNOYED = 4;
const ANNOYED_S = 30;
const LAP_AFTER_S = 20;

const HEAD_HEIGHT = 0.9;

/**
 * The cat's mind: a state machine with needs (hunger, thirst, grooming) and a daily rhythm from
 * the room clock. It decides where to go, asks `CatMotion` to walk or hop there, and names the
 * body pose. One `enter(state)` sets each state up; `tick(dt)` runs it. Timers are real seconds.
 */
export class CatBrain {
  state: CatState = 'idle';
  private previous: CatState = 'idle';
  private timer = 0;
  private age = 0;
  private now = 0;
  private next: CatState = 'idle';
  private pending: Activity = 'none';

  /** The resting spot chosen for the current lie-down; `perch` while actually up there. */
  private spot: RestingSpot | null = null;
  private perch: RestingSpot | null = null;

  private readonly goal = new THREE.Vector3();
  private readonly facing = new THREE.Vector3();
  private hasFacing = false;
  private readonly eye = new THREE.Vector3();
  private playerDistance = Infinity;
  private readonly gazeTarget = new THREE.Vector3();
  private hasGaze = false;
  private readonly lookPoint = new THREE.Vector3();
  private readonly rubEnd = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly tmp2d = new THREE.Vector2();

  private hunger = 0.35;
  private thirst = 0.2;
  /** Countdown to the post-meal wash; Infinity when nothing is due. */
  private groomIn = Infinity;
  private begCooldown = 0;
  private lapCooldown = 0;
  private annoyedFor = 0;
  private startleCooldown = 3;
  private attendFor = 0;
  private readonly petTimes: number[] = [];

  private playerSeat: Seat | null = null;
  private playerSeatedFor = 0;
  private sleepRemaining = 0;
  private subTimer = 0;
  private count = 0;
  private total = 0;
  private purring = false;
  private resumeRest = false;

  constructor(private readonly ctx: CatBrainContext) {
    this.enter('idle');
  }

  // --- public ---------------------------------------------------------------------------------

  update(dt: number): void {
    this.now += dt;
    this.age += dt;
    this.hunger = Math.min(1, this.hunger + dt / HUNGER_FULL_S);
    this.thirst = Math.min(1, this.thirst + dt / THIRST_FULL_S);
    this.groomIn -= dt;
    this.begCooldown -= dt;
    this.lapCooldown -= dt;
    this.annoyedFor -= dt;
    this.startleCooldown -= dt;
    this.attendFor -= dt;
    if (this.playerSeat) this.playerSeatedFor += dt;

    this.ctx.player.getEyePosition(this.eye);
    this.playerDistance = Math.hypot(this.eye.x - this.ctx.cat.position.x, this.eye.z - this.ctx.cat.position.z);

    this.hasGaze = false;
    this.observePlayer(dt);
    this.tick(dt);
    this.applyGaze();
  }

  /** The player strokes the cat. */
  pet(): PetOutcome {
    if (this.ctx.motion.hopping) return 'busy';
    this.petTimes.push(this.now);
    while (this.petTimes.length && this.now - this.petTimes[0] > PET_WINDOW_S) this.petTimes.shift();
    if (this.annoyedFor > 0) {
      this.ctx.body.flick();
      return 'annoyed';
    }
    if (this.petTimes.length >= PETS_BEFORE_ANNOYED) {
      this.petTimes.length = 0;
      this.annoyedFor = ANNOYED_S;
      this.ctx.body.flick();
      this.ctx.voice?.meow('grumble');
      this.setPurr(false);
      if (this.state === 'lap') this.lapCooldown = 90;
      this.startActivity('fleeMild');
      return 'annoyed';
    }
    if (this.state === 'sleep' || this.state === 'halfWake') {
      this.enter('stretch');
      return 'woke';
    }
    if (this.state === 'lap') {
      this.setPurr(true);
      return 'purr';
    }
    this.enter('petted');
    return 'purr';
  }

  /** The player calls the cat. */
  call(): CallOutcome {
    if (this.state === 'sleep' || this.state === 'halfWake') {
      this.ctx.body.flick();
      return 'asleep';
    }
    const busy = this.state === 'lap' || this.state === 'petted' || this.state === 'startle' || this.state === 'flee' || this.state === 'hop' || this.state === 'called';
    if (this.annoyedFor > 0 || busy) return 'ignored';
    if (chance(1 / 3)) {
      this.attendFor = 3;
      return 'ignored';
    }
    this.startActivity('call');
    return 'coming';
  }

  /** Which armchair the player sits in (null when standing). */
  setPlayerSeat(seat: Seat | null): void {
    const wasOnLap = this.state === 'lap' || (this.state === 'hop' && this.next === 'lap');
    this.playerSeat = seat;
    this.playerSeatedFor = 0;
    if (seat) {
      if (this.perch?.seat === seat && !wasOnLap) {
        // Evicted: grumble and leave the chair.
        this.ctx.body.flick();
        this.ctx.voice?.meow('grumble');
        this.setPurr(false);
        this.startActivity('fleeMild');
      }
    } else if (wasOnLap) {
      this.setPurr(false);
      this.lapCooldown = 60;
      this.startActivity('none');
    }
  }

  get isAsleep(): boolean {
    return this.state === 'sleep' || this.state === 'halfWake';
  }

  get isPurring(): boolean {
    return this.purring;
  }

  /** Caption fragment after the cat's name. */
  describe(): string {
    switch (this.state) {
      case 'sleep':
      case 'halfWake':
        return 'is sleeping — click to pet';
      case 'lap':
        return 'is on your lap — click to pet';
      case 'petted':
        return 'is purring';
      case 'eat':
        return 'is eating';
      case 'beg':
        return 'wants food';
      case 'drink':
        return 'is drinking';
      case 'groom':
        return 'is washing — click to pet';
      case 'window':
        return 'is watching the street';
      case 'tvWatch':
        return 'is watching TV';
      case 'sunbathe':
        return 'is sunbathing — click to pet';
      case 'scratch':
      case 'rugScratch':
        return 'is scratching';
      case 'rub':
        return 'is rubbing against the armchair';
      case 'toyStalk':
      case 'toyPounce':
      case 'toyWatch':
        return 'is playing';
      case 'flyStalk':
      case 'flyPounce':
        return 'is chasing something';
      case 'stretch':
        return 'is stretching';
      case 'startle':
      case 'flee':
        return 'is running off';
      case 'hop':
      case 'mount':
      case 'mountLap':
        return 'is jumping';
      case 'walk':
        return this.pending === 'call' ? 'is coming' : 'is on the move';
      case 'called':
        return 'came to see you — click to pet';
      case 'lie':
        return 'is resting — click to pet';
      default:
        return 'is looking around — click to pet';
    }
  }

  // --- reactions ------------------------------------------------------------------------------

  private observePlayer(dt: number): void {
    const d = this.playerDistance;
    if (this.state === 'sleep') {
      if (d < 0.6 && chance(0.15 * dt)) {
        this.sleepRemaining = this.timer;
        this.enter('halfWake');
      }
      return;
    }
    if (this.startleCooldown <= 0 && this.startles()) {
      const sprinting = this.ctx.player.isSprinting && d < SPRINT_SCARE;
      const crowded = d < PLAYER_TOO_CLOSE && this.state !== 'called';
      if (sprinting || crowded) {
        this.enter('startle');
        return;
      }
    }
    if (this.playerSeat && !this.perch && this.lapCooldown <= 0 && this.playerSeatedFor > LAP_AFTER_S && this.invitable() && chance(0.03 * dt)) {
      this.startActivity('lap');
    }
  }

  private startles(): boolean {
    switch (this.state) {
      case 'halfWake':
      case 'hop':
      case 'mount':
      case 'mountLap':
      case 'flee':
      case 'startle':
      case 'petted':
      case 'lap':
      case 'begin':
        return false;
      default:
        return true;
    }
  }

  private invitable(): boolean {
    switch (this.state) {
      case 'idle':
      case 'lookAround':
      case 'window':
      case 'tvWatch':
      case 'groom':
      case 'lie':
        return true;
      default:
        return false;
    }
  }

  private applyGaze(): void {
    const { body } = this.ctx;
    if (this.hasGaze) body.gaze(this.gazeTarget);
    else if (this.attendFor > 0 || (this.playerDistance < PLAYER_NEAR && this.followsPlayer())) body.gaze(this.eye);
    else body.gaze(null);
  }

  private followsPlayer(): boolean {
    switch (this.state) {
      case 'idle':
      case 'lookAround':
      case 'walk':
      case 'stretch':
      case 'lie':
      case 'halfWake':
      case 'beg':
      case 'called':
      case 'petted':
      case 'lap':
      case 'sunbathe':
      case 'rub':
        return true;
      default:
        return false;
    }
  }

  // --- state machine --------------------------------------------------------------------------

  private enter(state: CatState): void {
    const { body, motion } = this.ctx;
    this.previous = this.state;
    this.state = state;
    this.age = 0;
    this.subTimer = 0;
    switch (state) {
      case 'idle':
        body.setPose(this.perch ? 'lie' : chance(0.6) ? 'sit' : 'stand');
        this.timer = rand(1.5, 4);
        this.faceIfAny();
        break;
      case 'lookAround':
        body.setPose(chance(0.5) ? 'sit' : 'stand');
        this.timer = rand(2, 6);
        break;
      case 'walk':
      case 'flee':
        body.setPose('stand');
        break;
      case 'hop':
        body.setPose('pounce');
        break;
      case 'mount':
        if (!this.spot || (this.spot.seat && this.spot.seat === this.playerSeat) || !motion.reached) {
          this.enter('idle');
          break;
        }
        this.perch = this.spot;
        this.hop(this.spot.position, 'lie', 0.5);
        break;
      case 'mountLap': {
        if (!this.playerSeat || !motion.reached) {
          this.enter('idle');
          break;
        }
        const seat = this.playerSeat;
        const position = seat.lapSpot(new THREE.Vector3());
        const approach = seat.approachPoint(new THREE.Vector3());
        this.perch = { kind: 'seat', position, approach, facing: approach.clone(), seat };
        this.hop(position, 'lap', 0.5);
        break;
      }
      case 'begin':
        this.beginActivity(this.pending);
        break;
      case 'lie':
        body.setPose('lie');
        this.timer = rand(6, 15);
        if (this.spot?.facing) this.setFacing(this.spot.facing);
        this.faceIfAny();
        break;
      case 'sleep': {
        const bed = this.perch?.kind === 'bed' || this.spot?.kind === 'bed';
        body.setPose(this.ctx.clock.state.night || bed || chance(0.7) ? 'sleep' : 'loaf');
        this.timer = this.sleepRemaining > 0 ? this.sleepRemaining : this.sleepDuration();
        this.sleepRemaining = 0;
        this.setPurr(false);
        break;
      }
      case 'halfWake':
        body.setPose('loaf');
        this.timer = rand(3, 5);
        break;
      case 'stretch':
        body.setPose('stretch');
        this.timer = rand(2.5, 3.5);
        this.sleepRemaining = 0;
        break;
      case 'eat':
        body.setPose('eat');
        this.ctx.bowl.getWorldPosition(this.tmp);
        this.setFacing(this.tmp);
        this.faceIfAny();
        this.total = this.timer = rand(12, 18);
        break;
      case 'beg':
        body.setPose('sit');
        this.ctx.bowl.getWorldPosition(this.tmp);
        this.setFacing(this.tmp);
        this.faceIfAny();
        this.timer = rand(20, 40);
        this.subTimer = 1;
        break;
      case 'drink':
        body.setPose('drink');
        if (this.ctx.water) {
          this.ctx.water.getWorldPosition(this.tmp);
          this.setFacing(this.tmp);
          this.faceIfAny();
        }
        this.timer = rand(6, 10);
        this.subTimer = 0.8;
        break;
      case 'groom':
        body.setPose('groom');
        this.timer = rand(15, 25);
        this.groomIn = Infinity;
        break;
      case 'window':
        body.setPose('sit');
        this.faceIfAny();
        this.timer = rand(30, 90);
        break;
      case 'tvWatch':
        body.setPose('sit');
        this.faceIfAny();
        this.timer = rand(30, 60);
        this.lookPoint.copy(this.facing);
        break;
      case 'sunbathe':
        body.setPose(chance(0.5) ? 'lie' : 'loaf');
        this.faceIfAny();
        this.timer = rand(30, 60);
        this.subTimer = 3;
        break;
      case 'scratch':
        body.setPose('scratch');
        this.faceIfAny();
        this.timer = rand(8, 15);
        this.subTimer = 0.5;
        break;
      case 'rugScratch':
        body.setPose('scratch');
        this.timer = 4;
        break;
      case 'rub':
        body.setPose('stand');
        if (!motion.walkTo(this.rubEnd, RUB_SPEED)) this.enter('idle');
        break;
      case 'toyStalk':
        body.setPose('crouch');
        if (this.ctx.toy) this.setFacing(this.ctx.toy.getWorldPosition(this.tmp));
        this.faceIfAny();
        this.timer = rand(1, 2);
        break;
      case 'toyPounce': {
        const toy = this.ctx.toy;
        if (!toy) {
          this.enter('idle');
          break;
        }
        toy.getWorldPosition(this.tmp);
        this.tmp2.subVectors(this.tmp, this.ctx.cat.position).setY(0);
        if (this.tmp2.lengthSq() > 1e-4) this.tmp2.normalize();
        this.tmp.addScaledVector(this.tmp2, -(toy.radius + 0.1)).setY(0);
        this.ctx.nav.clampInside(this.tmp);
        body.setPose('pounce');
        motion.hopTo(this.tmp, 0.35);
        break;
      }
      case 'toyWatch':
        body.setPose('stand');
        this.timer = 4;
        break;
      case 'flyStalk':
        body.setPose('crouch');
        this.timer = rand(0.6, 1.2);
        this.lookPoint.copy(this.ctx.cat.position);
        this.lookPoint.x += THREE.MathUtils.randFloatSpread(1.2);
        this.lookPoint.z += THREE.MathUtils.randFloatSpread(1.2);
        this.lookPoint.y = rand(0.3, 0.7);
        break;
      case 'flyPounce':
        if (!this.ctx.nav.randomFreePoint(this.tmp, this.ctx.cat.position, 1)) {
          this.enter('idle');
          break;
        }
        body.setPose('pounce');
        motion.hopTo(this.tmp, 0.35);
        break;
      case 'startle':
        motion.stop();
        body.flick();
        body.setPose('crouch');
        this.setPurr(false);
        this.timer = 0.25;
        break;
      case 'petted':
        motion.stop();
        this.resumeRest = this.perch !== null || this.previous === 'lie' || this.previous === 'sunbathe' || this.previous === 'stretch';
        body.setPose(this.resumeRest ? 'lie' : 'sit');
        this.setPurr(true);
        this.timer = rand(4.5, 6);
        break;
      case 'lap':
        body.setPose('lie');
        this.setPurr(true);
        if (this.perch?.facing) this.setFacing(this.perch.facing);
        this.faceIfAny();
        break;
      case 'called':
        body.setPose('sit');
        this.setFacing(this.eye);
        this.faceIfAny();
        this.ctx.voice?.meow('greet');
        this.timer = rand(8, 15);
        break;
    }
  }

  private tick(dt: number): void {
    const { motion, voice } = this.ctx;
    this.timer -= dt;
    switch (this.state) {
      case 'idle':
        if (this.hunger > 0.7 && this.ctx.bowl.level <= 0 && this.playerDistance < 2 && chance(0.08 * dt)) voice?.meow('demand');
        if (this.timer <= 0) this.chooseActivity();
        break;
      case 'lookAround':
        this.wanderingGaze(dt, 1, 2.5);
        if (this.timer <= 0) this.enter('idle');
        break;
      case 'walk':
      case 'flee':
        if (!motion.busy) {
          if (!motion.reached && (this.next === 'mount' || this.next === 'mountLap')) this.enter('idle');
          else this.enter(this.next);
        }
        break;
      case 'hop':
        if (!motion.busy) this.enter(this.next);
        break;
      case 'lie':
        if (this.timer <= 0) this.enter(this.perch || this.sleepDrive() > 0.3 ? 'sleep' : 'idle');
        break;
      case 'sleep':
        if (this.timer <= 0 || (this.hunger > 0.9 && this.ctx.bowl.level > 0)) this.enter('stretch');
        break;
      case 'halfWake':
        if (this.timer <= 0) this.enter('sleep');
        break;
      case 'stretch':
        if (this.timer <= 0) this.enter('idle');
        break;
      case 'eat':
        this.ctx.bowl.eat((dt * 0.25) / this.total);
        this.hunger = Math.max(0, this.hunger - dt / this.total);
        if (this.timer <= 0 || this.ctx.bowl.level <= 0) {
          this.groomIn = rand(120, 180);
          this.enter('idle');
        }
        break;
      case 'beg':
        this.subTimer -= dt;
        if (this.subTimer <= 0) {
          voice?.meow('demand');
          this.subTimer = this.playerDistance < 2 ? rand(3, 6) : rand(7, 12);
        }
        if (this.ctx.bowl.level > 0) this.enter('eat');
        else if (this.timer <= 0) {
          this.begCooldown = 45;
          this.enter('idle');
        }
        break;
      case 'drink':
        this.subTimer -= dt;
        if (this.subTimer <= 0) {
          this.ctx.water?.sip();
          this.subTimer = rand(0.7, 1);
        }
        if (this.timer <= 0) {
          this.thirst = 0;
          this.enter('idle');
        }
        break;
      case 'groom':
        if (this.timer <= 0) this.enter('idle');
        break;
      case 'window': {
        // Head panning slowly across the view outside.
        this.tmp.subVectors(this.facing, this.ctx.cat.position).setY(0).normalize();
        this.gazeTarget.set(this.facing.x - this.tmp.z * Math.sin(this.age * 0.35) * 0.6, HEAD_HEIGHT + 0.3, this.facing.z + this.tmp.x * Math.sin(this.age * 0.35) * 0.6);
        this.hasGaze = true;
        if (this.timer <= 0) this.enter('idle');
        break;
      }
      case 'tvWatch':
        if (!this.ctx.tv?.isPlaying()) {
          this.enter('idle');
          break;
        }
        this.subTimer -= dt;
        if (this.subTimer <= 0) {
          this.tmp.subVectors(this.facing, this.ctx.cat.position).setY(0).normalize();
          const side = THREE.MathUtils.randFloatSpread(0.7);
          this.lookPoint.set(this.facing.x - this.tmp.z * side, this.facing.y + THREE.MathUtils.randFloatSpread(0.4), this.facing.z + this.tmp.x * side);
          this.subTimer = rand(2, 5);
        }
        this.gazeTarget.copy(this.lookPoint);
        this.hasGaze = true;
        if (this.timer <= 0) this.enter('idle');
        break;
      case 'sunbathe':
        this.subTimer -= dt;
        if (this.subTimer <= 0) {
          this.subTimer = 3;
          if (!this.findSunSpot(this.tmp) || this.tmp.distanceTo(this.ctx.cat.position) > 0.7) {
            this.enter('idle');
            break;
          }
        }
        if (this.timer <= 0) {
          this.spot = null;
          this.enter(this.sleepDrive() > 0.5 ? 'sleep' : 'idle');
        }
        break;
      case 'scratch':
        this.subTimer -= dt;
        if (this.subTimer <= 0) {
          this.ctx.scratcher?.scratched();
          this.subTimer = rand(0.5, 0.9);
        }
        if (this.timer <= 0) this.enter('idle');
        break;
      case 'rugScratch':
        if (this.timer <= 0) this.enter('idle');
        break;
      case 'rub':
        if (!motion.busy) this.enter('idle');
        break;
      case 'toyStalk':
        if (this.ctx.toy) {
          this.ctx.toy.getWorldPosition(this.gazeTarget);
          this.hasGaze = true;
        }
        if (this.timer <= 0) this.enter('toyPounce');
        break;
      case 'toyPounce':
        if (!motion.busy) {
          this.nudgeToy();
          this.enter('toyWatch');
        }
        break;
      case 'toyWatch': {
        const toy = this.ctx.toy;
        if (toy) {
          toy.getWorldPosition(this.gazeTarget);
          this.hasGaze = true;
        }
        if (this.age > 0.5 && (!toy || !toy.isRolling || this.timer <= 0)) {
          this.count++;
          if (this.count < this.total && toy) this.beginActivity('toy');
          else this.enter('idle');
        }
        break;
      }
      case 'flyStalk':
        this.gazeTarget.copy(this.lookPoint);
        this.hasGaze = true;
        if (this.timer <= 0) this.enter('flyPounce');
        break;
      case 'flyPounce':
        if (!motion.busy) {
          this.count++;
          this.enter(this.count < this.total ? 'flyStalk' : 'idle');
        }
        break;
      case 'startle':
        if (this.timer <= 0) {
          this.startleCooldown = 6;
          this.startActivity('flee');
        }
        break;
      case 'petted':
        if (this.timer <= 0) {
          this.setPurr(false);
          if (this.resumeRest) this.enter('lie');
          else this.enter('idle');
        }
        break;
      case 'lap':
        // Purring on the lap until the player stands up (see `setPlayerSeat`).
        break;
      case 'called':
        if (this.timer <= 0) this.enter('idle');
        break;
      case 'mount':
      case 'mountLap':
      case 'begin':
        // Transitional: `enter` already moved on.
        break;
    }
  }

  // --- activities -----------------------------------------------------------------------------

  private chooseActivity(): void {
    const drive = this.sleepDrive();
    const active = 1 - drive;
    const night = this.ctx.clock.state.night;
    const { bowl, water, windows, scratcher, toy, tv } = this.ctx;
    const hungry = this.hunger > 0.55;
    const sunny = this.findSunSpot(this.tmp) !== null;
    const rug = tv !== undefined;
    const options: { activity: Activity; weight: number }[] = [
      // Sleeping wins most of the day: the weight grows steeply with tiredness so a tired cat rarely does anything else.
      { activity: 'sleep', weight: drive * drive * 14 + (this.perch ? 1 : 0) },
      { activity: 'eat', weight: hungry && bowl.level > 0 ? this.hunger * 5 : 0 },
      { activity: 'beg', weight: hungry && bowl.level <= 0 && this.begCooldown <= 0 ? this.hunger * 3 : 0 },
      { activity: 'drink', weight: water && this.thirst > 0.5 ? this.thirst * 2 : 0 },
      { activity: 'groom', weight: this.groomIn <= 0 ? 3 : 0.3 },
      { activity: 'wander', weight: 0.6 + active },
      { activity: 'window', weight: windows?.length ? (night ? 0.2 : 0.5 + active) : 0 },
      { activity: 'scratch', weight: scratcher ? 0.3 + 0.5 * active : 0 },
      { activity: 'rugScratch', weight: rug ? 0.15 + 0.2 * active : 0 },
      { activity: 'toy', weight: toy ? 0.3 + active : 0 },
      { activity: 'tvWatch', weight: tv?.isPlaying() ? 2.5 : 0 },
      { activity: 'chase', weight: 0.05 + 0.1 * active },
      { activity: 'rub', weight: 0.3 + 0.3 * active },
      { activity: 'sunbathe', weight: sunny ? 1 + drive : 0 },
    ];
    this.startActivity(pickWeighted(options)?.activity ?? 'wander');
  }

  /** Runs an activity, first hopping down from a perch when the activity needs the floor. */
  private startActivity(activity: Activity): void {
    this.pending = activity;
    const staysPut = activity === 'groom' || (activity === 'sleep' && this.perch !== null);
    if (this.perch && !staysPut) {
      const approach = this.perch.approach;
      this.perch = null;
      this.spot = null;
      this.hop(approach, 'begin', 0.45);
      return;
    }
    this.beginActivity(activity);
  }

  private beginActivity(activity: Activity): void {
    const { cat, nav, bowl, water, scratcher, toy, windows, tv } = this.ctx;
    this.hasFacing = false;
    this.pending = activity;
    switch (activity) {
      case 'none':
        this.enter('idle');
        return;
      case 'sleep': {
        if (this.perch) {
          this.enter('lie');
          return;
        }
        const spot = pickRestingSpot({
          nav,
          bounds: this.ctx.bounds,
          seats: this.ctx.seats,
          playerSeat: this.playerSeat,
          bed: this.ctx.bed,
          windows,
          rugPoint: tv ? tv.watchingSpot(new THREE.Vector3()) : undefined,
          from: cat.position,
          night: this.ctx.clock.state.night,
        });
        if (!spot) {
          this.enter('idle');
          return;
        }
        this.spot = spot;
        if (isElevated(spot)) this.goTo(spot.approach, 'mount');
        else this.goTo(spot.position, 'lie');
        return;
      }
      case 'eat':
        this.goTo(bowl.feedingSpot(this.goal), 'eat');
        return;
      case 'beg':
        this.goTo(bowl.feedingSpot(this.goal), 'beg');
        return;
      case 'drink':
        if (!water) break;
        this.goTo(water.drinkingSpot(this.goal), 'drink');
        return;
      case 'groom':
        this.enter('groom');
        return;
      case 'wander':
        if (!nav.randomFreePoint(this.goal)) break;
        this.goTo(this.goal, 'lookAround');
        return;
      case 'window': {
        if (!windows?.length) break;
        const window = windows[Math.floor(Math.random() * windows.length)];
        window.lookoutSpot(this.goal).setY(0);
        this.setFacing(window.getWorldPosition(this.tmp));
        this.goTo(this.goal, 'window');
        return;
      }
      case 'scratch':
        if (!scratcher) break;
        this.setFacing(scratcher.facingPoint(this.tmp));
        this.goTo(scratcher.scratchingSpot(this.goal).setY(0), 'scratch');
        return;
      case 'rugScratch':
        if (!tv) break;
        tv.watchingSpot(this.goal).setY(0);
        this.goal.x += THREE.MathUtils.randFloatSpread(0.6);
        this.goal.z += THREE.MathUtils.randFloatSpread(0.6);
        this.goTo(this.goal, 'rugScratch');
        return;
      case 'toy': {
        if (!toy) break;
        if (this.state !== 'toyWatch') {
          this.count = 0;
          this.total = chance(0.5) ? 2 : 3;
        }
        toy.getWorldPosition(this.tmp).setY(0);
        this.tmp2.subVectors(cat.position, this.tmp).setY(0);
        if (this.tmp2.lengthSq() < 1e-4) this.tmp2.set(1, 0, 0);
        this.goal.copy(this.tmp).addScaledVector(this.tmp2.normalize(), 0.45);
        if (!nav.isFree(this.goal) && !nav.randomFreePoint(this.goal, this.tmp, 0.6)) break;
        this.goTo(this.goal, 'toyStalk');
        return;
      }
      case 'tvWatch': {
        if (!tv) break;
        tv.watchingSpot(this.goal).setY(0);
        if (tv.screenPoint) tv.screenPoint(this.tmp);
        else {
          // No screen point given: face away from the middle of the room, towards the wall the TV is on.
          this.ctx.bounds.getCenter(this.tmp2d);
          this.tmp.set(this.goal.x - this.tmp2d.x, 0, this.goal.z - this.tmp2d.y);
          if (this.tmp.lengthSq() < 1e-4) this.tmp.set(-1, 0, 0);
          this.tmp.normalize().multiplyScalar(2).add(this.goal).setY(0.8);
        }
        this.setFacing(this.tmp);
        this.goTo(this.goal, 'tvWatch');
        return;
      }
      case 'chase':
        this.count = 0;
        this.total = Math.floor(rand(3, 6));
        this.enter('flyStalk');
        return;
      case 'rub': {
        const seat = this.ctx.seats[Math.floor(Math.random() * this.ctx.seats.length)];
        if (!seat) break;
        const side = chance(0.5) ? 1 : -1;
        let ok = false;
        for (const s of [side, -side]) {
          seat.localToWorld(this.goal.set(s * 0.55, 0, -0.2)).setY(0);
          seat.localToWorld(this.rubEnd.set(s * 0.55, 0, 0.25)).setY(0);
          if (nav.isFree(this.goal) && nav.isFree(this.rubEnd)) {
            ok = true;
            break;
          }
        }
        if (!ok) break;
        this.goTo(this.goal, 'rub');
        return;
      }
      case 'sunbathe': {
        const window = this.findSunSpot(this.goal);
        if (!window) break;
        this.setFacing(window.getWorldPosition(this.tmp));
        this.goTo(this.goal, 'sunbathe');
        return;
      }
      case 'lap':
        if (!this.playerSeat) break;
        this.goTo(this.playerSeat.approachPoint(this.goal).setY(0), 'mountLap');
        return;
      case 'call': {
        // Stop 0.8 m short of the player, on the side the cat comes from.
        this.tmp.set(this.eye.x, 0, this.eye.z);
        this.tmp2.subVectors(cat.position, this.tmp).setY(0);
        if (this.tmp2.lengthSq() < 1e-4) this.tmp2.set(0, 0, 1);
        this.goal.copy(this.tmp).addScaledVector(this.tmp2.normalize(), 0.8);
        if (!nav.isFree(this.goal) && !nav.randomFreePoint(this.goal, this.tmp, 1)) break;
        this.goTo(this.goal, 'called');
        return;
      }
      case 'flee':
      case 'fleeMild': {
        const mild = activity === 'fleeMild';
        if (!this.pointAwayFromPlayer(this.goal, mild ? 1.5 : 2)) break;
        this.goTo(this.goal, 'idle', mild ? WALK_SPEED : TROT_SPEED, 'flee');
        return;
      }
    }
    // The activity was impossible right now: think again shortly.
    this.enter('idle');
  }

  // --- helpers --------------------------------------------------------------------------------

  private goTo(target: THREE.Vector3, next: CatState, speed = WALK_SPEED, state: 'walk' | 'flee' = 'walk'): void {
    if (this.ctx.motion.walkTo(target, speed)) {
      this.next = next;
      this.enter(state);
    } else {
      this.enter('idle');
    }
  }

  private hop(target: THREE.Vector3, next: CatState, duration: number): void {
    this.ctx.motion.hopTo(target, duration);
    this.next = next;
    this.enter('hop');
  }

  private setFacing(point: THREE.Vector3): void {
    this.facing.copy(point);
    this.hasFacing = true;
  }

  /** Turns towards the pending facing point (set before the walk), once. */
  private faceIfAny(): void {
    if (!this.hasFacing) return;
    this.ctx.motion.faceTowards(this.facing);
    this.hasFacing = false;
  }

  private setPurr(on: boolean): void {
    if (this.purring === on) return;
    this.purring = on;
    this.ctx.body.setPurring(on);
    this.ctx.voice?.setPurring(on);
  }

  /** Random glances around the room, one every `min`..`max` seconds. */
  private wanderingGaze(dt: number, min: number, max: number): void {
    this.subTimer -= dt;
    if (this.subTimer <= 0) {
      this.lookPoint.copy(this.ctx.cat.position);
      this.lookPoint.x += THREE.MathUtils.randFloatSpread(3);
      this.lookPoint.z += THREE.MathUtils.randFloatSpread(3);
      this.lookPoint.y = rand(0.1, 1.2);
      this.subTimer = rand(min, max);
    }
    this.gazeTarget.copy(this.lookPoint);
    this.hasGaze = true;
  }

  /** Rolls the toy towards a free direction. */
  private nudgeToy(): void {
    const toy = this.ctx.toy;
    if (!toy) return;
    toy.getWorldPosition(this.tmp).setY(0);
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.tmp2.set(Math.cos(angle), 0, Math.sin(angle));
      this.goal.copy(this.tmp).addScaledVector(this.tmp2, 0.8);
      if (this.ctx.nav.isFree(this.goal) && this.ctx.nav.segmentFree(this.tmp, this.goal)) {
        toy.nudge(this.tmp2, 1.5);
        return;
      }
    }
    // Hemmed in: a gentle tap wherever.
    this.tmp2.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    toy.nudge(this.tmp2, 0.8);
  }

  /** A free floor point at least `minDistance` from the player (the furthest of a few tries). */
  private pointAwayFromPlayer(out: THREE.Vector3, minDistance: number): boolean {
    let bestDistance = -1;
    for (let i = 0; i < 12; i++) {
      if (!this.ctx.nav.randomFreePoint(this.tmp)) continue;
      const d = Math.hypot(this.tmp.x - this.eye.x, this.tmp.z - this.eye.z);
      if (d > bestDistance) {
        bestDistance = d;
        out.copy(this.tmp);
      }
      if (d >= minDistance && d < minDistance + 1.5 && chance(0.5)) break;
    }
    return bestDistance >= 0;
  }

  /** The window whose sun patch lands on free floor inside the room; `out` receives the patch. */
  private findSunSpot(out: THREE.Vector3): WindowLookout | null {
    const windows = this.ctx.windows;
    if (!windows || this.ctx.clock.state.night) return null;
    for (const window of windows) {
      if (!window.sunSpotOnFloor(out)) continue;
      out.y = 0;
      this.tmp2d.set(out.x, out.z);
      if (!this.ctx.bounds.containsPoint(this.tmp2d)) continue;
      if (this.ctx.nav.isFree(out)) return window;
    }
    return null;
  }

  /** 0 (wide awake) .. 1 (dead tired) from the time of day: naps midday and at night, active at dawn and dusk. */
  private sleepDrive(): number {
    const h = this.ctx.clock.state.hours;
    if (h >= 22 || h < 5) return 0.9;
    if (h >= 11 && h < 17) return 0.85;
    if ((h >= 6 && h < 9) || (h >= 18 && h < 21)) return 0.15;
    return 0.5;
  }

  private sleepDuration(): number {
    const drive = this.sleepDrive();
    if (drive >= 0.7) return rand(110, 200);
    if (drive >= 0.4) return rand(50, 90);
    return rand(20, 40);
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function chance(p: number): boolean {
  return Math.random() < p;
}

