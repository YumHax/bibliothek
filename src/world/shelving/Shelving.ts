import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { boxDimensionsOf } from '@/catalog/media';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { GameSource } from '@/collection/GameSource';
import { GameList } from '@/collection/GameList';
import type { RoomOptions } from '../Room';
import type { Furniture } from '../Furniture';
import { GameBox } from '../GameBox';
import { PLINTH, Shelf } from '../Shelf';
import { ShelfLamp } from '../props/ShelfLamp';
import { BoxMotion } from './BoxMotion';
import { planArranged, planShelving, type BookcaseSpec, type ShelvingPlan } from './plan';
import { computeSlots, type Slot, type ZRange } from './slots';
import { nextSortMode, rowGroupKey, sortGames, type SortMode } from './sort';
import { BoxPool, sameExceptStatus } from './BoxPool';
import type { ShelfArrangement, ShelvingRows } from './arrangement';

/** What the shelving needs from the World: a way in and out of the scene for its furniture. */
export interface ShelvingHost {
  /** Where shelves and their ghosts are parented (the zone's group). */
  readonly scene: THREE.Object3D;
  place<T extends Furniture>(item: T, position: THREE.Vector3, rotationY?: number): T;
  remove(item: Furniture): void;
  /**
   * Boxes that entered / left the room, so the host can update its interactables. `handedOver` left it for another
   * shelving that shows them now (it may have taken them first): forgotten here, but still clickable.
   */
  boxesChanged(added: readonly GameBox[], removed: readonly GameBox[], handedOver?: readonly GameBox[]): void;
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
  /** A card on the first bookcase while it holds only a few games (the bare flat's start): what it is for. */
  starterCard?: { title: string; line: string; upTo: number };
  /** Its name in the player's arrangement (`arrangement.ts`): 'living', 'bedroom'. */
  id?: string;
  /** The sort the shelves stand in and the player's own arrangement ('custom'); the sort is `sort` alone without it. */
  arrangement?: ShelfArrangement;
  /** The boxes, shared with the flat's other shelvings so a game passing from one to the next keeps its box; its own by default. */
  pool?: BoxPool;
  /**
   * In the player's arrangement, the rows are counted for these games (the whole shelved collection) rather than
   * this shelving's own: every shelving keeps its rows, so no arranged row vanishes when a tall box comes to one.
   */
  rowsFrom?: GameSource;
}

/** How many bookcases `options` has room for (its `layout`'s slots, or the collection room's run along its walls). */
export function slotCount(options: Pick<ShelvingOptions, 'room' | 'backWallMinX' | 'rightWallKeepClear' | 'bookcase' | 'layout'>): number {
  if (options.layout) return options.layout.slots.length;
  const spec = { ...DEFAULT_SPEC, ...options.bookcase };
  return computeSlots(options.room, spec, options.backWallMinX ?? -options.room.width / 6, options.rightWallKeepClear).slots.length;
}

/** Horizontal distance from a bookcase face to its ceiling spot (m). */
const SPOT_THROW = 1.4;
/** A re-sort slides the boxes to their new spots one after another: the last sets off this long (s) after the first. */
const SORT_STAGGER = 0.35;

const DEFAULT_SPEC: Omit<BookcaseSpec, 'width' | 'rows'> = {
  depth: 0.3,
  // Five rows of about 29 cm for boxes of 18 to 20: a hand's height of air over the tallest, not a void.
  height: 1.7,
  boardThickness: 0.025,
  gap: 0.02,
  headroom: 0.04,
};

/** A game's box size, without a box: the plan decides what fits before any box is made. */
const dimensionsOf = (game: Game) => boxDimensionsOf(game);

/**
 * Owns every bookcase in the room. Sizes the shelving to the collection (as many bookcases as
 * the rows need, along the back wall then the right wall), sorts the boxes (or lays them out as the
 * player arranged them, the 'custom' sort), and rebuilds when the GameSource changes. The boxes come
 * from a `BoxPool` shared with the flat's other shelvings, made only for the games that get a spot:
 * what does not fit goes to `overflow`, which another Shelving (elsewhere in the flat) can display.
 * When the bookcases come out the same (a new sort, a box moved by the player), they stay and the
 * boxes slide to their new spots.
 */
