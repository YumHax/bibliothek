import * as THREE from 'three';
import type { RoomOptions } from '@/world/Room';

/** The grid a carried piece snaps to (m): its footprint's edges land on these lines, counted from the room's back-left corner. */
export const CELL = 0.1;
/** R and Q turn a piece a quarter; the wheel an eighth. Off the grid (G), the wheel turns it by 15°. */
export const TURN_STEP = Math.PI / 2;
export const WHEEL_STEP = Math.PI / 4;
export const FREE_WHEEL_STEP = THREE.MathUtils.degToRad(15);
/** Within this of a wall (m), a piece on the grid is pushed flush against it. */
const MAGNET = CELL * 0.75;
/** Within this (m), a piece's edge or centre lines up with a neighbour's (it wins over the grid). */
const ALIGN = 0.045;
/** A neighbour this far off (m) on the other axis is not lined up with. */
const ALIGN_REACH = 1.6;
/** What is left between a piece and the wall it stands against (m); `surfaces.ts` keeps the same. */
const WALL_GAP = 0.005;

type Extent = Pick<RoomOptions, 'width' | 'depth' | 'height'>;

/**
 * `yaw` turned one `step` in `direction` (+1 / -1) onto the absolute grid of `step`s: from a piece standing at an
 * odd angle, the first turn squares it (0.3 rad turned a quarter lands on 90°, not 0.3 + 90°).
 */
export function nextAngle(yaw: number, direction: number, step: number): number {
  const eps = 1e-3;
  const n = direction > 0 ? Math.floor((yaw + eps) / step) + 1 : Math.ceil((yaw - eps) / step) - 1;
  return n * step;
}

/** `yaw` rounded onto the grid of `step`s. */
export function snapAngle(yaw: number, step: number): number {
  return Math.round(yaw / step) * step;
}

/** Whether `yaw` is square to the room (a multiple of 90°, to a hair). */
export function isSquare(yaw: number): boolean {
  const q = yaw / (Math.PI / 2);
  return Math.abs(q - Math.round(q)) < 1e-3;
}

/** `value` such that `value + min` lands on the grid counted from `origin`. */
function onLine(value: number, min: number, origin: number): number {
  const edge = value + min;
  return value + (origin + Math.round((edge - origin) / CELL) * CELL - edge);
}

/**
 * A floor or ceiling piece's position (zone-local, changed in place) moved so its turned footprint `box` (local to
 * the piece) has its back-left corner on the grid.
 */
export function snapFloor(position: THREE.Vector3, box: THREE.Box3, room: Extent): void {
  position.x = onLine(position.x, box.min.x, -room.width / 2 + WALL_GAP);
  position.z = onLine(position.z, box.min.z, -room.depth / 2 + WALL_GAP);
}

/** A floor piece (turned footprint `box`, local) within `MAGNET` of a wall pushed flush against it, on either axis; true when it moved. */
export function toWalls(position: THREE.Vector3, box: THREE.Box3, room: Extent): boolean {
  const { x, z } = position;
  const halfW = room.width / 2 - WALL_GAP;
  const halfD = room.depth / 2 - WALL_GAP;
  if (Math.abs(position.x + box.min.x + halfW) < MAGNET) position.x = -halfW - box.min.x;
  else if (Math.abs(halfW - position.x - box.max.x) < MAGNET) position.x = halfW - box.max.x;
  if (Math.abs(position.z + box.min.z + halfD) < MAGNET) position.z = -halfD - box.min.z;
  else if (Math.abs(halfD - position.z - box.max.z) < MAGNET) position.z = halfD - box.max.z;
  return position.x !== x || position.z !== z;
}

/**
 * A wall piece's position (zone-local, in place) on the wall's grid: along the wall from its left end, and up from
 * the floor by its bottom edge. `normal` is the wall's inward normal (which axis runs along it).
 */
export function snapWall(position: THREE.Vector3, box: THREE.Box3, normal: THREE.Vector3, room: Extent): void {
  if (normal.x !== 0) position.z = onLine(position.z, box.min.z, -room.depth / 2);
  else position.x = onLine(position.x, box.min.x, -room.width / 2);
  position.y = onLine(position.y, box.min.y, 0);
}

/** A line to draw between two lined-up edges (zone-local), and what the piece lined up with (null: the room's centre line). */
export interface Guide {
  from: THREE.Vector3;
  to: THREE.Vector3;
  axis: 'x' | 'z';
  /** Where the line runs, on `axis`. */
  line: number;
  target: THREE.Box3 | null;
}

/**
 * The piece (turned footprint `box`, local, at `position`, zone-local, changed in place) lined up with the nearest
 * neighbour `others` (zone-local boxes) whose edge or centre comes within `ALIGN` on x or z, or set flush beside it,
 * or centred on the room (`centre`, zone-local); only on `axes`. The guides say what lined up with what (drawn at `y`).
 */
export function alignWith(position: THREE.Vector3, box: THREE.Box3, others: readonly THREE.Box3[], y: number, centre: THREE.Vector3, axes: readonly ('x' | 'z')[] = ['x', 'z']): Guide[] {
  const guides: Guide[] = [];
  for (const axis of axes) {
    const other = axis === 'x' ? 'z' : 'x';
    const min = position[axis] + box.min[axis];
    const max = position[axis] + box.max[axis];
    const mid = (min + max) / 2;
    const across = (position[other] + box.min[other] + position[other] + box.max[other]) / 2;
    let best: { shift: number; line: number; box: THREE.Box3 | null } | null = null;
    const consider = (mine: number, theirs: number, with_: THREE.Box3 | null): void => {
      const shift = theirs - mine;
      if (Math.abs(shift) < ALIGN && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, line: theirs, box: with_ };
    };
    for (const o of others) {
      // Only what stands near on the other axis: a wardrobe across the room is not lined up with.
      const gap = Math.max(o.min[other] - (position[other] + box.max[other]), position[other] + box.min[other] - o.max[other], 0);
      if (gap > ALIGN_REACH) continue;
      // Edge to edge, centre to centre, and flush beside it (my min on its max, my max on its min).
      consider(min, o.min[axis], o);
      consider(max, o.max[axis], o);
      consider(mid, (o.min[axis] + o.max[axis]) / 2, o);
      consider(min, o.max[axis], o);
      consider(max, o.min[axis], o);
    }
    consider(mid, centre[axis], null);
    const found = best as { shift: number; line: number; box: THREE.Box3 | null } | null;
    if (!found) continue;
    position[axis] += found.shift;
    const from = new THREE.Vector3().setY(y);
    const to = new THREE.Vector3().setY(y);
    from[axis] = found.line;
    to[axis] = found.line;
    from[other] = found.box ? (found.box.min[other] + found.box.max[other]) / 2 : centre[other];
    to[other] = across;
    guides.push({ from, to, axis, line: found.line, target: found.box });
  }
  return guides;
}
