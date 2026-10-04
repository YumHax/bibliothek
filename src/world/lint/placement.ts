import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { Room, type RoomOptions } from '../Room';
import type { Finding } from './finding';
import { labelOf } from './naming';

/** Below the floor by more than this: sunk (a layer is millimetres; a leaning thing's rim may dip a little). */
const SUNK = 0.015;
/** Off the floor by more than this with nothing under it and no wall or ceiling to hang from: floating. */
const FLOAT = 0.02;
/** A support's top is at most this far under the thing it carries (a leg's foot, a felt pad). */
const SUPPORT_GAP = 0.03;
/** Within this of a wall plane or the ceiling, a thing counts as mounted on it. */
const MOUNTED = 0.05;
/** Past a wall plane (the walls are planes) or the ceiling by more than this: outside the room. */
const OUTSIDE = 0.12;
/** Things flatter than this (rugs, flyers, doormats) lie under or on others by design: no overlap or floating check. */
const FLAT = 0.03;
/** Two parts of different things may share at most this share of the smaller one's volume. */
const OVERLAP = 0.5;
/** Parts smaller than this (m³, a cubic centimetre) are not worth an overlap finding. */
const TINY = 1e-6;
/** How much of a thing's footprint a support must cover to carry it. */
const CARRIED = 0.5;

interface Item {
  label: string;
  /**
   * Not standing on the floor by design, so it never floats: hung on a wall or the ceiling by its plan line
   * (`userData.lintAt`, set by the catalogue), or saying so itself (`Furniture.contactShadow` false: a garland strung
   * overhead, a throw on a chair the live shop stocks).
   */
  hung: boolean;
  box: THREE.Box3;
  /** The world boxes of what it draws. */
  parts: THREE.Box3[];
}

/** The world boxes of what `object` draws: visible meshes with a visible material (a hitbox draws nothing). */
function partsOf(object: THREE.Object3D): THREE.Box3[] {
  const parts: THREE.Box3[] = [];
  object.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    for (let o: THREE.Object3D | null = mesh; o && o !== object.parent; o = o.parent) if (!o.visible) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material || !material.visible || material.colorWrite === false) return;
    const box = boxOf(mesh);
    if (box && !box.isEmpty()) parts.push(box);
  });
  return parts;
}

/** The mesh's world box: its instances' when instanced, its geometry's otherwise. */
function boxOf(mesh: THREE.Mesh): THREE.Box3 | null {
  const instanced = mesh as Partial<THREE.InstancedMesh>;
  if (instanced.isInstancedMesh && typeof instanced.computeBoundingBox === 'function') {
    instanced.computeBoundingBox();
    return instanced.boundingBox ? instanced.boundingBox.clone().applyMatrix4(mesh.matrixWorld) : null;
  }
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox ? mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld) : null;
}

function size(box: THREE.Box3): THREE.Vector3 {
  return box.getSize(new THREE.Vector3());
}

function volume(box: THREE.Box3): number {
  const s = size(box);
  return Math.max(0, s.x) * Math.max(0, s.y) * Math.max(0, s.z);
}

function xzOverlap(a: THREE.Box3, b: THREE.Box3): number {
  const w = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const d = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  return w > 0 && d > 0 ? w * d : 0;
}

/** Whether `item` stands on another item's part: a top within `SUPPORT_GAP` under its bottom, covering half its footprint. */
function carried(item: Item, others: readonly Item[]): boolean {
  const bottom = item.box.min.y;
  const s = size(item.box);
  const area = s.x * s.z;
  for (const other of others) {
    for (const part of other.parts) {
      if (part.max.y > bottom + 0.01 || part.max.y < bottom - SUPPORT_GAP) continue;
      if (xzOverlap(item.box, part) >= CARRIED * area) return true;
    }
  }
  return false;
}

