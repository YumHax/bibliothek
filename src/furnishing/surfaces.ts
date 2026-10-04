import * as THREE from 'three';
import type { Placement } from '@/world/Placement';
import type { RoomOptions, Wall } from '@/world/Room';
import { wallMount } from '@/world/props/wallMount';
import { angleTo } from '@/math/angles';

/** What a piece moves over: the floor (standing), a wall (hung flat, facing into the room), the ceiling (hanging). */
export type Surface = 'floor' | 'wall' | 'ceiling';

/** Hung on a wall: its plan puts it no further off the wall than this (m). Further, it stands on something (a worktop). */
const HUNG_OFFSET = 0.06;
/** A floor piece whose back comes this close to a wall, turned roughly to face away from it, is pushed flush (m, radians). */
const SNAP_DISTANCE = 0.25;
const SNAP_ANGLE = THREE.MathUtils.degToRad(25);
/** What is left between a piece and the wall it stands against or hangs on, and between it and the ceiling (m). */
const WALL_GAP = 0.005;
const EDGE = 0.02;

/** The surface a piece placed at `at` moves over, and how far off a wall it hangs; null: it stays (it rests on something else). */
export function surfaceOf(at: Placement | undefined): { surface: Surface; offset: number } | null {
  if (!at || 'floor' in at) return { surface: 'floor', offset: 0 };
  if ('ceiling' in at) return { surface: 'ceiling', offset: 0 };
  if ('corner' in at) return { surface: at.hung ? 'ceiling' : 'floor', offset: 0 };
  // On the floor against a wall: a floor piece (it snaps back against a wall when set down near one).
  if (at.y === 0) return { surface: 'floor', offset: 0 };
  const offset = at.offset ?? 0;
  return offset <= HUNG_OFFSET ? { surface: 'wall', offset } : null;
}

/** A pose in the zone's frame. */
export interface Pose {
  position: THREE.Vector3;
  yaw: number;
}

/** A wall's inward normal and the yaw of something facing into the room from it. */
const WALLS: readonly { wall: Wall; normal: THREE.Vector3; yaw: number }[] = [
  { wall: 'back', normal: new THREE.Vector3(0, 0, 1), yaw: 0 },
  { wall: 'front', normal: new THREE.Vector3(0, 0, -1), yaw: Math.PI },
  { wall: 'left', normal: new THREE.Vector3(1, 0, 0), yaw: Math.PI / 2 },
  { wall: 'right', normal: new THREE.Vector3(-1, 0, 0), yaw: -Math.PI / 2 },
];

/** The inward normal of the wall a hung piece turned `yaw` faces the room from. */
export function wallNormal(yaw: number): THREE.Vector3 {
  let best = WALLS[0]!;
  for (const w of WALLS) if (Math.abs(angleTo(yaw, w.yaw)) < Math.abs(angleTo(yaw, best.yaw))) best = w;
  return best.normal;
}

/**
 * Where `ray` (zone-local) puts a piece of `surface` with local bounds `bounds`, turned `yaw` (floor and ceiling;
 * a wall sets its own): on the floor or the ceiling where the ray meets it, on the nearest wall it meets. Kept
 * inside `room`. Null when the ray meets no such surface (looking up at a floor piece).
 */
export function aimedPose(ray: THREE.Ray, room: Pick<RoomOptions, 'width' | 'depth' | 'height'>, surface: Surface, offset: number, bounds: THREE.Box3, yaw: number): Pose | null {
  const { origin: o, direction: d } = ray;
  if (surface === 'wall') return onWall(ray, room, offset, bounds);
  const height = surface === 'floor' ? 0 : room.height;
  if (Math.abs(d.y) < 1e-4) return null;
  const t = (height - o.y) / d.y;
  if (t <= 0) return null;
  const position = o.clone().addScaledVector(d, t);
  position.y = height;
  clampInside(position, room, bounds, yaw);
  return { position, yaw };
}

