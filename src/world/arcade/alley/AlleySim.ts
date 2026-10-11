import * as THREE from 'three';
import type { SfxEvent } from '@/audio/ChipSpeaker';
import { SoundQueue } from '../SoundQueue';
import { type ArcadeControls, NO_CONTROLS } from '../games/ArcadeGame';
import { random } from '@/random';

/*
 * The ball alley's rules and the ball's path, machine-local in metres (origin on the floor under
 * the middle of the lane, +z the player's end). Pure: vectors and numbers, no scene objects; the
 * `AlleyRoller` builds the model to these sizes and moves its ball to match every frame.
 */

export const LANE_W = 0.56;
/** The lane, from the player's end (near) up to the hump (far): z and height of its surface. */
export const LANE_NEAR = { z: 1.0, y: 0.78 };
export const LANE_FAR = { z: -0.4, y: 0.92 };
/** The target board: its front edge at the hump, tilted up to its back edge. */
export const BOARD_FRONT = { z: -0.5, y: 0.96 };
export const BOARD_BACK = { z: -1.08, y: 1.34 };
export const BOARD_W = 0.6;
export const BALL_R = 0.045;
export const BALLS = 9;
/** The rings' centre on the board (u across, v up the board from its front edge, metres) and the corner pockets. */
export const RING_CENTRE = { u: 0, v: 0.36 };
export const RINGS = [
  { within: 0.05, points: 50 },
  { within: 0.1, points: 40 },
  { within: 0.15, points: 30 },
  { within: 0.21, points: 20 },
];
export const POCKETS = [
  { u: -0.22, v: 0.62 },
  { u: 0.22, v: 0.62 },
];
export const POCKET_R = 0.04;
const POCKET_POINTS = 100;
/** The lit pocket (one of the two, a new one each ball) pays double. */
const LIT_POCKET_POINTS = 200;
/** Balls in a row into the 40 or better make a hot streak: each one after the second pays this on top. */
const HOT_FROM = 40;
const HOT_AFTER = 2;
const HOT_BONUS = 30;
export const BOARD_V = Math.hypot(BOARD_BACK.z - BOARD_FRONT.z, BOARD_BACK.y - BOARD_FRONT.y);
/** The board's normal (up and towards the player), for things lying on it. */
export const BOARD_NORMAL = new THREE.Vector3(0, BOARD_FRONT.z - BOARD_BACK.z, BOARD_BACK.y - BOARD_FRONT.y).normalize();
/**
 * The hole each ring drains into, at the bottom of its band (the 50's in the middle), and the gutter
 * along the board's front edge that takes a 10: a ball that lands in a ring rolls down into its hole.
 */
export const HOLES: readonly { points: number; u: number; v: number; r: number }[] = RINGS.map((ring, i) => {
  const inner = i === 0 ? 0 : RINGS[i - 1]!.within;
  return i === 0
    ? { points: ring.points, u: RING_CENTRE.u, v: RING_CENTRE.v, r: 0.032 }
    : { points: ring.points, u: RING_CENTRE.u, v: RING_CENTRE.v - (inner + ring.within) / 2, r: Math.min(0.028, (ring.within - inner) * 0.48) };
});
/** Aim: how fast the ball in hand moves across, and how far. */
const AIM_SPEED = 0.35;
const AIM_MAX = LANE_W / 2 - BALL_R - 0.02;
/** The power meter swings up and down while fire is held (a full swing in this many seconds). */
const POWER_PERIOD = 1.1;
/** How well the machine's own regular rolls (0..1), when the one at it does not say. */
const REGULAR_SKILL = 0.7;

type AlleyPhase = 'aim' | 'roll' | 'fly' | 'settle' | 'sink' | 'back';

/**
 * ALLEY ROLL's play: nine balls; with one in hand, left / right move it across the lane and fire
 * held swings the power meter up and down; let go and it rolls at that strength, slows up the
 * lane, flies over the hump, lands on the board and rolls down into its ring's hole (10 to 50, 100
 * in a corner pocket, 200 in the pocket lit for this ball), or, too soft, rolls back for nothing.
 * Balls in a row into the 40 or better heat up (each after the second pays a little more) and the
 * last ball counts double. Where it lands follows the power and a little luck. The `autopilot` is
 * a regular's hands.
 */
