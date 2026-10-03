import type * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { ATTIC_PLAN, LIFT_CODE } from '../attic/atticPlan';
import { LiftCode } from './liftCode';
import { landingY } from './stairwellPlan';

/** `climbing`: past our landing, up to the attic (the panel's code, `ATTIC_PLAN.liftCode`). */
export type LiftPhase = 'shut' | 'opening' | 'open' | 'closing' | 'moving' | 'climbing';

/** The lift's car as the ride to the attic reads and sets it: its height (local), its stop and target landings, its gate, its phase. */
export interface LiftCarState {
  y: number;
  stop: number;
  target: number;
  gate: number;
  phase: LiftPhase;
}

/** What the ride to the attic asks of the lift. */
export interface AtticRideHost {
  readonly car: LiftCarState;
  /** Off to landing `k`, as a button would send it. */
  send(k: number): void;
  /** The car moved out of the update's course: shown and its colliders synced now. */
  settle(): void;
}

/**
 * The old lift's secret ride (`ATTIC_PLAN.liftCode`): the code pressed floor by floor on the car's panel sends the car to
 * our landing, then on up past it, slowly, the lamp stuttering, until the view goes dark and the attic's own car takes
 * the player (`world/attic`). While they are up there the stairwell's car waits on our landing, shut, and folds its gate
 * open as they come back down in it. The `Lift` asks it at each step of its own run.
 */
export class AtticRide {
  /** The panel's presses, for the code. */
  private readonly code = new LiftCode(LIFT_CODE, ATTIC_PLAN.liftCode.gap);
  /** The ride: off to our landing first (`toTop`), the climb past it, then gone up (`away`, the view dark). */
  private secret: { session: SessionActions; stage: 'toTop' | 'climb' | 'away'; for: number } | null = null;
  /** Back down from the attic: the gate folds open on our landing as the player comes back into the stairwell. */
  private backFromAttic = false;

  constructor(private readonly host: AtticRideHost) {}

  /** The ride is under way: the lift serves nobody else meanwhile. */
  get active(): boolean {
    return this.secret !== null;
  }

  /** Kept for the player: up in the attic (they come back down in this car, on our landing) or on the code's ride. */
  get held(): boolean {
    return this.backFromAttic || this.secret !== null;
  }

  /** Floor `k` pressed on the panel by the player in the car, at `now` (s): true when it completed the code (the ride set off). */
  pressed(k: number, now: number, session: SessionActions): boolean {
    if (!this.code.press(k, now)) return false;
    this.goUpstairs(session);
    return true;
  }

  /** The car came to rest at a stop: on up if this is our landing on the way to the attic, else `otherwise`. */
  restAt(otherwise: LiftPhase): LiftPhase {
    return this.secret?.stage === 'toTop' && this.host.car.stop === 0 ? this.startClimb() : otherwise;
  }

  /** The stairwell emptied: gone up to the attic, the car is back on our landing, shut, for whoever comes down. */
  left(): void {
    if (this.secret?.stage === 'away') this.parkFromAttic();
  }

  /** The player is back in the stairwell: true once, if they came down from the attic (the gate is to fold open). */
  cameBack(): boolean {
    if (!this.backFromAttic) return false;
    this.backFromAttic = false;
    return true;
  }

  /** Up past our landing, slowly; at the top the view goes dark and the attic's car takes over (`world/attic`). */
  climb(dt: number): void {
    const car = this.host.car;
    const secret = this.secret;
    const top = landingY(0) + ATTIC_PLAN.climb.rise;
    car.y = Math.min(top, car.y + ATTIC_PLAN.climb.speed * dt);
    if (!secret || car.y < top) return;
    if (secret.stage === 'climb') {
      secret.stage = 'away';
      secret.session.travel('attic');
      return;
    }
    // Still here a while after the view should have gone (the attic did not load): back down to our landing.
    secret.for += dt;
    if (secret.for > 4) {
      this.secret = null;
      car.stop = 0;
      car.target = 0;
      car.phase = 'moving';
    }
  }

  /** The code was pressed: to our landing (from wherever), then on up past it. */
  private goUpstairs(session: SessionActions): void {
    const car = this.host.car;
    this.secret = { session, stage: 'toTop', for: 0 };
    session.react('The lamp flickers. Somewhere above, a motor nobody has heard in years wakes up.');
    if (car.phase === 'moving') car.target = 0;
    else if (car.stop === 0 && car.phase === 'shut') car.phase = this.startClimb();
    else this.host.send(0);
  }

  /** At our landing with its gate shut: on up, past where the lift ever went. */
  private startClimb(): LiftPhase {
    if (this.secret) this.secret.stage = 'climb';
    return 'climbing';
  }

  /** The player went up: the car waits on our landing again, shut, its gate opening as they come back down. */
  private parkFromAttic(): void {
    const car = this.host.car;
    this.secret = null;
    car.y = landingY(0);
    car.stop = 0;
    car.target = 0;
    car.gate = 0;
    car.phase = 'shut';
    this.backFromAttic = true;
    this.host.settle();
  }
}

/** The code scratched with a key into the car's varnish, under its mirror: pale, thin, a little crooked. */
export function scratchedCodeTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(384, 90);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(214, 180, 140, 0.55)';
  ctx.fillStyle = 'rgba(214, 180, 140, 0.55)';
  ctx.lineWidth = 2;
  ctx.font = 'italic 46px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  const marks = ATTIC_PLAN.liftCode.floors.map((name) => name.replace(/(st|nd|rd|th)$/, ''));
  marks.forEach((mark, i) => {
    ctx.save();
    ctx.translate(16 + i * 60, 46 + (i % 2 ? 4 : -3));
    ctx.rotate((i % 3 - 1) * 0.08);
    ctx.strokeText(mark, 0, 0);
    ctx.restore();
  });
  // A stray scratch through it, as if keys did the rest.
  ctx.beginPath();
  ctx.moveTo(10, 70);
  ctx.lineTo(370, 58);
  ctx.stroke();
  return toTexture(canvas, 4);
}
