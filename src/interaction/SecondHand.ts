import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Carriable } from './Carriable';
import type { Inspector } from './Inspector';
import { Rider } from './Rider';
import { damp } from '@/math/damp';

/** The air between the two boxes held side by side (m). */
const GAP = 0.02;
/** How fast the box in hand makes room for the second one, and closes it (rate per second). */
const SHIFT_RATE = 9;

const eye = new THREE.Quaternion();
const relative = new THREE.Quaternion();
const turn = new THREE.Matrix4();
const right = new THREE.Vector3();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();

/**
 * A second box held beside the one in hand to compare them (docs/furnishing.md "Two boxes side by side"): it comes to
 * the right of the box looked at, the pair centred in the view, turned as the first one is, so the mouse (the faces'
 * keys, the snap) turns both together; the loupe magnifies the first. It goes home when let go (`letGo`), when the box
 * in hand stops being looked at, or when that one goes back.
 */
export class SecondHand<Box extends Carriable = Carriable> implements Updatable {
  private rider: Rider<Box> | null = null;
  /** Boxes let go, still on their way home: the ray passes through them too. */
  private leaving: Rider<Box>[] = [];
  private shift = 0;

  constructor(
    private readonly inspector: Inspector<Box>,
    private readonly camera: THREE.Camera,
    private readonly scene: THREE.Object3D,
  ) {}

  /** The box held beside the one in hand, or null. */
  get current(): Box | null {
    return this.rider && !this.rider.leaving ? this.rider.box : null;
  }

  /** Whether `object` is one of the boxes it holds or is bringing home (the crosshair's ray goes through them). */
  carries(object: unknown): boolean {
    return this.rider?.box === object || this.leaving.some((rider) => rider.box === object);
  }

  /** Holds `box` beside the one in hand (the one held there before goes home); the box in hand is looked at. False with nothing in hand. */
  take(box: Box): boolean {
    const held = this.inspector.current;
    if (!this.inspector.holding || !held || box === held || this.carries(box)) return false;
    this.letGo();
    this.rider = new Rider(box, this.scene, true);
    this.inspector.examine(true);
    return true;
  }

  /** The second box goes home. */
  letGo(): void {
    if (!this.rider) return;
    this.rider.sendHome();
    this.leaving.push(this.rider);
    this.rider = null;
  }

  update(dt: number): void {
    const inspector = this.inspector;
    const main = inspector.current;
    // The box in hand put back, or no longer looked at (a step, the wheel back): the second one goes home.
    if (this.rider && (!main || !inspector.holding || !inspector.examining || this.rider.gone)) this.letGo();
    const rider = this.rider;
    this.camera.getWorldQuaternion(eye);
    if (main) main.getWorldQuaternion(quat);
    // The pair centred: the box in hand moves left by half the second box and the gap (not in the loupe: it fills the view).
    const want = rider && main && !inspector.magnifying ? -(GAP / 2 + halfAcross(rider.box, quat)) : 0;
    this.shift = damp(this.shift, want, SHIFT_RATE, dt);
    if (Math.abs(this.shift) < 1e-4 && want === 0) this.shift = 0;
    inspector.sideShift = this.shift;
    if (rider && main) {
      // To the right of the box in hand, its edge a gap from the other's, turned as it is.
      right.set(1, 0, 0).applyQuaternion(eye);
      const across = halfAcross(main, quat) + GAP + halfAcross(rider.box, quat) + main.openness * main.dimensions.width * 0.5;
      main.getWorldPosition(pos).addScaledVector(right, across);
      rider.update(dt, pos, quat);
    }
    if (!this.leaving.length) return;
    for (const going of this.leaving) going.update(dt, null, null);
    this.leaving = this.leaving.filter((going) => !going.gone);
  }
}

/** Half of `box`'s width along the view's horizontal, turned by `world` (its turn in the room). */
function halfAcross(box: Carriable, world: THREE.Quaternion): number {
  relative.copy(eye).invert().multiply(world);
  const e = turn.makeRotationFromQuaternion(relative).elements;
  const { width, height, depth } = box.dimensions;
  // Column-major: row 0 of the turn says how much of each of the box's axes lies along the view's x.
  return (Math.abs(e[0]!) * width + Math.abs(e[4]!) * height + Math.abs(e[8]!) * depth) / 2;
}
