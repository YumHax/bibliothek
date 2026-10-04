import * as THREE from 'three';
import { smooth, smoother } from '@/math/scalar';

/*
 * A walk as people walk it, in the root's frame (reference metres, +z ahead): each foot is on the
 * floor for `DUTY` of the cycle, sliding back under the body exactly as fast as the body goes (so
 * it stays put on the floor), then swings through, lifted, to land ahead. It strikes with the heel
 * (toes up), rolls flat, peels off the ball of the foot (heel up) and swings with the toes clear.
 * The pelvis turns with the swinging leg, drops on its side and sways over the standing foot; the
 * arms swing against the legs. The steps' length and rate follow the speed the way people's do: a
 * stroll takes shorter, not slower, steps.
 */

/** Steps per second at a walking speed (m/s): `CADENCE[0] + CADENCE[1] * speed`, never longer steps than `SHORTEST_STEP` below that pace. */
const CADENCE = [1.05, 0.66] as const;
const SHORTEST_STEP = 0.3;
/** How much of the cycle each foot is on the floor. */
const DUTY = 0.6;
/** The ankle's middle of stance relative to the hip (a little behind: a foot lands nearer under the body than it leaves), and apart from the middle line (times the build). */
const AHEAD = -0.04;
const WIDTH = 0.085;
/** The feet turn out a little (radians). */
const TOE_OUT = 0.07;

interface FootFrame {
  /** Where the ankle is with the foot flat (the root's frame, y the ankle's height on the floor, lift included). */
  readonly flat: THREE.Vector3;
  /** Toes down positive (heel up), toes up negative (heel strike). */
  pitch: number;
  /** Heading in the root's frame. */
  yaw: number;
  /** 1 on the floor, 0 in the air (a smooth edge). */
  stance: number;
  /** -1 far behind .. 1 far ahead, over the stride. */
  forward: number;
  /** How far through its swing (0..1), 0 on the floor. */
  swing: number;
}

export class Gait {
  /** Where in the cycle the left foot is (0..1: on the floor from 0 to `DUTY`); the right is half a cycle on. */
  phase = 0;
  readonly feet: [FootFrame, FootFrame] = [0, 1].map(() => ({ flat: new THREE.Vector3(), pitch: 0, yaw: 0, stance: 1, forward: 0, swing: 0 })) as [FootFrame, FootFrame];
  /** The pelvis's turn, its tilt to the side and its sway (metres, +x), and how far forward each arm swings (-1..1). */
  pelvisYaw = 0;
  pelvisRoll = 0;
  sway = 0;
  readonly arms: [number, number] = [0, 0];
  /** The walk's amount (0 slow shuffle .. about 1 at a brisk walk), for whatever scales with it. */
  amount = 0;

  /** Moves the cycle on by `dt` at `speed` (m/s, 0 standing) and lays out both feet for a body `build` wide. */
  update(dt: number, speed: number, build: number): void {
    const steps = Math.max(0.01, Math.min(CADENCE[0] + CADENCE[1] * speed, speed / SHORTEST_STEP));
    const cycle = steps / 2;
    const stride = speed / cycle;
    this.phase = (this.phase + dt * cycle) % 1;
    const a = THREE.MathUtils.clamp(speed / 1.2, 0.25, 1.15);
    this.amount = a;
    const reach = DUTY * stride;
    const clearance = 0.03 + 0.045 * Math.min(1, speed / 1.4);
    const swing = [0, 0];
    for (const [i, foot] of this.feet.entries()) {
      const side = i ? 1 : -1;
      const p = (this.phase + i * 0.5) % 1;
      let z: number;
      let lift = 0;
      if (p < DUTY) {
        const s = p / DUTY;
        z = AHEAD + reach * (0.5 - s);
        // Heel strike rolling flat, flat, then the heel peeling up off the ball of the foot.
        foot.pitch = s < 0.14 ? -0.22 * a * (1 - smooth(s / 0.14)) : s > 0.58 ? 0.5 * a * ((s - 0.58) / 0.42) ** 1.6 : 0;
        foot.stance = 1 - smooth((s - 0.9) / 0.1) * 0.5;
        foot.swing = 0;
      } else {
        const q = (p - DUTY) / (1 - DUTY);
        z = AHEAD + reach * (smoother(q) - 0.5);
        lift = clearance * Math.sin(Math.PI * Math.min(1, q * 1.1)) ** 1.2;
        // From the push-off, through the toes clearing the floor, to the toes up for the next strike.
        foot.pitch = q < 0.5 ? THREE.MathUtils.lerp(0.5 * a, -0.08, smooth(q / 0.5)) : THREE.MathUtils.lerp(-0.08, -0.22 * a, smooth((q - 0.5) / 0.5));
        foot.stance = smooth((q - 0.9) / 0.1) * 0.5;
        foot.swing = q;
        swing[i] = Math.sin(Math.PI * q);
      }
      foot.flat.set(side * WIDTH * build, lift, z);
      foot.yaw = side * TOE_OUT;
      foot.forward = reach > 1e-4 ? THREE.MathUtils.clamp((z - AHEAD) / (reach / 2), -1, 1) : 0;
    }
    const [left, right] = this.feet;
    // The hip goes forward with its leg: the right foot ahead turns the pelvis to the left (negative about y).
    this.pelvisYaw = 0.08 * a * (left.forward - right.forward) * 0.5;
    // The swinging leg's side drops a little; the pelvis sways over the standing foot.
    this.pelvisRoll = -0.045 * a * (swing[1]! - swing[0]!);
    this.sway = -0.016 * a * (swing[1]! - swing[0]!);
    // Each arm swings with the other side's leg.
    this.arms[0] = right.forward;
    this.arms[1] = left.forward;
  }
}
