import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { playFloorCreak, playSoftThud } from '@/audio/furnitureSounds';
import { reduceMotion } from '@/settings/motion';
import { Fit, localBounds } from './fit';
import { ridersOf, type Furnishings, type Piece } from './Furnishings';
import { aimedPose, clampInside, snapToWall, turnedBounds, type Pose } from './surfaces';

/** How far away a piece can be taken or set down (m). */
const REACH = 4;
/** Thinner than this (m), a piece lies flat (a rug): see `Fit`. */
const FLAT = 0.035;
/** A floor piece is never set nearer the player's feet than its own half size plus this (m): it would land on them. */
const FEET_CLEAR = 0.35;
/** How fast the carried piece follows the aim (1/s). */
const FOLLOW = 16;

interface Carried {
  piece: Piece;
  fit: Fit;
  /** Its bounds and what rides it, in its own frame. */
  bounds: THREE.Box3;
  flat: boolean;
  /** Where it stood when taken: `cancel` puts it back. */
  start: Pose;
  /** The turn the player gave it (floor and ceiling pieces). */
  yaw: number;
  /** Where the aim puts it now, and whether it may stand there. */
  target: Pose | null;
  fits: boolean;
}

/**
 * Carries a piece of the flat's furniture (a `Piece` of `Furnishings`) about its room: taken, it stops colliding and
 * follows the crosshair over its surface (the floor, a wall, the ceiling), turning with the wheel or `turn`, pushed
 * flush against a wall it is brought near; set down where it may stand (not through another piece, not in a
 * doorway), or put back where it was. What stands on it rides along. The Session's `Rearranging` drives it.
 */
export class FurnitureCarrier implements Updatable {
  private carried: Carried | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly centre = new THREE.Vector2(0, 0);
  private readonly toZone = new THREE.Matrix4();
  private readonly eye = new THREE.Vector3();
  private readonly shown = { position: new THREE.Vector3(), yaw: 0 };

  /** `blocked(from, to)`: a wall stands between two world points (the crosshair cannot reach through it). */
  constructor(
    private readonly camera: THREE.Camera,
    private readonly furnishings: Furnishings,
    private readonly blocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean,
    private readonly turnStep = THREE.MathUtils.degToRad(15),
  ) {
    document.addEventListener('wheel', (e) => {
      if (!this.carried || !document.pointerLockElement) return;
      this.turn(Math.sign(e.deltaY) * this.turnStep);
    }, { passive: true });
  }

  /** The piece being carried, if any. */
  get piece(): Piece | null {
    return this.carried?.piece ?? null;
  }

  /** Whether the carried piece may be set down where it is aimed. */
  get fits(): boolean {
    return this.carried?.fits ?? false;
  }

  /** The movable piece under the crosshair within reach, not behind a wall; null when there is none. */
  aimed(): Piece | null {
    const ray = this.ray();
    const hit = this.furnishings.pieceAt(ray, REACH);
    if (!hit || this.blocked(ray.origin, hit.point)) return null;
    return hit.piece;
  }

  /** Takes `piece` (movable, in an active zone) to move it. */
  take(piece: Piece): void {
    if (this.carried) this.cancel();
    const { zone, item } = piece;
    const riders = ridersOf(zone, item);
    const bounds = localBounds(item, riders);
    zone.lift(item);
    const carried = new Set([item, ...riders]);
    this.carried = {
      piece,
      fit: new Fit(zone, piece.surface, carried, this.furnishings.neighboursOf(piece)),
      bounds,
      flat: bounds.max.y - bounds.min.y < FLAT,
      start: { position: item.position.clone(), yaw: item.rotation.y },
      yaw: item.rotation.y,
      target: null,
      fits: false,
    };
    this.shown.position.copy(item.position);
    this.shown.yaw = item.rotation.y;
    playFloorCreak(0.03);
  }

