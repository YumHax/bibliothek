import { registerPanel } from './menu/MenuNav';
import { fadeIn, fadeOut } from './fade';
import './menu/menu.css';

/** What Tab can land on. */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The panel's fade-out before it hides (`ui-modal--closing`, menu.css). */
const CLOSE_MS = 150;

interface ModalPanelOptions {
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
 *
 * It comes in with the shared `ui-modal-in` (a fade, a small rise) and goes with a short fade: `isOpen`
 * turns false at once, the root hides once the fade is over.
 */
export abstract class ModalPanel<OpenArgs extends unknown[] = []> {
  protected readonly root: HTMLElement;

  /** Assigned by the Session so closing from the panel's own UI re-enters the room. */
  onOpenChange?: (open: boolean) => void;
  private readonly openListeners = new Set<(open: boolean) => void>();
  private opened = false;

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
      if (e.code === 'Tab' && !e.defaultPrevented && this.isOpen) this.keepTabInside(e);
    });
  }

  /** Tab and Shift+Tab go round the panel's own controls: the focus never falls out to the page (where Tab, E, O are game keys). */
  private keepTabInside(e: KeyboardEvent): void {
    const stops = [...this.root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.matches(':disabled') && el.offsetParent !== null);
    if (!stops.length) {
      e.preventDefault();
      return;
    }
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : at === -1 || at === stops.length - 1 ? 0 : at + 1;
    // Only at the ends (or from outside): between them the browser's own order is kept.
    if (at === -1 || (e.shiftKey ? at === 0 : at === stops.length - 1)) {
      e.preventDefault();
      stops[next]!.focus();
    }
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(...args: OpenArgs): void {
    if (this.isOpen) return;
    this.opened = true;
    fadeIn(this.root, 'ui-modal--closing');
    this.onOpened(...args);
    this.focusTarget()?.focus();
    this.emitOpenChange(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.opened = false;
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    fadeOut(this.root, 'ui-modal--closing', CLOSE_MS);
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