/** Hung by design, or touching a wall plane or the ceiling. */
function mounted({ hung, box }: Item, room: RoomOptions): boolean {
  if (hung) return true;
  const hw = room.width / 2;
  const hd = room.depth / 2;
  return box.min.x <= -hw + MOUNTED || box.max.x >= hw - MOUNTED || box.min.z <= -hd + MOUNTED || box.max.z >= hd - MOUNTED || box.max.y >= room.height - MOUNTED;
}

/** How far the box leaves the room, in words, or null when it stays in. */
function outside(box: THREE.Box3, room: RoomOptions): string | null {
  const hw = room.width / 2;
  const hd = room.depth / 2;
  const cm = (v: number) => `${Math.round(v * 100)} cm`;
  if (box.min.x < -hw - OUTSIDE) return `${cm(-hw - box.min.x)} through the left wall`;
  if (box.max.x > hw + OUTSIDE) return `${cm(box.max.x - hw)} through the right wall`;
  if (box.min.z < -hd - OUTSIDE) return `${cm(-hd - box.min.z)} through the back wall`;
  if (box.max.z > hd + OUTSIDE) return `${cm(box.max.z - hd)} through the front wall`;
  if (box.max.y > room.height + OUTSIDE) return `${cm(box.max.y - room.height)} through the ceiling`;
  return null;
}

/** The worst overlap between a part of `a` and a part of `b`: the share of the smaller part's volume they have in common. */
function worstOverlap(a: Item, b: Item): number {
  let worst = 0;
  const common = new THREE.Box3();
  for (const pa of a.parts) {
    for (const pb of b.parts) {
      if (!pa.intersectsBox(pb)) continue;
      const smaller = Math.min(volume(pa), volume(pb));
      if (smaller < TINY) continue;
      common.copy(pa).intersect(pb);
      worst = Math.max(worst, volume(common) / smaller);
    }
  }
  return worst;
}

/**
 * Where a room subject's plan put things (`built`: the catalogue's group, the `Room` shell then the placed items):
 * sunk under the floor, floating with nothing under them, outside the walls, or two things sharing one space (parts
 * of both in the same volume; a thing resting on another shares next to nothing with it). Flat things (rugs, flyers)
 * are only checked for sinking and for leaving the room.
 */
export function lintPlacement(built: THREE.Object3D, room: RoomOptions): Finding[] {
  built.updateWorldMatrix(true, true);
  const findings: Finding[] = [];
  const items: Item[] = [];
  for (const object of built.children) {
    if (object instanceof Room || object.name === 'Floor') continue;
    const parts = partsOf(object);
    if (!parts.length) continue;
    const box = new THREE.Box3();
    for (const part of parts) box.union(part);
    const at: unknown = object.userData.lintAt;
    const hung = at === 'wall' || at === 'ceiling' || (object as Partial<Furniture>).contactShadow === false;
    items.push({ label: labelOf(object, built), hung, box, parts });
  }
  for (const item of items) {
    const flat = size(item.box).y < FLAT;
    if (item.box.min.y < -SUNK) findings.push({ check: 'sunk', key: item.label, detail: `its bottom is ${Math.round(-item.box.min.y * 1000)} mm under the floor` });
    const out = outside(item.box, room);
    if (out) findings.push({ check: 'outside', key: item.label, detail: `reaches ${out}` });
    if (!flat && item.box.min.y > FLOAT && !mounted(item, room) && !carried(item, items.filter((o) => o !== item))) {
      findings.push({ check: 'floating', key: item.label, detail: `its bottom is ${Math.round(item.box.min.y * 100)} cm up with nothing under it` });
    }
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (size(a.box).y < FLAT || size(b.box).y < FLAT || !a.box.intersectsBox(b.box)) continue;
      const share = worstOverlap(a, b);
      if (share > OVERLAP) findings.push({ check: 'overlap', key: `${a.label} ~ ${b.label}`, detail: `parts of the two share ${Math.round(share * 100)} % of the smaller part` });
    }
  }
  return findings;
}