  /** Turns the carried piece by `radians` (a wall piece keeps facing into the room). */
  turn(radians: number): void {
    if (this.carried && this.carried.piece.surface !== 'wall') this.carried.yaw += radians;
  }

  /** Sets the carried piece down where it is aimed; false (it stays in hand) when it may not stand there. */
  setDown(): boolean {
    const carried = this.carried;
    if (!carried?.target || !carried.fits) return false;
    const { piece, target } = carried;
    piece.zone.move(piece.item, target.position, target.yaw);
    piece.zone.setDown(piece.item);
    this.furnishings.save(piece);
    this.carried = null;
    playSoftThud(0.08);
    return true;
  }

  /** Puts the carried piece back where it was taken from. */
  cancel(): void {
    const carried = this.carried;
    if (!carried) return;
    const { piece, start } = carried;
    piece.zone.move(piece.item, start.position, start.yaw);
    piece.zone.setDown(piece.item);
    this.carried = null;
  }

  update(dt: number): void {
    const carried = this.carried;
    if (!carried) return;
    const { piece, bounds } = carried;
    const { zone, item } = piece;
    const ray = this.ray();
    this.toZone.copy(zone.group.matrixWorld).invert();
    const local = ray.clone().applyMatrix4(this.toZone);
    const aimed = aimedPose(local, zone.spec.extent, piece.surface, piece.offset, bounds, carried.yaw);
    if (aimed) {
      if (piece.surface === 'floor') {
        this.keepNear(aimed, bounds);
        if (!carried.flat) snapToWall(aimed, zone.spec.extent, bounds);
        clampInside(aimed.position, zone.spec.extent, bounds, aimed.yaw); // pushed off the feet, it never goes through a wall
      }
      carried.target = aimed;
      const near = this.eye.distanceTo(aimed.position.clone().applyMatrix4(zone.group.matrixWorld)) <= REACH + 1;
      carried.fits = near && zone.contains(this.eye, 0.2) && carried.fit.allows(this.worldBox(aimed, bounds), carried.flat);
    } else {
      carried.fits = false;
    }
    const target = carried.target;
    if (!target) return;
    const t = reduceMotion() ? 1 : 1 - Math.exp(-FOLLOW * dt);
    this.shown.position.lerp(target.position, t);
    this.shown.yaw += shortest(target.yaw - this.shown.yaw) * t;
    zone.move(item, this.shown.position, this.shown.yaw);
  }

  /** The crosshair's ray (world); `eye` is left at its origin. */
  private ray(): THREE.Ray {
    this.raycaster.setFromCamera(this.centre, this.camera);
    this.eye.copy(this.raycaster.ray.origin);
    return this.raycaster.ray;
  }

  /** A floor piece stays within reach: aimed at the player's own feet it is pushed out ahead, aimed far off it is pulled in. */
  private keepNear(pose: Pose, bounds: THREE.Box3): void {
    const feet = this.eye.clone().applyMatrix4(this.toZone).setY(0);
    const near = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2 + FEET_CLEAR;
    const far = Math.max(near, REACH);
    const away = pose.position.clone().setY(0).sub(feet);
    const distance = away.length();
    if (distance >= near && distance <= far) return;
    const ahead = distance > 1e-3 ? away.divideScalar(distance) : this.camera.getWorldDirection(new THREE.Vector3()).transformDirection(this.toZone).setY(0).normalize();
    const to = THREE.MathUtils.clamp(distance, near, far);
    pose.position.x = feet.x + ahead.x * to;
    pose.position.z = feet.z + ahead.z * to;
  }

  /** The world box of a piece of local `bounds` standing at `pose` (zone-local). */
  private worldBox(pose: Pose, bounds: THREE.Box3): THREE.Box3 {
    return turnedBounds(bounds, pose.yaw).translate(pose.position).applyMatrix4(this.toZone.clone().invert());
  }
}

/** `angle` brought into (-pi, pi]. */
function shortest(angle: number): number {
  return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}
