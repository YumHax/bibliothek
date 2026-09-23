import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { GameSource } from '@/collection/GameSource';
import type { RoomOptions } from '../Room';
import type { Furniture } from '../Furniture';
import { GameBox } from '../GameBox';
import { Shelf } from '../Shelf';
import { ShelfLamp } from '../props/ShelfLamp';
import { planShelving, type BookcaseSpec } from './plan';
import { computeSlots, type Slot, type ZRange } from './slots';
import { nextSortMode, rowGroupKey, sortGames, type SortMode } from './sort';

/** What the shelving needs from the World: a way in and out of the scene for its furniture. */
export interface ShelvingHost {
  /** Where shelves and their ghosts are parented (the zone's group). */
  readonly scene: THREE.Object3D;
  place<T extends Furniture>(item: T, position: THREE.Vector3, rotationY?: number): T;
  remove(item: Furniture): void;
  /** Boxes that entered / left the room, so the host can update its interactables. */
  boxesChanged(added: readonly GameBox[], removed: readonly GameBox[]): void;
}

export interface ShelvingOptions {
  room: RoomOptions;
  /** Back-wall x from which bookcases may start; everything left of it is the TV corner. */
  backWallMinX?: number;
  /** Stretch of the right wall (world z range) no bookcase may cover, e.g. a projection wall. */
  rightWallKeepClear?: ZRange;
  sort?: SortMode;
  bookcase?: Partial<Pick<BookcaseSpec, 'height' | 'depth' | 'gap' | 'headroom' | 'boardThickness'>>;
  /** Bookcases that stand even when the collection is empty or small, waiting to be filled. Default 0. */
  minBookcases?: number;
}

/** Horizontal distance from a bookcase face to its ceiling spot (m). */
const SPOT_THROW = 1.4;

const DEFAULT_SPEC: Omit<BookcaseSpec, 'width' | 'rows'> = {
  depth: 0.3,
  height: 1.9,
  boardThickness: 0.025,
  gap: 0.02,
  headroom: 0.04,
};

/**
 * Owns every bookcase in the room. Sizes the shelving to the collection (as many bookcases as
 * the rows need, along the back wall then the right wall), sorts the boxes, and rebuilds when
 * the GameSource changes — reusing the GameBox of every game that is still there so its art
 * is not fetched twice.
 */
export class Shelving {
  private mode: SortMode;
  private readonly slots: readonly Slot[];
  private readonly spec: Omit<BookcaseSpec, 'rows'>;
  private readonly boxById = new Map<string, GameBox>();
  /** Boxes currently on a shelf, in shelf order. */
  private ordered: GameBox[] = [];
  private shelves: Shelf[] = [];
  private readonly ceiling: number;
  /** One ceiling spot per slot, created on first use and kept across rebuilds so its switch state survives. */
  private readonly lampBySlot = new Map<number, ShelfLamp>();
  private placedLamps: ShelfLamp[] = [];
  /** The Group the Inspector will return each box to (its shelf, or an emptied "ghost" of it). */
  private readonly homeOf = new Map<GameBox, Shelf>();
  private ghosts: Shelf[] = [];
  private readonly unsubscribe: () => void;
  private readonly minBookcases: number;

  constructor(
    private readonly host: ShelvingHost,
    private readonly covers: BoxArtLoader,
    private readonly source: GameSource,
    options: ShelvingOptions,
  ) {
    this.mode = options.sort ?? 'platform';
    this.minBookcases = options.minBookcases ?? 0;
    this.ceiling = options.room.height;
    const partial = { ...DEFAULT_SPEC, ...options.bookcase };
    const { slots, width } = computeSlots(options.room, partial, options.backWallMinX ?? -options.room.width / 6, options.rightWallKeepClear);
    this.slots = slots;
    this.spec = { ...partial, width };
    this.unsubscribe = source.subscribe(() => this.rebuild());
    this.rebuild();
  }

  get sortMode(): SortMode {
    return this.mode;
  }

  /** Every displayed box, in shelf order (left to right, top to bottom, bookcase by bookcase). */
  get boxes(): readonly GameBox[] {
    return this.ordered;
  }

  get bookcases(): readonly Shelf[] {
    return this.shelves;
  }

  findBox(gameId: string): GameBox | undefined {
    const box = this.boxById.get(gameId);
    return box && this.ordered.includes(box) ? box : undefined;
  }

  setSort(mode: SortMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.rebuild();
  }

  cycleSort(): SortMode {
    this.setSort(nextSortMode(this.mode));
    return this.mode;
  }

  /** Stops listening to the source and removes everything from the room. */
  dispose(): void {
    this.unsubscribe();
    const shown = this.ordered;
    this.tearDown();
    for (const box of this.boxById.values()) this.disposeBox(box);
    this.boxById.clear();
    this.ordered = [];
    for (const ghost of this.ghosts) this.host.scene.remove(ghost);
    this.ghosts = [];
    this.host.boxesChanged([], shown);
  }

