import * as THREE from 'three';
import { markShared } from '../materials/sharedResources';

/** How far a travel door's leaf swings ajar (radians), how fast, and how long it stands open before it swings back. */
const OPEN_ANGLE = THREE.MathUtils.degToRad(26);
const OPEN_S = 0.35;
const CLOSE_S = 0.6;
const HOLD_S = 1.2;
/** The shop bell on its spring, knocked by the opening leaf: its swing (radians), how fast it rings down and bobs. */
const BELL_KICK = 0.45;
const BELL_DECAY_S = 0.5;
const BELL_HZ = 3.2;
/** Every travel door's gap: one material for the page (no zone's unload frees it). */
const GAP = markShared(new THREE.MeshBasicMaterial({ color: 0x0d0c0b }));

/**
 * A door that only ever opens a little, for show: the travel doors, whose way through is behind the curtain (`Travel`).
 * `open()` swings `leaf` (hinged on its left edge; negative about y opens it towards +z) ajar in `OPEN_S`, holds it
 * there, then lets it swing back; `gap` (the dark of the way through) is shown only while it stands ajar. The bell's
 * swing (`bellSwing`, radians) is a damped bob that starts as the leaf knocks it.
 */
export class DoorSwing {
  private openness = 0;
  private target = 0;
  private hold = 0;
  private bellTime = Infinity;

  constructor(private readonly leaf: THREE.Object3D, private readonly gap: THREE.Object3D | null = null) {
    if (gap) gap.visible = false;
  }

  /** The bell's angle now (0 at rest). */
  get bellSwing(): number {
    if (!Number.isFinite(this.bellTime)) return 0;
    const t = this.bellTime;
    return BELL_KICK * Math.exp(-t / BELL_DECAY_S) * Math.sin(t * BELL_HZ * Math.PI * 2);
  }

  open(): void {
    this.target = 1;
    this.hold = HOLD_S;
    this.bellTime = 0;
  }

  /** Shut at once (the zone left behind, or found again). */
  shut(): void {
    this.openness = 0;
    this.target = 0;
    this.hold = 0;
    this.bellTime = Infinity;
    this.apply();
  }

  update(dt: number): void {
    if (Number.isFinite(this.bellTime)) {
      this.bellTime += dt;
      if (this.bellTime > BELL_DECAY_S * 6) this.bellTime = Infinity;
    }
    if (this.target === 1 && this.openness >= 1) {
      this.hold -= dt;
      if (this.hold <= 0) this.target = 0;
    }
    if (this.openness === this.target) return;
    const step = dt / (this.target > this.openness ? OPEN_S : CLOSE_S);
    this.openness = this.target > this.openness ? Math.min(1, this.openness + step) : Math.max(0, this.openness - step);
    this.apply();
  }

  private apply(): void {
    // Eased out: quick off the latch, slowing at the end of its swing.
    const t = this.openness;
    this.leaf.rotation.y = -OPEN_ANGLE * (1 - (1 - t) * (1 - t));
    if (this.gap) this.gap.visible = t > 0;
  }
}

/** The dark of a doorway `width` x `height`, just behind a shut leaf (wall-hung, origin on the floor at its middle). */
export function doorway(width: number, height: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), GAP);
  mesh.position.set(0, height / 2, 0.002);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
