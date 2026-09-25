import * as THREE from 'three';
import type { Collisions } from '@/core/Collider';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { LidMotion } from '../box/LidMotion';
import { invisibleHitbox } from '../meshUtils';
import { Prop } from '../props/Prop';
import { SAS } from './airlockPlan';
import { bake, sasFinish } from './sasFinish';
import { playClack, playThud } from './doorSounds';

/** `street`: the street door's two leaves, opening out onto the pavement. `inner`: the glazed door, opening into the building. */
export type SasDoorKind = 'street' | 'inner';

export interface SasDoorOptions {
  kind: SasDoorKind;
  /** The zone's colliders: the leaves stop the player where they stand, shut or open. */
  collisions: Collisions;
  /** The caption and the click are the airlock's to decide (`Airlock`). */
  label: () => string | null;
  activate: (session: SessionActions) => void;
}

/** One leaf: its hinge (sas-local x), which way it runs from the hinge when shut (+1 towards +x), its width. */
interface Leaf {
  hinge: number;
  run: 1 | -1;
  width: number;
  pivot: THREE.Group;
}

/**
 * How each door is hung (sas-local): the hinge line's z, the leaf's depth behind it (pivot space,
 * from `z0` to `z1`), which way it swings (+1: out to the street, -1: into the building), how far,
 * and which face looks into the sas (+1: the box's +z face). The street door is the facade's
 * painted double door; the inner door a glazed single leaf hinged on the left.
 */
const HANGING = {
  street: { z: -0.005, z0: -0.05, z1: 0, swing: 1, open: THREE.MathUtils.degToRad(88), sasFace: -1, seconds: 1.3 },
  inner: { z: -SAS.depth + 0.005, z0: 0, z1: 0.04, swing: -1, open: THREE.MathUtils.degToRad(95), sasFace: 1, seconds: 1.1 },
} as const;
/** The leaves' colliders swap from shut to open as they swing past this. */
const BLOCKER_SWAP = 0.5;

/**
 * A door of the sas (see `airlockPlan.ts`): its leaves on hinge pivots, the face seen from inside
 * baked like the rest of the sas and the other lit like its zone, the handles, a hitbox over the
 * opening. Swings open and shut (`open` / `close`), or is shut at once (`snapShut`: the twin being
 * made ready for a crossing, out of sight); a leaf meeting its frame thuds. Its colliders follow
 * the leaves. What a click does is the `Airlock`'s. Sas-local, placed with the `SasShell`.
 */