export class Shelving {
  private mode: SortMode;
  readonly id: string;
  private readonly slots: readonly Slot[];
  private readonly spec: Omit<BookcaseSpec, 'rows'>;
  private readonly pool: BoxPool;
  /** The boxes this shelving shows, by game id. */
  private readonly shown = new Map<string, GameBox>();
  /** Boxes currently on a shelf, in shelf order. */
  private ordered: GameBox[] = [];
  private shelves: Shelf[] = [];
  private readonly ceiling: number;
  /** One ceiling spot per slot, created on first use and kept across rebuilds so its switch state survives. */
  private readonly lampBySlot = new Map<number, ShelfLamp>();
  private placedLamps: ShelfLamp[] = [];
  private readonly unsubscribe: () => void;
  private minBookcases: number;
  private capacity: number;
  private readonly lamps: boolean;
  private readonly starterCard: ShelvingOptions['starterCard'];
  private readonly arrangement: ShelfArrangement | null;
  private readonly rowsFrom: GameSource | null;
  /** Someone downstream shows the overflow: a box the player put on another shelving is left over here, for it. */
  private readonly passesOn: boolean;
  /** Bumped by `arranged()`: the player's arrangement changed, a 'custom' layout is stale. */
  private revision = 0;
  /** What the last layout laid out: its games in input order, the settings, the ids that did not fit. */
  private laidOut: { games: readonly Game[]; settings: string; leftover: ReadonlySet<string> } | null = null;
  /** The games that did not fit, in shelf order; another Shelving can take them as its source. */
  readonly overflow: GameList;
  /** Ticks the boxes while they move (a hover, a slide after a sort). */
  private readonly motion = new BoxMotion();

  constructor(
    private readonly host: ShelvingHost,
    covers: BoxArtLoader,
    private readonly source: GameSource,
    options: ShelvingOptions,
  ) {
    this.id = options.id ?? 'shelving';
    this.arrangement = options.arrangement ?? null;
    this.rowsFrom = options.rowsFrom ?? null;
    this.mode = this.arrangement?.mode ?? options.sort ?? 'platform';
    this.pool = options.pool ?? new BoxPool(covers);
    this.minBookcases = options.minBookcases ?? 0;
    this.lamps = options.lamps ?? true;
    this.starterCard = options.starterCard;
    this.passesOn = options.overflow !== undefined;
    this.overflow = options.overflow ?? new GameList();
    this.ceiling = options.room.height;
    const partial = { ...DEFAULT_SPEC, ...options.bookcase };
    const { slots, width } = options.layout ?? computeSlots(options.room, partial, options.backWallMinX ?? -options.room.width / 6, options.rightWallKeepClear);
    this.slots = slots;
    this.capacity = Math.min(options.capacity ?? slots.length, slots.length);
    this.spec = { ...partial, width };
    this.unsubscribe = source.subscribe(() => this.rebuild());
    host.place(this.motion, new THREE.Vector3());
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
    return this.shown.get(gameId);
  }

