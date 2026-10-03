import * as THREE from 'three';
import { warnCoplanar } from '../../surface/coplanar';

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

/** How close to a solid surface a face facing into it must lie to be out of sight (a slit no eye looks through). */
const HIDDEN_GAP = 0.01;

/** A solid surface things are built against (`TriBuilder.hideAgainst`): its outward normal, its plane's constant, where it is. */
interface Hider {
  normal: THREE.Vector3;
  constant: number;
  bounds: THREE.Box3 | null;
}

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
  private readonly hiders: Hider[] = [];

  /**
   * A solid surface the things are built against, `normal` outward through `point` (the pavement, a facade's
   * wall), within `bounds` (everywhere by default): faces lying on it (within a centimetre) and facing into it
   * are never seen, and `build` leaves them out. Boxes stood on the pavement or set against a wall lose their
   * bottoms and backs: fewer triangles, and no hidden faces flush with each other for the z-fight checks. Not on a
   * builder whose `vertexCount`s are kept as ranges: leaving faces out shifts them.
   */
  hideAgainst(normal: THREE.Vector3, point: THREE.Vector3, bounds: THREE.Box3 | null = null): this {
    const n = normal.clone().normalize();
    this.hiders.push({ normal: n, constant: -n.dot(point), bounds: bounds?.clone().expandByScalar(HIDDEN_GAP) ?? null });
    return this;
  }

  /** `hideAgainst` the ground at height `y` (default the pavement's 0), everywhere. */
  hideGround(y = 0): this {
    return this.hideAgainst(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, y, 0));
  }

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  /** How many vertices are in so far (three per triangle): where the next thing's start. */
  get vertexCount(): number {
    return this.positions.length / 3;
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

  /** Any geometry (a sphere, a cylinder, a torus) placed by `matrix`, in `color`: its triangles are copied in, the geometry is left as it was. */
  geometry(matrix: THREE.Matrix4, geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation): this {
    this.color.set(color);
    normalMatrix.getNormalMatrix(matrix);
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.getAttribute('position');
    const normal = source.getAttribute('normal');
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(matrix);
      nrm.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      this.push(v, nrm);
    }
    if (source !== geometry) source.dispose();
    return this;
  }

  build(): THREE.BufferGeometry {
    if (this.hiders.length) this.dropHidden();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    // `?debug` only: faces of different colours overlapping in one plane fight, and no polygon offset can part them.
    warnCoplanar(g, 'color');
    return g;
  }

  /** Leaves out the triangles lying on a `hideAgainst` surface and facing into it. */
  private dropHidden(): void {
    const { positions, normals, colors } = this;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const centre = new THREE.Vector3();
    const face = new THREE.Vector3();
    let kept = 0;
    for (let t = 0; t < positions.length; t += 9) {
      a.fromArray(positions, t);
      b.fromArray(positions, t + 3);
      c.fromArray(positions, t + 6);
      face.subVectors(b, a).cross(centre.subVectors(c, a));
      const length = face.length();
      let hidden = false;
      if (length > 1e-12) {
        face.divideScalar(length);
        centre.copy(a).add(b).add(c).divideScalar(3);
        hidden = this.hiders.some(
          (h) =>
            face.dot(h.normal) < -0.99 &&
            [a, b, c].every((p) => Math.abs(h.normal.dot(p) + h.constant) <= HIDDEN_GAP) &&
            (!h.bounds || h.bounds.containsPoint(centre)),
        );
      }
      if (hidden) continue;
      if (kept !== t) {
        for (let k = 0; k < 9; k++) {
          positions[kept + k] = positions[t + k]!;
          normals[kept + k] = normals[t + k]!;
          colors[kept + k] = colors[t + k]!;
        }
      }
      kept += 9;
    }
    positions.length = kept;
    normals.length = kept;
    colors.length = kept;
  }

  private push(p: THREE.Vector3, n: THREE.Vector3): void {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.colors.push(this.color.r, this.color.g, this.color.b);
  }
}
