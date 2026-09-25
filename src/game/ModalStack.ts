import type { SearchBar } from '@/ui/SearchBar';
import type { CoreParts, ModalLike } from './SessionParts';
import { isAction } from '@/input/actions';
import type { KeyRoute } from './SessionHost';

/** The full-screen DOM panels the Session knows by name, and what it needs to hand the mouse over and back. */
export interface ModalParts extends Pick<CoreParts, 'player' | 'interactor' | 'overlay'> {
  search?: SearchBar;
  /** The collection (Tab). */
  collectionEditor?: ModalLike;
  /** The mail-order catalogue. */
  catalogue?: ModalLike;
  /** The WE BUY desk's panel. */
  sellDesk?: ModalLike;
  /** The prize counter's panel (prizes for tickets, tickets for coins). */
  prizeCounter?: ModalLike;
  /** The big frame a web-page cabinet game plays in (LexiPunk): a modal the cabinet opens itself. */
  arcadeScreen?: ModalLike;
  /** Re-enters the room after a panel released the pointer lock: `() => void lockFlow.resume()`. */
  enterRoom?: () => void;
}

/**
 * The one DOM panel that owns the keyboard and the mouse, if any: opening one closes the other,
 * releases the mouse and mutes the room; closing it (from the Session or from its own UI) re-enters
 * the room. Keys: Tab toggles the collection anywhere, Esc closes the open panel.
 */
export class ModalStack implements KeyRoute {
  private current: ModalLike | null = null;
  private readonly watched = new WeakSet<ModalLike>();
  /** Panels opened over the copy in hand (haggle, swap): the box stays in hand while the mouse is released. */
  private readonly holding = new WeakSet<ModalLike>();

  constructor(private readonly parts: ModalParts) {}

  /** The open panel, if any. */
  get active(): ModalLike | null {
    return this.current;
  }

  /** True while the open panel works on the copy in hand (`keepsHeld`, or opened through `openHolding`). */
  get holdingThrough(): boolean {
    const modal = this.current;
    return !!modal && (modal.keepsHeld === true || this.holding.has(modal));
  }

  /** Hears the panel's own opens and closes (its Close button, a cabinet opening it) from now on. Idempotent. */
  watch(modal: ModalLike): void {
    if (this.watched.has(modal)) return;
    this.watched.add(modal);
    const sync = (open: boolean) => this.sync(modal, open);
    if (modal.addOpenListener) modal.addOpenListener(sync);
    else modal.onOpenChange ??= sync;
  }

  /** Shows `modal` (no-op when it is up already). The caller empties the hands first if it should. */
  open(modal: ModalLike): void {
    this.watch(modal);
    if (!modal.isOpen) this.toggle(modal);
  }

  /** Shows `modal` over the copy in hand, which stays there. */
  openHolding(modal: ModalLike): void {
    this.holding.add(modal);
    this.open(modal);
  }

  toggle(modal: ModalLike): void {
    this.watch(modal);
    modal.toggle();
    this.sync(modal, modal.isOpen);
  }

  /** Tab works everywhere (start card, room, inside the editor) so it can close what it opened; Esc closes the open panel. */
  onKey(code: string, e: KeyboardEvent): boolean {
    const { collectionEditor } = this.parts;
    if (isAction(code, 'collection') && collectionEditor) {
      e.preventDefault();
      this.toggle(collectionEditor);
      return true;
    }
    if (isAction(code, 'close') && this.current) {
      this.current.close();
      return true;
    }
    return false;
  }

  /** A panel opened: release the mouse and mute the room (any other panel closes). Closed: re-enter through the lock flow. */
  private sync(modal: ModalLike, open: boolean): void {
    if (open) {
      if (this.current === modal) return;
      if (this.current) this.current.close();
      this.current = modal;
      const { player, interactor, overlay, search } = this.parts;
      search?.close();
      overlay.setModal(true); // keeps the start card hidden behind the panel when the lock drops
      interactor.enabled = false;
      player.unlock();
    } else {
      if (this.current !== modal) return;
      this.current = null;
      const { interactor, overlay, enterRoom } = this.parts;
      interactor.enabled = true;
      enterRoom?.();
      overlay.setModal(false);
    }
  }
}
