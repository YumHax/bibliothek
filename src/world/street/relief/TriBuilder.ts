import * as THREE from 'three';

/** A unit box's 36 corners and normals (centred, side 1), turned into boxes of any size by `TriBuilder.box`. */
const UNIT = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const out = { position: Float32Array.from(g.getAttribute('position').array), normal: Float32Array.from(g.getAttribute('normal').array) };
  g.dispose();
  return out;
})();

const v = new THREE.Vector3();
const nrm = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();

/**
 * Collects coloured triangles (non-indexed, vertex colours, a normal each) into one geometry: the
 * street's relief is thousands of little boxes and quads (balcony bars, sills, awning stripes)
 * that must end up as one draw call per material. Boxes are placed by a matrix; quads and
 * triangles are given in the frame of the current matrix too.
 */
export class TriBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly color = new THREE.Color();

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  /** A box `w` x `h` x `d` centred at (x, y, z) in the frame `matrix` places, in `color`. */
  box(matrix: THREE.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation): this {
    this.color.set(color);
    normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < 36; i++) {
      v.set(UNIT.position[i * 3]! * w + x, UNIT.position[i * 3 + 1]! * h + y, UNIT.position[i * 3 + 2]! * d + z).applyMatrix4(matrix);
      nrm.set(UNIT.normal[i * 3]!, UNIT.normal[i * 3 + 1]!, UNIT.normal[i * 3 + 2]!).applyMatrix3(normalMatrix).normalize();
      this.push(v, nrm);
    }
    return this;
  }

  /** A triangle (corners counter-clockwise seen from its front) in the frame `matrix` places; the normal follows the winding. */
  triangle(matrix: THREE.Matrix4, a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, c: THREE.Vector3Tuple, color: THREE.ColorRepresentation): this {
    this.color.set(color);
    const pa = new THREE.Vector3(...a).applyMatrix4(matrix);
    const pb = new THREE.Vector3(...b).applyMatrix4(matrix);
    const pc = new THREE.Vector3(...c).applyMatrix4(matrix);
    nrm.subVectors(pc, pb).cross(v.subVectors(pa, pb)).normalize();
    this.push(pa, nrm);
    this.push(pb, nrm);
    this.push(pc, nrm);
    return this;
  }

  /** A quad a-b-c-d (counter-clockwise from its front); `twoSided` adds its back face too. */
  quad(matrix: THREE.Matrix4, a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, c: THREE.Vector3Tuple, d: THREE.Vector3Tuple, color: THREE.ColorRepresentation, twoSided = false, backColor?: THREE.ColorRepresentation): this {
    this.triangle(matrix, a, b, c, color).triangle(matrix, a, c, d, color);
    if (twoSided) this.triangle(matrix, a, c, b, backColor ?? color).triangle(matrix, a, d, c, backColor ?? color);
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  private push(p: THREE.Vector3, n: THREE.Vector3): void {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.colors.push(this.color.r, this.color.g, this.color.b);
  }
}
