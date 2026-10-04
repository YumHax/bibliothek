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
  | 'called'
  | 'treat';

/**
 * One state of the cat, all in one place. `M` is the state's own scratch data (a countdown to
 * the next meow, the length of the meal): made fresh by `memo` on every `enter`, handed to
 * `enter` and `tick`, gone when the state is left.
 */
interface StateDef<M = unknown> {
  memo?(): M;
  /** Sets the state up (pose, `timer`, facing); may hand over to another state at once. */
  enter?(mind: CatMind, memo: M): void;
  /** One frame; `mind.timer` has already been counted down by `dt`. */
  tick(mind: CatMind, dt: number, memo: M): void;
  /** Caption fragment after the cat's name. */
  describe: string | ((mind: CatMind) => string);
  /** A sprinting or crowding player startles it out of this (default true). */
  startles?: boolean;
  /**
   * Settled (resting, watching, busy at its bowl or post): a player walking up to it, close enough to
   * stroke it, does not startle it; only a sprint does (default false).
   */
  calm?: boolean;
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
/** A pounce lands this far short of the floor under the fly: the front paws reach the rest. */
const FLY_REACH = 0.15;
/** How much of its hunger one treat takes away. */
const TREAT_FILLS = 0.08;

const LOOKING_AROUND = 'is looking around · pet';
const SLEEPING = 'is sleeping · pet';
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
 * Every rhythm of the cat in one place (real seconds; `[min, max]` is drawn from evenly): how long
 * each state lasts, how often its sounds come, the cooldowns and the per-second chances the brain
 * rolls. A day lasts 600 s, so an in-game hour is 25 s.
 */
export const CAT_TIMING = {
  idle: [1.5, 4],
  lookAround: [2, 6],
  /** One glance round the room every so often, within `glanceCone` rad either side of where it faces, this far off (m). */
  glance: [1, 2.5],
  glanceCone: 1.3,
  glanceDistance: [1, 2.5],
  lie: [6, 15],
  halfWake: [3, 5],
  stretch: [2.5, 3.5],
  /** The yawn this long into a stretch, one stretch in `yawnChance`. */
  yawnAt: [0.6, 1.2],
  yawnChance: 0.6,
  eat: [12, 18],
  crunch: [0.35, 0.7],
  /** A meal comes in mouthfuls: heads down this long, then up for a look round (and a lick of the lips) this long. */
  eatBout: [3, 5],
  eatPause: [0.8, 1.5],
  /** After a meal, the wash is due in this long. */
  groomAfterMeal: [120, 180],
  beg: [20, 40],
  /** The begging meow: every so often with the player near (m) or not; how many meows to full insistence; the odds a trill takes its place. */
  begMeowNear: [3, 6],
  begMeowFar: [7, 12],
  begNear: 2,
  begRamp: 5,
  begTrill: 0.2,
  begCooldown: 45,
  drink: [6, 10],
  sip: [0.7, 1],
  groom: [15, 25],
  /** A soft lick now and then while washing. */
  groomLick: [1.5, 4],
  window: [30, 90],
  /** Of the window's glances with the ears pricked, this share gets a chirp or a chatter. */
  windowCall: 0.15,
  tvWatch: [30, 60],
  tvLook: [2, 5],
  sunbathe: [30, 60],
  scratch: [8, 15],
  scratchStroke: [0.5, 0.9],
  rugScratch: [4, 6],
  rugStroke: [0.6, 0.9],
  toyStalk: [1, 2],
  toyWatch: 4,
  flyStalk: [0.9, 1.6],
  startle: 0.25,
  startleCooldown: 6,
  petted: [4.5, 6],
  pettedBlink: [2.5, 4],
  /** Petted while busy (eating, drinking, scratching): it purrs this long and carries on. */
  purrWhileBusy: 3,
  lapBlink: [4, 8],
  called: [8, 15],
  treatSniff: [1, 1.5],
  treatCrunch: [2.5, 3.5],
  /** No lap again for this long after being annoyed on it, or after the player stood up. */
  lapCooldownAnnoyed: 90,
  lapCooldownStood: 60,
  /** Asleep, a player nearer than this (m) half wakes it, at this chance per second. */
  halfWakeWithin: 0.6,
  halfWakeChance: 0.15,
  /** A seated player's lap lures an invitable cat at this chance per second. */
  lapInvite: 0.03,
  /** Idle, hungry by an empty bowl with the player near: a demand meow at this chance per second. */
  idleDemand: 0.08,
} as const;

const span = (range: readonly [number, number]): number => rand(range[0], range[1]);

/**
 * Every state of the cat: set-up, frame, caption and how it takes the player. The compiler keeps
 * it complete; a new behaviour is a new `CatState` plus its entry here (and usually an activity
 * in `catActivities.ts` that leads to it).
 */
export const STATES: Record<CatState, StateDef> = {
  idle: {
    enter(mind) {
      // It keeps the posture it has when that is one to idle in (no sit-stand-sit between thoughts); from anything else, it settles.
      keepOrSettle(mind);
      mind.timer = span(CAT_TIMING.idle);
      mind.faceIfAny();
    },
    tick(mind, dt) {
      if (mind.hunger > 0.7 && mind.ctx.bowl.level <= 0 && mind.playerDistance < CAT_TIMING.begNear && chance(CAT_TIMING.idleDemand * dt)) mind.ctx.voice?.meow('demand');
      if (mind.timer <= 0) mind.chooseActivity();
    },
    describe: LOOKING_AROUND,
    invitable: true,
    followsPlayer: true,
  },
  lookAround: withMemo({
    memo: () => ({ glanceIn: 0 }),
    enter(mind) {
      keepOrSettle(mind);
      mind.timer = span(CAT_TIMING.lookAround);
    },
    tick(mind, dt, memo) {
      // Glances round the room, in front of it (the head only turns so far: nothing behind it).
      memo.glanceIn -= dt;
      if (memo.glanceIn <= 0) {
        const { cat } = mind.ctx;
        const yaw = cat.rotation.y + THREE.MathUtils.randFloatSpread(CAT_TIMING.glanceCone * 2);
        const distance = span(CAT_TIMING.glanceDistance);
        mind.lookPoint.set(cat.position.x + Math.sin(yaw) * distance, rand(0.1, 1.2), cat.position.z + Math.cos(yaw) * distance);
        memo.glanceIn = span(CAT_TIMING.glance);
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
      if (!spot || (spot.seat && (spot.seat === mind.playerSeat || spot.seat.guest)) || !mind.ctx.motion.reached) {
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
      mind.timer = span(CAT_TIMING.lie);
      if (mind.spot?.facing) mind.setFacing(mind.spot.facing);
      mind.faceIfAny();
    },
    tick(mind) {
      if (mind.timer <= 0) mind.enter(mind.perch || mind.sleepDrive() > 0.3 ? 'sleep' : 'idle');
    },
    describe: 'is resting · pet',
    invitable: true,
    followsPlayer: true,
    calm: true,
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
      mind.timer = span(CAT_TIMING.halfWake);
    },
    tick(mind) {
      if (mind.timer <= 0) mind.enter('sleep');
    },
    describe: SLEEPING,
    startles: false,
    followsPlayer: true,
  },
  stretch: withMemo({
    /** Until the little yawn at the height of the stretch (Infinity: none this time). */
    memo: () => ({ yawnIn: Infinity }),
    enter(mind, memo) {
      mind.ctx.body.setPose('stretch');
      mind.timer = span(CAT_TIMING.stretch);
      mind.sleepRemaining = 0;
      if (chance(CAT_TIMING.yawnChance)) memo.yawnIn = span(CAT_TIMING.yawnAt);
    },
    tick(mind, dt, memo) {
      memo.yawnIn -= dt;
      if (memo.yawnIn <= 0) {
        memo.yawnIn = Infinity;
        mind.ctx.voice?.meow('yawn');
      }
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: 'is stretching',
    followsPlayer: true,
  }),
  eat: withMemo({
    /** The meal's length: the bowl and the hunger go down in proportion. Until the next mouthful's crunch. */
    memo: () => ({ total: 0, crunchIn: 0.6, boutLeft: 0, pauseLeft: 0 }),
    enter(mind, memo) {
      mind.ctx.body.setPose('eat');
      mind.ctx.bowl.getWorldPosition(mind.tmp);
      mind.setFacing(mind.tmp);
      mind.faceIfAny();
      memo.total = mind.timer = span(CAT_TIMING.eat);
      memo.boutLeft = span(CAT_TIMING.eatBout);
    },
    tick(mind, dt, memo) {
      // Heads up between mouthfuls: a look at the player (or round the room) and a lick, then back to it.
      if (memo.pauseLeft > 0) {
        memo.pauseLeft -= dt;
        mind.timer += dt;
        mind.gazeTarget.copy(mind.eye);
        mind.hasGaze = mind.playerDistance < 3;
        if (memo.pauseLeft <= 0) {
          mind.ctx.body.setPose('eat');
          memo.boutLeft = span(CAT_TIMING.eatBout);
        }
        return;
      }
      memo.boutLeft -= dt;
      if (memo.boutLeft <= 0 && mind.timer > 2) {
        memo.pauseLeft = span(CAT_TIMING.eatPause);
        mind.ctx.body.setPose('sit');
        mind.ctx.voice?.noise('lick');
        return;
      }
      memo.crunchIn -= dt;
      if (memo.crunchIn <= 0) {
        mind.ctx.voice?.noise('crunch');
        memo.crunchIn = span(CAT_TIMING.crunch);
      }
      mind.ctx.bowl.eat((dt * 0.25) / memo.total);
      mind.hunger = Math.max(0, mind.hunger - dt / memo.total);
      if (mind.timer <= 0 || mind.ctx.bowl.level <= 0) {
        mind.groomIn = span(CAT_TIMING.groomAfterMeal);
        mind.enter('idle');
      }
    },
    describe: 'is eating',
    calm: true,
  }),
  beg: withMemo({
    /**
     * Until the next meow, how many so far (each a little more insistent), the player's distance to the
     * bowl last frame, and how long it keeps quiet watching a player who is coming to the bowl.
     */
    memo: () => ({ meowIn: 1, meows: 0, playerToBowl: Infinity, hush: 0 }),
    enter(mind) {
      mind.ctx.body.setPose('sit');
      mind.ctx.bowl.getWorldPosition(mind.tmp);
      mind.setFacing(mind.tmp);
      mind.faceIfAny();
      mind.timer = span(CAT_TIMING.beg);
    },
    tick(mind, dt, memo) {
      const bowl = mind.ctx.bowl.getWorldPosition(mind.tmp);
      const toBowl = Math.hypot(mind.eye.x - bowl.x, mind.eye.z - bowl.z);
      // The player heading for the bowl: it waits, eyes on them, instead of nagging.
      if (dt > 0 && (memo.playerToBowl - toBowl) / dt > 0.3) memo.hush = 1;
      memo.playerToBowl = toBowl;
      memo.hush -= dt;
      if (memo.hush > 0) {
        mind.gazeTarget.copy(mind.eye);
        mind.hasGaze = true;
      } else {
        memo.meowIn -= dt;
      }
      if (memo.meowIn <= 0) {
        if (memo.meows > 0 && chance(CAT_TIMING.begTrill)) mind.ctx.voice?.meow('trill');
        else mind.ctx.voice?.meow('demand', Math.min(1, memo.meows / CAT_TIMING.begRamp));
        memo.meows++;
        memo.meowIn = span(mind.playerDistance < CAT_TIMING.begNear ? CAT_TIMING.begMeowNear : CAT_TIMING.begMeowFar);
      }
      if (mind.ctx.bowl.level > 0) mind.enter('eat');
      else if (mind.timer <= 0) {
        mind.begCooldown = CAT_TIMING.begCooldown;
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
      mind.timer = span(CAT_TIMING.drink);
    },
    tick(mind, dt, memo) {
      memo.sipIn -= dt;
      if (memo.sipIn <= 0) {
        mind.drinkingFrom?.sip();
        mind.ctx.voice?.noise('lap');
        memo.sipIn = span(CAT_TIMING.sip);
      }
      if (mind.timer <= 0) {
        mind.thirst = 0;
        mind.enter('idle');
      }
    },
    describe: 'is drinking',
    calm: true,
  }),
  groom: withMemo({
    memo: () => ({ lickIn: 1 }),
    enter(mind) {
      mind.ctx.body.setPose('groom');
      mind.timer = span(CAT_TIMING.groom);
      mind.groomIn = Infinity;
    },
    tick(mind, dt, memo) {
      // A soft, sparse lick of the tongue on fur (far quieter than lapping water).
      memo.lickIn -= dt;
      if (memo.lickIn <= 0) {
        mind.ctx.voice?.noise('lick');
        memo.lickIn = span(CAT_TIMING.groomLick);
      }
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: 'is washing · pet',
    invitable: true,
    calm: true,
  }),
  window: withMemo({
    memo: () => ({ glanceIn: 0 }),
    enter(mind) {
      mind.ctx.body.setPose('sit');
      mind.faceIfAny();
      mind.timer = span(CAT_TIMING.window);
    },
    tick(mind, dt, memo) {
      // Something out there, held for a moment, then a quick flick of the eyes to the next (a bird, a car); the ears prick at some.
      memo.glanceIn -= dt;
      if (memo.glanceIn <= 0) {
        const { facing, tmp } = mind;
        tmp.subVectors(facing, mind.ctx.cat.position).setY(0).normalize();
        const side = THREE.MathUtils.randFloatSpread(1.4);
        mind.lookPoint.set(facing.x - tmp.z * side, HEAD_HEIGHT + rand(0, 0.6), facing.z + tmp.x * side);
        memo.glanceIn = chance(0.25) ? rand(0.3, 0.6) : rand(1.2, 3.5);
        if (chance(0.3)) {
          mind.ctx.body.prick();
          // A bird out there: now and then a chirp, or the teeth-chattering it makes at prey it cannot reach.
          if (chance(CAT_TIMING.windowCall)) mind.ctx.voice?.meow(chance(0.5) ? 'chirp' : 'chatter');
        }
      }
      mind.gazeTarget.copy(mind.lookPoint);
      mind.hasGaze = true;
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: 'is watching the street',
    invitable: true,
    calm: true,
  }),
  tvWatch: withMemo({
    memo: () => ({ lookIn: 0 }),
    enter(mind) {
      mind.ctx.body.setPose('sit');
      mind.faceIfAny();
      mind.timer = span(CAT_TIMING.tvWatch);
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
        memo.lookIn = span(CAT_TIMING.tvLook);
      }
      mind.gazeTarget.copy(mind.lookPoint);
      mind.hasGaze = true;
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: 'is watching TV',
    invitable: true,
    calm: true,
  }),
  sunbathe: withMemo({
    /** Until the next check that the sun patch is still under it. */
    memo: () => ({ checkIn: 3 }),
    enter(mind) {
      mind.ctx.body.setPose(chance(0.5) ? 'lie' : 'loaf');
      mind.faceIfAny();
      mind.timer = span(CAT_TIMING.sunbathe);
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
    describe: 'is sunbathing · pet',
    followsPlayer: true,
    calm: true,
  }),
  scratch: withMemo({
    memo: () => ({ strokeIn: 0.5 }),
    enter(mind) {
      mind.ctx.body.setPose('scratch');
      mind.faceIfAny(false);
      mind.timer = span(CAT_TIMING.scratch);
    },
    tick(mind, dt, memo) {
      memo.strokeIn -= dt;
      if (memo.strokeIn <= 0) {
        mind.ctx.scratcher?.scratched();
        mind.ctx.voice?.noise('claws');
        memo.strokeIn = span(CAT_TIMING.scratchStroke);
      }
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: SCRATCHING,
    calm: true,
  }),
  rugScratch: withMemo({
    memo: () => ({ strokeIn: 0.4 }),
    enter(mind) {
      // Low on the rug, front paws kneading and pulling at the pile in turn.
      mind.ctx.body.setPose('knead');
      mind.timer = span(CAT_TIMING.rugScratch);
    },
    tick(mind, dt, memo) {
      memo.strokeIn -= dt;
      if (memo.strokeIn <= 0) {
        mind.ctx.voice?.noise('rug');
        memo.strokeIn = span(CAT_TIMING.rugStroke);
      }
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: SCRATCHING,
  }),
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
      mind.timer = span(CAT_TIMING.toyStalk);
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
      mind.timer = CAT_TIMING.toyWatch;
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
      mind.timer = span(CAT_TIMING.flyStalk);
      // Where the fly settles next (it flies there: `CatFly`); the cat chirps at it now and then.
      mind.lookPoint.copy(mind.ctx.cat.position);
      mind.lookPoint.x += THREE.MathUtils.randFloatSpread(1.2);
      mind.lookPoint.z += THREE.MathUtils.randFloatSpread(1.2);
      mind.lookPoint.y = rand(0.3, 0.7);
      mind.ctx.body.prick();
      if (chance(0.3)) mind.ctx.voice?.meow('chirp');
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
      // At the fly: to the floor under it (a metre at most), paws reaching the last bit.
      const { cat, nav } = mind.ctx;
      const { tmp, tmp2 } = mind;
      tmp2.subVectors(mind.lookPoint, cat.position).setY(0);
      const distance = tmp2.length();
      if (distance > 1e-3) tmp2.divideScalar(distance);
      tmp.copy(cat.position).setY(0).addScaledVector(tmp2, THREE.MathUtils.clamp(distance - FLY_REACH, 0.2, 1));
      nav.clampInside(tmp);
      if (!nav.isFree(tmp) && !nav.randomFreePoint(tmp, tmp.clone(), 0.3)) {
        mind.enter('idle');
        return;
      }
      mind.ctx.body.setPose('pounce');
      mind.ctx.motion.hopTo(tmp, 0.35);
    },
    tick(mind) {
      mind.gazeTarget.copy(mind.lookPoint);
      mind.hasGaze = true;
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
      // Only a charge gets the hiss; a player merely stepping too close gets a grumble and a flinch.
      mind.ctx.voice?.meow(mind.startledBy === 'crowd' ? 'grumble' : chance(0.5) ? 'hiss' : 'yowl');
      // Read once: any other startle (not set by the player's approach) is a fright.
      mind.startledBy = 'sprint';
      mind.setPurr(false);
      mind.timer = CAT_TIMING.startle;
    },
    tick(mind) {
      // Caught mid-leap: it lands first.
      if (mind.ctx.motion.hopping) return;
      if (mind.timer <= 0) {
        mind.startleCooldown = CAT_TIMING.startleCooldown;
        mind.startActivity('flee');
      }
    },
    describe: RUNNING_OFF,
    startles: false,
  },
  petted: withMemo({
    /** Whether it goes back to lying down (it was resting, or up on a perch) rather than about its day. */
    memo: () => ({ resumeRest: false, blinkIn: 0 }),
    enter(mind, memo) {
      mind.ctx.motion.stop();
      memo.resumeRest = mind.perch !== null || mind.previous === 'lie' || mind.previous === 'sunbathe' || mind.previous === 'stretch';
      mind.ctx.body.setPose(memo.resumeRest ? 'lie' : 'sit');
      mind.setPurr(true);
      mind.timer = span(CAT_TIMING.petted);
      memo.blinkIn = rand(0.8, 1.6);
    },
    tick(mind, dt, memo) {
      memo.blinkIn -= dt;
      if (memo.blinkIn <= 0) {
        mind.ctx.body.slowBlink();
        memo.blinkIn = span(CAT_TIMING.pettedBlink);
      }
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
  lap: withMemo({
    memo: () => ({ blinkIn: 2 }),
    enter(mind) {
      mind.ctx.body.setPose('lie');
      mind.setPurr(true);
      mind.ctx.voice?.meow('trill');
      if (mind.perch?.facing) mind.setFacing(mind.perch.facing);
      mind.faceIfAny();
    },
    // Purring on the lap until the player stands up (see `CatBrain.setPlayerSeat`), slow-blinking now and then.
    tick(mind, dt, memo) {
      memo.blinkIn -= dt;
      if (memo.blinkIn <= 0) {
        mind.ctx.body.slowBlink();
        memo.blinkIn = span(CAT_TIMING.lapBlink);
      }
    },
    describe: 'is on your lap · pet',
    startles: false,
    followsPlayer: true,
  }),
  called: {
    enter(mind) {
      mind.ctx.body.setPose('sit');
      mind.setFacing(mind.eye);
      mind.faceIfAny();
      mind.ctx.voice?.meow(chance(0.5) ? 'trill' : 'greet');
      mind.timer = span(CAT_TIMING.called);
    },
    tick(mind) {
      if (mind.timer <= 0) mind.enter('idle');
    },
    describe: 'came to see you · pet',
    followsPlayer: true,
  },
  treat: withMemo({
    /** First up at the hand, sniffing; then down to the one dropped by its paws, crunching. */
    memo: () => ({ eating: false, crunchIn: 0.3 }),
    enter(mind) {
      mind.ctx.body.setPose('sit');
      mind.setFacing(mind.eye);
      mind.faceIfAny();
      mind.ctx.voice?.meow('trill');
      mind.timer = span(CAT_TIMING.treatSniff);
    },
    tick(mind, dt, memo) {
      if (!memo.eating) {
        // Nose up to the hand holding it.
        mind.gazeTarget.set(mind.eye.x, Math.max(0.3, mind.eye.y - 0.7), mind.eye.z);
        mind.hasGaze = true;
        if (mind.timer <= 0) {
          memo.eating = true;
          mind.ctx.body.setPose('eat');
          mind.timer = span(CAT_TIMING.treatCrunch);
        }
        return;
      }
      memo.crunchIn -= dt;
      if (memo.crunchIn <= 0) {
        mind.ctx.voice?.noise('crunch', 0.8);
        memo.crunchIn = rand(0.25, 0.45);
      }
      if (mind.timer <= 0) {
        mind.hunger = Math.max(0, mind.hunger - TREAT_FILLS);
        mind.enter('idle');
      }
    },
    describe: (mind) => (mind.memo as { eating?: boolean } | undefined)?.eating ? 'is crunching a treat' : 'wants that treat',
    startles: false,
    followsPlayer: true,
  }),
};

/**
 * Idling postures: a cat already sitting or standing stays so (up on a perch, lying down too); only
 * out of anything else (a meal, a stretch, a pounce) does it pick one, lying down on a perch.
 */
function keepOrSettle(mind: CatMind): void {
  const { body } = mind.ctx;
  const pose = body.pose;
  if (mind.perch) {
    if (pose !== 'lie' && pose !== 'sit' && pose !== 'loaf') body.setPose('lie');
    return;
  }
  if (pose !== 'sit' && pose !== 'stand') body.setPose(chance(0.6) ? 'sit' : 'stand');
}

function sleepDuration(mind: CatMind): number {
  const drive = mind.sleepDrive();
  if (drive >= 0.7) return rand(110, 200);
  if (drive >= 0.4) return rand(50, 90);
  return rand(20, 40);
}

/**
 * Bats the toy on, the way the paw came: along the cat-to-ball direction, spread wider with every
 * try that finds the way blocked; hemmed in, a gentle tap wherever. The bell jingles as it rolls.
 */
function nudgeToy(mind: CatMind): void {
  const { toy, nav, cat } = mind.ctx;
  if (!toy) return;
  const { tmp, tmp2, goal } = mind;
  toy.getWorldPosition(tmp).setY(0);
  tmp2.subVectors(tmp, cat.position).setY(0);
  const ahead = tmp2.lengthSq() > 1e-4 ? Math.atan2(tmp2.x, tmp2.z) : Math.random() * Math.PI * 2;
  for (let i = 0; i < 8; i++) {
    const angle = ahead + THREE.MathUtils.randFloatSpread(NUDGE_SPREAD * (1 + i * 0.5));
    tmp2.set(Math.sin(angle), 0, Math.cos(angle));
    goal.copy(tmp).addScaledVector(tmp2, 0.8);
    if (nav.isFree(goal) && nav.segmentFree(tmp, goal)) {
      const speed = rand(1.2, 1.7);
      toy.nudge(tmp2, speed);
      mind.ctx.voice?.noise('ball', speed / 1.7);
      return;
    }
  }
  tmp2.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
  toy.nudge(tmp2, 0.8);
  mind.ctx.voice?.noise('ball', 0.4);
}

/** Spread (radians, full width) of the first try at batting the ball straight on. */
const NUDGE_SPREAD = 0.8;