/** The nearest wall the ray meets from inside the room: the piece hangs there where the ray meets it, clamped to the wall. */
function onWall(ray: THREE.Ray, room: Pick<RoomOptions, 'width' | 'depth' | 'height'>, offset: number, bounds: THREE.Box3): Pose | null {
  const halfW = room.width / 2;
  const halfD = room.depth / 2;
  const { origin: o, direction: d } = ray;
  let best: { wall: Wall; t: number } | null = null;
  for (const { wall, normal } of WALLS) {
    const facing = normal.dot(d);
    if (facing >= -1e-4) continue; // walking away from that wall
    const plane = normal.x !== 0 ? halfW : halfD;
    // The wall's plane: p . normal = -plane.
    const t = (-plane - normal.dot(o)) / facing;
    if (t > 0 && (!best || t < best.t)) best = { wall, t };
  }
  if (!best) return null;
  const hit = o.clone().addScaledVector(d, best.t);
  const length = best.wall === 'back' || best.wall === 'front' ? room.width : room.depth;
  let along = best.wall === 'back' || best.wall === 'front' ? hit.x : hit.z;
  // In the wall's frame the piece's local x runs along the wall (mirrored on two walls: keep it symmetric).
  const half = Math.max(-bounds.min.x, bounds.max.x);
  along = THREE.MathUtils.clamp(along, -length / 2 + half + EDGE, length / 2 - half - EDGE);
  const y = THREE.MathUtils.clamp(hit.y, EDGE - bounds.min.y, room.height - EDGE - bounds.max.y);
  const mount = wallMount({ ...room, doorways: [] }, best.wall, along, y, offset);
  return { position: mount.position, yaw: mount.rotationY };
}

/** Moves `position` so the piece's bounds, turned `yaw`, stay inside the room's floor plan. */
export function clampInside(position: THREE.Vector3, room: Pick<RoomOptions, 'width' | 'depth'>, bounds: THREE.Box3, yaw: number): void {
  const box = turnedBounds(bounds, yaw);
  const halfW = room.width / 2 - WALL_GAP;
  const halfD = room.depth / 2 - WALL_GAP;
  position.x = clampSpan(position.x, box.min.x, box.max.x, halfW);
  position.z = clampSpan(position.z, box.min.z, box.max.z, halfD);
}

/** `x` such that `[x + min, x + max]` stays in `[-half, half]` (centred when it is wider). */
function clampSpan(x: number, min: number, max: number, half: number): number {
  const lo = -half - min;
  const hi = half - max;
  return lo > hi ? (lo + hi) / 2 : THREE.MathUtils.clamp(x, lo, hi);
}

/**
 * A floor piece near a wall, turned roughly away from it: turned square and pushed back flush against it (a
 * sideboard, a bed's headboard, a shoe rack). Changes `pose` in place; true when it snapped.
 */
export function snapToWall(pose: Pose, room: Pick<RoomOptions, 'width' | 'depth'>, bounds: THREE.Box3): boolean {
  for (const { normal, yaw } of WALLS) {
    if (Math.abs(angleTo(pose.yaw, yaw)) > SNAP_ANGLE) continue;
    const plane = normal.x !== 0 ? room.width / 2 : room.depth / 2;
    // Squared up, the piece's back (local -z) faces the wall: its back stands at p . normal + min.z.
    const along = pose.position.dot(normal);
    const back = along + bounds.min.z;
    if (back - -plane > SNAP_DISTANCE) continue;
    pose.yaw = yaw;
    pose.position.addScaledVector(normal, -plane + WALL_GAP - bounds.min.z - along);
    return true;
  }
  return false;
}

/** The axis-aligned box (zone axes) of `bounds` turned `yaw` about y. */
export function turnedBounds(bounds: THREE.Box3, yaw: number): THREE.Box3 {
  return bounds.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(yaw));
}
