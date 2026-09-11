import * as THREE from 'three';

export type Axis = 'x' | 'y' | 'z';
export type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

export interface Range {
  min: number;
  max: number;
}

/** An axis-aligned block, in the local metres of the object being built. */
export interface Slab {
  x: Range;
  y: Range;
  z: Range;
}

export function slab(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Slab {
  return { x: { min: x0, max: x1 }, y: { min: y0, max: y1 }, z: { min: z0, max: z1 } };
}

/** A slab of the given size centred on the origin. */
export function centredSlab(width: number, height: number, depth: number): Slab {
  return slab(-width / 2, width / 2, -height / 2, height / 2, -depth / 2, depth / 2);
}

export function slabCentre(s: Slab): THREE.Vector3 {
  return new THREE.Vector3((s.x.min + s.x.max) / 2, (s.y.min + s.y.max) / 2, (s.z.min + s.z.max) / 2);
}

export function slabSize(s: Slab): THREE.Vector3 {
  return new THREE.Vector3(s.x.max - s.x.min, s.y.max - s.y.min, s.z.max - s.z.min);
}

/**
 * How each face is parameterised, mirroring three's BoxGeometry so a texture painted for a whole
 * box keeps its orientation when only a fragment of that box is drawn (e.g. the lid's slice of the
 * spine). `u`/`v` name the in-plane axes and the direction in which the texture coordinate grows.
 */
const FACES: Record<Face, { n: Axis; nSign: 1 | -1; u: Axis; uSign: 1 | -1; v: Axis; vSign: 1 | -1 }> = {
  px: { n: 'x', nSign: 1, u: 'z', uSign: -1, v: 'y', vSign: 1 },
  nx: { n: 'x', nSign: -1, u: 'z', uSign: 1, v: 'y', vSign: 1 },
  py: { n: 'y', nSign: 1, u: 'x', uSign: 1, v: 'z', vSign: -1 },
  ny: { n: 'y', nSign: -1, u: 'x', uSign: 1, v: 'z', vSign: 1 },
  pz: { n: 'z', nSign: 1, u: 'x', uSign: 1, v: 'y', vSign: 1 },
  nz: { n: 'z', nSign: -1, u: 'x', uSign: -1, v: 'y', vSign: 1 },
};

interface Bucket {
  positions: number[];
  normals: number[];
  uvs: number[];
}

/**
 * Builds a geometry out of rectangular faces, one material group per material index.
 * Every quad is a face of some slab; its UVs are the slab's footprint inside `textureSpace`
 * (by default the whole object), so several fragments can share one texture seamlessly.
 */
export class QuadGeometryBuilder {
  private readonly buckets = new Map<number, Bucket>();

  constructor(private readonly full: Slab) {}

  add(face: Face, s: Slab, materialIndex: number, textureSpace: Slab = this.full): this {
    const f = FACES[face];
    const bucket = this.bucket(materialIndex);
    const normal = new THREE.Vector3();
    normal[f.n] = f.nSign;

    const corner = (su: 0 | 1, sv: 0 | 1): { p: THREE.Vector3; uv: [number, number] } => {
      const p = new THREE.Vector3();
      p[f.n] = f.nSign > 0 ? s[f.n].max : s[f.n].min;
      p[f.u] = (f.uSign > 0) === (su === 1) ? s[f.u].max : s[f.u].min;
      p[f.v] = (f.vSign > 0) === (sv === 1) ? s[f.v].max : s[f.v].min;
      const nu = normalise(p[f.u], textureSpace[f.u]);
      const nv = normalise(p[f.v], textureSpace[f.v]);
      return { p, uv: [f.uSign > 0 ? nu : 1 - nu, f.vSign > 0 ? nv : 1 - nv] };
    };

    const c00 = corner(0, 0), c10 = corner(1, 0), c01 = corner(0, 1), c11 = corner(1, 1);
    // Wind the triangles so they face the outward normal.
    const winding = new THREE.Vector3().subVectors(c10.p, c00.p).cross(new THREE.Vector3().subVectors(c01.p, c00.p));
    const flip = winding.dot(normal) < 0;
    const tris = flip ? [c00, c11, c10, c00, c01, c11] : [c00, c10, c11, c00, c11, c01];
    for (const c of tris) {
      bucket.positions.push(c.p.x, c.p.y, c.p.z);
      bucket.normals.push(normal.x, normal.y, normal.z);
      bucket.uvs.push(c.uv[0], c.uv[1]);
    }
    return this;
  }

  /** All six faces of a slab with one material. */
  addBox(s: Slab, materialIndex: number, textureSpace: Slab = this.full): this {
    for (const face of Object.keys(FACES) as Face[]) this.add(face, s, materialIndex, textureSpace);
    return this;
  }

  build(): THREE.BufferGeometry {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
    const geometry = new THREE.BufferGeometry();
    for (const index of [...this.buckets.keys()].sort((a, b) => a - b)) {
      const bucket = this.buckets.get(index)!;
      const start = positions.length / 3;
      positions.push(...bucket.positions);
      normals.push(...bucket.normals);
      uvs.push(...bucket.uvs);
      geometry.addGroup(start, bucket.positions.length / 3, index);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    return geometry;
  }

  private bucket(index: number): Bucket {
    let bucket = this.buckets.get(index);
    if (!bucket) {
      bucket = { positions: [], normals: [], uvs: [] };
      this.buckets.set(index, bucket);
    }
    return bucket;
  }
}

function normalise(value: number, range: Range): number {
  const span = range.max - range.min;
  return span === 0 ? 0 : (value - range.min) / span;
}
