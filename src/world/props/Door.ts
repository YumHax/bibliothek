import * as THREE from 'three';
import type { Collisions } from '@/core/Collider';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { LidMotion } from '../box/LidMotion';
import type { Doorway } from '../Room';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { Prop, part, matte, markShared } from './Prop';
import { scuffed, wood as woodMaterial } from '@/world/materials/finishes';

export interface DoorOptions {
  /** Colour of the painted leaf. Default a deep slate green. */
  leafColor?: number;
  /**
   * Where the leaf's collider lives: shut, it fills the opening; open, it stands against the
   * wall of the room it swung into. Without it the leaf stops nobody.
   */
  collisions?: Collisions;
  /** Its plain doormat just inside. Default true; false where the room lays its own (the flat's front door). */
  mat?: boolean;
}

/**
 * Face width of the architrave (the moulding framing the opening) and how far it stands proud of
 * the wall: a little more than the room's baseboard (0.02, `Room`), which runs under its feet.
 */
const ARCHITRAVE = 0.07;
const ARCHITRAVE_DEPTH = 0.022;
/** Depth of the door frame through the wall: the jambs and the leaf sit inside it. */
const FRAME_DEPTH = 0.12;
/** Width of the jambs lining the opening; the leaf hangs between them. */
const LINING = 0.03;
const LEAF_THICKNESS = 0.04;
/**
 * The leaf swings away from the room that hangs it when open, in this long: almost flat against
 * the wall of the room it opens into (a door pushed right back), so it never bars a corridor.
 */
const OPEN_ANGLE = THREE.MathUtils.degToRad(165);
const SWING_SECONDS = 1.4;
/** The leaf's collider swaps from the shut position to the open one as it swings past this openness. */
const BLOCKER_SWAP = 0.5;
const HANDLE_Y = 1.03;
// The gap between two zones' wall planes (see `worldPlan.ts`) must stay within `FRAME_DEPTH` so the lining covers it.

const PAINT = scuffed(matte(0xf6f3ee, 0.7));
const OAK = markShared(woodMaterial(0x8b6a44, 0.55));
const BRASS = markShared(new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3, emissive: 0xc9a75b, emissiveIntensity: 0 }));

/**
 * An interior door, hung in a `Doorway` cut through the wall (`Room` makes the hole; this fills
 * it): architrave and jambs, a painted panelled leaf on brass hinges with a lever handle on both
 * sides, an oak threshold and a doormat on the hanging room's side. The lining runs through the
 * wall and bridges the gap to the next zone's shell, whose matching doorway is on the other side.
 * Clicking the door swings it open away from the room that hangs it, or shuts it; the player
 * walks through, and the leaf itself is a collider kept where it stands (`DoorOptions.collisions`).
 * The cat never follows: its world ends at its zone's bounds.
 * Local frame as `wallMount(wall, along, 0)`: origin on the floor at the middle of the opening,
 * +z into the room that hangs it.
 */
export class Door extends Prop implements Updatable, Interactable {
  /** The leaf swings: a blob laid under it once would stay behind. */
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  /** The leaf: the crosshair ray stops at it and it counts as a wall for sound while shut (open, it lies against the wall). */
  readonly occluders: THREE.Object3D[] = [];
  /** Both rooms see the door, whichever of them is drawn. */
  readonly seenFromNextDoor = true;

  private readonly motion = new LidMotion(OPEN_ANGLE, SWING_SECONDS);
  private readonly pivot = new THREE.Group();
  /** +1 hinged on the left (pivot at -x, leaf towards +x), -1 on the right: the leaf is mirrored and turns the other way. */
  private readonly side: 1 | -1;
  private readonly brass: THREE.MeshStandardMaterial;
  private readonly collisions?: Collisions;
  /** The leaf's colliders in world space, shut and open; laid out on the first tick, once the door is placed. */
  private readonly shutBlocker = new THREE.Box3();
  private readonly openBlocker = new THREE.Box3();
  private blockersLaidOut = false;
  private blocker: THREE.Box3 | null = null;

