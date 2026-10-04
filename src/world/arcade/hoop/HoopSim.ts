import * as THREE from 'three';
import type { SfxEvent } from '@/audio/ChipSpeaker';
import { SoundQueue } from '../SoundQueue';
import { type ArcadeControls, NO_CONTROLS } from '../games/ArcadeGame';
import { random } from '@/random';
import { damp } from '@/math/damp';

/*
 * HOOP FEVER's rules and ball physics, machine-local in metres (origin on the floor under the
 * middle of the cage, +z the player's end). Pure: vectors and numbers, no scene objects; the
 * `HoopShot` builds the cage to these sizes and moves its balls and hoop to match every frame.
 */

export const WIDTH = 0.96;
/** The cage, from the player's end (+z) to the backboard (-z). */
export const FRONT_Z = 0.95;
export const BACK_Z = -1.35;
export const CAGE_H = 2.55;
/** The ramp the balls roll back down: high at the back, low at the front gutter. */
export const RAMP = { backZ: -1.25, backY: 1.08, frontZ: 0.72, frontY: 0.86 };
export const GUTTER_Z = 0.8;
/** How hard the ramp pulls a ball back to the front (gravity along its slope, helped a little so nothing dawdles), m/s². */
const RAMP_PULL = 9.81 * Math.sin(Math.atan2(RAMP.backY - RAMP.frontY, RAMP.frontZ - RAMP.backZ)) * 1.6;
export const BALL_R = 0.09;
export const BALLS = 3;
export const HOOP = { x: 0, y: 2.0, z: -0.98, r: 0.21, tube: 0.012 };
export const BOARD = { z: -1.18, w: 0.8, h: 0.55, y: 2.12 };
const GRAVITY = 9.81;
const SUBSTEP = 1 / 240;
/** Where a throw goes when nothing says where the player looks (never live: the machine always hands the look over). */
const STRAIGHT_AHEAD = new THREE.Vector3(0, 0.2, -1).normalize();
/** What the roof net leaves of a ball's speed along it when the ball hits it. */
const ROOF_DRAG = 0.35;
/** Where the ball leaves the hand, machine-local, and how the throw works: speed from the meter, a lift above the look. */
export const RELEASE = new THREE.Vector3(0.08, 1.45, 0.62);
const THROW_SPEED: [number, number] = [3.2, 7.4];
const LIFT = 1.3;
const POWER_PERIOD = 1.2;
const ROUND_SECONDS = 30;
/** The final seconds pay more per basket. */
export const FINAL_SECONDS = 10;
const BASKET_POINTS = 20;
const FINAL_POINTS = 30;
/** Baskets in a row multiply (to this). */
export const STREAK_MAX = 3;
/** After this many baskets the hoop starts sliding from side to side; faster after twice as many. */
const MOVE_AFTER = 10;
const SLIDE = 0.2;

/** How a shot ended, for whoever threw it to react: in (clean or off the rim), out off the rim (so close), or out. */
export type HoopOutcome = 'basket' | 'swish' | 'rimOut' | 'miss';

export interface HoopBall {
  readonly pos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  /** In the gutter, in the air, or in a regular's hands (the `HoopShot` moves it with them). */
  state: 'rest' | 'flying' | 'held';
  /** Above the rim on this flight (a basket must come down through it). */
  above: boolean;
  scored: boolean;
  touched: boolean;
  /** Off the rim on this flight (a miss that did is a near thing). */
  rimmed: boolean;
}

/**
 * The round: thirty seconds, three balls that roll back down the ramp to the gutter. The player
 * holds fire (the meter swings) and lets go to throw along their look, lifted; a regular throws
 * the arc that would drop it in, with a little error. A basket pays 20 (30 in the last ten
 * seconds) times the run of baskets (to x3); a miss breaks the run; after ten baskets the hoop
 * slides, after twenty faster. The balls are simulated at 240 Hz: gravity, the rim as a tube, the
 * backboard, the back panel, the side and top nets, the ramp.
 */
export class HoopSim {
  readonly balls: HoopBall[] = [];
  points = 0;
  streak = 0;
  timeLeft = ROUND_SECONDS;
  /** Fire held: the meter swings, `power` 0..1. */
  charging = false;
  power = 0;
  /** The hoop's slide across, from its middle. */
  hoopX = 0;
  private baskets = 0;
  private chargeClock = 0;
  private slideClock = 0;
  private demoWait = 0;
  /** Seconds since the clock ran out: a ball balanced on the rim must not hold the round open for ever. */
  private overtime = 0;
  private readonly sounds = new SoundQueue();
  private outcomes: HoopOutcome[] = [];
  private flash: string | null = null;
  private readonly scratch = new THREE.Vector3();
  private readonly away = new THREE.Vector3();

