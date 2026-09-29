import * as THREE from 'three';

/** Points along the lead, and its thickness (a cord's, seen as two crossed ribbons). */
const SEGMENTS = 10;
const WIDTH = 0.011;
/** How far the lead sags below the straight line at its middle, per metre of slack. */
const SAG = 0.22;
/** Its length: shorter than this between hand and collar, it hangs slack. */
const LENGTH = 1.2;

/**
 * A dog's lead from its walker's hand to the collar: a thin cord (two ribbons crossed along it,
 * so it has width from every side, updated in place: no allocation per frame) sagging by how much
 * slack there is. Fades with its walker (alpha hash, like the people).
 */
export class Lead extends THREE.Mesh {
  private readonly positions: THREE.BufferAttribute;
  private readonly point = new THREE.Vector3();
  private readonly side = new THREE.Vector3();

  constructor(color: number) {
    const geometry = new THREE.BufferGeometry();
    const count = (SEGMENTS + 1) * 4;
    const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    const index: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      for (const strip of [0, 2]) {
        const a = i * 4 + strip;
        const b = a + 1;
        const c = a + 4;
        const d = b + 4;
        index.push(a, c, b, b, c, d);
      }
    }
    geometry.setIndex(index);
    super(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide, alphaHash: true }));
    this.positions = positions;
    this.name = 'Lead';
    this.frustumCulled = false;
    this.castShadow = false;
  }

  /** 0 gone .. 1 solid. */
  setFade(amount: number): void {
    (this.material as THREE.MeshStandardMaterial).opacity = amount;
    this.visible = amount > 0.3;
  }

  /** Strung from `hand` to `collar` (the parent's frame). */
  string(hand: THREE.Vector3, collar: THREE.Vector3): void {
    const span = hand.distanceTo(collar);
    const sag = Math.max(0.02, (LENGTH - span) * SAG + 0.04);
    // Across the cord, level: the second ribbon stands upright.
    this.side.set(collar.z - hand.z, 0, hand.x - collar.x);
    if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
    this.side.normalize().multiplyScalar(WIDTH / 2);
    const p = this.positions;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      this.point.lerpVectors(hand, collar, t);
      this.point.y -= sag * 4 * t * (1 - t);
      const k = i * 4;
      p.setXYZ(k, this.point.x - this.side.x, this.point.y, this.point.z - this.side.z);
      p.setXYZ(k + 1, this.point.x + this.side.x, this.point.y, this.point.z + this.side.z);
      p.setXYZ(k + 2, this.point.x, this.point.y - WIDTH / 2, this.point.z);
      p.setXYZ(k + 3, this.point.x, this.point.y + WIDTH / 2, this.point.z);
    }
    p.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}
