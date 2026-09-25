import * as THREE from 'three';
import type { CatMind } from './CatMind';
import { RUB_SPEED } from './CatMotion';
import { chance, rand } from './random';

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

/**
 * One state of the cat, all in one place. `M` is the state's own scratch data (a countdown to
 * the next meow, the length of the meal): made fresh by `memo` on every `enter`, handed to
 * `enter` and `tick`, gone when the state is left.
 */
export interface StateDef<M = unknown> {
  memo?(): M;
  /** Sets the state up (pose, `timer`, facing); may hand over to another state at once. */
  enter?(mind: CatMind, memo: M): void;
  /** One frame; `mind.timer` has already been counted down by `dt`. */
  tick(mind: CatMind, dt: number, memo: M): void;
  /** Caption fragment after the cat's name. */
  describe: string | ((mind: CatMind) => string);
  /** A sprinting or crowding player startles it out of this (default true). */
  startles?: boolean;
  /** A seated player's lap may tempt it away from this (default false). */
  invitable?: boolean;
  /** Its head turns to follow a nearby player (default false). */
  followsPlayer?: boolean;
}

/** Types a state's `memo` for its own `enter` / `tick`. */
function withMemo<M>(def: StateDef<M>): StateDef {
  return def;
}

const HEAD_HEIGHT = 0.9;

const LOOKING_AROUND = 'is looking around — click to pet';
const SLEEPING = 'is sleeping — click to pet';
const JUMPING = 'is jumping';
const RUNNING_OFF = 'is running off';
const SCRATCHING = 'is scratching';
const PLAYING = 'is playing';
const CHASING = 'is chasing something';

/** `walk` and `flee`: follow the path, then hand over to `next`. */
const travelling = {
  enter(mind: CatMind): void {
    mind.ctx.body.setPose('stand');
  },
  tick(mind: CatMind): void {
    const { motion } = mind.ctx;
    if (!motion.busy) {
      // A door shut in its face, or a hop target never reached: think again.
      if (motion.blocked || (!motion.reached && (mind.next === 'mount' || mind.next === 'mountLap'))) mind.enter('idle');
      else mind.enter(mind.next);
    }
  },
};

/** Transitional states: `enter` already moved on. */
function passThrough(): void {}

/**
 * Every state of the cat: set-up, frame, caption and how it takes the player. The compiler keeps
 * it complete; a new behaviour is a new `CatState` plus its entry here (and usually an activity
 * in `catActivities.ts` that leads to it).
 */
