import * as THREE from 'three';
import type { GameBox } from '../GameBox';
import type { Shelf, ShelfSpot } from '../Shelf';
import type { Shelving } from './Shelving';
import { arrange, swapped, type ShelfAddress, type ShelfArrangement } from './arrangement';
import { nextSortMode, type SortMode } from './sort';

/** A spot on one of the flat's bookcases for the box in hand (`ShelvingGroup.spotAt`). */
export interface ShelfTarget extends ShelfAddress {
  shelf: Shelf;
  spot: ShelfSpot;
}

/**
 * Several Shelvings seen as one by the session: every zone handle's `shelving` (the collection
 * room's, the bedroom's bought bookcases, which hold what the first had no room for). Search, the
 * random pick and the sort key reach every box wherever it stands; sorting sorts them all the same
 * way, the first's order leading. A box the player puts somewhere by hand (`moveBox`) makes the
 * shelves theirs: the 'custom' sort, kept in the `ShelfArrangement`.
 */
export class ShelvingGroup {
  private readonly members: Shelving[];
  private readonly raycaster = new THREE.Raycaster();
  private readonly local = new THREE.Vector3();

  /** `shelvings` in order, the first leading the sort; absent ones (null, undefined) are skipped. */
  constructor(
    shelvings: readonly (Shelving | null | undefined)[],
    private readonly arrangement: ShelfArrangement | null = null,
  ) {
    this.members = shelvings.filter((s): s is Shelving => !!s);
    if (!this.members.length) throw new Error('[shelving] a ShelvingGroup needs at least one shelving');
  }

  get boxes(): readonly GameBox[] {
    return this.members.flatMap((s) => s.boxes);
  }

  findBox(gameId: string): GameBox | undefined {
    for (const shelving of this.members) {
      const box = shelving.findBox(gameId);
      if (box) return box;
    }
    return undefined;
  }

  cycleSort(): SortMode {
    return this.sortAll(nextSortMode(this.members[0]!.sortMode, this.arrangement?.exists ?? false));
  }

  /**
   * The spot on a bookcase where `ray` (world) meets it within `far` metres, for `held`: which bookcase, row and
   * place in the row. Null when the ray meets none. What stands between (a wall) is the caller's to check.
   */
  spotAt(ray: THREE.Ray, held: GameBox, far: number): (ShelfTarget & { point: THREE.Vector3 }) | null {
    this.raycaster.set(ray.origin, ray.direction);
    this.raycaster.far = far;
    let best: (ShelfTarget & { point: THREE.Vector3; distance: number }) | null = null;
    for (const shelving of this.members) {
      shelving.bookcases.forEach((shelf, bookcase) => {
        const hit = this.raycaster.intersectObject(shelf, true).find((h) => h.object !== held);
        if (!hit || (best && hit.distance >= best.distance)) return;
        const spot = shelf.spotAt(shelf.worldToLocal(this.local.copy(hit.point)), held);
        if (!spot) return;
        // A swap sends the other box to the row the one in hand came from: that row must have room for it.
        if (spot.swap && spot.fits && shelf.rowOf(held) !== spot.row) spot.fits = this.originHasRoom(held, spot.swap);
        best = { shelving: shelving.id, bookcase, row: spot.row, index: spot.index, shelf, spot, point: hit.point.clone(), distance: hit.distance };
      });
    }
    return best;
  }

  /**
   * Puts `box` (in hand) at `to`: the boxes as they stand become the player's arrangement, with this one moved
   * (the games not on the shelves today keep their places), and every shelving lays it out: the neighbours
   * slide to make room, the box's rest pose (and `home`) is its new spot. The caller then lets it go.
   */
  moveBox(box: GameBox, to: ShelfAddress): void {
    if (!this.arrangement) return;
    const shown = Object.fromEntries(this.members.map((shelving) => [shelving.id, shelving.rows()]));
    this.arrangement.setArrangement(arrange(shown, this.arrangement.all(), box.game.id, to));
    for (const shelving of this.members) shelving.arranged();
    this.sortAll('custom');
  }

  /**
   * Swaps `held` (in hand) with `other` (on a shelf): each takes the other's place, the rest of the shelves as they
   * stand becoming the player's arrangement, as `moveBox` does. The caller then lets the box in hand go.
   */
  swapBoxes(held: GameBox, other: GameBox): void {
    if (!this.arrangement) return;
    const shown = Object.fromEntries(this.members.map((shelving) => [shelving.id, shelving.rows()]));
    this.arrangement.setArrangement(swapped(shown, this.arrangement.all(), held.game.id, other.game.id));
    for (const shelving of this.members) shelving.arranged();
    this.sortAll('custom');
  }

  /** Whether the row `held` came from (it counts there while in hand) has room for `other` in its place. */
  private originHasRoom(held: GameBox, other: GameBox): boolean {
    const home = held.home;
    for (const shelving of this.members) {
      const shelf = shelving.bookcases.find((b) => b === home);
      if (!shelf) continue;
      const row = shelf.rowOf(held);
      return row >= 0 && shelf.roomFor(row, held, other);
    }
    return false;
  }

  /** Every shelving takes `mode`, the leader first (its overflow feeds the next); the mode is remembered. */
  private sortAll(mode: SortMode): SortMode {
    this.arrangement?.setMode(mode);
    const [first, ...rest] = this.members;
    // The others take the mode first: the leader's new overflow rebuilds them once, already in it.
    for (const shelving of rest) shelving.presetSort(mode);
    first!.presetSort(mode);
    first!.rebuild();
    // A second rebuild of one the overflow rebuilt already only restyles it.
    for (const shelving of rest) shelving.rebuild();
    return mode;
  }
}
