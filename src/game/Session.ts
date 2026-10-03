import type { Input } from '@/core/Input';
import type { Interactable } from '@/interaction/Interactable';
import type { PlatformId } from '@/catalog/types';
import type { GameBox } from '@/world/GameBox';
import type { VideoScreen } from '@/world/screen';
import type { ZoneId } from '@/world/zoneIds';
import type { ArcadeMachineLike, ForSaleLike, PaymentLike, SeatLike, SessionActions, UpgradeOfferLike } from './SessionActions';
import type { ReadingNotice, RewardNotice, TipOptions } from '@/notices';
import type { ModalLike, SessionParts } from './SessionParts';
import type { KeyRoute, SessionHost } from './SessionHost';
import { ModalStack } from './ModalStack';
import { Hands } from './Hands';
import { CopyOpening } from './CopyOpening';
import { Seating } from './Seating';
import { Screens } from './Screens';
import { GoingOut } from './GoingOut';
import { ArcadePlay } from './ArcadePlay';
import { ProgramPlay } from './ProgramPlay';
import { MarketCounter } from './MarketCounter';
import { Purchases } from './Purchases';
import { Browse } from './Browse';
import { CatCare } from './CatCare';
import { NoticeDismiss } from './NoticeDismiss';
import { PhotoControl } from './PhotoControl';
import { Rearranging, type PieceLike } from './Rearranging';
import { Labelling } from './Labelling';
import { isAction } from '@/input/actions';

export type { SessionParts } from './SessionParts';

/** A right-button press with a box in hand shorter than this (ms) and moving the mouse less (px) is a tap, not a turn of the box. */
const RIGHT_TAP_MS = 280;
const RIGHT_TAP_MOVE = 10;

/**
 * Game rules: what happens when the player clicks something, presses a key or leaves the room.
 * A thin router: each feature is a controller with its own narrow parts (`ModalStack`, `Hands`,
 * `Seating`, `Screens`, `GoingOut`, `ArcadePlay`, `MarketCounter`, `Purchases`, `Browse`,
 * `CatCare`, `Rearranging`); the Session builds them, is their `SessionHost` (the shared moves), routes keys
 * through them in one fixed order (`routes`) and answers `SessionActions` by delegating.
 * Interactables call back into it through `SessionActions`; it owns nothing in the scene itself.
 * Optional features are silently skipped when their part is not wired in (see `SessionParts`).
 */
export class Session implements SessionActions, SessionHost {
  private readonly modals: ModalStack;
  private readonly hands: Hands;
  private readonly seating: Seating;
  private readonly screens: Screens;
  private readonly goingOut: GoingOut;
  private readonly arcade: ArcadePlay;
  /** Holding the pad of a program on the TV (the emulator, a canvas game: `src/onscreen`). */
  private readonly programPlay: ProgramPlay;
  /** The flea market's rules for the copy in hand (buy, haggle, hold, swap, hand back). */
  private readonly counter: MarketCounter;
  private readonly purchases: Purchases;
  private readonly browse: Browse;
  /** Moving things about the flat: a box into any shelf's gap, the furniture about it (right-click, M). */
  private readonly rearranging: Rearranging;
  /**
   * Who hears a key, in this order; the first to take it ends the routing. The order is the rules (the
   * keys are the action table's, `input/actions`, which lists the shared ones):
   * 1. panels: Tab toggles the collection, Esc closes the open panel (over panels and the start card too);
   * 2. the room is deaf while a panel or the search bar has the keyboard, the mouse is free, the
   *    travel menu reads its digits, or the player sleeps;
   * 3. at an arcade machine every key is the game's (E walks away, fire replays on the end card);
   *    then photo mode: while it is on every key is its own; P enters it, J opens the journal;
   *    then moving things (docs/furnishing.md): from above (L) every key is the planning view's; while a piece is
   *    carried M / R / Q / G / X / E are its; M puts the shelf box in hand where it is aimed, M on a piece takes it,
   *    U (hands free, at home) undoes the last move; the right mouse button does the same (`bindInput`);
   * 4. a box in hand, O: a sealed copy stays shut at a stall (and asks twice at home), a copy's past shows (`CopyOpening`);
   *    then a market copy in hand: U (just bought), B, H, R, X; O finds out a fake and goes on to 5;
   * 5. a box in hand: E puts it back, O opens it;
   * 6. browsing: F / Slash search, T sorts, N night, R random pick (not while holding), Enter picks up the found box;
   *    then K, the label maker, at home with free hands (`Labelling`);
   * 7. X puts down the card being read, the tips, the banner (`NoticeDismiss`); C calls the cat;
   * 8. seated: a movement key or E stands up.
   */
  private readonly routes: readonly KeyRoute[];