export const STATES: Record<CatState, StateDef> = {
  idle: {
    enter(mind) {
      mind.ctx.body.setPose(mind.perch ? 'lie' : chance(0.6) ? 'sit' : 'stand');
      mind.timer = rand(1.5, 4);
      mind.faceIfAny();
    },
    tick(mind, dt) {
      if (mind.hunger > 0.7 && mind.ctx.bowl.level <= 0 && mind.playerDistance < 2 && chance(0.08 * dt)) mind.ctx.voice?.meow('demand');
      if (mind.timer <= 0) mind.chooseActivity();
    },
    describe: LOOKING_AROUND,
    invitable: true,
    followsPlayer: true,
  },
  lookAround: withMemo({
    memo: () => ({ glanceIn: 0 }),
    enter(mind) {
      mind.ctx.body.setPose(chance(0.5) ? 'sit' : 'stand');
      mind.timer = rand(2, 6);
    },
    tick(mind, dt, memo) {
      // Random glances around the room, one every 1..2.5 s.
      memo.glanceIn -= dt;
      if (memo.glanceIn <= 0) {
        mind.lookPoint.copy(mind.ctx.cat.position);
        mind.lookPoint.x += THREE.MathUtils.randFloatSpread(3);
        mind.lookPoint.z += THREE.MathUtils.randFloatSpread(3);
        mind.lookPoint.y = rand(0.1, 1.2);
        memo.glanceIn = rand(1, 2.5);
      }
      mind.gazeTarget.copy(mind.lookPoint);
      mind.hasGaze = true;
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: LOOKING_AROUND,
    invitable: true,
    followsPlayer: true,
  }),
  walk: {
    ...travelling,
    describe: (mind) => (mind.pending === 'call' ? 'is coming' : 'is on the move'),
    followsPlayer: true,
  },
  flee: {
    ...travelling,
    describe: RUNNING_OFF,
    startles: false,
  },
  hop: {
    enter(mind) {
      mind.ctx.body.setPose('pounce');
    },
    tick(mind) {
      if (!mind.ctx.motion.busy) mind.enter(mind.next);
    },
    describe: JUMPING,
    startles: false,
  },
  mount: {
    enter(mind) {
      const spot = mind.spot;
      if (!spot || (spot.seat && spot.seat === mind.playerSeat) || !mind.ctx.motion.reached) {
        mind.enter('idle');
        return;
      }
      if (spot.available && !spot.available()) {
        mind.enter('idle');
        return;
      }
      mind.perch = spot;
      mind.hop(spot.position, 'lie', spot.hopApex !== undefined ? 0.65 : 0.5, spot.hopApex);
    },
    tick: passThrough,
    describe: JUMPING,
    startles: false,
  },
  mountLap: {
    enter(mind) {
      if (!mind.playerSeat || !mind.ctx.motion.reached) {
        mind.enter('idle');
        return;
      }
      const seat = mind.playerSeat;
      const position = seat.lapSpot(new THREE.Vector3());
      const approach = seat.approachPoint(new THREE.Vector3());
      mind.perch = { kind: 'seat', position, approach, facing: approach.clone(), seat };
      mind.hop(position, 'lap', 0.5);
    },
    tick: passThrough,
    describe: JUMPING,
    startles: false,
  },
  begin: {
    enter(mind) {
      mind.beginActivity(mind.pending);
    },
    tick: passThrough,
    describe: LOOKING_AROUND,
    startles: false,
  },
  lie: {
    enter(mind) {
      mind.ctx.body.setPose('lie');
      mind.timer = rand(6, 15);
      if (mind.spot?.facing) mind.setFacing(mind.spot.facing);
      mind.faceIfAny();
    },
    tick(mind) {
      if (mind.timer <= 0) mind.enter(mind.perch || mind.sleepDrive() > 0.3 ? 'sleep' : 'idle');
    },
    describe: 'is resting — click to pet',
    invitable: true,
    followsPlayer: true,
  },
  sleep: {
    enter(mind) {
      const bed = mind.perch?.kind === 'bed' || mind.spot?.kind === 'bed';
      mind.ctx.body.setPose(mind.ctx.clock.state.night || bed || chance(0.7) ? 'sleep' : 'loaf');
      mind.timer = mind.sleepRemaining > 0 ? mind.sleepRemaining : sleepDuration(mind);
      mind.sleepRemaining = 0;
      mind.setPurr(false);
    },
    tick(mind) {
      if (mind.timer <= 0 || (mind.hunger > 0.9 && mind.ctx.bowl.level > 0)) mind.enter('stretch');
    },
    describe: SLEEPING,
  },
  halfWake: {
    enter(mind) {
      mind.ctx.body.setPose('loaf');
      mind.timer = rand(3, 5);
    },
    tick(mind) {
      if (mind.timer <= 0) mind.enter('sleep');
    },
    describe: SLEEPING,
    startles: false,
    followsPlayer: true,
  },
  stretch: {
    enter(mind) {
      mind.ctx.body.setPose('stretch');
      mind.timer = rand(2.5, 3.5);
      mind.sleepRemaining = 0;
    },
    tick(mind) {
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: 'is stretching',
    followsPlayer: true,
  },
  eat: withMemo({
    /** The meal's length: the bowl and the hunger go down in proportion. */
    memo: () => ({ total: 0 }),
    enter(mind, memo) {
      mind.ctx.body.setPose('eat');
      mind.ctx.bowl.getWorldPosition(mind.tmp);
      mind.setFacing(mind.tmp);
      mind.faceIfAny();
      memo.total = mind.timer = rand(12, 18);
    },
    tick(mind, dt, memo) {
      mind.ctx.bowl.eat((dt * 0.25) / memo.total);
      mind.hunger = Math.max(0, mind.hunger - dt / memo.total);
      if (mind.timer <= 0 || mind.ctx.bowl.level <= 0) {
        mind.groomIn = rand(120, 180);
        mind.enter('idle');
      }
    },
    describe: 'is eating',
  }),
  beg: withMemo({
    memo: () => ({ meowIn: 1 }),
    enter(mind) {
      mind.ctx.body.setPose('sit');
      mind.ctx.bowl.getWorldPosition(mind.tmp);
      mind.setFacing(mind.tmp);
      mind.faceIfAny();
      mind.timer = rand(20, 40);
    },
    tick(mind, dt, memo) {
      memo.meowIn -= dt;
      if (memo.meowIn <= 0) {
        mind.ctx.voice?.meow('demand');
        memo.meowIn = mind.playerDistance < 2 ? rand(3, 6) : rand(7, 12);
      }
      if (mind.ctx.bowl.level > 0) mind.enter('eat');
      else if (mind.timer <= 0) {
        mind.begCooldown = 45;
        mind.enter('idle');
      }
    },
    describe: 'wants food',
    followsPlayer: true,
  }),
  drink: withMemo({
    memo: () => ({ sipIn: 0.8 }),
    enter(mind) {
      mind.ctx.body.setPose('drink');
      if (mind.drinkingFrom) {
        mind.drinkingFrom.getWorldPosition(mind.tmp);
        mind.setFacing(mind.tmp);
        mind.faceIfAny();
      }
      mind.timer = rand(6, 10);
    },
    tick(mind, dt, memo) {
      memo.sipIn -= dt;
      if (memo.sipIn <= 0) {
        mind.drinkingFrom?.sip();
        memo.sipIn = rand(0.7, 1);
      }
      if (mind.timer <= 0) {
        mind.thirst = 0;
        mind.enter('idle');
      }
    },
    describe: 'is drinking',
  }),
  groom: {
    enter(mind) {
      mind.ctx.body.setPose('groom');
      mind.timer = rand(15, 25);
      mind.groomIn = Infinity;
    },
    tick(mind) {
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: 'is washing — click to pet',
    invitable: true,
  },
  window: {
    enter(mind) {
      mind.ctx.body.setPose('sit');
      mind.faceIfAny();
      mind.timer = rand(30, 90);
    },
    tick(mind) {
      // Head panning slowly across the view outside.
      const { facing, tmp } = mind;
      tmp.subVectors(facing, mind.ctx.cat.position).setY(0).normalize();
      mind.gazeTarget.set(facing.x - tmp.z * Math.sin(mind.age * 0.35) * 0.6, HEAD_HEIGHT + 0.3, facing.z + tmp.x * Math.sin(mind.age * 0.35) * 0.6);
      mind.hasGaze = true;
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: 'is watching the street',
    invitable: true,
  },
  tvWatch: withMemo({
    memo: () => ({ lookIn: 0 }),
    enter(mind) {
      mind.ctx.body.setPose('sit');
      mind.faceIfAny();
      mind.timer = rand(30, 60);
      mind.lookPoint.copy(mind.facing);
    },
    tick(mind, dt, memo) {
      if (!mind.ctx.tv?.isPlaying()) {
        mind.enter('idle');
        return;
      }
      memo.lookIn -= dt;
      if (memo.lookIn <= 0) {
        const { facing, tmp } = mind;
        tmp.subVectors(facing, mind.ctx.cat.position).setY(0).normalize();
        const side = THREE.MathUtils.randFloatSpread(0.7);
        mind.lookPoint.set(facing.x - tmp.z * side, facing.y + THREE.MathUtils.randFloatSpread(0.4), facing.z + tmp.x * side);
        memo.lookIn = rand(2, 5);
      }
      mind.gazeTarget.copy(mind.lookPoint);
      mind.hasGaze = true;
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: 'is watching TV',
    invitable: true,
  }),
  sunbathe: withMemo({
    /** Until the next check that the sun patch is still under it. */
    memo: () => ({ checkIn: 3 }),
    enter(mind) {
      mind.ctx.body.setPose(chance(0.5) ? 'lie' : 'loaf');
      mind.faceIfAny();
      mind.timer = rand(30, 60);
    },
    tick(mind, dt, memo) {
      memo.checkIn -= dt;
      if (memo.checkIn <= 0) {
        memo.checkIn = 3;
        if (!mind.findSunSpot(mind.tmp) || mind.tmp.distanceTo(mind.ctx.cat.position) > 0.7) {
          mind.enter('idle');
          return;
        }
      }
      if (mind.timer <= 0) {
        mind.spot = null;
        mind.enter(mind.sleepDrive() > 0.5 ? 'sleep' : 'idle');
      }
    },
    describe: 'is sunbathing — click to pet',
    followsPlayer: true,
  }),
  scratch: withMemo({
    memo: () => ({ strokeIn: 0.5 }),
    enter(mind) {
      mind.ctx.body.setPose('scratch');
      mind.faceIfAny();
      mind.timer = rand(8, 15);
    },
    tick(mind, dt, memo) {
      memo.strokeIn -= dt;
      if (memo.strokeIn <= 0) {
        mind.ctx.scratcher?.scratched();
        memo.strokeIn = rand(0.5, 0.9);
      }
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: SCRATCHING,
  }),
  rugScratch: {
    enter(mind) {
      mind.ctx.body.setPose('scratch');
      mind.timer = 4;
    },
    tick(mind) {
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: SCRATCHING,
  },
  rub: {
    enter(mind) {
      mind.ctx.body.setPose('stand');
      if (!mind.ctx.motion.walkTo(mind.rubEnd, RUB_SPEED)) mind.enter('idle');
    },
    tick(mind) {
      if (!mind.ctx.motion.busy) mind.enter('idle');
    },
    describe: 'is rubbing against the armchair',
    followsPlayer: true,
  },
  toyStalk: {
    enter(mind) {
      mind.ctx.body.setPose('crouch');
      if (mind.ctx.toy) mind.setFacing(mind.ctx.toy.getWorldPosition(mind.tmp));
      mind.faceIfAny();
      mind.timer = rand(1, 2);
    },
    tick(mind) {
      if (mind.ctx.toy) {
        mind.ctx.toy.getWorldPosition(mind.gazeTarget);
        mind.hasGaze = true;
      }
      if (mind.timer <= 0) mind.enter('toyPounce');
    },
    describe: PLAYING,
  },
  toyPounce: {
    enter(mind) {
      const { toy, cat, nav, body, motion } = mind.ctx;
      if (!toy) {
        mind.enter('idle');
        return;
      }
      toy.getWorldPosition(mind.tmp);
      mind.tmp2.subVectors(mind.tmp, cat.position).setY(0);
      if (mind.tmp2.lengthSq() > 1e-4) mind.tmp2.normalize();
      mind.tmp.addScaledVector(mind.tmp2, -(toy.radius + 0.1)).setY(0);
      nav.clampInside(mind.tmp);
      body.setPose('pounce');
      motion.hopTo(mind.tmp, 0.35);
    },
    tick(mind) {
      if (!mind.ctx.motion.busy) {
        nudgeToy(mind);
        mind.enter('toyWatch');
      }
    },
    describe: PLAYING,
  },
  toyWatch: {
    enter(mind) {
      mind.ctx.body.setPose('stand');
      mind.timer = 4;
    },
    tick(mind) {
      const toy = mind.ctx.toy;
      if (toy) {
        toy.getWorldPosition(mind.gazeTarget);
        mind.hasGaze = true;
      }
      if (mind.age > 0.5 && (!toy || !toy.isRolling || mind.timer <= 0)) {
        mind.bout.done++;
        if (mind.bout.done < mind.bout.of && toy) mind.beginActivity('toy');
        else mind.enter('idle');
      }
    },
    describe: PLAYING,
  },
  flyStalk: {
    enter(mind) {
      mind.ctx.body.setPose('crouch');
      mind.timer = rand(0.6, 1.2);
      mind.lookPoint.copy(mind.ctx.cat.position);
      mind.lookPoint.x += THREE.MathUtils.randFloatSpread(1.2);
      mind.lookPoint.z += THREE.MathUtils.randFloatSpread(1.2);
      mind.lookPoint.y = rand(0.3, 0.7);
    },
    tick(mind) {
      mind.gazeTarget.copy(mind.lookPoint);
      mind.hasGaze = true;
      if (mind.timer <= 0) mind.enter('flyPounce');
    },
    describe: CHASING,
  },
  flyPounce: {
    enter(mind) {
      if (!mind.ctx.nav.randomFreePoint(mind.tmp, mind.ctx.cat.position, 1)) {
        mind.enter('idle');
        return;
      }
      mind.ctx.body.setPose('pounce');
      mind.ctx.motion.hopTo(mind.tmp, 0.35);
    },
    tick(mind) {
      if (!mind.ctx.motion.busy) {
        mind.bout.done++;
        mind.enter(mind.bout.done < mind.bout.of ? 'flyStalk' : 'idle');
      }
    },
    describe: CHASING,
  },
  startle: {
    enter(mind) {
      mind.ctx.motion.stop();
      mind.ctx.body.flick();
      mind.ctx.body.setPose('crouch');
      mind.setPurr(false);
      mind.timer = 0.25;
    },
    tick(mind) {
      if (mind.timer <= 0) {
        mind.startleCooldown = 6;
        mind.startActivity('flee');
      }
    },
    describe: RUNNING_OFF,
    startles: false,
  },
  petted: withMemo({
    /** Whether it goes back to lying down (it was resting, or up on a perch) rather than about its day. */
    memo: () => ({ resumeRest: false }),
    enter(mind, memo) {
      mind.ctx.motion.stop();
      memo.resumeRest = mind.perch !== null || mind.previous === 'lie' || mind.previous === 'sunbathe' || mind.previous === 'stretch';
      mind.ctx.body.setPose(memo.resumeRest ? 'lie' : 'sit');
      mind.setPurr(true);
      mind.timer = rand(4.5, 6);
    },
    tick(mind, _dt, memo) {
      if (mind.timer <= 0) {
        mind.setPurr(false);
        if (memo.resumeRest) mind.enter('lie');
        else mind.enter('idle');
      }
    },
    describe: 'is purring',
    startles: false,
    followsPlayer: true,
  }),
  lap: {
    enter(mind) {
      mind.ctx.body.setPose('lie');
      mind.setPurr(true);
      if (mind.perch?.facing) mind.setFacing(mind.perch.facing);
      mind.faceIfAny();
    },
    // Purring on the lap until the player stands up (see `CatBrain.setPlayerSeat`).
    tick: passThrough,
    describe: 'is on your lap — click to pet',
    startles: false,
    followsPlayer: true,
  },
  called: {
    enter(mind) {
      mind.ctx.body.setPose('sit');
      mind.setFacing(mind.eye);
      mind.faceIfAny();
      mind.ctx.voice?.meow('greet');
      mind.timer = rand(8, 15);
    },
    tick(mind) {
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: 'came to see you — click to pet',
    followsPlayer: true,
  },
};

function sleepDuration(mind: CatMind): number {
  const drive = mind.sleepDrive();
  if (drive >= 0.7) return rand(110, 200);
  if (drive >= 0.4) return rand(50, 90);
  return rand(20, 40);
}

/** Rolls the toy towards a free direction. */
function nudgeToy(mind: CatMind): void {
  const { toy, nav } = mind.ctx;
  if (!toy) return;
  const { tmp, tmp2, goal } = mind;
  toy.getWorldPosition(tmp).setY(0);
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    tmp2.set(Math.cos(angle), 0, Math.sin(angle));
    goal.copy(tmp).addScaledVector(tmp2, 0.8);
    if (nav.isFree(goal) && nav.segmentFree(tmp, goal)) {
      toy.nudge(tmp2, 1.5);
      return;
    }
  }
  // Hemmed in: a gentle tap wherever.
  tmp2.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
  toy.nudge(tmp2, 0.8);
}
