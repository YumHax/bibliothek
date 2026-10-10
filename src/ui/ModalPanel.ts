import { isNavClick, registerPanel, unregisterPanel } from './menu/MenuNav';
import { fadeIn, fadeOut } from './fade';
import { playUiSound } from '@/audio/uiSounds';
import { rememberFocus } from './rememberFocus';
import { isActionKey } from './keys';
import './menu/menu.css';

/** What Tab can land on. */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
/** A control that takes Enter and Space itself: the kit's Enter shortcut stays off it. */
const CONTROL = 'button, input, select, textarea, a[href], [role="button"], [role="tab"]';
/** A button that commits something (buys, sells, lends): never the default focus (one press would do it). */
const COMMITTING = '.ui-btn--primary, .ui-btn--danger, [data-commit]';

/** The panel's fade-out before it hides (`ui-modal--closing`, menu.css). */
const CLOSE_MS = 150;

/** A status line's colour: plain, an error, or good news. */
type StatusTone = 'info' | 'error' | 'ok';

interface ModalPanelOptions {
  /** Classes of the root after `ui-modal` (the layer): a layout (`ui-modal--sheet` / `ui-modal--centre`) and the panel's own. */
  className: string;
  /** When given, the root is the dialog (`role="dialog"`, `aria-modal`, this label); else the panel marks an inner card itself. */
  label?: string;
  /**
   * A press and its release both on the backdrop (the root, outside the card) close the panel; a drag that only
   * ends there does not. Default false: a sheet fills the screen and has no backdrop. `CardPanel` turns it on.
   */
  backdropCloses?: boolean;
}

/**
 * The frame every full-screen DOM panel shares (the collection, the catalogue, the desks, the prize counter, the
 * paper, the scratch card, the arcade's big screen), and the base of the kit's two layouts (`panel/SheetPanel`,
 * `panel/CardPanel`): a hidden root in the container, `isOpen` / `open` / `close` / `toggle` for the Session
 * (`ModalLike`), `addOpenListener` for the Session's `ModalStack` and anyone else (`onOpenChange` stays as a single
 * legacy hook), and the controls walkable from the arrows and a controller (`registerPanel`: B steps back or
 * closes, D-pad left / right is `onSide`).
 *
 * One policy for every panel:
 * - Dismiss: a `[data-action="close"]` control, Esc, E (outside a text field), B or the backdrop (`backdropCloses`) close it; any other
 *   `[data-action]` click plays the pick sound and reaches `onAction`; closing plays the back sound.
 * - Back: a panel with sub-pages overrides `onBack` to step back; Esc and B then step back before they close.
 * - Focus: on opening, the visible `[data-autofocus]` control, else the first control that commits nothing, else
 *   the dismiss; `refresh()` repaints through `repaint()` and puts the focus back on the same control.
 * - Enter: when the focus is not on a control, Enter reaches `onEnter` (a panel's one shortcut); on a control, the
 *   control takes it.
 * - Status: `setStatus(text, tone)` writes the frame's `role="status"` line.
 * - Teardown: every listener the panel adds passes `signal`; `dispose()` aborts them and takes the root out.
 *
 * Keys typed in it stay in it (`keydown` stops at the root, so WASD does not walk the player; Esc goes on to the
 * Session, which closes the panel, unless `onBack` took it). `keyup` is let through: `Input` hears it in the
 * capture phase anyway, so a key held when the panel opened is released. The mouse is the Session's business: its
 * `ModalStack` unlocks the player when the panel reports it opened.
 *
 * `open(...args)` passes its arguments to `onOpened`; a panel opened with arguments overrides `toggle` (the
 * Session only ever closes it). It comes in with the shared `ui-modal-in` (a fade, a small rise) and goes with a
 * short fade: `isOpen` turns false at once, the root hides once the fade is over.
 */
export abstract class ModalPanel<OpenArgs extends unknown[] = []> {
  protected readonly root: HTMLElement;
  /** Aborted by `dispose()`: every listener the panel adds passes it (`listen`). */
  protected readonly signal: AbortSignal;
  /** The frame's status line, set by the layout that has one (`setStatus`). */
  protected statusEl: HTMLElement | null = null;
  /** The class the status line wears for an error (the sheets keep the catalogue's). */
  protected statusErrorClass = 'ui-panel__status--error';

  /** Assigned by the Session so closing from the panel's own UI re-enters the room. */
  onOpenChange?: (open: boolean) => void;
  private readonly openListeners = new Set<(open: boolean) => void>();
  private readonly aborter = new AbortController();
  private readonly backdropCloses: boolean;
  private opened = false;
  /** The last pointer press landed on the backdrop (see `backdropCloses`). */
  private pressedBackdrop = false;