export class AlleySim {
  /** The ball in play (its centre) and how far it has turned about x. */
  readonly ball = new THREE.Vector3();
  spin = 0;
  /** Whether the ball in play shows, and how many wait in the trough (the one in hand is not in it). */
  ballShown = true;
  waiting = BALLS - 1;
  points = 0;
  ballsLeft = BALLS;
  /** The last ball's points (0 a miss), null before the first; and what made it special (LIT POCKET!, HOT STREAK...). */
  lastPoints: number | null = null;
  lastNote: string | null = null;
  /** The meter, 0..1, and where it was let go last time (null before the first ball). */
  power = 0;
  lastPower: number | null = null;
  /** The pocket lit for this ball (0 left, 1 right). */
  litPocket = 0;
  /** Balls in a row into the 40 or better. */
  hot = 0;
  /** Where the lane's ball in hand is across (m from the middle). */
  aimU = 0;
  private currentPhase: AlleyPhase = 'aim';
  private phaseClock = 0;
  private charging = false;
  private chargeClock = 0;
  private flightFrom = new THREE.Vector3();
  private flightTo = new THREE.Vector3();
  private holeAt = new THREE.Vector3();
  private landing: { u: number; v: number; points: number } = { u: 0, v: 0, points: 0 };
  private rollSeconds = 1;
  private demoTarget = { u: 0, power: 0.4, holdFor: 0.5 };
  private demoClock = 0;
  private readonly sounds = new SoundQueue();

  constructor() {
    this.resetBall(true);
  }

  get phase(): AlleyPhase {
    return this.currentPhase;
  }

  /** Seconds into the current phase. */
  get phaseTime(): number {
    return this.phaseClock;
  }

  /** The ball in hand is the last: it counts double. */
  get lastBall(): boolean {
    return this.ballsLeft === 1;
  }

  /** The sounds of this frame, oldest first. */
  takeSounds(): SfxEvent[] {
    return this.sounds.take();
  }

  /** Nine balls, no points; `attract` when nobody is at it (the ball and a full trough on show). */
  newGame(attract: boolean): void {
    this.points = 0;
    this.ballsLeft = BALLS;
    this.lastPoints = null;
    this.lastNote = null;
    this.lastPower = null;
    this.hot = 0;
    this.aimU = 0;
    this.litPocket = 0;
    this.resetBall(attract);
  }

  /** One frame of the play; true once the last ball is back and none is in hand. */
  play(dt: number, controls: ArcadeControls): boolean {
    this.advance(dt, controls);
    return this.ballsLeft === 0 && this.currentPhase === 'aim';
  }

  /** A regular (`skill` 0..1): aims at the rings (or, feeling lucky, the lit pocket), holds for about the right power. */
  autopilot(dt: number, skill = REGULAR_SKILL): ArcadeControls {
    const out: ArcadeControls = { ...NO_CONTROLS };
    if (this.currentPhase !== 'aim') return out;
    if (!this.charging && this.phaseClock === 0) {
      const pocket = random() < 0.1 + skill * 0.2 ? POCKETS[this.litPocket]! : null;
      const off = 1.4 - skill;
      const u = pocket ? pocket.u : RING_CENTRE.u + (random() - 0.5) * 0.06 * off;
      const v = pocket ? pocket.v : RING_CENTRE.v;
      const power = THREE.MathUtils.clamp((v - 0.04) / 0.72 + (random() - 0.5) * 0.17 * off, 0.15, 1);
      // Once lined up: a beat's wait, then fire held until the meter has climbed to that power on its first way up.
      this.demoTarget = { u, power, holdFor: 0.6 + power * (POWER_PERIOD / 2) };
      this.demoClock = 0;
    }
    const diff = this.demoTarget.u - this.aimU;
    if (Math.abs(diff) > 0.01 && !this.charging) {
      out.left = diff < 0;
      out.right = diff > 0;
      return out;
    }
    this.demoClock += dt;
    out.fire = this.demoClock > 0.6 && this.demoClock < this.demoTarget.holdFor;
    return out;
  }

