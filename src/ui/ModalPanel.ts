import { registerPanel } from './menu/MenuNav';
import './menu/menu.css';

export interface ModalPanelOptions {
  /** Classes of the root after `ui-modal` (the layer): a layout (`ui-modal--sheet` / `ui-modal--centre`) and the panel's own. */
  className: string;
  /** When given, the root is the dialog (`role="dialog"`, `aria-modal`, this label); else the panel marks an inner card itself. */
  label?: string;
}

/**
 * The frame every full-screen DOM panel shares (the collection, the catalogue, the desks, the
 * prize counter, the paper, the scratch card, the arcade's big screen): a hidden root in the
 * container, `isOpen` / `open` / `close` / `toggle` for the Session (`ModalLike`), `addOpenListener`
 * for the Session's `ModalStack` and anyone else (`onOpenChange` stays as a single legacy hook), and the controls walkable from
 * the arrows and a controller (`registerPanel`: B is an Esc press, D-pad left / right is `onSide`).
 *
 * Keys typed in it stay in it (`keydown` stops at the root, so WASD does not walk the player;
 * Esc goes on to the Session, which closes the panel). `keyup` is let through: `Input` hears it
 * in the capture phase anyway, so a key held when the panel opened is released. The mouse is the
 * Session's business: its `ModalStack` unlocks the player when the panel reports it opened.
 *
 * `open(...args)` passes its arguments to `onOpened`; a panel opened with arguments overrides
 * `toggle` (the Session only ever closes it).
 */
export abstract class ModalPanel<OpenArgs extends unknown[] = []> {
  protected readonly root: HTMLElement;

  /** Assigned by the Session so closing from the panel's own UI re-enters the room. */
  onOpenChange?: (open: boolean) => void;
  private readonly openListeners = new Set<(open: boolean) => void>();

  constructor(container: HTMLElement, options: ModalPanelOptions) {
    this.root = document.createElement('section');
    this.root.className = `ui-modal ${options.className}`;
    this.root.hidden = true;
    if (options.label !== undefined) {
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-modal', 'true');
      this.root.setAttribute('aria-label', options.label);
    }
    container.appendChild(this.root);
    registerPanel(this.root, { isOpen: () => this.navigable(), onSide: (direction) => this.onSide(direction) });
    this.root.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') return;
      e.stopPropagation();
      this.onKey(e);
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(...args: OpenArgs): void {
    if (this.isOpen) return;
    this.root.hidden = false;
    this.onOpened(...args);
    this.focusTarget()?.focus();
    this.emitOpenChange(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.onClosed();
    this.emitOpenChange(false);
  }

  toggle(...args: OpenArgs): void {
    if (this.isOpen) this.close();
    else this.open(...args);
  }

  /** Hears every open and close, after the Session's `onOpenChange`. Returns the unsubscribe. */
  addOpenListener(listener: (open: boolean) => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  /** The panel was just shown (before the focus lands): paint it. */
  protected onOpened(..._args: OpenArgs): void {}

  /** The panel was just hidden. */
  protected onClosed(): void {}

  /** A key typed while the focus is in the panel (Esc excepted: the Session closes the panel). */
  protected onKey(_e: KeyboardEvent): void {}

  /** D-pad left / right (or the arrow keys): true when the panel used it (tabs), else the focus moves. */
  protected onSide(_direction: 1 | -1): boolean {
    return false;
  }

  /** Where the focus lands on opening: the `[data-autofocus]` control if usable, else nowhere. */
  protected focusTarget(): HTMLElement | null {
    const auto = this.root.querySelector<HTMLElement>('[data-autofocus]');
    return auto && !auto.matches(':disabled') ? auto : null;
  }

  /** Whether the arrows and the controller walk the panel now (default: while it is open). */
  protected navigable(): boolean {
    return this.isOpen;
  }

  private emitOpenChange(open: boolean): void {
    this.onOpenChange?.(open);
    for (const listener of [...this.openListeners]) listener(open);
  }
}
