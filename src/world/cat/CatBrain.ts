import type * as THREE from 'three';
import type { Seat } from '../Seat';
import type { CatBedLike, CatBody, CatClock, CatPlayerView, CatToyLike, CatVoiceLike, FoodBowlLike, ScratcherLike, WaterBowlLike } from './types';
import type { FloorNav } from '../nav/FloorNav';
import type { CatMotion } from './CatMotion';
import type { CatPerch, WindowLookout } from './spots';
import { CatMind } from './CatMind';
import { CAT_TIMING, STATES, type CatState } from './catStates';
import { chance } from './random';
import { placeForMorning } from './morning';

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
  nav: FloorNav;
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

type PetOutcome = 'purr' | 'woke' | 'annoyed' | 'busy';
type CallOutcome = 'coming' | 'ignored' | 'asleep';

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
 * The clock jumping this far ahead in one frame (in-game hours), from bedtime hours, is a sleep (by
 * day only a pastime leaps, under `NIGHT_H`): a frame's own tick is a few thousandths of an hour. A leap of `NIGHT_H` or more
 * is a night (it wakes hungry); any leap into the morning hours puts the cat where a cat is at breakfast.
 */
const TIME_SKIP_H = 0.5;
const NIGHT_H = 3;
/** The hours the bed sends the player to sleep in (`game/Sleep`'s `SLEEPY`): a short leap counts as a sleep only from these. */
const BEDTIME = { from: 20, until: 5 };
/** Fed up, it grumbles at most this often (s); strokes in between only get a flick of the tail. */
const GRUMBLE_EVERY_S = 4;
/** Asleep this long (s) before the breathing turns into a snore, and only one nap in `SNORE_CHANCE`. */
const SNORE_AFTER_S = [20, 40] as const;
const SNORE_CHANCE = 0.5;
/** A refilled bowl fetches a cat this hungry from this near (m, floor distance), at a trot. */
const REFILL_CALLS = { hunger: 0.45, distance: 6 };
/** Up and about, at nothing it would mind dropping: an open front door may tempt it out (`CatOuting`). */
const ROAMING: readonly CatState[] = ['idle', 'lookAround', 'walk', 'rub', 'groom', 'stretch'];
/** Back in from the stairs, it stays home a while before wandering off round the flat again (s). */
const BACK_INDOORS_EXPLORE_S = 60;
/** Busy at something of its own: a stroke gets a purr and a slow blink, and it carries on. */
const CARRIES_ON: readonly CatState[] = ['eat', 'drink', 'scratch'];
/** States a refilled bowl does not interrupt: asleep, busy with the player, in flight, already at the bowl. */
const DEAF_TO_BOWL: readonly CatState[] = ['sleep', 'halfWake', 'lap', 'petted', 'startle', 'flee', 'hop', 'mount', 'mountLap', 'begin', 'eat', 'beg', 'treat'];

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
  private lastHours = NaN;
  private lastBowl = NaN;
  /** Petted while busy: the purr stops after this long. */
  private purrFor = 0;
  private lastGrumble = -Infinity;
  /** This nap's snore: from how far into it (s; Infinity: a quiet nap). */
  private snoreAfter = Infinity;

  constructor(private readonly ctx: CatBrainContext) {
    this.mind = new CatMind(ctx);
    this.mind.enter('idle');
  }

  /** Something bought for it after it moved in (the scratching post, the ball): from now on it may go to it. */
  provide(things: Pick<CatBrainContext, 'scratcher' | 'toy'>): void {
    Object.assign(this.ctx, things);
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
    if (this.purrFor > 0) {
      this.purrFor -= dt;
      // (On the lap or being stroked, those states own the purr.)
      if (this.purrFor <= 0 && mind.state !== 'lap' && mind.state !== 'petted') mind.setPurr(false);
    }

    this.ctx.player.getEyePosition(mind.eye);
    mind.playerDistance = Math.hypot(mind.eye.x - this.ctx.cat.position.x, mind.eye.z - this.ctx.cat.position.z);

    mind.hasGaze = false;
    this.noticeTimeSkip();
    this.noticeRefill();
    this.observePlayer(dt);
    this.tick(dt);
    this.applyGaze();
    if (mind.state !== 'sleep') this.snoreAfter = Math.random() < SNORE_CHANCE ? SNORE_AFTER_S[0] + Math.random() * (SNORE_AFTER_S[1] - SNORE_AFTER_S[0]) : Infinity;
    this.ctx.voice?.setSnoring(mind.state === 'sleep' && this.ctx.body.pose === 'sleep' && mind.age > this.snoreAfter);
  }

  /** The fly it is chasing (a point in its parent's frame), or null. */
  get fly(): THREE.Vector3 | null {
    return this.mind.flying ? this.mind.lookPoint : null;
  }

  /** The player strokes the cat. */
  pet(): PetOutcome {
    const mind = this.mind;
    if (this.ctx.motion.hopping) return 'busy';
    this.petTimes.push(this.now);
    while (this.petTimes.length && this.now - this.petTimes[0]! > PET_WINDOW_S) this.petTimes.shift();
    if (this.annoyedFor > 0) {
      this.ctx.body.flick();
      this.grumble();
      return 'annoyed';
    }
    if (this.petTimes.length >= PETS_BEFORE_ANNOYED) {
      this.petTimes.length = 0;
      this.annoyedFor = ANNOYED_S;
      this.ctx.body.flick();
      this.grumble();
      mind.setPurr(false);
      if (mind.state === 'lap') this.lapCooldown = CAT_TIMING.lapCooldownAnnoyed;
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
    if (CARRIES_ON.includes(mind.state)) {
      mind.setPurr(true);
      this.ctx.body.slowBlink();
      this.purrFor = CAT_TIMING.purrWhileBusy;
      return 'purr';
    }
    mind.enter('petted');
    return 'purr';
  }

  /** A grumble, unless it grumbled a moment ago (the flick of the tail says enough then). */
  private grumble(): void {
    if (this.now - this.lastGrumble < GRUMBLE_EVERY_S) return;
    this.lastGrumble = this.now;
    this.ctx.voice?.meow('grumble');
  }

  /** The player calls the cat; `treats` (the jar rattled) always fetches an awake cat that is free to come. */
  call(treats = false): CallOutcome {
    const state = this.mind.state;
    if (state === 'sleep' || state === 'halfWake') {
      this.ctx.body.flick();
      return 'asleep';
    }
    if (treats) {
      // Nothing but being mid-leap (or already at it) keeps a cat from a treat, not even a grudge.
      if (state === 'startle' || state === 'hop' || state === 'treat') return 'ignored';
      this.ctx.body.prick();
      this.mind.startActivity('treat');
      return 'coming';
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
      this.lapCooldown = CAT_TIMING.lapCooldownStood;
      mind.startActivity('none');
    }
  }

  get isAsleep(): boolean {
    return this.mind.state === 'sleep' || this.mind.state === 'halfWake';
  }

  /** Up and about on the floor, at nothing it would not drop (`CatOuting`: free to slip out of an open front door). */
  get roaming(): boolean {
    return this.mind.perch === null && ROAMING.includes(this.mind.state);
  }

  /** Back from outside (`CatOuting`): no perch, no errand, a fresh look round. */
  resume(): void {
    const mind = this.mind;
    mind.perch = null;
    mind.spot = null;
    mind.pending = 'none';
    mind.setPurr(false);
    mind.exploreCooldown = BACK_INDOORS_EXPLORE_S;
    mind.enter('idle');
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

  /** The clock leapt forward (a night in bed): come the morning, the cat is wherever a cat would be by then. */
  private noticeTimeSkip(): void {
    const hours = this.ctx.clock.state.hours;
    const last = this.lastHours;
    this.lastHours = hours;
    if (Number.isNaN(last)) return;
    const ahead = (((hours - last) % 24) + 24) % 24;
    // A pastime winds the clock on too (under 3 h, `HOUSEHOLD.pastimeMaxMinutes`), by day: only a leap from
    // bedtime hours (`game/Sleep`'s evening and small hours) is a short night; any other leap must be a night's length.
    const fromBedtime = last >= BEDTIME.from || last < BEDTIME.until;
    if (ahead < (fromBedtime ? TIME_SKIP_H : NIGHT_H)) return;
    this.petTimes.length = 0;
    this.annoyedFor = 0;
    this.lapCooldown = 0;
    placeForMorning(this.mind, ahead >= NIGHT_H);
  }

  /** The bowl was just filled: a hungry cat nearby trots over. */
  private noticeRefill(): void {
    const mind = this.mind;
    const level = this.ctx.bowl.level;
    const last = this.lastBowl;
    this.lastBowl = level;
    if (Number.isNaN(last) || level <= last + 0.2) return;
    if (mind.hunger < REFILL_CALLS.hunger || DEAF_TO_BOWL.includes(mind.state)) return;
    this.ctx.bowl.getWorldPosition(mind.tmp);
    const cat = this.ctx.cat.position;
    if (Math.hypot(mind.tmp.x - cat.x, mind.tmp.z - cat.z) > REFILL_CALLS.distance) return;
    this.ctx.body.prick();
    this.ctx.voice?.meow('chirp');
    mind.startActivity('rushToBowl');
  }

  private observePlayer(dt: number): void {
    const mind = this.mind;
    const d = mind.playerDistance;
    if (mind.state === 'sleep') {
      if (d < CAT_TIMING.halfWakeWithin && chance(CAT_TIMING.halfWakeChance * dt)) {
        mind.sleepRemaining = mind.timer;
        mind.enter('halfWake');
      }
      return;
    }
    const def = STATES[mind.state];
    if (mind.startleCooldown <= 0 && def.startles !== false) {
      const sprinting = this.ctx.player.isSprinting && d < SPRINT_SCARE;
      // Settled, it lets a walking player come close enough to stroke it: only a sprint startles it.
      const crowded = d < PLAYER_TOO_CLOSE && mind.state !== 'called' && !def.calm;
      if (sprinting || crowded) {
        mind.startledBy = sprinting ? 'sprint' : 'crowd';
        mind.enter('startle');
        return;
      }
    }
    if (mind.playerSeat && !mind.perch && this.lapCooldown <= 0 && this.playerSeatedFor > LAP_AFTER_S && def.invitable && chance(CAT_TIMING.lapInvite * dt)) {
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

