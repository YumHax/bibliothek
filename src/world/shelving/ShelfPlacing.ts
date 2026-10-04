import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { basic } from '@/world/materials/palette';
import { markShared } from '@/world/materials/sharedResources';
import { RENDER_ORDER } from '@/world/surface/layers';
import type { GameBox } from '../GameBox';
import type { Showcases, ShowcaseTarget } from '../showcase/Showcases';
import type { ShelfTarget, ShelvingGroup } from './ShelvingGroup';

/** What the box in hand is aimed at: a spot on a shelf, or a slot of a display (`Showcases`). */
interface PlacingTarget {
  readonly spot: { readonly fits: boolean; readonly swap?: GameBox };
  /** Why it does not go there, when that is not a full row (a box too big for the display's slot). */
  readonly refusal?: string;
}

/** How far away a shelf spot can be aimed at with a box in hand (m). */
const REACH = 2.6;
/**
 * The ghost of the box in hand where it would go: a lit (not shaded) see-through box of its size, with its edges
 * drawn, so it reads on any shelf. Warm: it goes in the gap (the row parts to show it); blue: it swaps with the box
 * it wraps; red: no room.
 */
const GHOST_OPACITY = 0.22;
const COLOURS = { room: 0xffe6a8, swap: 0x9fd4ff, full: 0xff6b5c } as const;
type Look = keyof typeof COLOURS;
const FILLS: Record<Look, THREE.MeshBasicMaterial> = {
  room: ghostFill(COLOURS.room),
  swap: ghostFill(COLOURS.swap),
  full: ghostFill(COLOURS.full),
};
const EDGES: Record<Look, THREE.LineBasicMaterial> = {
  room: ghostEdge(COLOURS.room),
  swap: ghostEdge(COLOURS.swap),
  full: ghostEdge(COLOURS.full),
};
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX);
markShared(UNIT_BOX);
markShared(UNIT_EDGES);

/** What `ShelfPlacing` needs of the hand: the box in it, and whether it is in hand (not on its way back). */
interface HandLike {
  readonly current: GameBox | null;
  /** Non-null while the box is in (or on its way to) the hand. */
  readonly focusDistance: number | null;
}

/**
 * With one of the flat's shelf boxes in hand, the spot on a bookcase under the crosshair (`target`) and a ghost of
 * the box standing there: in a gap, the row's boxes part to where they would slide; over the middle of another box,
 * the two would swap (`swapping`); red when the row has no room. `place` puts it there (the `ShelvingGroup` makes
 * it the player's arrangement), after which the hand lets it go to its new spot.
 */
export class ShelfPlacing implements Updatable {
  private spot: ShelfTarget | null = null;
  /** The display's slot aimed at instead of a shelf (the nearer of the two wins). */
  private slot: ShowcaseTarget | null = null;
  private readonly ghost = new THREE.Group();
  private readonly fill: THREE.Mesh;
  private readonly edges: THREE.LineSegments;
  /** The boxes standing aside for the ghost now. */
  private parted = new Set<GameBox>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly centre = new THREE.Vector2(0, 0);

  /** `blocked(from, to)`: a wall stands between two world points; `showcases`: the flat's displays, aimed at like the shelves. */
  constructor(
    private readonly camera: THREE.Camera,
    scene: THREE.Object3D,
    private readonly shelves: ShelvingGroup,
    private readonly hand: HandLike,
    private readonly blocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean,
    private readonly showcases: Showcases | null = null,
  ) {
    this.fill = new THREE.Mesh(UNIT_BOX, FILLS.room);
    this.edges = new THREE.LineSegments(UNIT_EDGES, EDGES.room);
    for (const part of [this.fill, this.edges]) {
      part.castShadow = false;
      part.receiveShadow = false;
      part.renderOrder = RENDER_ORDER.label;
      // Never under the crosshair: the ray finds the shelf behind it.
      part.raycast = () => {};
    }
    this.ghost.add(this.fill, this.edges);
    this.ghost.name = 'ShelfSpotGhost';
    this.ghost.visible = false;
    scene.add(this.ghost);
  }

  /** Whether one of the flat's boxes is in hand, from a shelf or a display (not a market copy, not a stray's own box). */
  get active(): boolean {
    const box = this.hand.current;
    return box !== null && this.hand.focusDistance !== null && (this.shelves.findBox(box.game.id) === box || (this.showcases?.holds(box) ?? false));
  }

