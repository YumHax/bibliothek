import * as THREE from 'three';
import { RENDER_ORDER } from '@/world/surface/layers';

/** A unit cube's twelve edges, shared by every outline. */
const EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));

/**
 * The twelve edges of a box, drawn unlit: a piece's bounds at a pose (`set`), or a box as it stands (`setBox`).
 * Seen through what stands before it unless `depthTest` (the carried piece's own outline hides behind itself).
 */
export class BoxOutline {
  readonly object: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;

  constructor(color: THREE.ColorRepresentation, { opacity = 1, depthTest = false }: { opacity?: number; depthTest?: boolean } = {}) {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest, depthWrite: false, toneMapped: false });
    this.object = new THREE.LineSegments(EDGES, material);
    this.object.visible = false;
    this.object.frustumCulled = false;
    this.object.renderOrder = RENDER_ORDER.overlay;
  }

  /** `bounds` (the piece's own frame) standing at `pose` (the parent's frame), a hair larger so it clears the faces. */
  set(bounds: THREE.Box3, pose: { position: THREE.Vector3; yaw: number }): void {
    const size = bounds.getSize(new THREE.Vector3()).addScalar(0.01);
    const centre = bounds.getCenter(new THREE.Vector3()).applyAxisAngle(THREE.Object3D.DEFAULT_UP, pose.yaw).add(pose.position);
    this.object.position.copy(centre);
    this.object.rotation.set(0, pose.yaw, 0);
    this.object.scale.copy(size);
  }

  /** An axis-aligned `box` (the parent's frame). */
  setBox(box: THREE.Box3): void {
    this.object.position.copy(box.getCenter(new THREE.Vector3()));
    this.object.rotation.set(0, 0, 0);
    this.object.scale.copy(box.getSize(new THREE.Vector3()).addScalar(0.01));
  }

  setColor(color: THREE.Color): void {
    this.object.material.color.copy(color);
  }
}