  constructor(private readonly parts: SessionParts) {
    this.modals = new ModalStack(parts);
    // Panels that open or close from their own UI (a Close button, a cabinet opening the big screen), watched from the start.
    for (const modal of [parts.collectionEditor, parts.catalogue, parts.prizeCounter, parts.sellDesk, parts.haggle, parts.trade, parts.arcadeScreen]) if (modal) this.modals.watch(modal);
    this.counter = new MarketCounter({ parts, notices: parts.notices, pickUp: (box) => this.pickUp(box), putBack: () => this.putBack(), showModal: (modal) => this.modals.openHolding(modal) });
    this.browse = new Browse(parts, this);
    this.hands = new Hands(parts, (taking) => {
      this.counter.end(true);
      if (taking) this.browse.forget();
    });
    this.seating = new Seating(parts, this);
    this.screens = new Screens(parts);
    this.goingOut = new GoingOut(parts, this, this.screens);
    this.arcade = new ArcadePlay(parts, this);
    this.programPlay = new ProgramPlay(parts, this);
    this.purchases = new Purchases(parts, this);
    this.rearranging = new Rearranging(parts, this, () => this.onHover(this.hovered));
    const deaf: KeyRoute = { onKey: () => this.modalOpen || !parts.player.isLocked || this.goingOut.menuOpen || this.seating.asleep };
    const photo = new PhotoControl(parts, (panel) => this.openPanel(panel));
    // O on a box in hand asks the copy first (a seal, a past: `CopyOpening`), then the market, then the hands open it.
    const opening = new CopyOpening(parts, () => this.counter.holding);
    this.routes = [this.modals, deaf, this.arcade, this.programPlay, photo, this.rearranging, opening, this.counter, this.hands, this.browse, new Labelling(parts, this, (panel) => this.openPanel(panel), () => this.rearranging.carrying), new NoticeDismiss(parts), new CatCare(parts, this), this.seating];

    const { interactor, inspector, player, search } = parts;
    // The carried box must not block the ray, nor its wrapper (a market copy's `ForSaleBox` owns the box's hitbox).
    interactor.ignore = (item) => {
      const held = inspector.current;
      return held !== null && (item === held || item.hitboxes.includes(held));
    };
    interactor.onHoverChange((item) => this.onHover(item));
    interactor.onSelect((item) => item.activate(this));
    inspector.onLookEnabledChange((enabled) => (player.controls.enabled = enabled));
    player.controls.addEventListener('unlock', () => {
      // A panel needs the hands (a haggle or a swap panel works on the copy still in hand); the pause menu leaves the box held.
      if (inspector.isActive && this.modals.active && !this.modals.holdingThrough) this.putBack();
      inspector.stopRotating(); // a right button held through the unlock must not leave the look frozen
      this.rearranging.cancel(); // a piece being carried goes back where it was
      // A paid arcade play holds still (it goes on once the pointer is locked again) instead of being lost.
      if (!this.arcade.hold() && !this.programPlay.hold()) this.stand();
      // Esc under pointer lock is eaten by the browser and unlocks instead: treat it as "close search / stay here".
      search?.close();
      this.goingOut.onUnlock();
    });
    player.controls.addEventListener('lock', () => {
      this.arcade.resume();
      this.programPlay.resume();
    });
  }

  get held(): GameBox | null {
    return this.hands.held;
  }

  get seatedIn(): SeatLike | null {
    return this.arcade.current ? null : this.seating.current;
  }

  get seated(): boolean {
    return this.parts.player.isSeated;
  }

  /** What the hands are on (a machine, a market copy, a box, a seat, nothing): the touch bar shows what works there. */
  get handsContext(): 'arcade' | 'market' | 'held' | 'seated' | 'room' | 'furnishing' {
    if (this.arcade.current || this.programPlay.holding) return 'arcade';
    if (this.rearranging.carrying || this.rearranging.planning) return 'furnishing';
    if (this.counter.holding) return 'market';
    if (this.hands.held) return 'held';
    return this.parts.player.isSeated ? 'seated' : 'room';
  }

  /** True while a DOM overlay (search bar, collection editor, catalogue) owns the keyboard. */
  get modalOpen(): boolean {
    return this.modals.active !== null || (this.parts.search?.isOpen ?? false);
  }

  /** Routes clicks and key presses to the rules. Call once. */
  bindInput(input: Input, doc: Document = document): void {
    const { player, interactor, inspector } = this.parts;
    // The right button (docs/furnishing.md): pressed with free hands it takes the piece of furniture aimed at, while
    // carrying it puts it back; with a box in hand a drag turns the box (`Inspector`), a tap puts it in the shelf's gap aimed at.
    let rightTap: { at: number; moved: number } | null = null;
    doc.addEventListener('mousedown', (e) => {
      if (this.modalOpen || !player.isLocked) return;
      if (e.button === 2) {
        rightTap = inspector.current ? { at: performance.now(), moved: 0 } : null;
        if (!inspector.current) this.rearranging.grab();
        return;
      }
      if (e.button !== 0) return;
      if (this.rearranging.click()) return; // sets the carried piece down
      if (!interactor.select() && inspector.isActive) this.putBack(); // clicked at nothing while holding
    });
    doc.addEventListener('mousemove', (e) => {
      if (rightTap) rightTap.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    });
    doc.addEventListener('mouseup', (e) => {
      if (e.button !== 2 || !rightTap) return;
      const tap = rightTap;
      rightTap = null;
      if (this.modalOpen || !player.isLocked) return;
      if (performance.now() - tap.at < RIGHT_TAP_MS && tap.moved < RIGHT_TAP_MOVE) this.rearranging.tapWithBox();
    });
    // Right-click drag rotates the held box; the browser menu would steal the mouse.
    doc.addEventListener('contextmenu', (e) => e.preventDefault());
    input.onPress((code, e) => {
      // The collection opened from the pause menu (the box stayed held there): the hands empty first, as for any panel.
      if (isAction(code, 'collection') && !this.modals.active) this.putBack();
      for (const route of this.routes) if (route.onKey(code, e)) return;
    });
  }