  constructor() {
    for (let i = 0; i < BALLS; i++) this.balls.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), state: 'rest', above: false, scored: false, touched: false, rimmed: false });
    this.newGame();
  }

  /** The sounds of this frame, oldest first. */
  takeSounds(): SfxEvent[] {
    return this.sounds.take();
  }

  /** How the shots that ended this frame ended, oldest first. */
  takeOutcomes(): HoopOutcome[] {
    const outcomes = this.outcomes;
    this.outcomes = [];
    return outcomes;
  }

  /** The line to flash on the scoreboard (a basket, the hoop moving), once, or null. */
  takeFlash(): string | null {
    const flash = this.flash;
    this.flash = null;
    return flash;
  }

  /** A fresh round: the clock full, the balls back in the gutter, the hoop in the middle. */
  newGame(): void {
    this.points = 0;
    this.baskets = 0;
    this.streak = 0;
    this.timeLeft = ROUND_SECONDS;
    this.overtime = 0;
    this.charging = false;
    this.power = 0;
    this.hoopX = 0;
    this.slideClock = 0;
    this.demoWait = 0.8;
    this.outcomes = [];
    this.balls.forEach((b, i) => {
      b.state = 'rest';
      b.pos.set(-0.2 + i * 0.2, RAMP.frontY + BALL_R, GUTTER_Z);
      b.vel.set(0, 0, 0);
    });
  }

  /**
   * One frame of the round; true once it is over. `player` throws on fire's release along
   * `controls.look` (the player's view direction, machine-local, unit length); otherwise fire's press
   * is a regular's throw.
   */
  play(dt: number, controls: ArcadeControls, player: boolean): boolean {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.slide(dt);
    if (this.timeLeft > 0) {
      if (player) this.playerThrow(dt, controls);
      else if (controls.firePressed) this.regularThrow();
    }
    this.simulate(dt);
    // Over once the clock is out and nothing is in the air (or, at the latest, a few seconds after the buzzer).
    if (this.timeLeft <= 0) this.overtime += dt;
    return this.timeLeft <= 0 && (this.balls.every((b) => b.state === 'rest') || this.overtime > 5);
  }

  /** A regular's hands: a throw every second or two while a ball is in the gutter. */
  autopilot(dt: number): ArcadeControls {
    this.demoWait -= dt;
    const ready = this.demoWait <= 0 && this.balls.some((b) => b.state === 'rest');
    if (ready) this.demoWait = 0.9 + random() * 0.9;
    return { ...NO_CONTROLS, fire: ready, firePressed: ready };
  }

  /** The player: hold fire and the meter swings, let go to throw where they look. */
  private playerThrow(dt: number, controls: ArcadeControls): void {
    if (controls.fire) {
      if (!this.charging) {
        this.charging = true;
        this.chargeClock = 0;
      }
      this.chargeClock += dt;
      const t = (this.chargeClock % POWER_PERIOD) / POWER_PERIOD;
      this.power = t < 0.5 ? t * 2 : 2 - t * 2;
      return;
    }
    if (!this.charging) return;
    this.charging = false;
    const ball = this.nextBall();
    if (!ball) return;
    // Where the player looks, lifted: the arc a throw takes.
    const direction = controls.look ?? STRAIGHT_AHEAD;
    direction.y += LIFT;
    direction.normalize();
    const speed = THREE.MathUtils.lerp(THROW_SPEED[0], THROW_SPEED[1], this.power);
    this.launch(ball, direction.multiplyScalar(speed));
  }

  /** A regular: the arc that would drop it in, with a little error. */
  private regularThrow(): void {
    const ball = this.nextBall();
    if (!ball) return;
    const skill = 0.7;
    const target = this.scratch.set(this.hoopX + (random() - 0.5) * 0.12 * (1 - skill + 0.3), HOOP.y, HOOP.z + 0.02);
    const d = target.clone().sub(RELEASE);
    const horizontal = Math.hypot(d.x, d.z);
    const angle = THREE.MathUtils.degToRad(55);
    const denom = 2 * Math.cos(angle) ** 2 * (horizontal * Math.tan(angle) - d.y);
    const speed = Math.sqrt((GRAVITY * horizontal * horizontal) / Math.max(0.01, denom)) * (1 + (random() - 0.5) * 0.08);
    const vel = new THREE.Vector3(d.x / horizontal, 0, d.z / horizontal).multiplyScalar(Math.cos(angle) * speed);
    vel.y = Math.sin(angle) * speed;
    this.launch(ball, vel);
  }

  /** The resting ball nearest `near` (machine-local; default the hand's release point), or null. */
  nextBall(near: THREE.Vector3 = RELEASE): HoopBall | null {
    let best: HoopBall | null = null;
    for (const b of this.balls) if (b.state === 'rest' && (!best || b.pos.distanceTo(near) < best.pos.distanceTo(near))) best = b;
    return best;
  }

  /** A regular picks `ball` up: it goes where their hands take it (the owner sets its position) until thrown or dropped. */
  take(ball: HoopBall): void {
    ball.state = 'held';
    ball.vel.set(0, 0, 0);
  }

  /** A held ball let go of without a throw (the regular walked off): it falls back to the ramp. */
  drop(ball: HoopBall): void {
    if (ball.state !== 'held') return;
    ball.state = 'flying';
    ball.vel.set(0, 0, 0);
    ball.above = false;
    ball.scored = true;
  }

  /**
   * A regular's throw of a held ball from where it is now (machine-local): the arc that would drop
   * it in where the hoop will be when it gets there, off by the thrower's error (0 perfect .. 1 wild).
   */
  throwHeld(ball: HoopBall, error: number): void {
    if (ball.state !== 'held' || this.timeLeft <= 0) {
      this.drop(ball);
      return;
    }
    const from = ball.pos;
    const target = this.scratch.set(this.hoopXAt(0.75) + (random() - 0.5) * 0.2 * error, HOOP.y, HOOP.z + 0.02 + (random() - 0.5) * 0.12 * error);
    const d = target.clone().sub(from);
    const horizontal = Math.max(0.05, Math.hypot(d.x, d.z));
    const angle = THREE.MathUtils.degToRad(52 + (random() - 0.5) * 6);
    const denom = 2 * Math.cos(angle) ** 2 * (horizontal * Math.tan(angle) - d.y);
    const speed = Math.sqrt((GRAVITY * horizontal * horizontal) / Math.max(0.01, denom)) * (1 + (random() - 0.5) * 0.1 * error);
    const vel = new THREE.Vector3(d.x / horizontal, 0, d.z / horizontal).multiplyScalar(Math.cos(angle) * speed);
    vel.y = Math.sin(angle) * speed;
    this.launch(ball, vel, from.clone());
  }

  /** Where the hoop will be `ahead` seconds from now (it slides on a known wave once it moves). */
  hoopXAt(ahead: number): number {
    if (this.baskets < MOVE_AFTER) return this.hoopX;
    const fast = this.baskets >= MOVE_AFTER * 2;
    return Math.sin((this.slideClock + ahead * (fast ? 1.6 : 1)) * 1.3) * SLIDE;
  }

  private launch(ball: HoopBall, velocity: THREE.Vector3, from: THREE.Vector3 = RELEASE): void {
    ball.state = 'flying';
    ball.pos.copy(from);
    ball.vel.copy(velocity);
    ball.above = false;
    ball.scored = false;
    ball.touched = false;
    ball.rimmed = false;
    this.sounds.push('launch');
  }

  private slide(dt: number): void {
    const moving = this.baskets >= MOVE_AFTER;
    const fast = this.baskets >= MOVE_AFTER * 2;
    this.slideClock += dt * (fast ? 1.6 : 1);
    const target = moving ? Math.sin(this.slideClock * 1.3) * SLIDE : 0;
    this.hoopX = damp(this.hoopX, target, 3, dt);
  }

  /** The balls in flight: gravity, the rim, the backboard, the nets and the ramp; a basket when one drops through the ring. */
  private simulate(dt: number): void {
    const steps = Math.ceil(dt / SUBSTEP);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const b of this.balls) {
        if (b.state !== 'flying') continue;
        b.vel.y -= GRAVITY * h;
        b.pos.addScaledVector(b.vel, h);
        this.collideRim(b);
        // The backboard.
        if (b.pos.z - BALL_R < BOARD.z && Math.abs(b.pos.x) < BOARD.w / 2 && Math.abs(b.pos.y - BOARD.y) < BOARD.h / 2 && b.vel.z < 0) {
          b.pos.z = BOARD.z + BALL_R;
          b.vel.z *= -0.55;
          b.touched = true;
          this.sounds.push('thud', 1.3);
        }
        // The back panel, the side nets and the cage's top net.
        if (b.pos.z - BALL_R < BACK_Z) {
          b.pos.z = BACK_Z + BALL_R;
          b.vel.z = Math.abs(b.vel.z) * 0.4;
        }
        const side = WIDTH / 2 - 0.03 - BALL_R;
        if (Math.abs(b.pos.x) > side) {
          b.pos.x = Math.sign(b.pos.x) * side;
          b.vel.x *= -0.3;
        }
        if (b.pos.y + BALL_R > CAGE_H) {
          b.pos.y = CAGE_H - BALL_R;
          b.vel.y = -Math.abs(b.vel.y) * 0.3;
          // The roof net gives and drags: a throw too hard drops short instead of sliding along it into the hoop.
          b.vel.x *= ROOF_DRAG;
          b.vel.z *= ROOF_DRAG;
        }
        // Through the ring, coming down.
        const dx = b.pos.x - this.hoopX;
        const dz = b.pos.z - HOOP.z;
        const inside = dx * dx + dz * dz < (HOOP.r - BALL_R * 0.4) ** 2;
        if (b.pos.y > HOOP.y + 0.02) b.above = inside || b.above;
        if (!b.scored && b.above && inside && b.pos.y < HOOP.y - 0.05 && b.vel.y < 0) this.basket(b);
        // The ramp: it lands and rolls back to the gutter.
        const floor = rampY(b.pos.z) + BALL_R;
        if (b.pos.y < floor) {
          b.pos.y = floor;
          if (b.vel.y < -0.6) {
            b.vel.y *= -0.35;
            this.sounds.push('thud', 0.8);
          } else b.vel.y = 0;
          // Rolling: downhill towards the front, losing a little to the ramp.
          b.vel.x *= 1 - 3 * h;
          b.vel.z = b.vel.z * (1 - 1.5 * h) + RAMP_PULL * h;
          if (!b.scored && b.pos.z > HOOP.z + 0.4) this.missed(b);
        }
        if (b.pos.z >= GUTTER_Z && b.pos.y <= rampY(GUTTER_Z) + BALL_R + 0.01) {
          b.pos.z = GUTTER_Z;
          b.vel.set(0, 0, 0);
          if (!b.scored) this.missed(b);
          b.state = 'rest';
          this.spreadInGutter(b);
        }
      }
    }
  }

  /** The ring as a circle of tube: the nearest point of it pushes the ball out and takes some of its speed. */
  private collideRim(b: HoopBall): void {
    const dx = b.pos.x - this.hoopX;
    const dz = b.pos.z - HOOP.z;
    const flat = Math.hypot(dx, dz) || 1e-6;
    const nearest = this.scratch.set(this.hoopX + (dx / flat) * HOOP.r, HOOP.y, HOOP.z + (dz / flat) * HOOP.r);
    const away = this.away.copy(b.pos).sub(nearest);
    const dist = away.length();
    const reach = BALL_R + HOOP.tube;
    if (dist >= reach || dist === 0) return;
    const n = away.divideScalar(dist);
    b.pos.copy(nearest).addScaledVector(n, reach);
    const vn = b.vel.dot(n);
    if (vn < 0) {
      b.vel.addScaledVector(n, -(1 + 0.5) * vn);
      b.vel.multiplyScalar(0.85);
      if (!b.touched || vn < -0.8) this.sounds.push('rim', 0.9 + random() * 0.2);
      b.touched = true;
      b.rimmed = true;
    }
  }

  private basket(b: HoopBall): void {
    b.scored = true;
    this.baskets += 1;
    this.streak += 1;
    const final = this.timeLeft <= FINAL_SECONDS;
    const points = (final ? FINAL_POINTS : BASKET_POINTS) * Math.min(STREAK_MAX, this.streak);
    this.points += points;
    this.flash = b.touched ? `+${points}` : `SWISH +${points}`;
    this.outcomes.push(b.touched ? 'basket' : 'swish');
    this.sounds.push('swish');
    this.sounds.push('score', 1 + Math.min(STREAK_MAX, this.streak) * 0.1);
    if (this.baskets === MOVE_AFTER || this.baskets === MOVE_AFTER * 2) {
      this.flash = this.baskets === MOVE_AFTER ? 'HOOP ON THE MOVE!' : 'FASTER!';
      this.sounds.push('bonus');
    }
  }

  private missed(b: HoopBall): void {
    b.scored = true; // counted, one way or the other
    this.outcomes.push(b.rimmed ? 'rimOut' : 'miss');
    if (this.streak > 1) this.sounds.push('lose');
    this.streak = 0;
  }

  /** A ball back in the gutter takes the first free place along it. */
  private spreadInGutter(b: HoopBall): void {
    const places = [-0.2, 0, 0.2];
    const taken = this.balls.filter((o) => o !== b && o.state === 'rest').map((o) => o.pos.x);
    const free = places.find((x) => taken.every((t) => Math.abs(t - x) > 0.1)) ?? 0;
    b.pos.set(free, RAMP.frontY + BALL_R, GUTTER_Z);
  }
}

function rampY(z: number): number {
  const t = THREE.MathUtils.clamp((z - RAMP.backZ) / (RAMP.frontZ - RAMP.backZ), 0, 1);
  return THREE.MathUtils.lerp(RAMP.backY, RAMP.frontY, t);
}