  constructor(
    readonly doorway: Pick<Doorway, 'width' | 'height' | 'hinge'>,
    options: DoorOptions = {},
  ) {
    super();
    this.name = 'Door';
    const { width, height } = doorway;
    this.side = doorway.hinge === 'right' ? -1 : 1;
    this.brass = BRASS.clone();
    this.collisions = options.collisions;
    const leafPaint = matte(options.leafColor ?? 0x1f3538, 0.5);

    this.buildFrame(width, height);
    this.buildLeaf(width, height, leafPaint);

    // The doormat, just inside.
    if (options.mat !== false) {
      const mat = part(this, width * 0.8, 0.012, 0.42, matte(0x4a4038, 1), { y: 0.006, z: 0.3 });
      mat.castShadow = false;
    }

    const hitbox = invisibleHitbox(width, height, 0.3, { y: height / 2, z: 0.02 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.render();
  }

  get isOpen(): boolean {
    return this.motion.isOpen;
  }

  /** 0 shut to 1 fully open, through the swing: anything above 0 lets the eye through. */
  get openness(): number {
    return this.motion.openness;
  }

  open(): void {
    this.motion.open();
  }

  close(): void {
    this.motion.close();
  }

  /**
   * Hangs `object` on the leaf's face towards the room that hangs the door (+z), `along` metres
   * from the hinge edge and `y` up from the floor, so it swings with the leaf (a note, a wreath);
   * `far`: on the other face instead (the front door's landing side), turned to face out there.
   */
  attachToLeaf(object: THREE.Object3D, along: number, y: number, far = false): void {
    object.position.set(along, y, (far ? -1 : 1) * (LEAF_THICKNESS / 2 + 0.002));
    if (far) object.rotation.y += Math.PI;
    // A right-hung leaf is a mirrored left-hung one: unmirror what is hung on it.
    object.scale.x *= this.side;
    this.pivot.add(object);
  }

  update(dt: number): void {
    if (this.motion.tick(dt)) this.render();
    this.syncBlocker();
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.brass.emissiveIntensity = hovered ? 0.45 : 0;
  }

  label(): string {
    return this.motion.isOpen ? 'Click to close the door' : 'Click to open the door';
  }

  activate(_session: SessionActions): void {
    this.motion.toggle();
  }

  // --- Collision ----------------------------------------------------------------------------

  /** Keeps the leaf's collider where the leaf is: in the opening while shut, along the corridor wall once open. */
  private syncBlocker(): void {
    if (!this.collisions) return;
    if (!this.blockersLaidOut) this.layOutBlockers();
    const wanted = this.motion.openness < BLOCKER_SWAP ? this.shutBlocker : this.openBlocker;
    if (wanted === this.blocker) return;
    if (this.blocker) this.collisions.remove(this.blocker);
    this.collisions.add(wanted);
    this.blocker = wanted;
  }

  /** Both leaf positions as world-space boxes; needs the door's world matrix, hence after `place()`. */
  private layOutBlockers(): void {
    const { width, height } = this.doorway;
    this.shutBlocker.set(new THREE.Vector3(-width / 2, 0, -FRAME_DEPTH), new THREE.Vector3(width / 2, height, ARCHITRAVE_DEPTH));
    // The open leaf runs from the hinge along its swung direction (see `render`), thick as it is.
    const hinge = this.pivot.position;
    const tip = hinge.clone().add(new THREE.Vector3(this.side * Math.cos(OPEN_ANGLE), 0, -Math.sin(OPEN_ANGLE)).multiplyScalar(leafWidth(width)));
    this.openBlocker.setFromPoints([hinge, tip]).expandByScalar(LEAF_THICKNESS);
    this.openBlocker.min.y = 0;
    this.openBlocker.max.y = height;
    this.shutBlocker.applyMatrix4(this.matrixWorld);
    this.openBlocker.applyMatrix4(this.matrixWorld);
    this.blockersLaidOut = true;
  }

  // --- Geometry -----------------------------------------------------------------------------

  private render(): void {
    // Hinged on the left, a positive turn about +y swings the free edge towards -z, out of the
    // hanging room; the mirrored right-hung leaf turns the other way to swing to the same side.
    this.pivot.rotation.y = this.side * this.motion.angle;
  }

  /** Architrave on the room side, jambs and head lining the opening through the wall, an oak threshold. */
  private buildFrame(width: number, height: number): void {
    const a = ARCHITRAVE;
    const lining = LINING;
    // Architrave: two uprights and a head, standing a little proud of the wall.
    part(this, a, height + a, ARCHITRAVE_DEPTH, PAINT, { x: -width / 2 - a / 2, y: (height + a) / 2, z: ARCHITRAVE_DEPTH / 2 });
    part(this, a, height + a, ARCHITRAVE_DEPTH, PAINT, { x: width / 2 + a / 2, y: (height + a) / 2, z: ARCHITRAVE_DEPTH / 2 });
    part(this, width + 2 * a, a, ARCHITRAVE_DEPTH, PAINT, { y: height + a / 2, z: ARCHITRAVE_DEPTH / 2 });
    // Jambs and head: the lining of the opening, running back through the wall.
    const z = -FRAME_DEPTH / 2 + ARCHITRAVE_DEPTH;
    part(this, lining, height, FRAME_DEPTH, PAINT, { x: -width / 2 + lining / 2, y: height / 2, z });
    part(this, lining, height, FRAME_DEPTH, PAINT, { x: width / 2 - lining / 2, y: height / 2, z });
    part(this, width, lining, FRAME_DEPTH, PAINT, { y: height - lining / 2, z });
    // Threshold strip, between the jambs (under them, its faces would z-fight with theirs).
    part(this, width - 2 * lining, 0.012, FRAME_DEPTH, OAK, { y: 0.006, z });
  }

  /** The leaf on its hinge pivot: painted panels, brass hinges and a lever handle on each side. */
  private buildLeaf(width: number, height: number, paint: THREE.MeshStandardMaterial): void {
    const lining = LINING;
    const leafW = leafWidth(width);
    const leafH = height - lining - 0.012;
    // The pivot sits at the hinge edge, slightly behind the wall plane so the leaf lies inside the
    // frame. A right-hung leaf is the left-hung one mirrored across the opening's middle.
    this.pivot.position.set(this.side * (-width / 2 + lining + 0.003), 0.008, -0.045);
    this.pivot.scale.x = this.side;
    this.add(this.pivot);

    const leaf = part(this.pivot, leafW, leafH, LEAF_THICKNESS, paint, { x: leafW / 2, y: leafH / 2 });
    leaf.receiveShadow = true;
    this.occluders.push(leaf);
    // Two raised panels on each face, a lock rail between them.
    const raised = matte(new THREE.Color(paint.color).multiplyScalar(0.9).getHex(), 0.5);
    const panelW = leafW - 0.24;
    const panels = [
      { y: 0.16, h: leafH * 0.38 },
      { y: 0.16 + leafH * 0.38 + 0.16, h: leafH - 0.16 - leafH * 0.38 - 0.16 - 0.16 },
    ];
    for (const { y, h } of panels)
      for (const side of [1, -1]) part(this.pivot, panelW, h, 0.008, raised, { x: leafW / 2, y: y + h / 2, z: side * (LEAF_THICKNESS / 2 + 0.004) });

    // Hinges on the pivot edge, a lever handle on each face near the free edge.
    for (const y of [0.25, leafH / 2, leafH - 0.25]) this.pivot.add(cylinderMesh(0.008, 0.09, this.brass, { x: 0.002, y, z: 0 }, { segments: 10 }));
    const handleX = leafW - 0.07;
    for (const side of [1, -1]) {
      const z = side * (LEAF_THICKNESS / 2 + 0.012);
      const rose = cylinderMesh(0.026, 0.008, this.brass, { x: handleX, y: HANDLE_Y, z: side * (LEAF_THICKNESS / 2 + 0.004) }, { segments: 16 });
      rose.rotation.x = Math.PI / 2;
      const stem = cylinderMesh(0.009, 0.03, this.brass, { x: handleX, y: HANDLE_Y, z }, { segments: 10 });
      stem.rotation.x = Math.PI / 2;
      const lever = part(this.pivot, 0.12, 0.016, 0.016, this.brass, { x: handleX - 0.05, y: HANDLE_Y, z: side * (LEAF_THICKNESS / 2 + 0.028) });
      lever.castShadow = false;
      this.pivot.add(rose, stem);
    }
    // Escutcheon under the handle on the room side.
    part(this.pivot, 0.022, 0.05, 0.004, this.brass, { x: handleX, y: HANDLE_Y - 0.09, z: LEAF_THICKNESS / 2 + 0.002 });
  }
}

/** The leaf is the opening less the jambs and a hair of clearance. */
function leafWidth(openingWidth: number): number {
  return openingWidth - 2 * LINING - 0.006;
}
