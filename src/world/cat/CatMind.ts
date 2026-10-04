import * as THREE from 'three';
import type { Seat } from '../Seat';
import type { WaterBowlLike } from './types';
import type { CatBrainContext } from './CatBrain';
import { WALK_SPEED } from './CatMotion';
import type { RestingSpot, WindowLookout } from './spots';
import { STATES, type CatState } from './catStates';
import { ACTIVITIES, pickActivity, type Activity } from './catActivities';

/**
 * The cat's working memory and its moves from one state to the next: what the state table
 * (`catStates.ts`) and the activity table (`catActivities.ts`) read and write. `CatBrain` owns
 * one, counts its needs down and feeds it the player's position every frame, and ticks the
 * current state. Timers are real seconds; the vectors are scratch space, nothing allocates per frame.
 */
export class CatMind {
  state: CatState = 'idle';
  previous: CatState = 'idle';
  /** The current state's countdown: set by its `enter`, counted down before each of its ticks. */
  timer = 0;
  /** Seconds since the current state was entered. */
  age = 0;
  /** Where the walk or hop under way hands over. */
  next: CatState = 'idle';
  /** The activity under way (or waiting for the hop down from a perch). */
  pending: Activity = 'none';
  /** The current state's own scratch data (`StateDef.memo`), fresh on every `enter`. */
  memo: unknown = undefined;

  /** The resting spot chosen for the current lie-down; `perch` while actually up there. */
  spot: RestingSpot | null = null;
  perch: RestingSpot | null = null;
  /** A fly is being chased: `lookPoint` is where it buzzes (set on entering a state). */
  flying = false;
  /** The water bowl it went to drink from. */
  drinkingFrom: WaterBowlLike | null = null;
  /** A play bout (the ball, an imaginary fly): pounces so far, out of how many. */
  readonly bout = { done: 0, of: 0 };

  readonly goal = new THREE.Vector3();
  /** Point to turn to on arrival (set before the walk), used once by `faceIfAny`. */
  readonly facing = new THREE.Vector3();
  hasFacing = false;
  /** The player's eye, and its floor distance to the cat, this frame. */
  readonly eye = new THREE.Vector3();
  playerDistance = Infinity;
  /** Where a state turns the head this frame (`hasGaze`); else `CatBrain` decides. */
  readonly gazeTarget = new THREE.Vector3();
  hasGaze = false;
  readonly lookPoint = new THREE.Vector3();
  readonly rubEnd = new THREE.Vector3();
  readonly tmp = new THREE.Vector3();
  readonly tmp2 = new THREE.Vector3();
  readonly tmp2d = new THREE.Vector2();

  hunger = 0.35;
  thirst = 0.2;
  /** Countdown to the post-meal wash; Infinity when nothing is due. */
  groomIn = Infinity;
  begCooldown = 0;
  exploreCooldown = 0;
  startleCooldown = 3;

  playerSeat: Seat | null = null;
  /** What is left of a nap interrupted by a half wake. */
  sleepRemaining = 0;
  purring = false;
  /** What set off the current startle: a sprint (hiss, yowl) or a player simply walking too close (a grumble). */
  startledBy: 'sprint' | 'crowd' = 'sprint';
  /** The last two activities chosen when idle, newest first: the draw leans away from repeating them. */
  readonly recent: Activity[] = [];

  constructor(readonly ctx: CatBrainContext) {}

  // --- transitions ----------------------------------------------------------------------------

  /** Leaves the current state for `state` and sets it up (which may hand over again at once). */
  enter(state: CatState): void {
    this.previous = this.state;
    this.state = state;
    this.age = 0;
    this.flying = state === 'flyStalk' || state === 'flyPounce';
    const def = STATES[state];
    this.memo = def.memo?.();
    def.enter?.(this, this.memo);
  }

  /** What an idle cat does next: a weighted pick of the activity table. */
  chooseActivity(): void {
    const activity = pickActivity(this);
    this.recent.unshift(activity);
    this.recent.length = Math.min(this.recent.length, 2);
    this.startActivity(activity);
  }

  /** Runs an activity, first hopping down from a perch when the activity needs the floor. */
  startActivity(activity: Activity): void {
    this.pending = activity;
    const staysPut = activity === 'groom' || (activity === 'sleep' && this.perch !== null);
    if (this.perch && !staysPut) {
      const { approach, hopApex } = this.perch;
      this.perch = null;
      this.spot = null;
      this.hop(approach, 'begin', hopApex !== undefined ? 0.6 : 0.45, hopApex);
      return;
    }
    this.beginActivity(activity);
  }

  beginActivity(activity: Activity): void {
    this.hasFacing = false;
    this.pending = activity;
    // The activity was impossible right now: think again shortly.
    if (!ACTIVITIES[activity].begin(this)) this.enter('idle');
  }

  // --- helpers --------------------------------------------------------------------------------

  goTo(target: THREE.Vector3, next: CatState, speed = WALK_SPEED, state: 'walk' | 'flee' = 'walk'): void {
    if (this.ctx.motion.walkTo(target, speed)) {
      this.next = next;
      this.enter(state);
    } else {
      this.enter('idle');
    }
  }

  hop(target: THREE.Vector3, next: CatState, duration: number, apex?: number): void {
    this.ctx.motion.hopTo(target, duration, apex);
    this.next = next;
    this.enter('hop');
  }

  setFacing(point: THREE.Vector3): void {
    this.facing.copy(point);
    this.hasFacing = true;
  }

  /** Turns towards the pending facing point (set before the walk), once; `keepClear` false when it means to touch what it faces (the post). */
  faceIfAny(keepClear = true): void {
    if (!this.hasFacing) return;
    this.ctx.motion.faceTowards(this.facing, keepClear);
    this.hasFacing = false;
  }

  setPurr(on: boolean): void {
    if (this.purring === on) return;
    this.purring = on;
    this.ctx.body.setPurring(on);
    this.ctx.voice?.setPurring(on);
  }

  /** The window whose sun patch lands on free floor inside the room; `out` receives the patch. */
  findSunSpot(out: THREE.Vector3): WindowLookout | null {
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

  /** 0 (wide awake) .. 1 (dead tired) from the time of day: naps midday and at night, active at dawn and dusk (eased between the knots). */
  sleepDrive(): number {
    const h = ((this.ctx.clock.state.hours % 24) + 24) % 24;
    let i = 0;
    // Knots exist on both sides of `i`: it stops before the last one, and the index below is clamped to it.
    while (i < SLEEP_CURVE.length - 1 && SLEEP_CURVE[i + 1]![0] <= h) i++;
    const [h0, d0] = SLEEP_CURVE[i]!;
    const [h1, d1] = SLEEP_CURVE[Math.min(i + 1, SLEEP_CURVE.length - 1)]!;
    return THREE.MathUtils.lerp(d0, d1, THREE.MathUtils.smoothstep(h, h0, h1));
  }
}

/** (hour, sleep drive) knots, eased between with a smoothstep and wrapping at midnight: deep at night, a long midday nap, lively at dawn and dusk. */
const SLEEP_CURVE: readonly [number, number][] = [
  [0, 0.9],
  [4.5, 0.9],
  [6, 0.2],
  [8.5, 0.15],
  [10, 0.55],
  [11.5, 0.85],
  [16.5, 0.85],
  [18, 0.2],
  [20.5, 0.15],
  [22, 0.9],
  [24, 0.9],
];
