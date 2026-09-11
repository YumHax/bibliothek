import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { LidMotion } from '../box/LidMotion';
import type { Doorway } from '../Room';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { Hallway } from './Hallway';
import { Prop, part, matte } from './Prop';

export interface DoorOptions {
  /** Colour of the painted leaf. Default a deep slate green. */
  leafColor?: number;
}

/** Face width of the architrave (the moulding framing the opening) and how far it stands proud of the wall. */
const ARCHITRAVE = 0.07;
const ARCHITRAVE_DEPTH = 0.018;
/** Depth of the door frame through the wall: the jambs and the leaf sit inside it. */
const FRAME_DEPTH = 0.12;
const LEAF_THICKNESS = 0.04;
/** The leaf swings out into the hallway by this much when open, in this long. */
const OPEN_ANGLE = THREE.MathUtils.degToRad(95);
const SWING_SECONDS = 1.1;
const HANDLE_Y = 1.03;
// `HALLWAY_SETBACK` (the gap between the wall plane and the hallway) must stay within `FRAME_DEPTH` so the lining covers it.

const PAINT = matte(0xf6f3ee, 0.7);
const OAK = matte(0x8b6a44, 0.55);
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3, emissive: 0xc9a75b, emissiveIntensity: 0 });

/**
 * The flat's front door, hung in a `Doorway` cut through the wall (`Room` makes the hole; this
 * fills it): architrave and jambs, a painted panelled leaf on brass hinges with a lever handle
 * on both sides, an oak threshold and a doormat inside. Behind it, the flat's `Hallway`: the
 * corridor to the other rooms and the front door, lit only while this door is open.
 * Clicking the door swings it open into the hallway or shuts it. Nobody goes through: the opening
 * is a real collider (the player is kept inside by the room bounds anyway, the cat by this).
 * Local frame as `wallMount(wall, along, 0)`: origin on the floor at the middle of the opening,
 * +z into the room.
 */
export class Door extends Prop implements Updatable, Interactable {
  readonly hitboxes: THREE.Object3D[];

  private readonly motion = new LidMotion(OPEN_ANGLE, SWING_SECONDS);
  private readonly pivot = new THREE.Group();
  private readonly hallway: Hallway;
  private readonly brass: THREE.MeshStandardMaterial;

  constructor(
    readonly doorway: Pick<Doorway, 'width' | 'height'>,
    options: DoorOptions = {},
  ) {
    super();
    this.name = 'Door';
    const { width, height } = doorway;
    this.brass = BRASS.clone();
    const leafPaint = matte(options.leafColor ?? 0x1f3538, 0.5);

    this.buildFrame(width, height);
    this.buildLeaf(width, height, leafPaint);
    this.hallway = new Hallway({ width, height, trim: ARCHITRAVE });
    this.add(this.hallway);

    // The doormat, just inside.
    const mat = part(this, width * 0.8, 0.012, 0.42, matte(0x4a4038, 1), { y: 0.006, z: 0.3 });
    mat.castShadow = false;

    const hitbox = invisibleHitbox(width, height, 0.3, { y: height / 2, z: 0.02 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.render();
  }

  /** The opening itself: nothing walks through it. */
  override get footprint(): THREE.Box3 {
    const { width, height } = this.doorway;
    return new THREE.Box3(new THREE.Vector3(-width / 2 - ARCHITRAVE, 0, -0.3), new THREE.Vector3(width / 2 + ARCHITRAVE, height, 0.1));
  }

  get isOpen(): boolean {
    return this.motion.isOpen;
  }

  open(): void {
    this.motion.open();
  }

  close(): void {
    this.motion.close();
  }

  update(dt: number): void {
    if (this.motion.tick(dt)) this.render();
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

  // --- Geometry -----------------------------------------------------------------------------

  private render(): void {
    // Hinged on the left; a positive turn about +y swings the free edge towards -z, out into the hallway.
    this.pivot.rotation.y = this.motion.angle;
    this.hallway.setOpenness(this.motion.openness);
  }

  /** Architrave on the room side, jambs and head lining the opening through the wall, an oak threshold. */
  private buildFrame(width: number, height: number): void {
    const a = ARCHITRAVE;
    const lining = 0.03;
    // Architrave: two uprights and a head, standing a little proud of the wall.
    part(this, a, height + a, ARCHITRAVE_DEPTH, PAINT, { x: -width / 2 - a / 2, y: (height + a) / 2, z: ARCHITRAVE_DEPTH / 2 });
    part(this, a, height + a, ARCHITRAVE_DEPTH, PAINT, { x: width / 2 + a / 2, y: (height + a) / 2, z: ARCHITRAVE_DEPTH / 2 });
    part(this, width + 2 * a, a, ARCHITRAVE_DEPTH, PAINT, { y: height + a / 2, z: ARCHITRAVE_DEPTH / 2 });
    // Jambs and head: the lining of the opening, running back through the wall.
    const z = -FRAME_DEPTH / 2 + ARCHITRAVE_DEPTH;
    part(this, lining, height, FRAME_DEPTH, PAINT, { x: -width / 2 + lining / 2, y: height / 2, z });
    part(this, lining, height, FRAME_DEPTH, PAINT, { x: width / 2 - lining / 2, y: height / 2, z });
    part(this, width, lining, FRAME_DEPTH, PAINT, { y: height - lining / 2, z });
    // Threshold strip.
    part(this, width, 0.012, FRAME_DEPTH, OAK, { y: 0.006, z });
  }

  /** The leaf on its hinge pivot: painted panels, brass hinges and a lever handle on each side. */
  private buildLeaf(width: number, height: number, paint: THREE.MeshStandardMaterial): void {
    const lining = 0.03;
    const leafW = width - 2 * lining - 0.006;
    const leafH = height - lining - 0.012;
    // The pivot sits at the hinge edge, slightly behind the wall plane so the leaf lies inside the frame.
    this.pivot.position.set(-width / 2 + lining + 0.003, 0.008, -0.045);
    this.add(this.pivot);

    const leaf = part(this.pivot, leafW, leafH, LEAF_THICKNESS, paint, { x: leafW / 2, y: leafH / 2 });
    leaf.receiveShadow = true;
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
