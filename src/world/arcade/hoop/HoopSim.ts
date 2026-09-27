import * as THREE from 'three';
import type { SfxEvent } from '@/audio/ChipSpeaker';
import { type ArcadeControls, NO_CONTROLS } from '../games/ArcadeGame';

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

export interface HoopBall {
  readonly pos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  state: 'rest' | 'flying';
  /** Above the rim on this flight (a basket must come down through it). */
  above: boolean;
  scored: boolean;
  touched: boolean;
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
  private sounds: SfxEvent[] = [];
  private flash: string | null = null;
  private readonly scratch = new THREE.Vector3();
  private readonly away = new THREE.Vector3();

  constructor() {
    for (let i = 0; i < BALLS; i++) this.balls.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), state: 'rest', above: false, scored: false, touched: false });
    this.newGame();
  }

  /** The sounds of this frame, oldest first. */
  takeSounds(): SfxEvent[] {
    const sounds = this.sounds;
    this.sounds = [];
    return sounds;
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
    this.balls.forEach((b, i) => {
      b.state = 'rest';
      b.pos.set(-0.2 + i * 0.2, RAMP.frontY + BALL_R, GUTTER_Z);
      b.vel.set(0, 0, 0);
    });
  }

  /**
   * One frame of the round; true once it is over. `player` throws on fire's release along
   * `look()` (the player's view direction, machine-local, unit length); otherwise fire's press
   * is a regular's throw.
   */
  play(dt: number, controls: ArcadeControls, player: boolean, look: () => THREE.Vector3): boolean {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.slide(dt);
    if (this.timeLeft > 0) {
      if (player) this.playerThrow(dt, controls, look);
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
    if (ready) this.demoWait = 0.9 + Math.random() * 0.9;
    return { ...NO_CONTROLS, fire: ready, firePressed: ready };
  }

  /** The player: hold fire and the meter swings, let go to throw where they look. */
  private playerThrow(dt: number, controls: ArcadeControls, look: () => THREE.Vector3): void {
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
    const direction = look();
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
    const target = this.scratch.set(this.hoopX + (Math.random() - 0.5) * 0.12 * (1 - skill + 0.3), HOOP.y, HOOP.z + 0.02);
    const d = target.clone().sub(RELEASE);
    const horizontal = Math.hypot(d.x, d.z);
    const angle = THREE.MathUtils.degToRad(55);
    const denom = 2 * Math.cos(angle) ** 2 * (horizontal * Math.tan(angle) - d.y);
    const speed = Math.sqrt((GRAVITY * horizontal * horizontal) / Math.max(0.01, denom)) * (1 + (Math.random() - 0.5) * 0.08);
    const vel = new THREE.Vector3(d.x / horizontal, 0, d.z / horizontal).multiplyScalar(Math.cos(angle) * speed);
    vel.y = Math.sin(angle) * speed;
    this.launch(ball, vel);
  }

  private nextBall(): HoopBall | null {
    // The one nearest the hand.
    let best: HoopBall | null = null;
    for (const b of this.balls) if (b.state === 'rest' && (!best || b.pos.distanceTo(RELEASE) < best.pos.distanceTo(RELEASE))) best = b;
    return best;
  }

  private launch(ball: HoopBall, velocity: THREE.Vector3): void {
    ball.state = 'flying';
    ball.pos.copy(RELEASE);
    ball.vel.copy(velocity);
    ball.above = false;
    ball.scored = false;
    ball.touched = false;
    this.sounds.push({ sfx: 'launch' });
  }

  private slide(dt: number): void {
    const moving = this.baskets >= MOVE_AFTER;
    const fast = this.baskets >= MOVE_AFTER * 2;
    this.slideClock += dt * (fast ? 1.6 : 1);
    const target = moving ? Math.sin(this.slideClock * 1.3) * SLIDE : 0;
    this.hoopX += (target - this.hoopX) * Math.min(1, dt * 3);
  }

  /** The balls in flight: gravity, the rim, the backboard, the nets and the ramp; a basket when one drops through the ring. */
  private simulate(dt: number): void {
    const steps = Math.ceil(dt / SUBSTEP);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const b of this.balls) {
        if (b.state === 'rest') continue;
        b.vel.y -= GRAVITY * h;
        b.pos.addScaledVector(b.vel, h);
        this.collideRim(b);
        // The backboard.
        if (b.pos.z - BALL_R < BOARD.z && Math.abs(b.pos.x) < BOARD.w / 2 && Math.abs(b.pos.y - BOARD.y) < BOARD.h / 2 && b.vel.z < 0) {
          b.pos.z = BOARD.z + BALL_R;
          b.vel.z *= -0.55;
          b.touched = true;
          this.sounds.push({ sfx: 'thud', pitch: 1.3 });
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
            this.sounds.push({ sfx: 'thud', pitch: 0.8 });
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
      if (!b.touched || vn < -0.8) this.sounds.push({ sfx: 'rim', pitch: 0.9 + Math.random() * 0.2 });
      b.touched = true;
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
    this.sounds.push({ sfx: 'swish' }, { sfx: 'score', pitch: 1 + Math.min(STREAK_MAX, this.streak) * 0.1 });
    if (this.baskets === MOVE_AFTER || this.baskets === MOVE_AFTER * 2) {
      this.flash = this.baskets === MOVE_AFTER ? 'HOOP ON THE MOVE!' : 'FASTER!';
      this.sounds.push({ sfx: 'bonus' });
    }
  }

  private missed(b: HoopBall): void {
    b.scored = true; // counted, one way or the other
    if (this.streak > 1) this.sounds.push({ sfx: 'lose' });
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
