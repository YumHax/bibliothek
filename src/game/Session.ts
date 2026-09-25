import type { Input } from '@/core/Input';
import type { Interactable } from '@/interaction/Interactable';
import type { PlatformId } from '@/catalog/types';
import type { GameBox } from '@/world/GameBox';
import type { VideoScreen } from '@/world/screen';
import type { ZoneId } from '@/world/zoneIds';
import type { ArcadeMachineLike, ForSaleLike, PaymentLike, SeatLike, SessionActions, UpgradeOfferLike } from './SessionActions';
import type { ModalLike, SessionParts } from './SessionParts';
import type { KeyRoute, SessionHost } from './SessionHost';
import { ModalStack } from './ModalStack';
import { Hands } from './Hands';
import { Seating } from './Seating';
import { Screens } from './Screens';
import { GoingOut } from './GoingOut';
import { ArcadePlay } from './ArcadePlay';
import { MarketCounter } from './MarketCounter';
import { Purchases } from './Purchases';
import { Browse } from './Browse';
import { CatCare } from './CatCare';
import { PhotoControl } from './PhotoControl';

export type { SessionParts } from './SessionParts';

/**
 * Game rules: what happens when the player clicks something, presses a key or leaves the room.
 * A thin router: each feature is a controller with its own narrow parts (`ModalStack`, `Hands`,
 * `Seating`, `Screens`, `GoingOut`, `ArcadePlay`, `MarketCounter`, `Purchases`, `Browse`,
 * `CatCare`); the Session builds them, is their `SessionHost` (the shared moves), routes keys
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
  /** The flea market's rules for the copy in hand (buy, haggle, hold, swap, hand back). */
  private readonly counter: MarketCounter;
  private readonly purchases: Purchases;
  private readonly browse: Browse;
  /**
   * Who hears a key, in this order; the first to take it ends the routing. The order is the rules (the
   * keys are the action table's, `input/actions`, which lists the shared ones):
   * 1. panels: Tab toggles the collection, Esc closes the open panel (over panels and the start card too);
   * 2. the room is deaf while a panel or the search bar has the keyboard, the mouse is free, the
   *    travel menu reads its digits, or the player sleeps;
   * 3. at an arcade machine every key is the game's (E walks away, fire replays on the end card);
   *    then photo mode: while it is on every key is its own; P enters it, J opens the journal;
   * 4. a market copy in hand: U (just bought), B, H, R, X; O finds out a fake and goes on to 5;
   * 5. a box in hand: E puts it back, O opens it;
   * 6. browsing: F / Slash search, T sorts, N night, R random pick (not while holding), Enter picks up the found box;
   * 7. C calls the cat;
   * 8. seated: a movement key or E stands up.
   */
  private readonly routes: readonly KeyRoute[];

  constructor(private readonly parts: SessionParts) {
    this.modals = new ModalStack(parts);
    // Panels that open or close from their own UI (a Close button, a cabinet opening the big screen), watched from the start.
    for (const modal of [parts.collectionEditor, parts.catalogue, parts.prizeCounter, parts.sellDesk, parts.haggle, parts.trade, parts.arcadeScreen]) if (modal) this.modals.watch(modal);
    this.counter = new MarketCounter({ parts, notify: (text, ms) => this.notify(text, ms), pickUp: (box) => this.pickUp(box), putBack: () => this.putBack(), showModal: (modal) => this.modals.openHolding(modal) });
    this.browse = new Browse(parts, this);
    this.hands = new Hands(parts, (taking) => {
      this.counter.end(true);
      if (taking) this.browse.forget();
    });
    this.seating = new Seating(parts, this);
    this.screens = new Screens(parts);
    this.goingOut = new GoingOut(parts, this, this.screens);
    this.arcade = new ArcadePlay(parts, this);
    this.purchases = new Purchases(parts, this);
    const deaf: KeyRoute = { onKey: () => this.modalOpen || !parts.player.isLocked || this.goingOut.menuOpen || this.seating.asleep };
    const photo = new PhotoControl(parts, (panel) => this.openPanel(panel));
    this.routes = [this.modals, deaf, this.arcade, photo, this.counter, this.hands, this.browse, new CatCare(parts, this), this.seating];

    const { interactor, inspector, player, search } = parts;
    interactor.ignore = (item) => item === inspector.current; // the carried box must not block the ray
    interactor.onHoverChange((item) => this.onHover(item));
    interactor.onSelect((item) => item.activate(this));
    inspector.onLookEnabledChange((enabled) => (player.controls.enabled = enabled));
    player.controls.addEventListener('unlock', () => {
      // A haggle or a swap panel takes the mouse with the copy still in hand.
      if (inspector.isActive && !this.modals.holdingThrough) this.putBack();
      this.stand();
      // Esc under pointer lock is eaten by the browser and unlocks instead: treat it as "close search / stay here".
      search?.close();
      this.goingOut.onUnlock();
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

  /** True while a DOM overlay (search bar, collection editor, catalogue) owns the keyboard. */
  get modalOpen(): boolean {
    return this.modals.active !== null || (this.parts.search?.isOpen ?? false);
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
    if (!this.arcade.leave()) this.seating.stand();
  }

  sleep(): void {
    this.seating.sleep();
  }

  playOn(screen: VideoScreen, box: GameBox): Promise<void> {
    return this.screens.playOn(screen, box);
  }

  stopScreen(screen: VideoScreen): void {
    this.screens.stop(screen);
  }

  hint(message: string): void {
    this.parts.overlay.showHint(message);
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

  openPanel(panel: ModalLike): void {
    this.openModal(panel);
  }

  notify(text: string, ms = 2000): void {
    if (this.parts.toast) this.parts.toast.show(text, ms);
    else this.parts.overlay.showHint(text, ms);
  }

  setFrozen(frozen: boolean): void {
    const { player, interactor } = this.parts;
    player.movementEnabled = !frozen;
    interactor.enabled = !frozen && !this.modals.active;
  }

  // --- Helpers ----------------------------------------------------------------------------------

  /** Every panel opens this way: the hands are emptied first, then the panel takes the mouse. */
  private openModal(modal: ModalLike | undefined): void {
    if (!modal) return;
    this.putBack();
    this.modals.open(modal);
  }

  private onHover(item: Interactable | null): void {
    this.parts.overlay.setHoverLabel(item?.label(this) ?? null, item?.labelPlacement?.() ?? 'crosshair');
  }
}