export class SasDoor extends Prop implements Updatable, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  readonly occluders: THREE.Object3D[] = [];

  private readonly motion: LidMotion;
  private readonly leaves: Leaf[];
  private readonly hanging: (typeof HANGING)[SasDoorKind];
  private readonly shutBlockers: THREE.Box3[] = [];
  private readonly openBlockers: THREE.Box3[] = [];
  private blockersLaidOut = false;
  private blocking: THREE.Box3[] | null = null;

  constructor(private readonly options: SasDoorOptions) {
    super();
    this.name = `SasDoor:${options.kind}`;
    const f = sasFinish();
    const hanging = (this.hanging = HANGING[options.kind]);
    this.motion = new LidMotion(hanging.open, hanging.seconds);
    const street = options.kind === 'street';
    const opening = street ? SAS.outerDoor : SAS.innerDoor;
    const materials = street ? f.streetLeaf : f.glazedLeaf;
    const half = opening.width / 2;
    this.leaves = street
      ? [{ hinge: -half, run: 1, width: half - 0.005, pivot: new THREE.Group() }, { hinge: half, run: -1, width: half - 0.005, pivot: new THREE.Group() }]
      : [{ hinge: -half, run: 1, width: opening.width - 0.01, pivot: new THREE.Group() }];

    const height = opening.height - 0.01;
    const depth = hanging.z1 - hanging.z0;
    for (const leaf of this.leaves) {
      leaf.pivot.position.set(leaf.hinge, 0, hanging.z);
      this.add(leaf.pivot);
      leaf.pivot.updateMatrix();
      // The leaf, its baked sides lit for where it hangs shut.
      const box = new THREE.BoxGeometry(leaf.width, height, depth);
      const offset = new THREE.Vector3((leaf.run * leaf.width) / 2 + leaf.run * 0.003, height / 2 + 0.005, (hanging.z0 + hanging.z1) / 2);
      bake(box, new THREE.Matrix4().multiplyMatrices(leaf.pivot.matrix, new THREE.Matrix4().makeTranslation(offset)));
      const inside = hanging.sasFace > 0 ? 4 : 5;
      const faces = [0, 1, 2, 3, 4, 5].map((i) => (i === inside || i < 4 ? materials.baked : materials.lit));
      const mesh = new THREE.Mesh(box, faces);
      mesh.position.copy(offset);
      mesh.receiveShadow = true;
      leaf.pivot.add(mesh);
      this.occluders.push(mesh);
      this.hardware(leaf, street, hanging.sasFace);
    }

    // The hitbox fills the opening, through the wall, so the door is clicked open or shut from either side.
    const hitbox = invisibleHitbox(opening.width, opening.height, 0.3, { y: opening.height / 2, z: hanging.z + (hanging.z0 + hanging.z1) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);

    // The colliders, sas-local: the opening while shut; each leaf where it lies once open.
    const zc = hanging.z + (hanging.z0 + hanging.z1) / 2;
    this.shutBlockers.push(new THREE.Box3(new THREE.Vector3(-half, 0, zc - 0.06), new THREE.Vector3(half, opening.height, zc + 0.06)));
    for (const leaf of this.leaves) {
      const hinge = new THREE.Vector3(leaf.hinge, 0, hanging.z);
      const tip = hinge.clone().add(new THREE.Vector3(leaf.run * Math.cos(hanging.open), 0, hanging.swing * Math.sin(hanging.open)).multiplyScalar(leaf.width));
      const box = new THREE.Box3().setFromPoints([hinge, tip]).expandByScalar(0.05);
      box.min.y = 0;
      box.max.y = opening.height;
      this.openBlockers.push(box);
    }
    this.render();
  }

  get isOpen(): boolean {
    return this.motion.isOpen;
  }

  /** Shut and still: nothing can be seen past it. */
  get isShut(): boolean {
    return !this.motion.isOpen && !this.motion.isMoving;
  }

  /** 0 shut .. 1 open, through the swing. */
  get openness(): number {
    return this.motion.openness;
  }

  open(): void {
    if (!this.motion.isOpen && this.isShut) playClack(0.2);
    this.motion.open();
  }

  close(): void {
    this.motion.close();
  }

  /** Shut at once, without a sound: the twin made ready out of sight. */
  snapShut(): void {
    this.motion.reset();
    this.render();
    this.syncBlocker();
  }

  update(dt: number): void {
    const wasMoving = this.motion.isMoving;
    if (this.motion.tick(dt)) this.render();
    if (wasMoving && this.isShut) playThud(this.options.kind === 'street' ? 0.45 : 0.25);
    this.syncBlocker();
  }

  // --- Interactable ---------------------------------------------------------------------------------

  setHovered(): void {
    // The caption says what the door does.
  }

  label(): string | null {
    return this.options.label();
  }

  activate(session: SessionActions): void {
    this.options.activate(session);
  }

  // --- Leaves ---------------------------------------------------------------------------------------

  private render(): void {
    const angle = this.motion.angle;
    for (const leaf of this.leaves) leaf.pivot.rotation.y = -leaf.run * this.hanging.swing * angle;
  }

  private syncBlocker(): void {
    if (!this.blockersLaidOut) {
      this.updateWorldMatrix(true, false);
      for (const box of [...this.shutBlockers, ...this.openBlockers]) box.applyMatrix4(this.matrixWorld);
      this.blockersLaidOut = true;
    }
    const wanted = this.motion.openness < BLOCKER_SWAP ? this.shutBlockers : this.openBlockers;
    if (wanted === this.blocking) return;
    for (const box of this.blocking ?? []) this.options.collisions.remove(box);
    for (const box of wanted) this.options.collisions.add(box);
    this.blocking = wanted;
  }

  /** A knob on the street face and a lever inside (the street door), a handle on each side (the inner door). */
  private hardware(leaf: Leaf, street: boolean, sasFace: 1 | -1): void {
    const f = sasFinish();
    const { z0, z1 } = this.hanging;
    const along = leaf.run * (leaf.width - (street ? 0.1 : 0.08));
    for (const side of [1, -1] as const) {
      const inside = side === sasFace;
      // The street door's knob sits on the right leaf only, as on the painted door; its lever inside on both.
      if (street && !inside && leaf.run === 1) continue;
      const z = side > 0 ? z1 + 0.018 : z0 - 0.018;
      const knob = street && !inside;
      const geometry = knob ? new THREE.SphereGeometry(0.035, 16, 10) : new THREE.BoxGeometry(0.12, 0.018, 0.02);
      const at = new THREE.Vector3(along - leaf.run * (knob ? 0 : 0.05), knob ? 1.1 : 1.03, z);
      const mesh = new THREE.Mesh(geometry, inside ? f.brass : f.litBrass);
      mesh.position.copy(at);
      if (inside) bake(geometry, new THREE.Matrix4().multiplyMatrices(leaf.pivot.matrix, new THREE.Matrix4().makeTranslation(at)));
      leaf.pivot.add(mesh);
    }
  }
}