  /** Clicking a console: name the platform, count its games and point at the first box. */
  focusPlatform(id: PlatformId): void {
    this.browse.focusPlatform(id);
  }

  // --- SessionActions (and SessionHost) ------------------------------------------------------------

  pickUp(box: GameBox): void {
    this.hands.pickUp(box);
  }

  putBack(): void {
    this.hands.putBack();
  }

  sit(seat: SeatLike): void {
    this.seating.sit(seat);
  }

  stand(): void {
    if (!this.arcade.leave() && !this.programPlay.leave()) this.seating.stand();
  }

  sleep(): void {
    this.seating.sleep();
  }

  playOn(screen: VideoScreen, box: Pick<GameBox, 'game'>): Promise<void> {
    return this.screens.playOn(screen, box);
  }

  stopScreen(screen: VideoScreen): void {
    this.screens.stop(screen);
  }

  travel(to?: ZoneId): void {
    this.goingOut.travel(to);
  }

  playArcade(machine: ArcadeMachineLike): void {
    this.arcade.play(machine);
  }

  collectChange(): void {
    this.arcade.collectChange();
  }

  inspectForSale(item: ForSaleLike): void {
    this.counter.offer(item);
  }

  buyUpgrade(offer: UpgradeOfferLike): void {
    this.purchases.buyUpgrade(offer);
  }

  pay(payment: PaymentLike): void {
    this.purchases.pay(payment);
  }

  openPrizeCounter(): void {
    this.openModal(this.parts.prizeCounter);
  }

  openCatalogue(): void {
    this.openModal(this.parts.catalogue);
  }

  openSellDesk(): void {
    this.openModal(this.parts.sellDesk);
  }

  /** Takes a piece of furniture out of storage, in front of the player, into the hands (the Stored furniture panel). */
  takeOutStored(piece: PieceLike): void {
    this.rearranging.takeOut(piece);
  }

  openPanel(panel: ModalLike): void {
    this.openModal(panel);
  }

  say(line: string, speaker?: string): void {
    this.parts.notices.say(line, speaker);
  }

  react(text: string): void {
    this.parts.notices.react(text);
  }

  refuse(text: string): void {
    this.parts.notices.refuse(text);
  }

  reward(reward: RewardNotice): void {
    this.parts.notices.reward(reward);
  }

  tip(text: string, options?: TipOptions): () => void {
    return this.parts.notices.tip(text, options);
  }

  read(card: ReadingNotice): void {
    this.parts.notices.read(card);
  }

  setFrozen(frozen: boolean): void {
    const { player, interactor } = this.parts;
    player.movementEnabled = !frozen;
    interactor.enabled = !frozen && !this.modals.active && !this.rearranging.carrying;
  }

  // --- Helpers ----------------------------------------------------------------------------------

  /** Every panel opens this way: the hands are emptied first, then the panel takes the mouse. */
  private openModal(modal: ModalLike | undefined): void {
    if (!modal) return;
    this.rearranging.cancel();
    this.putBack();
    this.modals.open(modal);
  }

  /** What the crosshair is on, and the timer that re-reads its caption while it stays there. */
  private hovered: Interactable | null = null;
  private hoverTimer: number | undefined;

  /** A caption can change while looked at (a lamp switched, a price paid): it is re-read 4 times a second. */
  private onHover(item: Interactable | null): void {
    this.hovered = item;
    window.clearInterval(this.hoverTimer);
    // A piece of furniture being carried (the crosshair picks nothing then) says whether it fits where it is aimed.
    const reread = item || this.rearranging.carrying || this.rearranging.hovering;
    this.hoverTimer = reread ? window.setInterval(() => this.showHoverLabel(), 250) : undefined;
    this.showHoverLabel();
  }

  private showHoverLabel(): void {
    const carried = this.rearranging.caption();
    if (carried) return this.parts.overlay.setHoverLabel(carried, 'crosshair');
    const item = this.hovered;
    // A movable piece under the crosshair says it can be taken (after what a click on it does, a seat's "sit").
    const movable = this.rearranging.hoverHint();
    if (!item && !movable) {
      window.clearInterval(this.hoverTimer); // set down with nothing under the crosshair: nothing more to re-read
      this.hoverTimer = undefined;
    }
    const label = item?.label(this) ?? null;
    const text = label && movable ? `${label} · ${movable.toLowerCase()}` : label ?? movable;
    this.parts.overlay.setHoverLabel(text, item?.labelPlacement?.() ?? 'crosshair');
  }
}
