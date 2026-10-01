import * as THREE from 'three';

/** A rectangle of a texture, in UV (0..1, v up). */
export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export const FULL_UV: UvRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const d = new THREE.Vector3();
const n = new THREE.Vector3();

/**
 * Collects textured quads (signs, cards, lettering on glass, screens) into one geometry, each showing its rectangle
 * of a shared atlas: the textured counterpart of `relief/TriBuilder`, one draw call for all of a shopfront's.
 */
export class TexQuads {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  /**
   * A quad `width` x `height` centred at (x, y, z) in the frame `matrix` places, facing its +z (turned `yaw` about
   * its own y first): the texture's `uv` rectangle upright on it.
   */
  quad(matrix: THREE.Matrix4, x: number, y: number, z: number, width: number, height: number, uv: UvRect, yaw = 0, tilt = 0): this {
    const local = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeRotationX(tilt));
    const m = matrix.clone().multiply(local);
    const w = width / 2;
    const h = height / 2;
    a.set(-w, -h, 0).applyMatrix4(m);
    b.set(w, -h, 0).applyMatrix4(m);
    c.set(w, h, 0).applyMatrix4(m);
    d.set(-w, h, 0).applyMatrix4(m);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    this.push(a, uv.u0, uv.v0).push(b, uv.u1, uv.v0).push(c, uv.u1, uv.v1);
    this.push(a, uv.u0, uv.v0).push(c, uv.u1, uv.v1).push(d, uv.u0, uv.v1);
    return this;
  }

  /** The same quad from both sides, each reading the right way round (a hanging sign, a card on a string). */
  twoSided(matrix: THREE.Matrix4, x: number, y: number, z: number, width: number, height: number, front: UvRect, back: UvRect = front, yaw = 0, gap = 0.006): this {
    const offset = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(gap / 2);
    this.quad(matrix, x + offset.x, y, z + offset.z, width, height, front, yaw);
    return this.quad(matrix, x - offset.x, y, z - offset.z, width, height, back, yaw + Math.PI);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  private push(p: THREE.Vector3, u: number, v: number): this {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.uvs.push(u, v);
    return this;
  }
}
