import * as THREE from 'three';
import type { Carriable } from './Carriable';
import { reduceMotion } from '@/settings/motion';
import { smoothDamp } from '@/math/springs';
import { dampFactor } from '@/math/damp';

/** A box sent home further than this from its rest pose (another room) is back there at once, never flown through the walls (m). */
const FAR_HOME = 3;
/** The springs of the flights (rad/s, critically damped): the slide out of (or into) the row stiff and short, the flight softer. */
const SLIDE_STIFFNESS = 30;
const FLY_STIFFNESS = 13;
/** This close (m) a slide or a flight home is over. */
const ARRIVED = 0.006;
/** Carried, the box follows where it is held this tightly (rate per second), as the box in hand does. */
const FOLLOW_RATE = 18;

type Stage = 'out' | 'carried' | 'flyHome' | 'slideHome' | 'gone';

/**
 * One box carried along with the Inspector's (held beside it to compare, `SecondHand`; stacked behind it in the arms,
 * `Armful`): slid out of its row, flown to wherever its carrier says each frame, and home again the way it came, slid
 * back into its row (or at once when its home is in another room). It never decides where it is held: `update` is
 * handed the pose. Disposed under the hand (its shelf rebuilt it), it is simply gone.
 */
export class Rider<Box extends Carriable = Carriable> {
  private stage: Stage = 'out';
  private readonly origin: THREE.Object3D | null;
  private readonly velocity = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly targetQuat = new THREE.Quaternion();
  private readonly restPos = new THREE.Vector3();
  private readonly restQuat = new THREE.Quaternion();
  private readonly scratch: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];

  /** `inHand`: the box shows its openable self (its back, its sharp front) while carried, as the box in hand does. */
  constructor(readonly box: Box, scene: THREE.Object3D, private readonly inHand: boolean) {
    this.origin = box.parent;
    box.setHovered(false);
    box.snapClosed();
    box.onDisposed = () => this.abandon();
    scene.attach(box); // keeps where it stands, in the room's frame
    if (inHand) box.setInHand(true);
  }

  /** Back on its shelf (or disposed): nothing more to carry. */
  get gone(): boolean {
    return this.stage === 'gone';
  }

  /** On its way home (or there): no longer the carrier's to place. */
  get leaving(): boolean {
    return this.stage === 'flyHome' || this.stage === 'slideHome' || this.stage === 'gone';
  }

  /** Sends it home: back to the point just out of its row, then in (at once from another room). */
  sendHome(): void {
    if (this.leaving) return;
    this.box.close();
    this.restPose();
    if (this.box.position.distanceTo(this.restPos) > FAR_HOME) return this.arrive();
    this.stage = 'flyHome';
  }

  /** One frame: out of its row, then to `pos` / `quat` (world) while carried; home when sent there. */
  update(dt: number, pos: THREE.Vector3 | null, quat: THREE.Quaternion | null): void {
    const box = this.box;
    if (this.stage === 'gone') return;
    box.tick(dt);
    if (this.stage === 'out' || this.stage === 'flyHome' || this.stage === 'slideHome') {
      this.restPose();
      this.target.copy(this.restPos);
      this.targetQuat.copy(this.restQuat);
      if (this.stage !== 'slideHome') this.target.add(this.slideOffset());
      // Out of the row first; then, carried, it flies to where it is held (the stage below).
      if (this.stage === 'out' && box.position.distanceTo(this.target) < ARRIVED) this.stage = 'carried';
    }
    if (this.stage === 'carried') {
      if (!pos || !quat) return;
      this.target.copy(pos);
      this.targetQuat.copy(quat);
    }
    if (reduceMotion()) {
      box.position.copy(this.target);
      box.quaternion.copy(this.targetQuat);
    } else if (this.stage === 'carried' && this.velocity.lengthSq() < 1e-4 && box.position.distanceTo(this.target) < 0.05) {
      // Close by: a tight follow, so it never trails a turning view.
      const t = dampFactor(FOLLOW_RATE, dt);
      box.position.lerp(this.target, t);
      box.quaternion.slerp(this.targetQuat, t);
      this.velocity.set(0, 0, 0);
    } else {
      const sliding = this.stage === 'out' || this.stage === 'slideHome';
      smoothDamp(box.position, this.target, this.velocity, sliding ? SLIDE_STIFFNESS : FLY_STIFFNESS, dt, this.scratch);
      box.quaternion.slerp(this.targetQuat, dampFactor(sliding ? 16 : 9, dt));
    }
    if (this.stage === 'flyHome' && box.position.distanceTo(this.target) < ARRIVED && box.openness < 0.01) this.stage = 'slideHome';
    else if (this.stage === 'slideHome' && box.position.distanceTo(this.target) < 1e-3 && box.quaternion.angleTo(this.targetQuat) < 0.01) this.arrive();
  }

  /** Where it belongs: its `home` when it has one (its shelf laid it out again meanwhile), else where it was taken from. */
  private homeOf(): THREE.Object3D | null {
    return this.box.home ?? this.origin;
  }

  private restPose(): void {
    const home = this.homeOf();
    if (!home) return;
    home.updateWorldMatrix(true, false);
    this.restPos.copy(this.box.restPosition).applyMatrix4(home.matrixWorld);
    home.getWorldQuaternion(this.restQuat).multiply(this.box.restQuaternion);
  }

  /** From the rest pose out of the row: along its slide (its front, or its spine when it stands spine out), world metres. */
  private slideOffset(): THREE.Vector3 {
    const axis = this.box.slideAxis;
    const offset = axis ? this.scratch[0].copy(axis) : this.scratch[0].set(0, 0, 1);
    return offset.multiplyScalar(this.box.slideOut).applyQuaternion(this.restQuat);
  }

  private arrive(): void {
    const box = this.box;
    box.onDisposed = null;
    const home = this.homeOf();
    if (home) {
      home.attach(box);
      box.position.copy(box.restPosition);
      box.quaternion.copy(box.restQuaternion);
    } else box.removeFromParent();
    box.snapClosed();
    if (this.inHand) box.setInHand(false);
    this.stage = 'gone';
  }

  /** Disposed under the hand (its shelf rebuilt it): gone, nothing flies home. */
  private abandon(): void {
    this.box.onDisposed = null;
    this.box.removeFromParent();
    this.stage = 'gone';
  }
}
