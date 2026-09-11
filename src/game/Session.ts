import type { Input } from '@/core/Input';
import type { Interactable } from '@/interaction/Interactable';
import type { Game, PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { randomStartSeconds } from '@/video/randomStart';
import type { GameBox } from '@/world/GameBox';
import type { Seat } from '@/world/Seat';
import type { VideoScreen } from '@/world/screen';
import type { SessionActions } from './SessionActions';
import type { SessionParts } from './SessionParts';
import type { SortMode } from '@/world/shelving/sort';
import { distanceTo, faceBox, standInFrontOf } from './playerPose';

export type { SessionParts } from './SessionParts';

/** Physical keys that make a seated player stand up (movement keys and the "put back" key). */
const STAND_UP_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE']);

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

/** The box the player was just pointed at (search result or random pick) and until when it counts. */
interface FocusedBox {
  box: GameBox;
  kind: 'search' | 'random';
  until: number;
}

/**
 * Game rules: what happens when the player clicks something, presses a key or leaves the room.
 * Interactables call back into it through `SessionActions`; it owns nothing in the scene itself.
 * Optional features (search, random pick, sorting, night mode, box opening, collection editor)
 * are routed here too and silently skipped when their part is not wired in (see `SessionParts`).
 */
export class Session implements SessionActions {
  private focus: FocusedBox | null = null;
  private editorOpen = false;
  /** The screen last asked to play; only one plays at a time so two longplays never talk over each other. */
  private activeScreen: VideoScreen | null = null;

  constructor(private readonly parts: SessionParts) {
    const { interactor, inspector, player, search, collectionEditor } = parts;
    interactor.ignore = (item) => item === inspector.current; // the carried box must not block the ray
    interactor.events.onHoverChange = (item) => this.onHover(item);
    interactor.events.onSelect = (item) => item.activate(this);
    inspector.events.onLookEnabledChange = (enabled) => (player.controls.enabled = enabled);
    player.controls.addEventListener('unlock', () => {
      if (inspector.isActive) this.putBack();
      this.stand();
      // Esc under pointer lock is eaten by the browser and unlocks instead: treat it as "close search".
      search?.close();
    });
    if (search) {
      search.events.onSelect = (game) => {
        this.setSearchFrozen(false);
        this.locate(game, 'search');
      };
      search.events.onCancel = () => this.setSearchFrozen(false);
    }
    if (collectionEditor) collectionEditor.onOpenChange = (open) => this.syncEditor(open);
  }

  get held(): GameBox | null {
    return this.parts.inspector.current;
  }

  get seated(): boolean {
    return this.parts.player.isSeated;
  }

  /** True while a DOM overlay (search bar, collection editor) owns the keyboard. */
  get modalOpen(): boolean {
    return this.editorOpen || (this.parts.search?.isOpen ?? false);
  }

  /** Routes clicks and key presses to the rules. Call once. */
  bindInput(input: Input, doc: Document = document): void {
    const { player, interactor, inspector } = this.parts;
    doc.addEventListener('mousedown', (e) => {
      if (this.modalOpen || !player.isLocked || e.button !== 0) return;
      if (!interactor.select() && inspector.isActive) this.putBack(); // clicked at nothing while holding
    });
    // Right-click drag rotates the held box; the browser menu would steal the mouse.
    doc.addEventListener('contextmenu', (e) => e.preventDefault());
    input.onPress((code, e) => {
      // Tab works everywhere (start card, room, inside the editor) so it can close what it opened.
      if (code === 'Tab' && this.parts.collectionEditor) {
        e.preventDefault();
        this.toggleEditor();
        return;
      }
      if (code === 'Escape' && this.editorOpen) {
        this.toggleEditor();
        return;
      }
      if (this.modalOpen || !player.isLocked) return; // the search bar reads its own keys

      switch (code) {
        case 'Slash':
        case 'KeyF':
          if (this.parts.search) {
            e.preventDefault(); // would otherwise type into the freshly focused field
            this.openSearch();
            return;
          }
          break;
        case 'KeyE':
          if (inspector.isActive) {
            this.putBack();
            return;
          }
          break;
        case 'KeyO':
          if (inspector.isActive) {
            this.toggleBoxOpen();
            return;
          }
          break;
        case 'KeyT':
          if (this.parts.shelving?.cycleSort) {
            this.cycleSort();
            return;
          }
          break;
        case 'KeyN':
          if (this.parts.dayNight) {
            this.toggleNight();
            return;
          }
          break;
        case 'KeyR':
          if (!inspector.isActive) {
            this.randomPick();
            return;
          }
          break;
        case 'KeyC':
          if (this.parts.cat) {
            this.callCat();
            return;
          }
          break;
        case 'Enter':
        case 'NumpadEnter':
          if (this.pickUpFocused()) return;
          break;
      }
      if (player.isSeated && STAND_UP_KEYS.has(code)) this.stand();
    });
  }

  // --- SessionActions ---------------------------------------------------------------------------

  pickUp(box: GameBox): void {
    this.parts.highlighter?.clear();
    this.focus = null;
    this.parts.inspector.inspect(box);
    this.parts.panel.show(box.game);
  }

  putBack(): void {
    this.parts.inspector.release();
    this.parts.panel.hide();
  }

  sit(seat: Seat): void {
    const { position, yaw } = seat.eyePose();
    this.parts.player.sit(position, yaw);
    this.parts.cat?.setPlayerSeat?.(seat);
    this.hint('Move or press E to stand up');
  }

  stand(): void {
    if (!this.parts.player.isSeated) return;
    this.parts.player.stand();
    this.parts.cat?.setPlayerSeat?.(null);
  }

  async playOn(screen: VideoScreen, box: GameBox): Promise<void> {
    if (this.activeScreen && this.activeScreen !== screen) this.activeScreen.stop();
    this.activeScreen = screen;
    screen.searching(box.game.title);
    try {
      const video = await this.parts.videos.findLongplay(box.game);
      if (this.activeScreen !== screen || screen.state !== 'searching') return; // switched off or replaced meanwhile
      if (!video) {
        screen.fail(`No longplay found for\n${box.game.title}`);
        return;
      }
      screen.play(video, randomStartSeconds(video.durationSeconds)); // skip intro and credits
    } catch (err) {
      console.warn('[video]', err);
      if (this.activeScreen === screen) screen.fail('Video search failed.\nIs the dev server running?');
    }
  }

  stopScreen(screen: VideoScreen): void {
    screen.stop();
    if (this.activeScreen === screen) this.activeScreen = null;
  }

  hint(message: string): void {
    this.parts.overlay.showHint(message);
  }

  // --- Console stand ----------------------------------------------------------------------------

  /** Clicking a console: name the platform, count its games and point at the first box. */
  focusPlatform(id: PlatformId): void {
    const boxes = this.ownedBoxes().filter((b) => b.game.platform === id);
    const name = getPlatform(id).name;
    if (!boxes.length) {
      this.notify(`No ${name} games on the shelves`);
      return;
    }
    if (this.locate(boxes[0]!.game, 'random')) {
      this.notify(`${name}: ${boxes.length} game${boxes.length > 1 ? 's' : ''}\nPress R to go there`, RANDOM_FOLLOW_UP_MS);
    }
  }

  // --- Quick search -----------------------------------------------------------------------------

  private openSearch(): void {
    const { search } = this.parts;
    if (!search) return;
    const games = this.games();
    if (!games.length) {
      this.notify('No games to search — the collection is empty');
      return;
    }
    search.open(games);
    this.setSearchFrozen(true);
  }

  /** While typing, WASD must not walk and the crosshair must not pick; the pointer lock stays engaged. */
  private setSearchFrozen(frozen: boolean): void {
    const { player, interactor } = this.parts;
    player.movementEnabled = !frozen;
    interactor.enabled = !frozen && !this.editorOpen;
  }

  /** Highlights the game's box, turns the player towards it and arms Enter to pick it up. */
  private locate(game: Game, kind: FocusedBox['kind']): GameBox | null {
    const { player, highlighter } = this.parts;
    const box = this.findBox(game);
    if (!box) {
      this.notify(`${game.title} is not on a shelf`);
      return null;
    }
    highlighter?.highlight(box, HIGHLIGHT_SECONDS);
    faceBox(player, box);
    const ms = kind === 'random' ? RANDOM_FOLLOW_UP_MS : SEARCH_FOLLOW_UP_MS;
    this.focus = { box, kind, until: performance.now() + ms };

    if (kind === 'search') {
      const distance = distanceTo(player, box);
      this.notify(
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
      this.notify('Too far away — walk closer', 1500);
      return true;
    }
    this.pickUp(focus.box);
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
      this.goToAndPickUp(focus.box);
      return;
    }
    const boxes = this.ownedBoxes();
    if (!boxes.length) {
      this.notify('No games on the shelves');
      return;
    }
    const box = boxes[Math.floor(Math.random() * boxes.length)]!;
    if (this.locate(box.game, 'random')) {
      this.notify(`Random pick: ${box.game.title}\nPress R again to go there`, RANDOM_FOLLOW_UP_MS);
    }
  }

  private goToAndPickUp(box: GameBox): void {
    this.stand();
    standInFrontOf(this.parts.player, box, TELEPORT_DISTANCE_M);
    this.pickUp(box);
  }

  // --- The cat ----------------------------------------------------------------------------------

  private callCat(): void {
    const { cat } = this.parts;
    if (!cat) return;
    const name = cat.settings.name;
    const outcome = cat.call();
    this.notify(
      outcome === 'coming' ? `${name} is coming` : outcome === 'asleep' ? `${name} is fast asleep` : `${name} looks at you… and looks away`,
      1500,
    );
  }

  // --- Sorting, night mode, box opening -----------------------------------------------------------

  private cycleSort(): void {
    const mode = this.parts.shelving?.cycleSort?.();
    if (!mode) return;
    this.parts.highlighter?.clear(); // boxes move; a stale glow would mislead
    this.focus = null;
    this.notify(`Sorted by ${SORT_LABELS[mode] ?? mode}`);
  }

  private toggleNight(): void {
    const { dayNight } = this.parts;
    if (!dayNight) return;
    dayNight.toggleNight();
    if (dayNight.isNight !== undefined) this.notify(dayNight.isNight ? 'Night' : 'Day', 1200);
  }

  private toggleBoxOpen(): void {
    this.parts.inspector.toggleOpen();
  }

  // --- Collection editor --------------------------------------------------------------------------

  private toggleEditor(): void {
    const editor = this.parts.collectionEditor;
    if (!editor) return;
    editor.toggle();
    this.syncEditor(editor.isOpen);
  }

  /** Editor open: release the mouse and mute the room. Editor closed: re-enter through the lock flow. */
  private syncEditor(open: boolean): void {
    if (open === this.editorOpen) return;
    this.editorOpen = open;
    const { player, interactor, overlay, search, enterRoom } = this.parts;
    if (open) {
      search?.close();
      overlay.setModal(true); // keeps the start card hidden behind the editor when the lock drops
      interactor.enabled = false;
      player.unlock();
    } else {
      interactor.enabled = true;
      enterRoom?.();
      overlay.setModal(false);
    }
  }

  // --- Helpers ----------------------------------------------------------------------------------

  private games(): readonly Game[] {
    return this.parts.gameSource?.games ?? this.ownedBoxes().map((b) => b.game);
  }

  private ownedBoxes(): readonly GameBox[] {
    return this.parts.shelving?.boxes ?? [];
  }

  private findBox(game: Game): GameBox | undefined {
    return this.parts.shelving?.findBox(game.id);
  }

  private notify(text: string, ms = 2000): void {
    if (this.parts.toast) this.parts.toast.show(text, ms);
    else this.parts.overlay.showHint(text, ms);
  }

  private onHover(item: Interactable | null): void {
    this.parts.overlay.setHoverLabel(item?.label(this) ?? null, item?.labelPlacement?.() ?? 'crosshair');
  }
}
