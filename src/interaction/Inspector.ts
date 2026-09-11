import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { GameBox } from '@/world/GameBox';

export interface InspectorEvents {
  /** Called with false while the user is rotating the box (right button held), true afterwards. */
  onLookEnabledChange?(enabled: boolean): void;
}

type Phase = 'idle' | 'toHand' | 'inHand' | 'toShelf';

/**
 * Pulls a GameBox off its shelf and carries it in front of the camera, low and to the left
 * so the crosshair stays free for other interactions (e.g. the TV). The player can keep
 * walking and looking around; holding the right mouse button rotates the box instead.
 * `toggleOpen()` swings the lid open to show the cartridge and manual; the box slides to the
 * right while open so the whole spread stays in view. `release()` sends it back to its rest pose.
 */
export class Inspector implements Updatable {
  /** Hand pose in camera space (metres): x right, y up, z forward is negative. */
  readonly handOffset = new THREE.Vector3(-0.11, -0.05, -0.42);
  rotateSpeed = 0.005;
  readonly events: InspectorEvents = {};

  private phase: Phase = 'idle';
  private box: GameBox | null = null;
  private originalParent: THREE.Object3D | null = null;
  private rotating = false;
  private readonly userRotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  private readonly targetPos = new THREE.Vector3();
  private readonly targetQuat = new THREE.Quaternion();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpOffset = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly scene: THREE.Scene,
  ) {
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  get isActive(): boolean {
    return this.phase !== 'idle';
  }

  get current(): GameBox | null {
    return this.box;
  }

  /** True while the carried box is open (or opening). */
  get isOpen(): boolean {
    return this.box?.isOpen ?? false;
  }

  inspect(box: GameBox): void {
    if (this.phase !== 'idle') return;
    this.box = box;
    this.originalParent = box.parent;
    box.setHovered(false);
    box.snapClosed();
    this.scene.attach(box); // keep world transform, reparent to scene
    this.userRotation.identity();
    this.euler.set(0, 0, 0);
    this.phase = 'toHand';
  }

  /** Opens or closes the carried box's lid. No-op when nothing is in hand. */
  toggleOpen(): void {
    if (this.box && (this.phase === 'inHand' || this.phase === 'toHand')) this.box.toggleOpen();
  }

  release(): void {
    if (this.phase === 'toHand' || this.phase === 'inHand') {
      this.phase = 'toShelf';
      this.box?.close();
      this.setRotating(false);
    }
  }

  update(dt: number): void {
    if (!this.box || this.phase === 'idle') return;
    const box = this.box;
    box.tick(dt);

    if (this.phase === 'toShelf') {
      const parent = this.originalParent!;
      parent.updateWorldMatrix(true, false);
      this.targetPos.copy(box.restPosition).applyMatrix4(parent.matrixWorld);
      parent.getWorldQuaternion(this.tmpQuat);
      this.targetQuat.copy(this.tmpQuat).multiply(box.restQuaternion);
    } else {
      this.camera.getWorldPosition(this.targetPos);
      this.camera.getWorldQuaternion(this.tmpQuat);
      // The lid swings out to the left; shift the box right as it opens so the spread stays centred.
      this.tmpOffset.copy(this.handOffset);
      this.tmpOffset.x += box.openness * box.dimensions.width * 0.5;
      this.targetPos.add(this.tmpOffset.applyQuaternion(this.tmpQuat));
      this.targetQuat.copy(this.tmpQuat).multiply(this.userRotation);
    }

    // Snappier when following the hand so the box does not lag behind head movement.
    const rate = this.phase === 'inHand' ? 18 : 10;
    const t = 1 - Math.exp(-rate * dt);
    box.position.lerp(this.targetPos, t);
    box.quaternion.slerp(this.targetQuat, t);

    const settled = box.position.distanceToSquared(this.targetPos) < 1e-6 && box.quaternion.angleTo(this.targetQuat) < 0.005;
    if (this.phase === 'toHand' && settled) this.phase = 'inHand';
    if (this.phase === 'toShelf' && settled) this.finishReturn();
  }

  private finishReturn(): void {
    const box = this.box!;
    this.originalParent!.attach(box);
    box.position.copy(box.restPosition);
    box.quaternion.copy(box.restQuaternion);
    box.snapClosed();
    this.phase = 'idle';
    this.box = null;
    this.originalParent = null;
  }

  private setRotating(rotating: boolean): void {
    if (this.rotating === rotating) return;
    this.rotating = rotating;
    this.events.onLookEnabledChange?.(!rotating);
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 2 && (this.phase === 'inHand' || this.phase === 'toHand')) this.setRotating(true);
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 2) this.setRotating(false);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.rotating) return;
    this.euler.y += e.movementX * this.rotateSpeed;
    this.euler.x += e.movementY * this.rotateSpeed;
    this.userRotation.setFromEuler(this.euler);
  };
}
