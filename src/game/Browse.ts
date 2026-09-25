import type { SearchBar } from '@/ui/SearchBar';
import type { GameSource } from '@/collection/GameSource';
import type { Game, PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { GameBox } from '@/world/GameBox';
import type { SortMode } from '@/world/shelving/sort';
import type { Highlighter } from './Highlighter';
import type { CoreParts, DayNightLike, ShelvingLike } from './SessionParts';
import type { KeyRoute, SessionHost } from './SessionHost';
import { isAction } from '@/input/actions';
import { actionKeyLabel } from '@/ui/keys';
import { distanceTo, faceBox, standInFrontOf } from './playerPose';

/** A box may be picked up with Enter when closer than this (metres). */
const REACH_M = 2.5;
/** Second `R` press within this window walks to the random pick. */
const RANDOM_FOLLOW_UP_MS = 5000;
/** `Enter` after a search result picks the box up within this window. */
const SEARCH_FOLLOW_UP_MS = 10000;
/** How far in front of a box the random pick teleports the player (metres). */
const TELEPORT_DISTANCE_M = 2;
const HIGHLIGHT_SECONDS = 3;

const SORT_LABELS: Record<SortMode, string> = { platform: 'platform', year: 'release year', title: 'title' };

export interface BrowseParts extends Pick<CoreParts, 'player' | 'inspector'> {
  search?: SearchBar;
  highlighter?: Highlighter;
  /** What search looks through (the shelved games); else the boxes on the shelves. */
  gameSource?: GameSource;
  shelving?: ShelvingLike;
  dayNight?: DayNightLike;
}

/** The box the player was just pointed at (search result or random pick) and until when it counts. */
interface FocusedBox {
  box: GameBox;
  kind: 'search' | 'random';
  until: number;
}

/**
 * Finding a game on the shelves: F / Slash searches (Enter then picks the box up), R picks one at
 * random (R again walks there), a console on the stand points at its first game; T sorts the
 * shelves, N turns the room to night.
 */
export class Browse implements KeyRoute {
  private focus: FocusedBox | null = null;

  constructor(private readonly parts: BrowseParts, private readonly host: SessionHost) {
    const { search } = parts;
    if (search) {
      search.onSelect((game) => {
        host.setFrozen(false);
        this.locate(game, 'search');
      });
      search.onCancel(() => host.setFrozen(false));
    }
  }

  /** Boxes moved or one was taken: no stale glow, no Enter / R follow-up. */
  forget(): void {
    this.parts.highlighter?.clear();
    this.focus = null;
  }

  /** Clicking a console: name the platform, count its games and point at the first box. */
  focusPlatform(id: PlatformId): void {
    const boxes = this.ownedBoxes().filter((b) => b.game.platform === id);
    const name = getPlatform(id).name;
    if (!boxes.length) {
      this.host.notify(`No ${name} games on the shelves`);
      return;
    }
    if (this.locate(boxes[0]!.game, 'random')) {
      this.host.notify(`${name}: ${boxes.length} game${boxes.length > 1 ? 's' : ''}\nPress ${actionKeyLabel('randomPick')} to go there`, RANDOM_FOLLOW_UP_MS);
    }
  }

  onKey(code: string, e: KeyboardEvent): boolean {
    const { search, shelving, dayNight, inspector } = this.parts;
    if (isAction(code, 'search')) {
      if (!search) return false;
      e.preventDefault(); // would otherwise type into the freshly focused field
      this.openSearch(search);
      return true;
    }
    if (isAction(code, 'sortShelves')) {
      if (!shelving?.cycleSort) return false;
      this.cycleSort();
      return true;
    }
    if (isAction(code, 'nightMode')) {
      if (!dayNight) return false;
      this.toggleNight(dayNight);
      return true;
    }
    if (isAction(code, 'randomPick')) {
      if (inspector.isActive) return false;
      this.randomPick();
      return true;
    }
    return isAction(code, 'pickUpFound') && this.pickUpFocused();
  }

  // --- Quick search -----------------------------------------------------------------------------

  private openSearch(search: SearchBar): void {
    const games = this.games();
    if (!games.length) {
      this.host.notify('No games to search — the collection is empty');
      return;
    }
    search.open(games);
    this.host.setFrozen(true);
  }

  /** Highlights the game's box, turns the player towards it and arms Enter to pick it up. */
  private locate(game: Game, kind: FocusedBox['kind']): GameBox | null {
    const { player, highlighter } = this.parts;
    const box = this.parts.shelving?.findBox(game.id);
    if (!box) {
      this.host.notify(`${game.title} is not on a shelf`);
      return null;
    }
    highlighter?.highlight(box, HIGHLIGHT_SECONDS);
    faceBox(player, box);
    const ms = kind === 'random' ? RANDOM_FOLLOW_UP_MS : SEARCH_FOLLOW_UP_MS;
    this.focus = { box, kind, until: performance.now() + ms };

    if (kind === 'search') {
      const distance = distanceTo(player, box);
      this.host.notify(
        distance < REACH_M
          ? `${game.title} — press Enter to pick it up`
          : `${game.title} is ${distance.toFixed(1)} m away — walk closer and press Enter`,
        4000,
      );
    }
    return box;
  }

  /** Enter: picks up the focused box when it is within reach. Returns true when the key was consumed. */
  private pickUpFocused(): boolean {
    const focus = this.currentFocus();
    if (!focus || this.parts.inspector.isActive) return false;
    if (distanceTo(this.parts.player, focus.box) > REACH_M) {
      this.host.notify('Too far away — walk closer', 1500);
      return true;
    }
    this.host.pickUp(focus.box);
    return true;
  }

  private currentFocus(): FocusedBox | null {
    if (this.focus && performance.now() > this.focus.until) this.focus = null;
    return this.focus;
  }

  // --- Random pick ------------------------------------------------------------------------------

  private randomPick(): void {
    const focus = this.currentFocus();
    if (focus?.kind === 'random') {
      this.host.stand();
      standInFrontOf(this.parts.player, focus.box, TELEPORT_DISTANCE_M);
      this.host.pickUp(focus.box);
      return;
    }
    const boxes = this.ownedBoxes();
    if (!boxes.length) {
      this.host.notify('No games on the shelves');
      return;
    }
    const box = boxes[Math.floor(Math.random() * boxes.length)]!;
    if (this.locate(box.game, 'random')) {
      this.host.notify(`Random pick: ${box.game.title}\nPress ${actionKeyLabel('randomPick')} again to go there`, RANDOM_FOLLOW_UP_MS);
    }
  }

  // --- Sorting, night mode ----------------------------------------------------------------------

  private cycleSort(): void {
    const mode = this.parts.shelving?.cycleSort?.();
    if (!mode) return;
    this.forget(); // boxes move; a stale glow would mislead
    this.host.notify(`Sorted by ${SORT_LABELS[mode] ?? mode}`);
  }

  private toggleNight(dayNight: DayNightLike): void {
    dayNight.toggleNight();
    if (dayNight.isNight !== undefined) this.host.notify(dayNight.isNight ? 'Night' : 'Day', 1200);
  }

  private games(): readonly Game[] {
    return this.parts.gameSource?.games ?? this.ownedBoxes().map((b) => b.game);
  }

  private ownedBoxes(): readonly GameBox[] {
    return this.parts.shelving?.boxes ?? [];
  }
}
