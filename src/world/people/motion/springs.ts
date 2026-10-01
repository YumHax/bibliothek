/*
 * Springs for the body: every joint that eases somewhere does so as a damped spring, never as a
 * straight lerp. A spring starts slowly, carries its speed and settles (with `zeta` under 1, a
 * little past the goal and back): the difference between a limb that moves and one that is moved.
 */

/**
 * One step of a damped spring towards `goal`: stiffness `omega` (rad/s: higher is quicker),
 * damping ratio `zeta` (1 critical, below 1 overshoots a little). Sub-stepped so a long frame stays
 * stable. Returns the new value and velocity.
 */
export function spring(value: number, velocity: number, goal: number, omega: number, dt: number, zeta = 1): [number, number] {
  for (let left = dt; left > 1e-6; left -= 1 / 60) {
    const h = Math.min(left, 1 / 60);
    velocity += (omega * omega * (goal - value) - 2 * zeta * omega * velocity) * h;
    value += velocity * h;
  }
  return [value, velocity];
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

/** Smoothstep of `t` clamped to 0..1. */
export function smooth(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/** Smootherstep (zero speed and acceleration at both ends) of `t` clamped to 0..1. */
export function smoother(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
}
