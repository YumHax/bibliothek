import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import type { Furniture } from './Furniture';
import { boxMesh, invisibleHitbox } from './meshUtils';
import { wood as woodMaterial } from '@/world/materials/finishes';
import { fabric as fabricMaterial } from '@/world/materials/finishes';

/** Eye height above the floor when sitting (seat cushion at ~0.45 m plus torso). */
const SEATED_EYE_HEIGHT = 1.2;

/**
 * A simple armchair the player can sit in. Local +z is the front (where the knees go).
 * `eyePose()` gives where the camera goes when seated.
 */
export class Seat extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];

  private readonly fabric = fabricMaterial({ color: 0x8a7a68, roughness: 0.95 });
  private readonly forward = new THREE.Vector3();
  private readonly seatTop: number;
  private readonly backCentreY: number;
  private readonly backCentreZ: number;
  private readonly backRecline: number;
  /** Where a cat lies (seat-local): on the bare seat until `mountCushion` puts it on top of the cushion. */
  private readonly restPoint: THREE.Vector3;

  constructor() {
    super();
    this.name = 'Seat';

    const width = 0.8;
    const depth = 0.6;
    const seatTop = 0.45;
    this.seatTop = seatTop;
    const armW = 0.1;
    const armH = seatTop + 0.25;
    const innerW = width - 2 * armW;
    const wood = woodMaterial(0x4a3524, 0.6);
    const piping = new THREE.MeshStandardMaterial({ color: 0x6e5f4f, roughness: 0.9 });

    const base = boxMesh(innerW, seatTop - 0.12, depth, this.fabric, { y: (seatTop - 0.12) / 2 + 0.06 });
    const cushion = boxMesh(innerW, 0.12, depth, this.fabric, { y: seatTop - 0.06, z: 0.02 });
    const back = boxMesh(width, 0.6, 0.14, this.fabric, { y: seatTop + 0.3, z: -depth / 2 + 0.07 });
    back.rotation.x = -0.12; // slight recline
    this.backCentreY = seatTop + 0.3;
    this.restPoint = new THREE.Vector3(0, seatTop + 0.02, 0.1);
    this.backCentreZ = -depth / 2 + 0.07;
    this.backRecline = -0.12;
    // A darker welt along the front edge of the seat cushion breaks up the block of fabric.
    const welt = boxMesh(innerW, 0.015, 0.015, piping, { y: seatTop - 0.0075, z: depth / 2 + 0.02 - 0.0075 });
    const arms = [-1, 1].map((sx) => boxMesh(armW, armH, depth, this.fabric, { x: (sx * (width - armW)) / 2, y: armH / 2 }));
    const legs = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => boxMesh(0.05, 0.06, 0.05, wood, { x: sx * (width / 2 - 0.08), y: 0.03, z: sz * (depth / 2 - 0.08) })),
    );

    // One box covers the whole chair so hovering any part of it works.
    const hitbox = invisibleHitbox(width, seatTop + 0.62, depth, { y: (seatTop + 0.62) / 2 });
    this.hitboxes = [hitbox];

    this.add(base, cushion, welt, back, ...arms, ...legs, hitbox);
  }

  /** Bounding box for collisions (local space). */
  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.3), new THREE.Vector3(0.4, 1.1, 0.3));
  }

  setHovered(hovered: boolean): void {
    this.fabric.emissive.setHex(hovered ? 0x1a1410 : 0x000000);
  }

  /**
   * Puts a cushion (or any object whose origin is its bottom centre) on the seat, pushed back
   * against the backrest. Works for a leaning cushion too: the contact point is the object's
   * highest, rearmost edge, so it rests on the reclined backrest instead of sinking into it.
   */
  mountCushion(cushion: THREE.Object3D): void {
    cushion.position.set(0, 0, 0);
    cushion.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(cushion);
    const clearance = 0.004;
    const y = this.seatTop - bounds.min.y;
    cushion.position.set(0, y, this.backFaceZ(y + bounds.max.y) - bounds.min.z + clearance);
    this.add(cushion);

    // The cat lies on the cushion, not in it: probe its top surface straight down over its middle
    // (a leaning cushion's top slopes and is highest at the back, so the bounds alone would not do).
    this.updateMatrixWorld(true);
    const centreZ = cushion.position.z + (bounds.min.z + bounds.max.z) / 2;
    const ray = new THREE.Raycaster(this.localToWorld(new THREE.Vector3(0, y + bounds.max.y + 0.5, centreZ)), new THREE.Vector3(0, -1, 0).transformDirection(this.matrixWorld));
    const hit = ray.intersectObject(cushion, true)[0];
    const top = hit ? this.worldToLocal(hit.point.clone()).y : y + bounds.max.y;
    this.restPoint.set(0, top + 0.02, centreZ);
  }

  /** Local z of the backrest's inner (front) face at height `y`, following its recline. */
  private backFaceZ(y: number): number {
    const dy = y - this.backCentreY;
    // Rotating the box about x by `recline` moves its front face (local z = +0.07) to:
    return this.backCentreZ + dy * Math.sin(this.backRecline) + 0.07 * Math.cos(this.backRecline);
  }

  label(player: PlayerState): string {
    return player.seated ? 'Click to stand up' : 'Click to sit down';
  }

  activate(session: SessionActions): void {
    if (session.seated) session.stand();
    else session.sit(this);
  }

  /** World floor point 0.45 m in front of the seat: where the cat stands before hopping up. */
  approachPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.set(0, 0, 0.75));
  }

  /** World point for a cat lying here: on top of the mounted cushion (its paws at the cushion's surface), or on the bare seat. */
  restingSpot(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.copy(this.restPoint));
  }

  /** World point on the lap of someone seated here. */
  lapSpot(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.set(0, 0.56, 0.22));
  }

  /** World-space eye position and camera yaw (Y rotation) for someone sitting here, facing the chair's front. */
  eyePose(): { position: THREE.Vector3; yaw: number } {
    const position = this.localToWorld(new THREE.Vector3(0, SEATED_EYE_HEIGHT, 0.08));
    this.forward.set(0, 0, 1).applyQuaternion(this.getWorldQuaternion(new THREE.Quaternion()));
    // A camera looks down -z, so yaw θ gives the direction (-sin θ, 0, -cos θ).
    const yaw = Math.atan2(-this.forward.x, -this.forward.z);
    return { position, yaw };
  }
}