  /** The spot aimed at with a shelf box in hand, if any (`spot.fits` says whether its row, or the display's slot, has room). */
  get target(): PlacingTarget | null {
    if (this.slot) return { spot: this.slot, ...(this.slot.fits ? {} : { refusal: `Too big for the ${this.slot.stand.standName}.` }) };
    return this.spot;
  }

  /** Whether the spot aimed at swaps the box in hand with the one there (rather than putting it in a gap). */
  get swapping(): boolean {
    return (this.slot ? this.slot.swap : this.spot?.spot.swap) !== undefined;
  }

  /**
   * Puts the box in hand at the aimed spot (the neighbours slide to make room, or the two swap), or in the display's
   * slot aimed at (what stood there goes where the box in hand came from); false when there is none or no room.
   */
  place(): boolean {
    const box = this.hand.current;
    const slot = this.slot;
    if (box && slot && this.showcases) {
      if (!slot.fits) return false;
      this.part([]);
      this.showcases.put(box, slot);
      this.hide();
      return true;
    }
    const spot = this.spot;
    if (!box || !spot?.spot.fits) return false;
    // Back to their rest poses first: the rebuild slides every box from where it stands now.
    this.part([]);
    const swap = spot.spot.swap;
    if (this.showcases?.holds(box)) {
      // Off its display first; the shelves then stand with it, and it goes where it was aimed (the box there, if any, takes its slot).
      this.showcases.toShelves(box, () => this.shelves.moveBox(box, spot), swap);
    } else if (swap) this.shelves.swapBoxes(box, swap);
    else this.shelves.moveBox(box, spot);
    this.hide();
    return true;
  }

  update(): void {
    const box = this.hand.current;
    if (!box || !this.active) return this.hide();
    this.raycaster.setFromCamera(this.centre, this.camera);
    const ray = this.raycaster.ray;
    let hit = this.shelves.spotAt(ray, box, REACH);
    if (hit && this.blocked(ray.origin, hit.point)) hit = null;
    let slot = this.showcases?.spotAt(ray, box, REACH) ?? null;
    if (slot && this.blocked(ray.origin, slot.centre)) slot = null;
    if (slot && hit && hit.point.distanceTo(ray.origin) < slot.distance) slot = null;
    if (slot) return this.showSlot(slot);
    this.slot = null;
    if (!hit) return this.hide();
    if (this.showcases?.holds(box) && hit.spot.swap) {
      // From a display, the box it swaps with takes the display's slot: only the row's room counts.
      hit.spot.fits = hit.shelf.roomFor(hit.spot.row, hit.spot.swap, box);
    }
    this.spot = hit;
    const { shelf, spot } = hit;
    shelf.updateWorldMatrix(true, false);
    this.ghost.position.copy(spot.centre).applyMatrix4(shelf.matrixWorld);
    this.ghost.quaternion.setFromRotationMatrix(shelf.matrixWorld);
    this.ghost.scale.copy(spot.size);
    const look: Look = !spot.fits ? 'full' : spot.swap ? 'swap' : 'room';
    this.fill.material = FILLS[look];
    this.edges.material = EDGES[look];
    this.ghost.visible = true;
    this.part(spot.parting);
  }

  /** Stands `parting`'s boxes aside, and every box parted before and not now back at rest. */
  private part(parting: readonly (readonly [GameBox, number])[]): void {
    const now = new Set<GameBox>();
    for (const [box, dx] of parting) {
      box.setParted(dx);
      now.add(box);
    }
    for (const box of this.parted) if (!now.has(box)) box.setParted(0);
    this.parted = now;
  }

  /** The ghost in a display's slot: where the box in hand would lean (nothing parts there). */
  private showSlot(slot: ShowcaseTarget): void {
    this.spot = null;
    this.slot = slot;
    this.ghost.position.copy(slot.centre);
    this.ghost.quaternion.copy(slot.quaternion);
    this.ghost.scale.copy(slot.size);
    const look: Look = !slot.fits ? 'full' : slot.swap ? 'swap' : 'room';
    this.fill.material = FILLS[look];
    this.edges.material = EDGES[look];
    this.ghost.visible = true;
    if (this.parted.size) this.part([]);
  }

  private hide(): void {
    this.spot = null;
    this.slot = null;
    this.ghost.visible = false;
    if (this.parted.size) this.part([]);
  }
}

function ghostFill(color: number): THREE.MeshBasicMaterial {
  return basic({ color, transparent: true, opacity: GHOST_OPACITY, depthWrite: false, toneMapped: false });
}

function ghostEdge(color: number): THREE.LineBasicMaterial {
  return markShared(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
}
