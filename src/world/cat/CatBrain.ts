import type * as THREE from 'three';
import type { Seat } from '../Seat';
import type { CatBedLike, CatBody, CatClock, CatPlayerView, CatToyLike, CatVoiceLike, FoodBowlLike, ScratcherLike, WaterBowlLike } from './types';
import type { CatNav } from './CatNav';
import type { CatMotion } from './CatMotion';
import type { CatPerch, WindowLookout } from './spots';
import { CatMind } from './CatMind';
import { STATES, type CatState } from './catStates';
import { chance } from './random';

export type { CatState } from './catStates';

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
  /** More water elsewhere in the flat (the kitchen's): the cat drinks at whichever is nearest and reachable. */
  waters?: readonly WaterBowlLike[];
  bed?: CatBedLike;
  scratcher?: ScratcherLike;
  toy?: CatToyLike;
  windows?: readonly WindowLookout[];
  tv?: CatScreen;
  voice?: CatVoiceLike;
  /** Floor points in the flat's other rooms the cat goes to have a look at, when the doors let it. */
  visits?: readonly THREE.Vector3[];
  /** Places to nap elsewhere in the flat (the bedroom's bed). */
  perches?: readonly CatPerch[];
}

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

/**
 * The cat's behaviour: a state machine with needs (hunger, thirst, grooming) and a daily rhythm
 * from the room clock. It decides where to go, asks `CatMotion` to walk or hop there, and names
 * the body pose. Each state lives in one entry of `STATES` (`catStates.ts`), each idle choice in
 * one entry of `ACTIVITIES` (`catActivities.ts`); both work on the `CatMind` this class owns. Here:
 * the needs, the reactions to the player (startle, lap, petting, calls) and the per-frame tick.
 * Timers are real seconds.
 */
export class CatBrain {
  private readonly mind: CatMind;
  private now = 0;
  private lapCooldown = 0;
  private annoyedFor = 0;
  private attendFor = 0;
  private readonly petTimes: number[] = [];
  private playerSeatedFor = 0;

  constructor(private readonly ctx: CatBrainContext) {
    this.mind = new CatMind(ctx);
    this.mind.enter('idle');
  }

  // --- public ---------------------------------------------------------------------------------

  get state(): CatState {
    return this.mind.state;
  }

  update(dt: number): void {
    const mind = this.mind;
    this.now += dt;
    mind.age += dt;
    mind.hunger = Math.min(1, mind.hunger + dt / HUNGER_FULL_S);
    mind.thirst = Math.min(1, mind.thirst + dt / THIRST_FULL_S);
    mind.groomIn -= dt;
    mind.begCooldown -= dt;
    this.lapCooldown -= dt;
    mind.exploreCooldown -= dt;
    this.annoyedFor -= dt;
    mind.startleCooldown -= dt;
    this.attendFor -= dt;
    if (mind.playerSeat) this.playerSeatedFor += dt;

    this.ctx.player.getEyePosition(mind.eye);
    mind.playerDistance = Math.hypot(mind.eye.x - this.ctx.cat.position.x, mind.eye.z - this.ctx.cat.position.z);

    mind.hasGaze = false;
    this.observePlayer(dt);
    this.tick(dt);
    this.applyGaze();
  }

  /** The player strokes the cat. */
  pet(): PetOutcome {
    const mind = this.mind;
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
      mind.setPurr(false);
      if (mind.state === 'lap') this.lapCooldown = 90;
      mind.startActivity('fleeMild');
      return 'annoyed';
    }
    if (mind.state === 'sleep' || mind.state === 'halfWake') {
      mind.enter('stretch');
      return 'woke';
    }
    if (mind.state === 'lap') {
      mind.setPurr(true);
      return 'purr';
    }
    mind.enter('petted');
    return 'purr';
  }

  /** The player calls the cat. */
  call(): CallOutcome {
    const state = this.mind.state;
    if (state === 'sleep' || state === 'halfWake') {
      this.ctx.body.flick();
      return 'asleep';
    }
    const busy = state === 'lap' || state === 'petted' || state === 'startle' || state === 'flee' || state === 'hop' || state === 'called';
    if (this.annoyedFor > 0 || busy) return 'ignored';
    if (chance(1 / 3)) {
      this.attendFor = 3;
      return 'ignored';
    }
    this.mind.startActivity('call');
    return 'coming';
  }

  /** Which armchair the player sits in (null when standing). */
  setPlayerSeat(seat: Seat | null): void {
    const mind = this.mind;
    const wasOnLap = mind.state === 'lap' || (mind.state === 'hop' && mind.next === 'lap');
    mind.playerSeat = seat;
    this.playerSeatedFor = 0;
    if (seat) {
      if (mind.perch?.seat === seat && !wasOnLap) {
        // Evicted: grumble and leave the chair.
        this.ctx.body.flick();
        this.ctx.voice?.meow('grumble');
        mind.setPurr(false);
        mind.startActivity('fleeMild');
      }
    } else if (wasOnLap) {
      mind.setPurr(false);
      this.lapCooldown = 60;
      mind.startActivity('none');
    }
  }

  get isAsleep(): boolean {
    return this.mind.state === 'sleep' || this.mind.state === 'halfWake';
  }

  get isPurring(): boolean {
    return this.mind.purring;
  }

  /** Caption fragment after the cat's name. */
  describe(): string {
    const describe = STATES[this.mind.state].describe;
    return typeof describe === 'string' ? describe : describe(this.mind);
  }

  // --- reactions ------------------------------------------------------------------------------

  private observePlayer(dt: number): void {
    const mind = this.mind;
    const d = mind.playerDistance;
    if (mind.state === 'sleep') {
      if (d < 0.6 && chance(0.15 * dt)) {
        mind.sleepRemaining = mind.timer;
        mind.enter('halfWake');
      }
      return;
    }
    if (mind.startleCooldown <= 0 && STATES[mind.state].startles !== false) {
      const sprinting = this.ctx.player.isSprinting && d < SPRINT_SCARE;
      const crowded = d < PLAYER_TOO_CLOSE && mind.state !== 'called';
      if (sprinting || crowded) {
        mind.enter('startle');
        return;
      }
    }
    if (mind.playerSeat && !mind.perch && this.lapCooldown <= 0 && this.playerSeatedFor > LAP_AFTER_S && STATES[mind.state].invitable && chance(0.03 * dt)) {
      mind.startActivity('lap');
    }
  }

  private applyGaze(): void {
    const { body } = this.ctx;
    const mind = this.mind;
    if (mind.hasGaze) body.gaze(mind.gazeTarget);
    else if (this.attendFor > 0 || (mind.playerDistance < PLAYER_NEAR && STATES[mind.state].followsPlayer)) body.gaze(mind.eye);
    else body.gaze(null);
  }

  // --- state machine --------------------------------------------------------------------------

  /** Runs the current state for a frame (its `timer` counted down first). */
  private tick(dt: number): void {
    const mind = this.mind;
    mind.timer -= dt;
    // A perch that stopped being one under the cat (the bath being run): out at once, grumbling.
    if (mind.perch?.available && mind.state !== 'hop' && !mind.perch.available()) {
      this.ctx.voice?.meow('grumble');
      mind.startActivity('wander');
      return;
    }
    STATES[mind.state].tick(mind, dt, mind.memo);
  }
}

