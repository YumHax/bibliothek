import * as THREE from 'three';
import type { BoxDimensions, Game } from '@/catalog/types';
import { fnv1a } from '@/random';
import type { Slab } from './slabs';

/*
 * How a copy's variant shows on its box (`Game.variant`, `economy/copyTraits`), with what the box already has: no new
 * map, no new program. A sealed box's shrink-wrap is its own clearcoat turned up (the finish the print already uses);
 * a crushed one has a corner pushed in, its own geometry moved (the closed box's and the shell's are the box's, never
 * shared).
 */

/** The shrink-wrap: a glassy coat over the print, a touch smoother. */
const WRAP = { clearcoat: 1, clearcoatRoughness: 0.04, roughness: 0.7 } as const;
/** A crushed corner: how far it is pushed in (m, along each side), how far the crumple reaches, and how near it may come to what the box holds. */
const DENT = { depth: 0.011, reach: 0.045, clearance: 0.0004 } as const;

/** Each material's own finish before the wrap, to give it back when the seal is broken. */
const unwrapped = new WeakMap<THREE.MeshStandardMaterial, { roughness: number; clearcoat?: number; clearcoatRoughness?: number }>();

/** Puts the shrink-wrap's finish on (or takes it off) `materials`. */
export function setWrapped(materials: readonly THREE.MeshStandardMaterial[], wrapped: boolean): void {
  for (const mat of materials) {
    const physical = mat instanceof THREE.MeshPhysicalMaterial ? mat : null;
    if (wrapped) {
      if (unwrapped.has(mat)) continue;
      unwrapped.set(mat, { roughness: mat.roughness, clearcoat: physical?.clearcoat, clearcoatRoughness: physical?.clearcoatRoughness });
      mat.roughness *= WRAP.roughness;
      if (physical) {
        // Only where the coat is already on (a program with clearcoat): turning it on from 0 would compile another.
        if (physical.clearcoat > 0) physical.clearcoat = WRAP.clearcoat;
        physical.clearcoatRoughness = WRAP.clearcoatRoughness;
      }
    } else {
      const before = unwrapped.get(mat);
      if (!before) continue;
      unwrapped.delete(mat);
      mat.roughness = before.roughness;
      if (physical && before.clearcoat !== undefined) physical.clearcoat = before.clearcoat;
      if (physical && before.clearcoatRoughness !== undefined) physical.clearcoatRoughness = before.clearcoatRoughness;
    }
  }
}

/**
 * The corner a crushed copy took the knock on (box space, the box centred on its origin), from its id: a top front one,
 * where the box has air over its contents (at the bottom they rest on the card, and the dent would have no room).
 */
export function dentedCorner(game: Pick<Game, 'id'>, dims: BoxDimensions): THREE.Vector3 {
  const h = fnv1a(`${game.id}:dent`);
  return new THREE.Vector3((h & 1 ? 1 : -1) * dims.width / 2, dims.height / 2, dims.depth / 2);
}

/**
 * How far the knock at `corner` may push each side in (m per axis): up to what the box holds (`held`, at rest in
 * `cavity`), never into it, or the cartridge would show through the card once the box is open.
 */
export function dentRoom(corner: THREE.Vector3, cavity: Slab, held: readonly Slab[]): THREE.Vector3 {
  const room = new THREE.Vector3();
  for (const axis of ['x', 'y', 'z'] as const) {
    const gap = corner[axis] > 0 ? cavity[axis].max - Math.max(...held.map((s) => s[axis].max)) : Math.min(...held.map((s) => s[axis].min)) - cavity[axis].min;
    room[axis] = Math.max(0, gap - DENT.clearance);
  }
  return room;
}

/**
 * Pushes the box's corner `corner` in: every vertex within `DENT.reach` of it moves towards the box's middle, the
 * nearer the more (the corner itself by `DENT.depth` along the face's two sides, less through the depth, and never
 * more than `room` on each axis: `dentRoom`). `toBox` takes the geometry's own space to the box's (a shell part on its
 * hinge); null when they are the same. The closed box and the shell take the same dent: nothing jumps when it opens.
 */
export function dentGeometry(geometry: THREE.BufferGeometry, corner: THREE.Vector3, dims: BoxDimensions, room: THREE.Vector3, toBox: THREE.Matrix4 | null = null): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!position) return;
  const fromBox = toBox ? toBox.clone().invert() : null;
  const p = new THREE.Vector3();
  const inward = new THREE.Vector3(-Math.sign(corner.x), -Math.sign(corner.y), -Math.sign(corner.z));
  const push = new THREE.Vector3(DENT.depth, DENT.depth, Math.min(DENT.depth * 0.4, dims.depth * 0.2)).min(room);
  let moved = false;
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    if (toBox) p.applyMatrix4(toBox);
    const near = 1 - p.distanceTo(corner) / DENT.reach;
    if (near <= 0) continue;
    const fall = near * near;
    p.x += inward.x * push.x * fall;
    p.y += inward.y * push.y * fall;
    p.z += inward.z * push.z * fall;
    if (fromBox) p.applyMatrix4(fromBox);
    position.setXYZ(i, p.x, p.y, p.z);
    moved = true;
  }
  if (!moved) return;
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
}

/** Dents every mesh under `root` (a shell built at its closed pose, parentless: its own space is the box's). */
export function dentObject(root: THREE.Object3D, corner: THREE.Vector3, dims: BoxDimensions, room: THREE.Vector3): void {
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) dentGeometry(obj.geometry as THREE.BufferGeometry, corner, dims, room, obj.matrixWorld);
  });
}
