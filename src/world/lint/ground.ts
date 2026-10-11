import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import type { Finding } from './finding';
import { labelOf, pathOf } from './naming';

/** Over the ground under its lowest part by more than this: floating (a foot's felt, a kerb's rounding). */
const FLOAT = 0.03;
/** Into the ground by more than this: sunk (a post set in the pavement may go a little way in, by design). */
const SUNK = 0.15;
/** Parts whose boxes come this close are one thing (a lamp's head on its arm, a sign on its post). */
const TOUCH = 0.02;
/** A thing flatter than this lies on the ground by design (markings, plates, manhole lids): never floating. */
const FLAT = 0.03;
/** A part parked out of sight (a pooled car, a dog away) stands this far under the ground: not a part in place. */
const STASHED = -5;

/** A connected piece of a mesh (or one instance of an instanced one): its world box and whose it is. */
interface Part {
  box: THREE.Box3;
  owner: string;
}

/**
 * Where an outdoor subject's things stand on uneven ground (`ground(x, z)`, world: the street's road 12 cm under its
 * pavements, the dropped kerbs between): every mesh split into its connected pieces (an instanced mesh, a piece per
 * instance), the pieces whose boxes touch joined into things, and a thing found floating over the ground under its
 * lowest piece or sunk into it. What hangs by design (`Furniture.contactShadow` false: an awning, a garland, a
 * bracket sign) and the ground itself (`userData.ground`) are left out. Keyed by the owner's path, never coordinates.
 */
export function lintGround(built: THREE.Object3D, ground: (x: number, z: number) => number): Finding[] {
  built.updateWorldMatrix(true, true);
  const parts: Part[] = [];
  for (const item of built.children) {
    if (item.userData.ground || (item as Partial<Furniture>).contactShadow === false) continue;
    const label = labelOf(item, built);
    item.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry || !shown(mesh, item)) return;
      const owner = obj === item ? label : `${label} > ${pathOf(obj, item)}`;
      for (const box of piecesOf(mesh)) if (box.max.y > STASHED) parts.push({ box, owner });
    });
  }
  const findings: Finding[] = [];
  for (const thing of joined(parts)) {
    const lowest = thing.reduce((a, b) => (b.box.min.y < a.box.min.y ? b : a));
    const bounds = new THREE.Box3();
    for (const p of thing) bounds.union(p.box);
    const centre = lowest.box.getCenter(new THREE.Vector3());
    const floor = ground(centre.x, centre.z);
    const bottom = lowest.box.min.y;
    const cm = (v: number): number => Math.round(v * 100);
    if (bottom < floor - SUNK) findings.push({ check: 'sunk', key: lowest.owner, detail: `its bottom is ${cm(floor - bottom)} cm into the ground` });
    else if (bottom > floor + FLOAT && bounds.max.y - bounds.min.y >= FLAT) findings.push({ check: 'floating', key: lowest.owner, detail: `its bottom is ${cm(bottom - floor)} cm over the ground with nothing under it` });
  }
  return findings;
}

/** Drawn: visible down from `item`, with a visible material that writes colour (a hitbox draws nothing). */
function shown(mesh: THREE.Mesh, item: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = mesh; o && o !== item.parent; o = o.parent) if (!o.visible) return false;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return !!material && material.visible && material.colorWrite !== false;
}

/** The world boxes of `mesh`'s connected pieces: one per instance of an instanced mesh, else one per piece of its geometry. */
function piecesOf(mesh: THREE.Mesh): THREE.Box3[] {
  const geometry = mesh.geometry;
  const instanced = mesh as Partial<THREE.InstancedMesh>;
  if (instanced.isInstancedMesh && instanced.getMatrixAt) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const local = geometry.boundingBox!;
    const matrix = new THREE.Matrix4();
    const boxes: THREE.Box3[] = [];
    for (let i = 0; i < (instanced.count ?? 0); i++) {
      instanced.getMatrixAt(i, matrix);
      if (Math.abs(matrix.determinant()) < 1e-9) continue;
      boxes.push(local.clone().applyMatrix4(matrix.premultiply(mesh.matrixWorld)));
    }
    return boxes;
  }
  return componentBoxes(geometry).map((box) => box.applyMatrix4(mesh.matrixWorld));
}

/** The local boxes of `geometry`'s connected pieces (triangles sharing a vertex, vertices welded by position). */
function componentBoxes(geometry: THREE.BufferGeometry): THREE.Box3[] {
  const position = geometry.getAttribute('position');
  if (!position) return [];
  const welded = new Int32Array(position.count);
  const seen = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1000)},${Math.round(position.getY(i) * 1000)},${Math.round(position.getZ(i) * 1000)}`;
    const first = seen.get(key);
    welded[i] = first ?? i;
    if (first === undefined) seen.set(key, i);
  }
  const parent = Int32Array.from({ length: position.count }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    const ra = find(welded[a]!);
    const rb = find(welded[b]!);
    if (ra !== rb) parent[ra] = rb;
  };
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const at = (i: number): number => (index ? index.getX(i) : i);
  for (let i = 0; i + 2 < count; i += 3) {
    union(at(i), at(i + 1));
    union(at(i), at(i + 2));
  }
  const boxes = new Map<number, THREE.Box3>();
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const vertex = at(i);
    const root = find(welded[vertex]!);
    let box = boxes.get(root);
    if (!box) boxes.set(root, (box = new THREE.Box3()));
    box.expandByPoint(v.fromBufferAttribute(position, vertex));
  }
  return [...boxes.values()];
}

/** `parts` joined into things: those whose boxes, grown by `TOUCH`, overlap (sweep and prune along x). */
function joined(parts: readonly Part[]): Part[][] {
  const order = parts.map((_, i) => i).sort((a, b) => parts[a]!.box.min.x - parts[b]!.box.min.x);
  const parent = Int32Array.from({ length: parts.length }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const grown = parts.map((p) => p.box.clone().expandByScalar(TOUCH));
  let active: number[] = [];
  for (const i of order) {
    const box = grown[i]!;
    active = active.filter((j) => grown[j]!.max.x >= box.min.x);
    for (const j of active) {
      if (!box.intersectsBox(grown[j]!)) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[ri] = rj;
    }
    active.push(i);
  }
  const things = new Map<number, Part[]>();
  parts.forEach((p, i) => {
    const root = find(i);
    const thing = things.get(root);
    if (thing) thing.push(p);
    else things.set(root, [p]);
  });
  return [...things.values()];
}
