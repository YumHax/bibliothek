import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Shelf } from '@/world/Shelf';
import { invisibleHitbox } from '@/world/meshUtils';
import { inScene } from './inScene';

/** How often the bookcases standing are read again (s): a rebuild or a bookcase bought changes them. */
const RECOUNT_SECONDS = 0.5;
/** The click target's depth, and how far in front of the back it stands (m): behind every box, so a box is hit first. */
const DEPTH = 0.01;
const OFF_BACK = 0.012;

interface FrontsOptions {
  scene: THREE.Scene;
  /** The flat's bookcases standing now (`ShelvingGroup.bookcaseList`). */
  bookcases: () => readonly Shelf[];
  interactor: { add(item: Interactable): void; remove(item: Interactable): void };
  /** The ray goes through every bookcase now (facing one already, seated): only the boxes are clicked. */
  passing: () => boolean;
}

/**
 * The open face of each bookcase, clickable (docs/furnishing.md "The bookcase view"): a click between the boxes, on a
 * board or a side, faces the bookcase (`SessionActions.faceBookcase`). One invisible plane per bookcase just in front
 * of its back, so the boxes before it are always what the ray meets first; kept in the scene, not in the bookcase
 * (whose own rays, `ShelvingGroup.spotAt` and the label maker's, never meet it), and moved with it every frame.
 */
export class BookcaseFronts implements Updatable {
  private readonly fronts = new Map<Shelf, BookcaseFront>();
  private readonly group = new THREE.Group();
  private age = Infinity;

  constructor(private readonly options: FrontsOptions) {
    this.group.name = 'BookcaseFronts';
    this.group.matrixAutoUpdate = false;
    options.scene.add(this.group);
  }

  update(dt: number): void {
    this.age += dt;
    if (this.age >= RECOUNT_SECONDS) this.recount();
    for (const front of this.fronts.values()) front.follow();
  }

  private recount(): void {
    this.age = 0;
    const standing = new Set(this.options.bookcases());
    for (const [shelf, front] of this.fronts) {
      if (standing.has(shelf)) continue;
      this.options.interactor.remove(front);
      this.group.remove(front.hitbox);
      this.fronts.delete(shelf);
    }
    for (const shelf of standing) {
      if (this.fronts.has(shelf)) continue;
      const front = new BookcaseFront(shelf, this.options.scene, this.options.passing);
      this.fronts.set(shelf, front);
      this.group.add(front.hitbox);
      this.options.interactor.add(front);
    }
  }
}

class BookcaseFront implements Interactable {
  readonly hitbox: THREE.Mesh;
  readonly hitboxes: THREE.Object3D[];
  private readonly offset: THREE.Matrix4;

  constructor(
    private readonly shelf: Shelf,
    private readonly scene: THREE.Scene,
    private readonly passing: () => boolean,
  ) {
    const { width, depth } = shelf.options;
    this.hitbox = invisibleHitbox(width, shelf.height, DEPTH);
    this.hitbox.name = 'BookcaseFront';
    this.hitbox.matrixAutoUpdate = false;
    this.hitboxes = [this.hitbox];
    this.offset = new THREE.Matrix4().makeTranslation(0, shelf.height / 2, -depth / 2 + OFF_BACK + DEPTH / 2);
    this.follow();
  }

  /** Where the bookcase stands now (the player may be carrying it). */
  follow(): void {
    this.hitbox.matrix.multiplyMatrices(this.shelf.matrixWorld, this.offset);
    this.hitbox.matrixWorld.copy(this.hitbox.matrix);
  }

  passesThrough(holding: boolean): boolean {
    // A box in hand aims at the gaps (`ShelfPlacing`); a bookcase in a room not drawn now is not there to click.
    return holding || this.passing() || !inScene(this.shelf, this.scene);
  }

  setHovered(): void {}

  label(): string {
    return 'Bookcase · browse';
  }

  activate(session: SessionActions): void {
    session.faceBookcase(this.shelf);
  }
}