  /** Aim and power with the ball in hand, then the ball's roll, flight, roll down the board and drop. */
  private advance(dt: number, controls: ArcadeControls): void {
    this.phaseClock += dt;
    switch (this.currentPhase) {
      case 'aim': {
        if (this.ballsLeft === 0) return;
        const dir = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
        this.aimU = THREE.MathUtils.clamp(this.aimU + dir * AIM_SPEED * dt, -AIM_MAX, AIM_MAX);
        if (controls.fire) {
          if (!this.charging) {
            this.charging = true;
            this.chargeClock = 0;
          }
          this.chargeClock += dt;
          // A triangle wave: up to full over half a period, back down, and again.
          const t = (this.chargeClock % POWER_PERIOD) / POWER_PERIOD;
          this.power = t < 0.5 ? t * 2 : 2 - t * 2;
        } else if (this.charging) {
          this.charging = false;
          this.roll();
        }
        this.placeBallInHand();
        break;
      }
      case 'roll': {
        const t = Math.min(1, this.phaseClock / this.rollSeconds);
        // Slowing as it climbs: position eases out.
        const s = 1 - (1 - t) * (1 - t);
        const soft = this.landing.points < 0;
        const reach = soft ? 0.6 : 1;
        this.ball.set(
          THREE.MathUtils.lerp(this.aimU, this.aimU * 0.95, s),
          THREE.MathUtils.lerp(LANE_NEAR.y, LANE_FAR.y, s * reach) + BALL_R,
          THREE.MathUtils.lerp(LANE_NEAR.z - 0.02, LANE_FAR.z, s * reach),
        );
        this.spin -= dt * 20;
        if (t >= 1) {
          if (soft) this.enterPhase('back');
          else {
            this.flightFrom.copy(this.ball);
            onBoard(this.landing.u, this.landing.v, this.flightTo);
            this.enterPhase('fly');
          }
        }
        break;
      }
      case 'fly': {
        const t = Math.min(1, this.phaseClock / 0.35);
        this.ball.lerpVectors(this.flightFrom, this.flightTo, t);
        this.ball.y += Math.sin(t * Math.PI) * 0.12;
        if (t >= 1) {
          this.sounds.push('thud');
          // It rolls down the board into the hole of the ring it landed in (or the gutter, or the pocket it dropped in).
          const hole = holeFor(this.landing);
          onBoard(hole.u, hole.v, this.holeAt);
          this.flightFrom.copy(this.ball);
          this.enterPhase('settle');
        }
        break;
      }
      case 'settle': {
        const t = Math.min(1, this.phaseClock / 0.3);
        const s = t * t;
        this.ball.lerpVectors(this.flightFrom, this.holeAt, s);
        this.spin += dt * 12;
        if (t >= 1) this.enterPhase('sink');
        break;
      }
      case 'sink': {
        const t = Math.min(1, this.phaseClock / 0.25);
        this.ball.copy(this.holeAt).addScaledVector(BOARD_NORMAL, -t * BALL_R * 2.2);
        if (t >= 1) {
          this.score(this.landing.points);
          this.resetBall(false);
        }
        break;
      }
      case 'back': {
        // Too soft: it rolls back down to the trough.
        const t = Math.min(1, this.phaseClock / 0.8);
        this.ball.z = THREE.MathUtils.lerp(this.ball.z, LANE_NEAR.z, t);
        this.ball.y = THREE.MathUtils.lerp(this.ball.y, LANE_NEAR.y + BALL_R, t);
        this.spin += dt * 14;
        if (t >= 1) {
          this.lastPoints = 0;
          this.lastNote = null;
          this.hot = 0;
          this.sounds.push('lose');
          this.resetBall(false);
        }
        break;
      }
    }
  }

  /** A ball home: its points (the lit pocket's, the hot streak's, doubled on the last ball), and the sound of it. */
  private score(base: number): void {
    const wasLast = this.ballsLeft === 0;
    let points = base;
    let note: string | null = null;
    if (base >= HOT_FROM) this.hot += 1;
    else this.hot = 0;
    if (base === LIT_POCKET_POINTS) note = 'LIT POCKET!';
    if (this.hot > HOT_AFTER) {
      points += HOT_BONUS;
      note ??= 'HOT STREAK!';
    }
    if (wasLast) {
      points *= 2;
      note = note ? `${note} x2` : 'LAST BALL x2';
    }
    this.points += points;
    this.lastPoints = points;
    this.lastNote = points > 0 ? note : null;
    this.sounds.push(base >= POCKET_POINTS ? 'bonus' : base >= 40 ? 'score' : 'blip', 1 + Math.min(base, 100) / 200 + (this.hot > HOT_AFTER ? 0.15 : 0));
    if (note && base >= POCKET_POINTS) this.sounds.push('win');
  }

