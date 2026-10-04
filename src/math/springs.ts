/*
 * Damped springs: a value that starts slowly, carries its speed and settles (with `zeta` under 1, a little past the
 * goal and back), the difference between a limb that moves and one that is moved. One integrator for the body's
 * joints, the cat's turn and the box flying to the hand; `damp` (`./damp`) is the memoryless cousin for a value that
 * only ever eases.
 */
import type * as THREE from 'three';
import { angleTo } from './angles';

/** The sub-step every spring integrates with: a long frame is taken in slices so the spring stays stable. */
const STEP = 1 / 60;

/**
 * One step of a damped spring towards `goal`: stiffness `omega` (rad/s: higher is quicker), damping ratio `zeta`
 * (1 critical, below 1 overshoots a little). Returns the new value and velocity.
 */
export function spring(value: number, velocity: number, goal: number, omega: number, dt: number, zeta = 1): [number, number] {
  for (let left = dt; left > 1e-6; left -= STEP) {
    const h = Math.min(left, STEP);
    velocity += (omega * omega * (goal - value) - 2 * zeta * omega * velocity) * h;
    value += velocity * h;
  }
  return [value, velocity];
}

/**
 * The same for an angle turning the short way round towards `goal` (the gap is re-measured each sub-step, so a
 * goal that passes behind is still the short way), its rate held within `maxRate` (rad/s); `step` is the sub-step
 * (the cat turns at 1 / 120 s). Critically damped.
 */
export function springAngle(angle: number, velocity: number, goal: number, omega: number, dt: number, maxRate: number, step = STEP): [number, number] {
  for (let left = dt; left > 1e-6; left -= step) {
    const h = Math.min(left, step);
    const delta = angleTo(angle, goal);
    velocity = Math.max(-maxRate, Math.min(maxRate, velocity + (omega * omega * delta - 2 * omega * velocity) * h));
    angle += velocity * h;
  }
  return [angle, velocity];
}

/** A value on a spring: `step(goal, dt)` moves it and returns it. */
export class Spring {
  velocity = 0;

  constructor(
    public value = 0,
    public omega = 8,
    public zeta = 1,
  ) {}

  step(goal: number, dt: number, omega = this.omega): number {
    [this.value, this.velocity] = spring(this.value, this.velocity, goal, omega, dt, this.zeta);
    return this.value;
  }

  /** Jumps there, at rest. */
  set(value: number): void {
    this.value = value;
    this.velocity = 0;
  }
}

/**
 * A point on a critically damped spring towards `target`, keeping its `velocity` from one frame to the next: the
 * closed form of Unity's SmoothDamp, stable at any frame time (the box flying to the hand). `omega` is the
 * stiffness; `position` and `velocity` are moved in place; `scratch` holds the two vectors the step needs.
 */
export function smoothDamp(position: THREE.Vector3, target: THREE.Vector3, velocity: THREE.Vector3, omega: number, dt: number, scratch: [THREE.Vector3, THREE.Vector3]): void {
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = scratch[0].subVectors(position, target);
  const temp = scratch[1].copy(velocity).addScaledVector(change, omega).multiplyScalar(dt);
  velocity.addScaledVector(temp, -omega).multiplyScalar(decay);
  position.copy(target).addScaledVector(change.add(temp), decay);
}
