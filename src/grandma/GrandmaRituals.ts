import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import { oncePerDay } from '@/time/OncePerDay';
import { FAVOURS, isFavourId, type FavourId } from './favours';
import type { LunchKind } from './lunch';
import type { Occasion } from './occasions';
import { RECIPES, isRecipeId, type RecipeId } from './recipes';

/*
 * MÉMÉ'S WAYS (docs/grandma.md "Sunday lunch, recipes and favours"): the lunches eaten at her table, the recipes she
 * taught and the dish cooked from one at home, the favour she asked and those done, the occasions kept (her birthday,
 * Christmas, All Saints). Saved as `bibliothek.grandmaRituals.v1`. Days are game days (`Today.gameDay`).
 */

/** How long things last and how often she asks. */
export const RITUALS = {
  /** A dish cooked at home is out (for a friend who drops by, like the cake) this many game days. */
  dishDays: 2,
  /** The portion for her keeps this many game days in the bag (the jam far longer: a jar). */
  portionDays: 4,
  jarDays: 30,
  /** She asks a favour from her `fromVisit`-th visit, `gapDays` game days after the last one was done. */
  favour: { fromVisit: 2, gapDays: 3, coins: 4 },
} as const;

/** A dish cooked at home: out on the worktop for friends, and a portion in the bag for her. */
interface Dish {
  recipe: RecipeId;
  day: number;
  /** Still out at home (a friend has not finished it). */
  home: boolean;
  /** The portion for her still carried. */
  carried: boolean;
}

/** The favour she asked: what, when, and the console's id at home for Félix's machine. */
interface OpenFavour {
  id: FavourId;
  day: number;
  console?: string;
}

interface RitualsState {
  /** How many lunches eaten at hers in all (today's: `oncePerDay`, `LUNCH_MARK`). */
  lunches: number;
  learned: RecipeId[];
  dish: Dish | null;
  favour: OpenFavour | null;
  /** The favours done, in order (one may come back), and the game day of the last. */
  helped: FavourId[];
  thankedDay: number | null;
  /** The occasions kept: `birthday:<day>`, `christmas:<year>`, `allSaints:<year>` (`?debug`'s with `:debug:<day>`). */
  kept: string[];
  /** `?debug`: an occasion today whatever the date. */
  forced: Occasion | null;
}

/** What happens, for whoever listens (the social layer). */
export type RitualEvent =
  | { kind: 'lunch'; lunch: LunchKind }
  | { kind: 'recipe'; id: RecipeId }
  | { kind: 'dish'; id: RecipeId }
  | { kind: 'favour'; id: FavourId }
  | { kind: 'occasion'; occasion: Occasion };

const OCCASIONS: readonly Occasion[] = ['birthday', 'christmas', 'allSaints'];

/** The once-a-day marker of lunch eaten at hers (`time/OncePerDay`). */
const LUNCH_MARK = 'grandmaLunch';

const fresh = (): RitualsState => ({ lunches: 0, learned: [], dish: null, favour: null, helped: [], thankedDay: null, kept: [], forced: null });

export class GrandmaRituals {
  private state: RitualsState;
  private readonly store: PersistedStore<RitualsState>;
  private readonly listeners = new Set<(event: RitualEvent) => void>();
  private readonly watchers = new Set<() => void>();

  constructor(private readonly day: () => number, storage: Storage | null = safeStorage()) {
    this.store = new PersistedStore<RitualsState>({ key: KEYS.grandmaRituals, version: 1, storage, defaults: fresh, read: readState });
    this.state = this.store.load();
  }