  /** Lets go: where it lands follows the power (and a little luck); too soft, it never clears the hump. */
  private roll(): void {
    const power = this.power;
    this.lastPower = power;
    this.ballsLeft -= 1;
    this.syncTrough(false);
    this.sounds.push('roll');
    this.rollSeconds = 0.9 - power * 0.35;
    if (power < 0.12) {
      this.landing = { u: this.aimU, v: 0, points: -1 };
      this.enterPhase('roll');
      return;
    }
    const noise = (): number => (random() + random() - 1) * 0.035;
    let v = 0.04 + power * 0.72 + noise();
    // Over the top: it hits the back of the cage and drops somewhere on the upper board.
    if (v > BOARD_V - 0.02) v = BOARD_V - 0.1 - random() * 0.2;
    const u = THREE.MathUtils.clamp(this.aimU * 1.05 + noise(), -BOARD_W / 2 + 0.05, BOARD_W / 2 - 0.05);
    this.landing = { u, v, points: this.scoreAt(u, v) };
    this.enterPhase('roll');
  }

  /** The next ball in hand (`attract`: nobody at the machine, so it and a full trough show); a pocket lights for it. */
  private resetBall(attract: boolean): void {
    this.currentPhase = 'aim';
    this.phaseClock = 0;
    this.power = 0;
    this.charging = false;
    this.syncTrough(attract);
    this.placeBallInHand();
    this.ballShown = this.ballsLeft > 0 || attract;
    this.litPocket = random() < 0.5 ? 0 : 1;
  }

  private enterPhase(phase: AlleyPhase): void {
    this.currentPhase = phase;
    this.phaseClock = 0;
  }

  private placeBallInHand(): void {
    this.ball.set(this.aimU, LANE_NEAR.y + BALL_R + 0.01, LANE_NEAR.z - 0.02);
  }

  /** The waiting balls in the trough: one fewer per ball rolled (the one in hand is not in it). */
  private syncTrough(attract: boolean): void {
    this.waiting = attract ? BALLS - 1 : Math.max(0, this.ballsLeft - 1);
  }

  /** Points for a ball that lands at (u, v) on the board: a corner pocket (the lit one double), else the ring it drops into, else the 10 at the bottom. */
  private scoreAt(u: number, v: number): number {
    for (const [i, p] of POCKETS.entries()) if (Math.hypot(u - p.u, v - p.v) <= POCKET_R) return i === this.litPocket ? LIT_POCKET_POINTS : POCKET_POINTS;
    const d = Math.hypot(u - RING_CENTRE.u, v - RING_CENTRE.v);
    return RINGS.find((r) => d <= r.within)?.points ?? 10;
  }
}

/** The centre of a ball resting on the target board at `u` across, `v` up the board from its front edge. */
function onBoard(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  return boardPoint(u, v, out).addScaledVector(BOARD_NORMAL, BALL_R);
}

/** A point on the target board's surface: `u` across, `v` up the board from its front edge. */
export function boardPoint(u: number, v: number, out = new THREE.Vector3()): THREE.Vector3 {
  const t = v / BOARD_V;
  return out.set(u, THREE.MathUtils.lerp(BOARD_FRONT.y, BOARD_BACK.y, t), THREE.MathUtils.lerp(BOARD_FRONT.z, BOARD_BACK.z, t));
}

/** Where a landed ball drops: the pocket it is in, its ring's hole, or (a 10) the gutter along the front edge below it. */
function holeFor(landing: { u: number; v: number; points: number }): { u: number; v: number } {
  if (landing.points >= POCKET_POINTS) return POCKETS.reduce((a, b) => (Math.hypot(landing.u - a.u, landing.v - a.v) <= Math.hypot(landing.u - b.u, landing.v - b.v) ? a : b));
  const hole = HOLES.find((h) => h.points === landing.points);
  return hole ?? { u: landing.u, v: 0.01 };
}
