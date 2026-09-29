import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import type { Furniture } from './Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from './meshUtils';
import { paint, timber } from '@/world/materials/palette';
import { INSET, proud } from './props/joinery';
import { HoverGlint } from './props/hoverGlint';
import { fabric as fabricMaterial } from '@/world/materials/finishes';

/** Eye height above the floor when sitting (seat cushion at ~0.45 m plus torso). */
const SEATED_EYE_HEIGHT = 1.2;
/** The chair stands on four turned legs this tall, tapering from `LEG_TOP` to `LEG_FOOT` (radii). */
const LEG_H = 0.1;
const LEG_TOP = 0.022;
const LEG_FOOT = 0.013;
/** Upholstery: the corner radius of the blocks and how high the cushions' faces dome (m). */
const ROUNDING = 0.03;
const CROWN = 0.016;
/** Seated, the seat cushion gives this much of its thickness, over `SINK_SECONDS`. */
const SINK = 0.14;
const SINK_SECONDS = 0.3;

/**
 * A simple armchair the player can sit in: rounded upholstered blocks (a frame, arms, a back), a
 * domed seat cushion that gives a little under the sitter, a domed back cushion, piping along the
 * seat's front, on four tapered legs. Local +z is the front (where the knees go). `eyePose()`
 * gives where the camera goes when seated.
 */
