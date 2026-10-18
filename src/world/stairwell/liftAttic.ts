import type * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { sharedCanvasTexture } from '../materials/sharedResources';
import { frozenRng } from '@/random';
import { ATTIC_PLAN, LIFT_CODE } from '../attic/atticPlan'; // imports-ok: the lift climbs to the attic: its code and its stop are the attic's plan
import { LiftCode } from './liftCode';
import { STOREYS, landingY } from '@/world/measures/building';

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
interface AtticRideHost {
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
  private secret: { session: SessionActions; stage: 'toTop' | 'climb' | 'away'; for: number; to: 'attic' | 'roof' } | null = null;
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
      secret.session.travel(secret.to);
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

  /**
   * The roof key turned in the panel's keyhole (Mme Pereira's, at Close): the same climb past our landing, all the way up
   * to the roof's door this time, no code needed.
   */
  keyRide(session: SessionActions): void {
    if (this.secret) return;
    this.goUpstairs(session, 'roof');
  }

  /** The code was pressed (or the roof key turned): to our landing (from wherever), then on up past it. */
  private goUpstairs(session: SessionActions, to: 'attic' | 'roof' = 'attic'): void {
    const car = this.host.car;
    this.secret = { session, stage: 'toTop', for: 0, to };
    session.react(to === 'roof' ? 'The key turns with a clack. The lamp steadies, and the car starts up past our landing, for the roof.' : 'The lamp flickers. Somewhere above, a motor nobody has heard in years wakes up.');
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

/**
 * The lower edge of the car's mirror, scratched over the years: keys dragged across it, initials, a heart, a date, and
 * among them, small, the old code as Albert Vasseur kept it, floor by floor in tally strokes (four, two, a gated five,
 * two, one, a ring for the ground floor). Nothing says it is a code: it reads as such only to whoever already knows
 * there is one, and Lambert's card sends them to the mirror (`building/hunt`).
 */
export function mirrorScratchesTexture(): THREE.CanvasTexture {
  return sharedCanvasTexture('lift-mirror-scratches', paintScratches, { anisotropy: 'facing' });
}

function paintScratches(): HTMLCanvasElement {
  const W = 768;
  const H = 232;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const rng = frozenRng('lift-mirror-scratches');
  const pale = (a: number): string => `rgba(236, 238, 240, ${a})`;
  ctx.lineCap = 'round';
  // Years of keys: long faint drags, short nicks.
  for (let i = 0; i < 46; i++) {
    const x = rng() * W;
    const y = 20 + rng() * (H - 40);
    const long = rng() < 0.4;
    const len = long ? 60 + rng() * 200 : 6 + rng() * 22;
    const a = (rng() - 0.5) * (long ? 0.5 : 2.4);
    ctx.strokeStyle = pale(long ? 0.12 + rng() * 0.12 : 0.2 + rng() * 0.2);
    ctx.lineWidth = long ? 1 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * Math.cos(a), y + len * Math.sin(a));
    ctx.stroke();
  }
  // Initials, a heart, a year: what people scratch in lifts.
  ctx.strokeStyle = pale(0.34);
  ctx.lineWidth = 1.6;
  ctx.font = 'italic 34px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(70, 70);
  ctx.rotate(-0.12);
  ctx.strokeText('J+M', 0, 0);
  ctx.restore();
  heart(ctx, 196, 62, 15);
  ctx.save();
  ctx.translate(560, 54);
  ctx.rotate(0.06);
  ctx.font = 'italic 26px "Courier New", monospace';
  ctx.strokeText('1974', 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(300, 176);
  ctx.rotate(0.04);
  ctx.font = 'italic 24px "Courier New", monospace';
  ctx.strokeText('KIKI', 0, 0);
  ctx.restore();
  // The code, small, low in the right-hand corner: tally strokes a floor, the groups a little apart.
  ctx.strokeStyle = pale(0.42);
  ctx.lineWidth = 1.4;
  let x = 520;
  const foot = 196;
  const tall = 16;
  for (const k of LIFT_CODE) {
    const count = STOREYS - k;
    if (count === 0) {
      ctx.beginPath();
      ctx.arc(x + 5, foot - tall / 2, 5, 0, Math.PI * 2);
      ctx.stroke();
      x += 22;
      continue;
    }
    const strokes = Math.min(count, 4);
    for (let i = 0; i < strokes; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 5, foot);
      ctx.lineTo(x + i * 5 + 1, foot - tall);
      ctx.stroke();
    }
    if (count >= 5) {
      ctx.beginPath();
      ctx.moveTo(x - 3, foot - 3);
      ctx.lineTo(x + strokes * 5, foot - tall + 2);
      ctx.stroke();
    }
    x += strokes * 5 + 14;
  }
  return canvas;
}

/** A small scratched heart round (x, y). */
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - 1.6 * r, y - 0.2 * r, x - 0.7 * r, y - 1.3 * r, x, y - 0.4 * r);
  ctx.bezierCurveTo(x + 0.7 * r, y - 1.3 * r, x + 1.6 * r, y - 0.2 * r, x, y + r);
  ctx.stroke();
}