  constructor(container: HTMLElement, options: ModalPanelOptions) {
    this.signal = this.aborter.signal;
    this.backdropCloses = options.backdropCloses ?? false;
    this.root = document.createElement('section');
    this.root.className = `ui-modal ${options.className}`;
    this.root.hidden = true;
    if (options.label !== undefined) {
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-modal', 'true');
      this.root.setAttribute('aria-label', options.label);
    }
    container.appendChild(this.root);
    registerPanel(this.root, {
      isOpen: () => this.navigable(),
      onSide: (direction) => this.onSide(direction),
      onBack: () => {
        if (!this.stepBack()) this.close();
      },
    });
    this.listen(this.root, 'keydown', (e) => {
      if (e.code === 'Escape') {
        // A sub-page steps back on Esc; the Session only hears the Esc that closes.
        if (this.isOpen && this.stepBack()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      e.stopPropagation();
      this.onKey(e);
      if (e.defaultPrevented || !this.isOpen) return;
      // The room's use key (E) closes a panel too, outside a text field: unlike Esc it is a gesture, so the mouse lock
      // comes straight back instead of asking for a click (`PointerLockFlow.enter`).
      if (!e.repeat && !isTextField(document.activeElement) && isActionKey(e.code, 'putBack')) {
        e.preventDefault();
        if (!this.stepBack()) this.close();
        return;
      }
      if (e.code === 'Tab') this.keepTabInside(e);
      else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !isControl(document.activeElement) && this.onEnter()) e.preventDefault();
    });
    this.listen(this.root, 'pointerdown', (e) => {
      this.pressedBackdrop = e.target === this.root;
    });
    this.listen(this.root, 'click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root) {
        if (this.backdropCloses && this.pressedBackdrop) this.close();
        return;
      }
      const control = target.closest<HTMLElement>('[data-action]');
      if (!control || !this.root.contains(control) || (control as HTMLButtonElement).disabled) return;
      const action = control.dataset.action!;
      if (action === 'close') {
        this.close();
        return;
      }
      if (!isNavClick()) playUiSound('pick'); // a controller's A already played it
      this.onAction(action, control);
    });
  }

  /** Adds a listener that `dispose()` removes. */
  protected listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (e: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions): void;
  protected listen<K extends keyof WindowEventMap>(target: Window, type: K, handler: (e: WindowEventMap[K]) => void, options?: AddEventListenerOptions): void;
  protected listen<K extends keyof DocumentEventMap>(target: Document, type: K, handler: (e: DocumentEventMap[K]) => void, options?: AddEventListenerOptions): void;
  protected listen(target: EventTarget, type: string, handler: (e: Event) => void, options?: AddEventListenerOptions): void;
  protected listen(target: EventTarget, type: string, handler: (e: never) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler as EventListener, { ...options, signal: this.signal });
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
    playUiSound('back');
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

  /**
   * Repaints the frame's content (`repaint`) and puts the focus back on the same control: the markup is replaced,
   * which would otherwise drop the focus (and with it the panel's keys) to the page. A control gone or disabled
   * hands the focus to the one now at its place, else to the panel's default.
   */
  refresh(): void {
    const restore = rememberFocus(this.root);
    this.repaint();
    restore();
    if (this.isOpen && !this.root.contains(document.activeElement)) this.focusTarget()?.focus();
  }

  /** Writes the frame's status line (none: nothing happens). An empty text clears it. */
  setStatus(message: string, tone: StatusTone = 'info'): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle(this.statusErrorClass, tone === 'error');
    this.statusEl.classList.toggle('ui-panel__status--ok', tone === 'ok');
  }

  /** Takes the panel out of the page for good (its zone unloaded): listeners, navigation, root. */
  dispose(): void {
    this.close();
    this.aborter.abort();
    unregisterPanel(this.root);
    this.root.remove();
  }

  /** The panel was just shown (before the focus lands): paint it. */
  protected onOpened(..._args: OpenArgs): void {}

  /** The panel was just hidden. */
  protected onClosed(): void {}

  /** Paints the frame's content from the panel's state; `refresh()` calls it and restores the focus. */
  protected repaint(): void {}

  /** A `[data-action]` control other than the dismiss was clicked (the pick sound already played). */
  protected onAction(_action: string, _el: HTMLElement): void {}

  /** A key typed while the focus is in the panel (Esc excepted: the Session closes the panel). */
  protected onKey(_e: KeyboardEvent): void {}

  /** Enter pressed with the focus on no control: the panel's one shortcut; true when it did something. */
  protected onEnter(): boolean {
    return false;
  }

  /** Esc or B inside a panel with sub-pages: step back and return true; false closes the panel. */
  protected onBack(): boolean {
    return false;
  }

  /** D-pad left / right (or the arrow keys): true when the panel used it (tabs), else the focus moves. */
  protected onSide(_direction: 1 | -1): boolean {
    return false;
  }

  /**
   * Where the focus lands on opening and after a repaint that lost it: the visible `[data-autofocus]` control,
   * else the first control that commits nothing, else the dismiss.
   */
  protected focusTarget(): HTMLElement | null {
    const usable = (el: HTMLElement | null) => (el && !el.matches(':disabled') && el.offsetParent !== null ? el : null);
    return (
      usable(this.root.querySelector<HTMLElement>('[data-autofocus]')) ??
      [...this.root.querySelectorAll<HTMLElement>(FOCUSABLE)].find((el) => usable(el) && !el.matches(COMMITTING) && el.dataset.action !== 'close') ??
      usable(this.root.querySelector<HTMLElement>('[data-action="close"]'))
    );
  }

  /** Whether the arrows and the controller walk the panel now (default: while it is open). */
  protected navigable(): boolean {
    return this.isOpen;
  }

  /** `onBack`, with the back sound when the panel stepped back. */
  private stepBack(): boolean {
    if (!this.onBack()) return false;
    playUiSound('back');
    return true;
  }

  private emitOpenChange(open: boolean): void {
    this.onOpenChange?.(open);
    for (const listener of [...this.openListeners]) listener(open);
  }
}

/** A field the keys type into (an E there is a letter, not a close). */
function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color'].includes((el as HTMLInputElement).type);
}

function isControl(el: Element | null): boolean {
  return el instanceof HTMLElement && el.matches(CONTROL);
}