  rebuild(): void {
    const previouslyShown = new Set(this.ordered);
    const games = dedupe(sortGames(this.source.games, this.mode));
    const dropped = this.reconcile(games);
    this.tearDown();
    for (const box of dropped) this.disposeBox(box);

    const boxes = games.map((g) => this.boxById.get(g.id)!);
    const spec: BookcaseSpec = { ...this.spec, rows: this.rowsFor(boxes) };
    const plan = planShelving<GameBox>({
      items: boxes,
      dimensions: (box) => box.dimensions,
      groupKey: (box) => rowGroupKey(box.game, this.mode),
      spec,
      maxBookcases: this.slots.length,
      minBookcases: this.minBookcases,
    });
    if (plan.leftover.length) console.warn(`[shelving] ${plan.leftover.length} game(s) do not fit in the room`);

    plan.bookcases.forEach((planned, i) => {
      const slot = this.slots[i];
      const shelf = this.host.place(
        new Shelf({ width: spec.width, depth: spec.depth, rowHeights: planned.rowHeights, gap: spec.gap, boardThickness: spec.boardThickness }),
        slot.position,
        slot.rotationY,
      );
      this.shelves.push(shelf);
      // Its spot hangs from the ceiling `SPOT_THROW` m in front of the bookcase, looking back at it (local -z).
      this.placedLamps.push(this.host.place(this.lampFor(i), slot.position.clone().addScaledVector(slot.facing, SPOT_THROW).setY(this.ceiling), slot.rotationY));
      planned.rows.forEach((row, r) => {
        shelf.placeRow(r, row.items);
        for (const box of row.items) {
          if (box.parent === shelf) this.homeOf.set(box, shelf);
          else this.followGhost(box, shelf); // carried by the player: its return target moves with it
        }
      });
    });
    for (const box of plan.leftover) {
      box.removeFromParent();
      this.homeOf.delete(box);
    }

    this.ordered = plan.bookcases.flatMap((b) => b.rows.flatMap((r) => r.items));
    // Status comes from the fresh Game object: a reused box still holds the one it was built with.
    games.forEach((game, i) => boxes[i]!.setStatusStyle(game.status));

    const shown = new Set(this.ordered);
    const added = this.ordered.filter((b) => !previouslyShown.has(b));
    const removed = [...previouslyShown].filter((b) => !shown.has(b));
    this.host.boxesChanged(added, removed);
  }

  /**
   * Makes sure a GameBox exists for every game, reusing the current one unless art-relevant
   * data changed. Returns the boxes that are no longer wanted (caller disposes them).
   */
  private reconcile(games: readonly Game[]): GameBox[] {
    const dropped: GameBox[] = [];
    const keep = new Set<string>();
    for (const game of games) {
      keep.add(game.id);
      const previous = this.boxById.get(game.id);
      if (previous && sameExceptStatus(previous.game, game)) continue;
      if (previous) dropped.push(previous);
      this.boxById.set(game.id, new GameBox(game, this.covers));
    }
    for (const [id, box] of this.boxById) {
      if (keep.has(id)) continue;
      dropped.push(box);
      this.boxById.delete(id);
    }
    return dropped;
  }

  /** Removes shelves and their lights, leaving boxes parentless (or in the player's hand). */
  private tearDown(): void {
    const carriedHomes = new Set<Shelf>();
    for (const box of this.boxById.values()) {
      if (!box.parent || box.parent instanceof Shelf) continue;
      const home = this.homeOf.get(box);
      if (home) carriedHomes.add(home);
    }
    for (const shelf of [...this.shelves, ...this.ghosts]) {
      for (const child of [...shelf.children]) if (child instanceof GameBox) shelf.remove(child);
      this.host.remove(shelf);
      shelf.dispose();
      if (carriedHomes.has(shelf)) this.host.scene.add(shelf); // invisible, only a return target now
    }
    this.shelves = [];
    this.ghosts = [...carriedHomes];
    for (const lamp of this.placedLamps) this.host.remove(lamp);
    this.placedLamps = [];
  }

  private lampFor(slotIndex: number): ShelfLamp {
    let lamp = this.lampBySlot.get(slotIndex);
    if (!lamp) {
      lamp = new ShelfLamp({ throwDistance: SPOT_THROW, aimHeight: this.spec.height * 0.5, ceilingHeight: this.ceiling });
      this.lampBySlot.set(slotIndex, lamp);
    }
    return lamp;
  }

  /** Moves the carried box's return target (an emptied old shelf) onto the shelf it now belongs to. */
  private followGhost(box: GameBox, shelf: Shelf): void {
    const ghost = this.homeOf.get(box);
    if (!ghost) {
      this.homeOf.set(box, shelf);
      return;
    }
    ghost.position.copy(shelf.position);
    ghost.quaternion.copy(shelf.quaternion);
    ghost.updateMatrixWorld(true);
  }

  private disposeBox(box: GameBox): void {
    box.removeFromParent();
    this.homeOf.delete(box);
    box.dispose();
  }

  /** 5 rows when the tallest box of the collection fits in a fifth of the bookcase, else 4. */
  private rowsFor(boxes: readonly GameBox[]): number {
    const tallest = boxes.reduce((h, b) => Math.max(h, b.dimensions.height), 0) + this.spec.headroom;
    const { height, boardThickness } = this.spec;
    const clearance = (rows: number) => (height - (rows + 1) * boardThickness) / rows;
    return clearance(5) >= tallest ? 5 : 4;
  }
}

/** Two entries with the same id would fight over one GameBox; keep the first. */
function dedupe(games: Game[]): Game[] {
  const seen = new Set<string>();
  return games.filter((g) => {
    if (seen.has(g.id)) {
      console.warn(`[shelving] duplicate game id "${g.id}" ignored`);
      return false;
    }
    seen.add(g.id);
    return true;
  });
}

/** A status change alone must not rebuild the box (its textures would be refetched). */
function sameExceptStatus(a: Game, b: Game): boolean {
  if (a === b) return true;
  const strip = (key: string, value: unknown) => (key === 'status' ? undefined : value);
  return JSON.stringify(a, strip) === JSON.stringify(b, strip);
}
