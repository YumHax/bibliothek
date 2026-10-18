import * as THREE from 'three';
import type { Shelf } from '@/world/Shelf';
import { eyePoseAt } from '@/world/meshUtils';

/** Where the eye stands to face a bookcase or one of its rows, and how it looks. */
interface EyePose {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
}

/** A little air round what is framed (a share of its size). */
const MARGIN = 1.1;
/** The eye is never nearer the boxes' fronts than this (m): the camera's near plane is at 0.1 m. */
const NEAREST = 0.3;
/** How much room the eye keeps behind it to the wall (m), and the step it comes in by when the room is too short. */
const CLEARANCE = 0.15;
const STEP = 0.05;
/**
 * Furniture between the eye and the bookcase (a sofa, a table in front of it): the eye steps in past it. The way is
 * looked along every `PATH_STEP` from the eye to this far in front of the boxes (m), clear of the bookcase's own body.
 */
const PATH_STEP = 0.15;
const PATH_CLEAR = 0.45;

const front = new THREE.Vector3();
const back = new THREE.Vector3();
const out = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const along = new THREE.Vector3();

/**
 * Square in front of `shelf`, looking straight in at the middle of it (`row` null) or of row `row` (0 = top), as far
 * back as the whole of it needs to fit the view with a margin at the camera's lens and shape; nearer when a wall
 * stands behind (`blocked`), the framing then tighter.
 */
export function framePose(
  shelf: Shelf,
  row: number | null,
  camera: THREE.PerspectiveCamera,
  blocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean,
  /** Whether a body would stand inside furniture at a point (world x, z): the eye never stands in it, nor looks past it. */
  inFurniture?: (at: THREE.Vector3) => boolean,
): EyePose {
  const { width, depth, boardThickness } = shelf.options;
  let y = shelf.height / 2;
  let height = shelf.height;
  if (row !== null) {
    const room = shelf.rowRoom(row);
    y = room.floor + room.height / 2;
    height = room.height + 2 * boardThickness;
  }
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanH = tanV * camera.aspect;
  let distance = Math.max(NEAREST, (height * MARGIN) / (2 * tanV), (width * MARGIN) / (2 * tanH));
  shelf.updateWorldMatrix(true, false);
  shelf.localToWorld(front.set(0, y, depth / 2));
  out.set(0, 0, 1).applyQuaternion(shelf.getWorldQuaternion(quaternion));
  // Back from the boxes' fronts until the eye (and a little behind it) meets a wall: the furthest the room allows.
  while (distance > NEAREST && blocked(front, back.copy(front).addScaledVector(out, distance + CLEARANCE))) distance -= STEP;
  // Then in past any furniture standing between: a sofa's back, a table, would hide the bottom rows.
  if (inFurniture) while (distance > NEAREST && furnitureBetween(front, out, distance, inFurniture)) distance -= STEP;
  const { position, yaw } = eyePoseAt(shelf, new THREE.Vector3(0, y, depth / 2 + Math.max(NEAREST, distance)));
  return { position, yaw, pitch: 0 };
}

/** Whether furniture stands on the way from the eye (`distance` out of `front` along `out`) to just in front of the boxes. */
function furnitureBetween(front: THREE.Vector3, out: THREE.Vector3, distance: number, inFurniture: (at: THREE.Vector3) => boolean): boolean {
  for (let d = distance; d >= PATH_CLEAR; d -= PATH_STEP) if (inFurniture(along.copy(front).addScaledVector(out, d))) return true;
  return false;
}

/** The middle of `shelf`'s front (world), at half its height: what "the bookcase over there" is measured to. */
export function frontCentre(shelf: Shelf, target = new THREE.Vector3()): THREE.Vector3 {
  shelf.updateWorldMatrix(true, false);
  return shelf.localToWorld(target.set(0, shelf.height / 2, shelf.options.depth / 2));
}

/** The way `shelf` faces (world, horizontal): out of its front. */
export function facingOf(shelf: Shelf, target = new THREE.Vector3()): THREE.Vector3 {
  return target.set(0, 0, 1).applyQuaternion(shelf.getWorldQuaternion(quaternion));
}
