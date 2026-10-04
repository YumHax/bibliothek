import * as THREE from 'three';
import { angleTo, lerpAngle, wrapAngle } from '@/math/angles';
import { smooth } from '@/math/scalar';

/*
 * Feet that stay where they are put. Standing, each foot is planted on the floor in the world: the
 * body turning, edging aside or shifting its weight moves the legs over it, never the foot. Once a
 * foot is too far from where the stance wants it (after a turn, a step aside, the end of a walk,
 * a new way of standing), it steps there: lifted, carried and set down in a third of a second, one
 * foot at a time, the weight on the other meanwhile. So a turn on the spot is a few small steps
 * and a stop settles with one, as people do. Walking, the feet follow the gait and are planted
 * wherever it leaves them.
 */

/** A foot this far (metres, plus a share of its turn) from its spot steps there. */
const STEP_FROM = 0.075;
const TURN_WEIGHT = 0.14;
/** A step's length in time (s, at tempo 1) and the lift of the foot. */
const STEP_S = 0.34;
const STEP_LIFT = 0.045;
/** Beyond this the body has been moved, not walked: the feet are put back under it at once. */
const TELEPORT = 0.9;

interface Planted {
  /** The ankle's flat position in the root's frame this frame, lift included. */
  readonly flat: THREE.Vector3;
  pitch: number;
  yaw: number;
}

export class Footing {
  /** Each foot's ankle, flat, in world space, and its heading in the world. */
  private readonly world = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly worldYaw = [0, 0];
  private valid = false;
  /** The step under way: which foot, from where (world), how far through (0..1). */
  private step: { foot: number; from: THREE.Vector3; fromYaw: number; t: number } | null = null;
  private lastFoot = 1;
  private rest = 0;
  readonly feet: [Planted, Planted] = [0, 1].map(() => ({ flat: new THREE.Vector3(), pitch: 0, yaw: 0 })) as [Planted, Planted];
  private readonly scratch = new THREE.Vector3();

  /** The foot that is stepping (0 left, 1 right), or -1: the weight is then on the other one. */
  get stepping(): number {
    return this.step ? this.step.foot : -1;
  }

  /** Forgets where the feet are: next frame they are put where the stance wants them. */
  reset(): void {
    this.valid = false;
    this.step = null;
  }

  /**
   * Walking (or anything else that places the feet): records where they are now, so they stay
   * there once the body stands. `toWorld` maps the root's frame to the world, `bodyYaw` the root's heading.
   */
  follow(feet: readonly { flat: THREE.Vector3; yaw: number }[], toWorld: (p: THREE.Vector3) => THREE.Vector3, bodyYaw: number): void {
    for (const [i, foot] of feet.entries()) {
      toWorld(this.world[i]!.copy(foot.flat).setY(0));
      this.worldYaw[i] = bodyYaw + foot.yaw;
    }
    this.valid = true;
    this.step = null;
  }

  /**
   * A frame standing: the planted feet in the root's frame (`feet`), stepping one to its spot in
   * `spots` (the root's frame, with its heading) when it has drifted too far (unless `steps` is false: they
   * hold still, the gait coming in or going out over them). `tempo` quickens the steps.
   */
  update(
    dt: number,
    spots: readonly { at: THREE.Vector3; yaw: number }[],
    toLocal: (p: THREE.Vector3) => THREE.Vector3,
    toWorld: (p: THREE.Vector3) => THREE.Vector3,
    bodyYaw: number,
    tempo: number,
    steps = true,
  ): void {
    if (this.valid) {
      // Moved rather than walked (put somewhere else): no step across the room.
      const far = spots.some((spot, i) => toLocal(this.scratch.copy(this.world[i]!)).setY(0).distanceTo(spot.at) > TELEPORT);
      if (far) this.valid = false;
    }
    if (!this.valid) {
      for (const [i, spot] of spots.entries()) {
        toWorld(this.world[i]!.copy(spot.at).setY(0));
        this.worldYaw[i] = bodyYaw + spot.yaw;
      }
      this.valid = true;
      this.step = null;
    }
    this.rest = Math.max(0, this.rest - dt);
    if (!this.step && this.rest <= 0 && steps) {
      // The foot furthest from its spot steps, if either is far enough; the same foot not twice running unless it must.
      let worst = -1;
      let worstError = STEP_FROM;
      for (const [i, spot] of spots.entries()) {
        const here = toLocal(this.scratch.copy(this.world[i]!)).setY(0);
        const turn = Math.abs(angleTo(this.worldYaw[i]! - bodyYaw, spot.yaw));
        const error = here.distanceTo(spot.at) + turn * TURN_WEIGHT - (i === this.lastFoot ? 0.01 : 0);
        if (error > worstError) {
          worstError = error;
          worst = i;
        }
      }
      if (worst >= 0) this.step = { foot: worst, from: this.world[worst]!.clone(), fromYaw: this.worldYaw[worst]!, t: 0 };
    }
    for (const [i, spot] of spots.entries()) {
      const foot = this.feet[i]!;
      if (this.step && this.step.foot === i) {
        const s = this.step;
        s.t = Math.min(1, s.t + (dt * tempo) / STEP_S);
        const k = smooth(s.t);
        // From where it was (now in the root's frame) to where the stance wants it, lifted on the way.
        toLocal(foot.flat.copy(s.from)).setY(0).lerp(spot.at, k);
        foot.flat.y = STEP_LIFT * Math.sin(Math.PI * s.t);
        foot.yaw = lerpAngle(s.fromYaw - bodyYaw, spot.yaw, k);
        foot.pitch = 0.12 * Math.sin(Math.PI * 2 * s.t);
        if (s.t >= 1) {
          toWorld(this.world[i]!.copy(spot.at).setY(0));
          this.worldYaw[i] = bodyYaw + spot.yaw;
          this.lastFoot = i;
          this.step = null;
          this.rest = 0.08;
        }
      } else {
        toLocal(foot.flat.copy(this.world[i]!)).setY(0);
        foot.yaw = wrapAngle(this.worldYaw[i]! - bodyYaw);
        foot.pitch = 0;
      }
    }
  }
}
