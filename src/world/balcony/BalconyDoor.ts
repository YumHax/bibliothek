import * as THREE from 'three';
import type { Collisions } from '@/core/Collider';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { LidMotion } from '../box/LidMotion';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { Prop, part, matte } from '../props/Prop';

export interface BalconyDoorOptions {
  width: number;
  height: number;
  /** Where the leaf's collider lives (shut: across the opening; open: against the room's wall). */
  collisions?: Collisions;
}

const FRAME = 0.06;
const FRAME_DEPTH = 0.14;
const LEAF_THICKNESS = 0.05;
const STILE = 0.075;
const BAR = 0.022;
const HANDLE_Y = 1.05;
/** The leaf swings into the room (French doors open inwards), nearly back against the wall. */
const OPEN_ANGLE = THREE.MathUtils.degToRad(110);
const SWING_SECONDS = 1.2;
const BLOCKER_SWAP = 0.5;

const PAINT = matte(0xf2efe8, 0.55);
const GLASS = new THREE.MeshStandardMaterial({ color: 0xd8e6ee, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.14, depthWrite: false });
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3, emissive: 0xc9a75b, emissiveIntensity: 0 });

/**
 * The glazed door onto the balcony: a painted frame through the wall, a single French leaf of six
 * panes on hinges, a lever handle each side. The glass is clear, so the balcony and the street are
 * seen through it shut (the portal through this door is always open, see `furnishBalcony`).
 * Clicking swings it open into the room or shut; the leaf is a collider where it stands. Local
 * frame as `wallMount`: origin on the floor at the middle of the opening, +z onto the balcony.
 */
export class BalconyDoor extends Prop implements Updatable, Interactable {
  readonly contactShadow = false;
  readonly seenFromNextDoor = true;
  readonly hitboxes: THREE.Object3D[];

  private readonly motion = new LidMotion(OPEN_ANGLE, SWING_SECONDS);
  private readonly pivot = new THREE.Group();
  private readonly brass = BRASS.clone();
  private readonly collisions?: Collisions;
  private readonly shutBlocker = new THREE.Box3();
  private readonly openBlocker = new THREE.Box3();
  private blockersLaidOut = false;
  private blocker: THREE.Box3 | null = null;

  constructor(private readonly options: BalconyDoorOptions) {
    super();
    this.name = 'BalconyDoor';
    const { width, height } = options;
    this.collisions = options.collisions;

    // Frame: jambs and head through the wall, a sill in stone.
    const z = -FRAME_DEPTH / 2 + 0.02;
    part(this, FRAME, height, FRAME_DEPTH, PAINT, { x: -width / 2 + FRAME / 2, y: height / 2, z });
    part(this, FRAME, height, FRAME_DEPTH, PAINT, { x: width / 2 - FRAME / 2, y: height / 2, z });
    part(this, width, FRAME, FRAME_DEPTH, PAINT, { y: height - FRAME / 2, z });
    part(this, width + 0.1, 0.03, FRAME_DEPTH + 0.06, matte(0xb9b1a3, 0.8), { y: 0.015, z });

    // The leaf, hinged on the left jamb, seen from the balcony.
    const leafW = width - 2 * FRAME - 0.006;
    const leafH = height - FRAME - 0.035;
    this.pivot.position.set(-width / 2 + FRAME, 0.03, -FRAME_DEPTH + 0.05);
    this.add(this.pivot);
    const at = (x: number, y: number, w: number, h: number, material: THREE.Material, depth = LEAF_THICKNESS): THREE.Mesh =>
      part(this.pivot, w, h, depth, material, { x: x + w / 2, y: y + h / 2 });
    at(0, 0, STILE, leafH, PAINT);
    at(leafW - STILE, 0, STILE, leafH, PAINT);
    at(STILE, leafH - STILE, leafW - 2 * STILE, STILE, PAINT);
    at(STILE, 0, leafW - 2 * STILE, 0.22, PAINT);
    // Six panes behind glazing bars.
    const gx0 = STILE;
    const gx1 = leafW - STILE;
    const gy0 = 0.22;
    const gy1 = leafH - STILE;
    const glass = at(gx0, gy0, gx1 - gx0, gy1 - gy0, GLASS, 0.008);
    glass.castShadow = false;
    glass.renderOrder = 1;
    at((gx0 + gx1) / 2 - BAR / 2, gy0, BAR, gy1 - gy0, PAINT, LEAF_THICKNESS * 0.6);
    for (const k of [1 / 3, 2 / 3]) at(gx0, gy0 + (gy1 - gy0) * k - BAR / 2, gx1 - gx0, BAR, PAINT, LEAF_THICKNESS * 0.6);

    for (const y of [0.3, leafH - 0.3]) this.pivot.add(cylinderMesh(0.008, 0.1, this.brass, { x: 0, y, z: 0 }, { segments: 10 }));
    for (const side of [1, -1]) {
      const lever = part(this.pivot, 0.12, 0.016, 0.016, this.brass, { x: leafW - 0.11, y: HANDLE_Y, z: side * (LEAF_THICKNESS / 2 + 0.03) });
      lever.castShadow = false;
    }

    const hitbox = invisibleHitbox(width, height, 0.3, { y: height / 2, z: -0.02 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.render();
  }

  get openness(): number {
    return this.motion.openness;
  }

  update(dt: number): void {
    if (this.motion.tick(dt)) this.render();
    this.syncBlocker();
  }

  setHovered(hovered: boolean): void {
    this.brass.emissiveIntensity = hovered ? 0.45 : 0;
  }

  label(): string {
    return this.motion.isOpen ? 'Click to close the balcony door' : 'Click to open the balcony door';
  }

  activate(_session: SessionActions): void {
    this.motion.toggle();
  }

  private render(): void {
    // The leaf runs from its hinge towards +x; a positive turn about +y swings its free edge towards -z, into the room.
    this.pivot.rotation.y = this.motion.angle;
  }

  private syncBlocker(): void {
    if (!this.collisions) return;
    if (!this.blockersLaidOut) {
      const { width, height } = this.options;
      this.shutBlocker.set(new THREE.Vector3(-width / 2, 0, -FRAME_DEPTH), new THREE.Vector3(width / 2, height, 0.02)).applyMatrix4(this.matrixWorld);
      const hinge = this.pivot.position;
      const leafW = width - 2 * FRAME;
      const tip = hinge.clone().add(new THREE.Vector3(Math.cos(OPEN_ANGLE), 0, -Math.sin(OPEN_ANGLE)).multiplyScalar(leafW));
      this.openBlocker.setFromPoints([hinge, tip]).expandByScalar(LEAF_THICKNESS);
      this.openBlocker.min.y = 0;
      this.openBlocker.max.y = height;
      this.openBlocker.applyMatrix4(this.matrixWorld);
      this.blockersLaidOut = true;
    }
    const wanted = this.motion.openness < BLOCKER_SWAP ? this.shutBlocker : this.openBlocker;
    if (wanted === this.blocker) return;
    if (this.blocker) this.collisions.remove(this.blocker);
    this.collisions.add(wanted);
    this.blocker = wanted;
  }
}
