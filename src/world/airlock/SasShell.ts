import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Prop } from '../props/Prop';
import { SAS } from './airlockPlan';
import { bake, sasFinish } from './sasFinish';

/** Subdivide the baked surfaces this finely (metres), so the globe's light grades smoothly across them. */
const CELL = 0.15;
/** How far the colliders reach behind the walls. */
const THICK = 0.15;

/**
 * Quads for baked surfaces, subdivided and uv'd in metres: `uv(p)` maps a sas-local point to its
 * texture coordinates. The winding follows `normal`.
 */
class Surfaces {
  private readonly parts: THREE.BufferGeometry[] = [];

  quad(origin: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, normal: THREE.Vector3, uv: (p: THREE.Vector3) => [number, number]): void {
    if (new THREE.Vector3().crossVectors(a, b).dot(normal) < 0) [a, b] = [b, a];
    const su = Math.max(1, Math.ceil(a.length() / CELL));
    const sv = Math.max(1, Math.ceil(b.length() / CELL));
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const p = new THREE.Vector3();
    for (let j = 0; j <= sv; j++) {
      for (let i = 0; i <= su; i++) {
        p.copy(origin).addScaledVector(a, i / su).addScaledVector(b, j / sv);
        positions.push(p.x, p.y, p.z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(...uv(p));
      }
    }
    for (let j = 0; j < sv; j++) {
      for (let i = 0; i < su; i++) {
        const k = j * (su + 1) + i;
        indices.push(k, k + 1, k + su + 2, k, k + su + 2, k + su + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    this.parts.push(geometry);
  }

  /** A box's faces (sas-local, axis-aligned), for trims and mats. */
  box(center: THREE.Vector3, size: THREE.Vector3): void {
    const g = new THREE.BoxGeometry(size.x, size.y, size.z).translate(center.x, center.y, center.z);
    this.parts.push(g.toNonIndexed());
  }

  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const indexed = this.parts.every((g) => g.index !== null);
    const merged = mergeGeometries(indexed ? this.parts : this.parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
    for (const part of this.parts) part.dispose();
    return bake(merged);
  }
}

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const X = v(1, 0, 0);
const Y = v(0, 1, 0);
const Z = v(0, 0, 1);

/**
 * The sas's room (see `airlockPlan.ts`): the tiled floor and a doormat, the plaster ceiling and its
 * globe, the side walls with their marble dado, the street wall round the street door's opening and
 * its reveal, the partition round the inner door's, architraves, the syndic's notice. Everything
 * seen from inside is baked (`sasFinish`); the partition's face on the building side is lit, like the
 * entrance hall it closes. Walls are colliders and stop the crosshair. Sas-local: place it at the
 * street door's outer face, +z out.
 */
export class SasShell extends Prop {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[];
  readonly occluders: THREE.Object3D[] = [];

  constructor() {
    super();
    this.name = 'SasShell';
    const f = sasFinish();
    const { width, depth, height, wall, partition, outerDoor: od, innerDoor: id } = SAS;
    const x0 = -width / 2;
    const x1 = width / 2;
    const zb = -(depth - partition);
    const zf = -wall;
    const zp = -depth;

    const walls = new Surfaces();
    const along = (p: THREE.Vector3, axis: 'x' | 'z'): [number, number] => [p[axis], p.y / 3];
    // Side walls.
    walls.quad(v(x0, 0, zb), v(0, 0, zf - zb), v(0, height, 0), X, (p) => along(p, 'z'));
    walls.quad(v(x1, 0, zb), v(0, 0, zf - zb), v(0, height, 0), X.clone().negate(), (p) => along(p, 'z'));
    // The street wall's inner face round the opening, and the opening's reveal through the wall.
    const street = (a: number, b: number, y0: number, y1: number): void => walls.quad(v(a, y0, zf), v(b - a, 0, 0), v(0, y1 - y0, 0), Z.clone().negate(), (p) => along(p, 'x'));
    street(x0, -od.width / 2, 0, height);
    street(od.width / 2, x1, 0, height);
    street(-od.width / 2, od.width / 2, od.height, height);
    walls.quad(v(-od.width / 2, 0, zf), v(0, 0, wall), v(0, od.height, 0), X, (p) => along(p, 'z'));
    walls.quad(v(od.width / 2, 0, zf), v(0, 0, wall), v(0, od.height, 0), X.clone().negate(), (p) => along(p, 'z'));
    walls.quad(v(-od.width / 2, od.height, zf), v(od.width, 0, 0), v(0, 0, wall), Y.clone().negate(), (p) => [p.x, 0.95]);
    // The partition's sas face round the inner door, and that opening's reveal.
    const inner = (a: number, b: number, y0: number, y1: number): void => walls.quad(v(a, y0, zb), v(b - a, 0, 0), v(0, y1 - y0, 0), Z, (p) => along(p, 'x'));
    inner(x0, -id.width / 2, 0, height);
    inner(id.width / 2, x1, 0, height);
    inner(-id.width / 2, id.width / 2, id.height, height);
    walls.quad(v(-id.width / 2, 0, zp), v(0, 0, partition), v(0, id.height, 0), X, (p) => along(p, 'z'));
    walls.quad(v(id.width / 2, 0, zp), v(0, 0, partition), v(0, id.height, 0), X.clone().negate(), (p) => along(p, 'z'));
    walls.quad(v(-id.width / 2, id.height, zp), v(id.width, 0, 0), v(0, 0, partition), Y.clone().negate(), (p) => [p.x, 0.95]);
    this.mesh(walls, f.wall, true);

    const floor = new Surfaces();
    floor.quad(v(x0, 0.004, zb), v(width, 0, 0), v(0, 0, zf - zb), Y, (p) => [p.x, p.z]);
    this.mesh(floor, f.floor);
    const stone = new Surfaces();
    stone.quad(v(-od.width / 2, 0.004, zf), v(od.width, 0, 0), v(0, 0, wall), Y, (p) => [p.x, p.z]);
    stone.quad(v(-id.width / 2, 0.004, zp), v(id.width, 0, 0), v(0, 0, partition), Y, (p) => [p.x, p.z]);
    this.mesh(stone, f.stone);
    const ceiling = new Surfaces();
    ceiling.quad(v(x0, height, zb), v(width, 0, 0), v(0, 0, zf - zb), Y.clone().negate(), (p) => [p.x, p.z]);
    this.mesh(ceiling, f.ceiling);

    // Architraves on the sas side of both doors; the doormat inside the street door.
    const trims = new Surfaces();
    const frame = (w: number, h: number, z: number, out: number): void => {
      const t = 0.07;
      const d = 0.02;
      for (const side of [-1, 1]) trims.box(v(side * (w / 2 + t / 2), (h + t) / 2, z + (out * d) / 2), v(t, h + t, d));
      trims.box(v(0, h + t / 2, z + (out * d) / 2), v(w + 2 * t, t, d));
    };
    frame(od.width, od.height, zf, -1);
    frame(id.width, id.height, zb, 1);
    // The globe's rod and rose.
    trims.box(v(SAS.lamp[0], height - 0.05, SAS.lamp[2]), v(0.012, 0.1, 0.012));
    this.mesh(trims, f.trim);
    const mat = new Surfaces();
    mat.box(v(0, 0.01, zf - 0.38), v(1.1, 0.012, 0.55));
    this.mesh(mat, f.mat);
    const notice = new Surfaces();
    notice.quad(v(x0 + 0.003, SAS.notice.y - 0.16, SAS.notice.z - 0.12), v(0, 0, 0.24), v(0, 0.32, 0), X, (p) => [1 - (p.z - (SAS.notice.z - 0.12)) / 0.24, (p.y - (SAS.notice.y - 0.16)) / 0.32]);
    this.mesh(notice, f.notice);

    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), f.globe);
    globe.position.set(...SAS.lamp);
    this.add(globe);

    // What the building side sees: the partition's plaster round the inner door, up to the hall's ceiling, and its architrave.
    const reach = SAS.partitionReach;
    const hall = (a: number, b: number, y0: number, y1: number): void => {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(b - a, y1 - y0), f.hallPlaster);
      plane.position.set((a + b) / 2, (y0 + y1) / 2, zp);
      plane.rotation.y = Math.PI;
      plane.receiveShadow = true;
      this.add(plane);
      this.occluders.push(plane);
    };
    hall(-reach, -id.width / 2, 0, SAS.partitionHeight);
    hall(id.width / 2, reach, 0, SAS.partitionHeight);
    hall(-id.width / 2, id.width / 2, id.height, SAS.partitionHeight);
    for (const side of [-1, 1]) this.lit(v(side * (id.width / 2 + 0.035), (id.height + 0.07) / 2, zp - 0.01), v(0.07, id.height + 0.07, 0.02));
    this.lit(v(0, id.height + 0.035, zp - 0.01), v(id.width + 0.14, 0.07, 0.02));

    const box = (ax: number, az: number, bx: number, bz: number): THREE.Box3 => new THREE.Box3(v(Math.min(ax, bx), 0, Math.min(az, bz)), v(Math.max(ax, bx), 3, Math.max(az, bz)));
    this.colliders = [
      box(x0 - THICK, zp, x0, 0.05),
      box(x1, zp, x1 + THICK, 0.05),
      box(x0 - THICK, zf, -od.width / 2, 0.05),
      box(od.width / 2, zf, x1 + THICK, 0.05),
      box(x0 - THICK, zp, -id.width / 2, zb),
      box(id.width / 2, zp, x1 + THICK, zb),
    ];
  }

  /** The baked surfaces as one mesh; they neither cast nor take shadows (their light is their own). */
  private mesh(surfaces: Surfaces, material: THREE.Material, occludes = false): void {
    const geometry = surfaces.build();
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, material);
    this.add(mesh);
    if (occludes) this.occluders.push(mesh);
  }

  private lit(center: THREE.Vector3, size: THREE.Vector3): void {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), sasFinish().hallTrim);
    trim.position.copy(center);
    trim.receiveShadow = true;
    this.add(trim);
  }
}