export class Seat extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];

  private readonly fabric = fabricMaterial({ color: 0x8a7a68, roughness: 0.95 });
  private readonly width: number;
  private readonly depth: number;
  private readonly height: number;
  private readonly glint: HoverGlint;
  private readonly cushion: THREE.Mesh;
  private readonly cushionBottom: number;
  private readonly cushionHeight: number;
  /** How far the seat cushion has given, 0..1. */
  private sunk = 0;
  /** A cushion put on the seat (`mountCushion`) and its height there, unsat on. */
  private thrown: { object: THREE.Object3D; restY: number } | null = null;
  /** Who sat down here last: whether they still sit here is read from them (`seatedIn`). */
  private sitter: PlayerState | null = null;
  /** A visiting friend's name while they sit here or are on their way to (the cat and the player keep off it). */
  guest: string | null = null;
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
    this.width = width;
    this.depth = depth;
    this.seatTop = seatTop;
    const armW = 0.1;
    const armH = seatTop + 0.25;
    const innerW = width - 2 * armW;
    const backH = 0.6;
    this.height = seatTop + backH + 0.05;
    const wood = timber(0x4a3524, 0.6);
    const piping = paint(0x6e5f4f, 0.9);

    // The frame under the seat cushion, between the arms (buried a hair in them), up from the legs.
    const frameH = seatTop - 0.12 - LEG_H;
    const base = upholstered(innerW + 2 * INSET, frameH, depth, this.fabric, 0, 'top');
    base.position.y = LEG_H + frameH / 2;
    this.cushionHeight = 0.12;
    this.cushionBottom = seatTop - this.cushionHeight;
    this.cushion = upholstered(innerW - 0.01, this.cushionHeight, depth - 0.02, this.fabric, CROWN, 'top');
    this.cushion.position.set(0, seatTop - this.cushionHeight / 2, 0.02);
    const back = upholstered(width, backH, 0.14, this.fabric, CROWN, 'front');
    back.position.set(0, seatTop + backH / 2, -depth / 2 + 0.07);
    back.rotation.x = -0.12; // slight recline
    this.backCentreY = seatTop + backH / 2;
    this.restPoint = new THREE.Vector3(0, seatTop + 0.02, 0.1);
    this.backCentreZ = -depth / 2 + 0.07;
    this.backRecline = -0.12;
    // A darker welt along the front edge of the seat cushion breaks up the block of fabric. It stands a few
    // millimetres proud of the cushion's top, front and sides: flush with them, their faces would z-fight.
    const welt = boxMesh(proud(innerW), 0.018, 0.018, piping, { y: seatTop - 0.006, z: depth / 2 + 0.02 - 0.006 });
    const arms = [-1, 1].map((sx) => {
      const arm = upholstered(armW, armH - LEG_H, depth, this.fabric, 0, 'top');
      arm.position.set((sx * (width - armW)) / 2, LEG_H + (armH - LEG_H) / 2, 0);
      return arm;
    });
    // Turned legs under the arms' corners, tapering to the floor, buried a hair in the arms.
    const legs = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => cylinderMesh(LEG_TOP, LEG_H + INSET, wood, { x: sx * (width / 2 - 0.045), y: (LEG_H + INSET) / 2, z: sz * (depth / 2 - 0.045) }, { radiusBottom: LEG_FOOT, segments: 12 })),
    );
    for (const block of [base, this.cushion, back, ...arms]) {
      block.castShadow = true;
      block.receiveShadow = true;
    }
    // Its hover cue: the piping and the legs catch the light, never the whole fabric.
    this.glint = HoverGlint.of(welt, ...legs);

    // One box covers the whole chair so hovering any part of it works.
    const hitbox = invisibleHitbox(width, seatTop + 0.62, depth, { y: (seatTop + 0.62) / 2 });
    this.hitboxes = [hitbox];

    this.add(base, this.cushion, welt, back, ...arms, ...legs, hitbox);
  }

  /** Bounding box for collisions (local space). */
  get footprint(): THREE.Box3 {
    const { width, depth, height } = this;
    return new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, height, depth / 2));
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  /** The seat cushion gives under whoever sits here, and comes back up when they get up. */
  update(dt: number): void {
    const want = this.sitter?.seatedIn === this ? 1 : 0;
    if (this.sunk === want) return;
    this.sunk = want > this.sunk ? Math.min(1, this.sunk + dt / SINK_SECONDS) : Math.max(0, this.sunk - dt / SINK_SECONDS);
    const squash = 1 - SINK * THREE.MathUtils.smoothstep(this.sunk, 0, 1);
    this.cushion.scale.y = squash;
    this.cushion.position.y = this.cushionBottom + (this.cushionHeight * squash) / 2;
    // A cushion thrown on the seat goes down with it.
    if (this.thrown) this.thrown.object.position.y = this.thrown.restY - this.cushionHeight * (1 - squash);
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
    this.thrown = { object: cushion, restY: y };

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

  /** Height (m) a person sitting here sits at: the seat, a little given. */
  get sittingHeight(): number {
    return this.seatTop + 0.01;
  }

  label(player: PlayerState): string {
    if (!player.seated && this.guest) return `Armchair · ${this.guest}'s`;
    return player.seated ? 'Armchair · stand up' : 'Armchair · sit';
  }

  activate(session: SessionActions): void {
    if (session.seated) session.stand();
    else if (this.guest) session.react(`${this.guest} is sitting there.`);
    else {
      session.sit(this);
      this.sitter = session;
    }
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

/**
 * An upholstered block: a box with rounded edges whose `face` (its top, or its front) domes out by
 * `crown` in the middle, the way a stuffed cushion does. Its own geometry (the crown is moulded
 * into it), centred on the origin.
 */
function upholstered(width: number, height: number, depth: number, material: THREE.Material, crown: number, face: 'top' | 'front'): THREE.Mesh {
  const radius = Math.min(ROUNDING, width / 3, height / 3, depth / 3);
  const geometry = new RoundedBoxGeometry(width, height, depth, 4, radius);
  if (crown > 0) {
    const position = geometry.getAttribute('position');
    const [halfA, halfB] = face === 'top' ? [width / 2, depth / 2] : [width / 2, height / 2];
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const out = face === 'top' ? y - (height / 2 - radius) : z - (depth / 2 - radius);
      if (out <= 0) continue;
      const a = x / halfA;
      const b = (face === 'top' ? z : y) / halfB;
      const dome = crown * Math.max(0, 1 - a * a) * Math.max(0, 1 - b * b) * (out / radius);
      if (face === 'top') position.setY(i, y + dome);
      else position.setZ(i, z + dome);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return new THREE.Mesh(geometry, material);
}