  subscribe(listener: (event: RitualEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Hears every change (a favour asked, a dish cooked or eaten): what shows reads again. */
  onChange(cb: () => void): () => void {
    this.watchers.add(cb);
    return () => this.watchers.delete(cb);
  }

  // --- lunch ---------------------------------------------------------------------------------

  /** Lunch eaten at hers on game day `day` already. */
  ateOn(day: number): boolean {
    return oncePerDay.done(LUNCH_MARK, day);
  }

  /** Lunch eaten (`lunch`: a Sunday's or Christmas). */
  eat(day: number, lunch: LunchKind): void {
    if (this.ateOn(day)) return;
    oncePerDay.mark(LUNCH_MARK, day);
    this.commit({ ...this.state, lunches: this.state.lunches + 1 });
    this.emit({ kind: 'lunch', lunch });
  }

  // --- recipes -------------------------------------------------------------------------------

  get learned(): readonly RecipeId[] {
    return this.state.learned;
  }

  /** The recipe she would teach now at `moment` (the end of a lunch, a favour's thanks), or null. */
  nextRecipe(moment: 'lunch' | 'favour'): RecipeId | null {
    return RECIPES.find((recipe) => recipe.taught === moment && !this.state.learned.includes(recipe.id))?.id ?? null;
  }

  learn(id: RecipeId): boolean {
    if (this.state.learned.includes(id)) return false;
    this.commit({ ...this.state, learned: [...this.state.learned, id] });
    this.emit({ kind: 'recipe', id });
    return true;
  }

  /** What the recipe tin cooks next: the first recipe learned after the one cooked last, or null when none is learned. */
  nextToCook(): RecipeId | null {
    const { learned, dish } = this.state;
    if (!learned.length) return null;
    const last = dish ? learned.indexOf(dish.recipe) : -1;
    return learned[(last + 1) % learned.length] ?? null;
  }

  /** The dish out at home (a friend may have some), or null. */
  get dishOut(): RecipeId | null {
    const dish = this.state.dish;
    return dish && dish.home && this.day() - dish.day < RITUALS.dishDays ? dish.recipe : null;
  }

  /** The portion for her in the bag, or null. */
  get portion(): RecipeId | null {
    const dish = this.state.dish;
    if (!dish?.carried) return null;
    const keeps = dish.recipe === 'jam' ? RITUALS.jarDays : RITUALS.portionDays;
    return this.day() - dish.day < keeps ? dish.recipe : null;
  }

  /** Cooks `id` at home: false while a dish is still out. */
  cook(id: RecipeId): boolean {
    if (this.dishOut || !this.state.learned.includes(id)) return false;
    this.commit({ ...this.state, dish: { recipe: id, day: this.day(), home: true, carried: true } });
    return true;
  }

  /** A friend finished the dish at home. */
  eatDish(): void {
    const dish = this.state.dish;
    if (dish?.home) this.commit({ ...this.state, dish: { ...dish, home: false } });
  }

  /** The portion handed to her: which, or null when none was carried. */
  givePortion(): RecipeId | null {
    const id = this.portion;
    const dish = this.state.dish;
    if (!id || !dish) return null;
    this.commit({ ...this.state, dish: { ...dish, carried: false } });
    this.emit({ kind: 'dish', id });
    return id;
  }

  // --- favours -------------------------------------------------------------------------------

  get favour(): { id: FavourId; day: number; console?: string } | null {
    return this.state.favour;
  }

  /** The favour she would ask now (her `visits` so far, this one included; `can`: what the player can do now), or null. */
  favourToAsk(visits: number, can: (id: FavourId) => boolean = () => true): FavourId | null {
    const { favour, helped, thankedDay } = this.state;
    if (favour || visits < RITUALS.favour.fromVisit) return null;
    if (thankedDay !== null && this.day() - thankedDay < RITUALS.favour.gapDays) return null;
    const fresh = FAVOURS.find((f) => !helped.includes(f.id) && can(f.id));
    if (fresh) return fresh.id;
    // All asked once: the ones that may come back, the one done longest ago first.
    const again = FAVOURS.filter((f) => !f.once && can(f.id)).sort((a, b) => helped.lastIndexOf(a.id) - helped.lastIndexOf(b.id));
    return again[0]?.id ?? null;
  }

  ask(id: FavourId, console?: string): void {
    this.commit({ ...this.state, favour: { id, day: this.day(), ...(console ? { console } : {}) } });
  }

  /** The open favour done: false if it was not the one asked. */
  complete(id: FavourId): boolean {
    if (this.state.favour?.id !== id) return false;
    this.commit({ ...this.state, favour: null, helped: [...this.state.helped, id], thankedDay: this.day() });
    this.emit({ kind: 'favour', id });
    return true;
  }

  // --- occasions -----------------------------------------------------------------------------

  get forced(): Occasion | null {
    return this.state.forced;
  }

  /** Whether `key` (`birthday:<day>`, `christmas:<year>`…) was kept already. */
  kept(key: string): boolean {
    return this.state.kept.includes(key);
  }

  /** `occasion` kept under `key`: false when it was already. */
  keep(occasion: Occasion, key: string): boolean {
    if (this.state.kept.includes(key)) return false;
    this.commit({ ...this.state, kept: [...this.state.kept, key] });
    this.emit({ kind: 'occasion', occasion });
    return true;
  }

  // --- `?debug` ------------------------------------------------------------------------------

  /** Her ways as on the first day. */
  debugReset(): void {
    this.commit(fresh());
  }

  /** Lunch again today; a favour asked on the next visit. */
  debugAgain(): void {
    oncePerDay.mark(LUNCH_MARK, -1);
    this.commit({ ...this.state, favour: null, thankedDay: null });
  }

  debugLearnAll(): void {
    this.commit({ ...this.state, learned: RECIPES.map((recipe) => recipe.id) });
  }

  /** An occasion today whatever the date (null: the calendar's). */
  debugForce(occasion: Occasion | null): void {
    this.commit({ ...this.state, forced: occasion });
  }

  private emit(event: RitualEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  private commit(state: RitualsState): void {
    this.state = state;
    this.store.save(state);
    for (const cb of [...this.watchers]) cb();
  }
}

function readState(data: unknown): RitualsState | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Partial<Record<keyof RitualsState, unknown>>;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const dish = raw.dish as Partial<Dish> | null | undefined;
  const favour = raw.favour as Partial<OpenFavour> | null | undefined;
  return {
    lunches: Math.max(0, Math.floor(num(raw.lunches) ?? 0)),
    learned: Array.isArray(raw.learned) ? raw.learned.filter(isRecipeId) : [],
    dish: dish && isRecipeId(dish.recipe) && num(dish.day) !== null ? { recipe: dish.recipe, day: dish.day!, home: dish.home === true, carried: dish.carried === true } : null,
    favour: favour && isFavourId(favour.id) && num(favour.day) !== null ? { id: favour.id, day: favour.day!, ...(typeof favour.console === 'string' ? { console: favour.console } : {}) } : null,
    helped: Array.isArray(raw.helped) ? raw.helped.filter(isFavourId) : [],
    thankedDay: num(raw.thankedDay),
    kept: Array.isArray(raw.kept) ? raw.kept.filter((k): k is string => typeof k === 'string') : [],
    forced: OCCASIONS.includes(raw.forced as Occasion) ? (raw.forced as Occasion) : null,
  };
}