  /** The game ids as they stand: bookcase by bookcase, row by row, left to right (a box in hand counts on its row). */
  rows(): ShelvingRows {
    return this.shelves.map((shelf) => shelf.rowIds());
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

  /** Takes `mode` for its next rebuild without rebuilding now (a group sorting all its members at once). */
  presetSort(mode: SortMode): void {
    this.mode = mode;
  }

  /** The player's arrangement changed (a box moved by hand): the next rebuild lays it out again. */
  arranged(): void {
    this.revision++;
  }

  /** The sort the boxes stand in now (null before the first layout). */
  get sortShown(): SortMode | null {
    return this.laidOut ? (this.laidOut.settings.slice(0, this.laidOut.settings.indexOf('|')) as SortMode) : null;
  }

  cycleSort(): SortMode {
    this.setSort(nextSortMode(this.mode, this.arrangement?.exists ?? false));
    return this.mode;
  }

  /** Stops listening to the source and removes everything from the room. */
  dispose(): void {
    this.unsubscribe();
    const shown = this.ordered;
    this.tearDown();
    // `tearDown` took the boxes off these shelves; one standing on another shelving's now stays there.
    for (const id of this.shown.keys()) this.pool.letGo(this, id);
    this.shown.clear();
    this.ordered = [];
    this.host.remove(this.motion);
    this.host.boxesChanged([], shown);
  }

  rebuild(): void {
    const games = dedupe(sortGames(this.source.games, this.mode));
    const settings = `${this.mode}|${this.capacity}|${this.minBookcases}|${this.mode === 'custom' ? this.revision : ''}`;
    // Most changes (a status, another room's list) leave the same games in the same order: restyle, do not rebuild.
    if (this.laidOut && this.laidOut.settings === settings && sameLayout(this.laidOut.games, games)) {
      this.restyle(games, this.laidOut.leftover);
      return;
    }

    const plan = this.plan(games);
    const previouslyShown = new Set(this.ordered);
    const placed = plan.bookcases.flatMap((b) => b.rows.flatMap((r) => r.items));
    const boxes = this.takeBoxes(placed);
    const boxOf = (game: Game): GameBox => boxes.get(game.id)!;
    // The bookcases come out as they stand: they stay, and the boxes slide to their new spots.
    const inPlace = this.laidOut !== null && plan.bookcases.length === this.shelves.length && plan.bookcases.every((planned, i) => sameNumbers(planned.rowHeights, this.shelves[i]!.options.rowHeights));

    if (inPlace) {
      const mine = new Set<THREE.Object3D>(this.shelves);
      const order = new Map(placed.map((game, i) => [game.id, i]));
      const last = Math.max(1, placed.length - 1);
      // Only a box standing on one of these bookcases slides; one arriving from elsewhere (another room's shelves) appears.
      const slide = (box: GameBox): number | null => (box.parent && mine.has(box.parent) ? (order.get(box.game.id)! / last) * SORT_STAGGER : null);
      plan.bookcases.forEach((planned, i) => this.fillShelf(this.shelves[i]!, planned.rows.map((row) => row.items.map(boxOf)), slide));
      for (const shelf of this.shelves) shelf.updateShadowProxy(); // the proxy stands at the new rest poses
    } else {
      this.tearDown();
      const spec = this.bookcaseSpec(games);
      plan.bookcases.forEach((planned, i) => {
        const slot = this.slots[i]!;
        const shelf = this.host.place(
          new Shelf({ width: spec.width, depth: spec.depth, rowHeights: planned.rowHeights, gap: spec.gap, boardThickness: spec.boardThickness }, this.motion),
          slot.position,
          slot.rotationY,
        );
        this.shelves.push(shelf);
        this.fillShelf(shelf, planned.rows.map((row) => row.items.map(boxOf)));
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
    }

    this.ordered = placed.map(boxOf);
    this.placeStarterCard();
    // Status comes from the fresh Game object: a reused box still holds the one it was built with.
    for (const game of placed) boxOf(game).setStatusStyle(game.status);

    const shown = new Set(this.ordered);
    const added = this.ordered.filter((b) => !previouslyShown.has(b));
    const gone = [...previouslyShown].filter((b) => !shown.has(b));
    this.host.boxesChanged(added, gone.filter((b) => !this.pool.isHeld(b)), gone.filter((b) => this.pool.isHeld(b)));
    // Last, once this shelving is consistent: whoever shows the overflow rebuilds on this.
    const leftover = new Set(plan.leftover.map((game) => game.id));
    this.laidOut = { games, settings, leftover };
    this.overflow.set(games.filter((g) => leftover.has(g.id)));
  }

  /** Where every game goes: sorted and flowed, or as the player arranged them. */
  private plan(games: readonly Game[]): ShelvingPlan<Game> {
    const spec = this.bookcaseSpec(games);
    if (this.mode === 'custom' && this.arrangement) {
      const arrangement = this.arrangement;
      return planArranged<Game>({
        items: games,
        id: (game) => game.id,
        dimensions: dimensionsOf,
        arranged: arrangement.rowsOf(this.id),
        elsewhere: (id) => {
          if (!this.passesOn) return false;
          const where = arrangement.shelvingOf(id);
          return where !== null && where !== this.id;
        },
        spec,
        maxBookcases: this.capacity,
        minBookcases: this.minBookcases,
      });
    }
    return planShelving<Game>({
      items: games,
      dimensions: dimensionsOf,
      groupKey: (game) => rowGroupKey(game, this.mode),
      spec,
      maxBookcases: this.capacity,
      minBookcases: this.minBookcases,
    });
  }

  private bookcaseSpec(games: readonly Game[]): BookcaseSpec {
    const counted = this.mode === 'custom' && this.rowsFrom ? this.rowsFrom.games : games;
    return { ...this.spec, height: this.spec.height - PLINTH, rows: this.rowsFor(counted) };
  }

  /**
   * The boxes of `placed` (taken from the pool: the one there is, or a new one when the game's art-relevant data
   * changed); the pool is told of the games this shelving no longer shows.
   */
  private takeBoxes(placed: readonly Game[]): Map<string, GameBox> {
    const boxes = new Map<string, GameBox>();
    for (const game of placed) boxes.set(game.id, this.pool.take(this, game));
    for (const [id, box] of this.shown) {
      // Still shown (the pool replaced and disposed the old box if the game's art-relevant data changed).
      if (boxes.has(id)) continue;
      // Off these shelves only: the next shelving may have taken it already (a box the player moved there).
      if (box.parent instanceof Shelf && this.shelves.includes(box.parent)) box.removeFromParent();
      this.pool.letGo(this, id);
    }
    this.shown.clear();
    for (const [id, box] of boxes) this.shown.set(id, box);
    return boxes;
  }

  /** Lays every row of `shelf` (the rows `rows` leaves out stand empty). */
  private fillShelf(shelf: Shelf, rows: readonly (readonly GameBox[])[], slide?: (box: GameBox) => number | null): void {
    for (let r = 0; r < shelf.rowCount; r++) shelf.placeRow(r, rows[r] ?? [], slide);
  }

  /** The starter card on the first bookcase's top row, right of its few boxes, while there are few enough of them. */
  private placeStarterCard(): void {
    const card = this.starterCard;
    const shelf = this.shelves[0];
    if (!card || !shelf) return;
    const few = this.ordered.length <= card.upTo;
    shelf.setCard(few ? card : null, 0, shelf.options.width / 2 - shelf.options.boardThickness - 0.12);
  }

  /** Same games in the same order as the last rebuild: only their status (the ghost, the lent tag) can have changed. */
  private restyle(games: readonly Game[], leftover: ReadonlySet<string>): void {
    for (const game of games) this.shown.get(game.id)?.setStatusStyle(game.status);
    for (const shelf of this.shelves) shelf.updateShadowProxy(); // a ghost casts no shadow
    this.laidOut = { ...this.laidOut!, games };
    this.overflow.set(games.filter((g) => leftover.has(g.id)));
  }

  /** Removes shelves and their lights, leaving boxes parentless (or in the player's hand, the shelf they belong on gone). */
  private tearDown(): void {
    for (const shelf of this.shelves) {
      for (const child of [...shelf.children]) if (child instanceof GameBox) shelf.remove(child);
      this.host.remove(shelf);
      shelf.dispose();
    }
    this.shelves = [];
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

  /** 5 rows when the tallest box of the games fits in a fifth of the bookcase, else 4. */
  private rowsFor(games: readonly Game[]): number {
    const tallest = games.reduce((h, g) => Math.max(h, dimensionsOf(g).height), 0) + this.spec.headroom;
    const { height, boardThickness } = this.spec;
    // The rows share what the plinth leaves of the bookcase's height (`Shelf` stands them on it).
    const clearance = (rows: number) => (height - PLINTH - (rows + 1) * boardThickness) / rows;
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

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((x, i) => Math.abs(x - b[i]!) < 1e-6);
}

/** The same games (but maybe their status) in the same order. */
function sameLayout(a: readonly Game[], b: readonly Game[]): boolean {
  return a.length === b.length && a.every((game, i) => sameExceptStatus(game, b[i]!));
}
