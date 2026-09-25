import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { GameSource } from '@/collection/GameSource';
import { GameList } from '@/collection/GameList';
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
  /**
   * Where the bookcases stand, instead of the collection room's back-wall-then-right-wall run
   * (`backWallMinX`, `rightWallKeepClear` are then ignored): positions, yaws and the width of every bookcase.
   */
  layout?: { slots: Slot[]; width: number };
  /** How many of the slots may be used (bought bookcases, say); all of them by default. `setCapacity` changes it. */
  capacity?: number;
  /** One ceiling spot per bookcase. Default true; off where a new light would recompile every shader mid-game. */
  lamps?: boolean;
  /** Where the games that do not fit are written (another Shelving's source); a fresh list by default. */
  overflow?: GameList;
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
 * is not fetched twice. What does not fit goes to `overflow`, which another Shelving (elsewhere in
 * the flat) can display.
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
  private minBookcases: number;
  private capacity: number;
  private readonly lamps: boolean;
  /** What the last full rebuild laid out: its games in shelf order, the settings, the ids that did not fit. */
  private laidOut: { games: readonly Game[]; settings: string; leftover: ReadonlySet<string> } | null = null;
  /** The games that did not fit, in shelf order; another Shelving can take them as its source. */
  readonly overflow: GameList;

  constructor(
    private readonly host: ShelvingHost,
    private readonly covers: BoxArtLoader,
    private readonly source: GameSource,
    options: ShelvingOptions,
  ) {
    this.mode = options.sort ?? 'platform';
    this.minBookcases = options.minBookcases ?? 0;
    this.lamps = options.lamps ?? true;
    this.overflow = options.overflow ?? new GameList();
    this.ceiling = options.room.height;
    const partial = { ...DEFAULT_SPEC, ...options.bookcase };
    const { slots, width } = options.layout ?? computeSlots(options.room, partial, options.backWallMinX ?? -options.room.width / 6, options.rightWallKeepClear);
    this.slots = slots;
    this.capacity = Math.min(options.capacity ?? slots.length, slots.length);
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

  /** Uses `bookcases` of the slots, every one of them standing even while empty (a bookcase just bought). */
  setCapacity(bookcases: number): void {
    const capacity = Math.max(0, Math.min(bookcases, this.slots.length));
    if (capacity === this.capacity && this.minBookcases === capacity) return;
    this.capacity = capacity;
    this.minBookcases = capacity;
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
    const games = dedupe(sortGames(this.source.games, this.mode));
    const settings = `${this.mode}|${this.capacity}|${this.minBookcases}`;
    // Most changes (a status, another room's list) leave the same games in the same order: restyle, do not rebuild.
    if (this.laidOut && this.laidOut.settings === settings && sameLayout(this.laidOut.games, games)) {
      this.restyle(games, this.laidOut.leftover);
      return;
    }

    const previouslyShown = new Set(this.ordered);
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
      maxBookcases: this.capacity,
      minBookcases: this.minBookcases,
    });

    plan.bookcases.forEach((planned, i) => {
      const slot = this.slots[i];
      const shelf = this.host.place(
        new Shelf({ width: spec.width, depth: spec.depth, rowHeights: planned.rowHeights, gap: spec.gap, boardThickness: spec.boardThickness }),
        slot.position,
        slot.rotationY,
      );
      this.shelves.push(shelf);
      planned.rows.forEach((row, r) => {
        shelf.placeRow(r, row.items);
        for (const box of row.items) {
          if (box.parent === shelf) this.homeOf.set(box, shelf);
          else this.followGhost(box, shelf); // carried by the player: its return target moves with it
        }
      });
    });
    // A spot hangs from the ceiling `SPOT_THROW` m in front of every slot, looking back at it (local -z):
    // lit over a bookcase, parked over an empty slot, so the scene's light count never follows the
    // collection (a light added or removed recompiles every shader).
    if (this.lamps) {
      this.slots.forEach((slot, i) => {
        const lamp = this.lampFor(i);
        lamp.setParked(i >= plan.bookcases.length);
        this.placedLamps.push(this.host.place(lamp, slot.position.clone().addScaledVector(slot.facing, SPOT_THROW).setY(this.ceiling), slot.rotationY));
      });
    }
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
    // Last, once this shelving is consistent: whoever shows the overflow rebuilds on this.
    const leftover = new Set(plan.leftover.map((box) => box.game.id));
    this.laidOut = { games, settings, leftover };
    this.overflow.set(games.filter((g) => leftover.has(g.id)));
  }

  /** Same games in the same order as the last rebuild: only their status (the ghost, the lent tag) can have changed. */
  private restyle(games: readonly Game[], leftover: ReadonlySet<string>): void {
    for (const game of games) this.boxById.get(game.id)?.setStatusStyle(game.status);
    for (const shelf of [...this.shelves, ...this.ghosts]) shelf.updateShadowProxy(); // a ghost casts no shadow
    this.laidOut = { ...this.laidOut!, games };
    this.overflow.set(games.filter((g) => leftover.has(g.id)));
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

/** Everything about a game but its status, as a string; computed once per Game object. */
const signatures = new WeakMap<Game, string>();
const withoutStatus = (key: string, value: unknown) => (key === 'status' ? undefined : value);

function signature(game: Game): string {
  let sig = signatures.get(game);
  if (sig === undefined) {
    sig = JSON.stringify(game, withoutStatus);
    signatures.set(game, sig);
  }
  return sig;
}

/** A status change alone must not rebuild the box (its textures would be refetched). */
function sameExceptStatus(a: Game, b: Game): boolean {
  return a === b || (a.id === b.id && signature(a) === signature(b));
}

/** The same games (but maybe their status) in the same order. */
function sameLayout(a: readonly Game[], b: readonly Game[]): boolean {
  return a.length === b.length && a.every((game, i) => sameExceptStatus(game, b[i]!));
}
