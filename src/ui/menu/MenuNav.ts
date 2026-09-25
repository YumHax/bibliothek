import type { Input } from '@/core/Input';
import { playUiSound } from '@/audio/uiSounds';

/** Elements of a menu screen the arrow keys and the D-pad walk through, in document order. */
const NAV_SELECTOR = '[data-nav]:not([disabled]):not([hidden])';
/** In a panel, everything that takes the focus is walked through (panels do not mark `data-nav`). */
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
  '[data-nav]',
].join(', ');

/** The navigable elements of `scope`, skipping those inside a hidden ancestor. */
export function navItems(scope: HTMLElement, selector = NAV_SELECTOR): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(selector)].filter((el) => el.offsetParent !== null && !el.closest('[hidden], [inert]'));
}

/** Moves the focus `step` items along (wrapping); from nothing focused, lands on the first or the last. */
export function moveFocus(scope: HTMLElement, step: 1 | -1, selector = NAV_SELECTOR): void {
  const items = navItems(scope, selector);
  if (!items.length) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = at === -1 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length;
  items[next]!.focus();
  playUiSound('move');
}

/** True for a text field or a select, where the keys belong to the field, not to the menu. */
export function isField(el: Element | null): boolean {
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(el.type);
  return el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}

// --- panels -------------------------------------------------------------------------------------------

export interface PanelNavOptions {
  /** True while the panel is up; presses are ignored otherwise. */
  isOpen(): boolean;
  /** Controller B: close the panel (or step back inside it). Default: an Escape press, which the Session closes modals on. */
  onBack?(): void;
  /** D-pad left / right: switch tabs or pages; return true when handled, else the focus moves like up / down. */
  onSide?(direction: 1 | -1): boolean;
}

interface Panel extends PanelNavOptions {
  root: HTMLElement;
}

const panels: Panel[] = [];
let input: Input | null = null;

/**
 * Makes a DOM panel (collection, catalogue, prize counter, market desks…) walkable like the menu:
 * arrow keys and the D-pad move the focus through its controls, Enter / A picks, B goes back.
 * Register once in the panel's constructor; `initPanelNav` (main) feeds the controller presses.
 */
export function registerPanel(root: HTMLElement, options: PanelNavOptions): void {
  panels.push({ root, ...options });
  // The panels keep their keys from the window's Input (WASD would walk), so their arrows are read here.
  root.addEventListener('keydown', (e) => {
    if (!options.isOpen() || isField(document.activeElement)) return;
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      moveFocus(root, e.code === 'ArrowDown' ? 1 : -1, FOCUSABLE_SELECTOR);
    } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && options.onSide?.(e.code === 'ArrowLeft' ? -1 : 1)) {
      e.preventDefault();
    }
  });
}

/** The open panel the focus is in, else the last one registered that is open. */
function openPanel(): Panel | null {
  const open = panels.filter((p) => p.isOpen());
  return open.find((p) => p.root.contains(document.activeElement)) ?? open[open.length - 1] ?? null;
}

/** True while a registered panel is up (a controller press then belongs to it, not to entering the room). */
export function panelOpen(): boolean {
  return openPanel() !== null;
}

/** Feeds controller presses (and arrow keys when the focus is outside any panel) to the open panel. Call once. */
export function initPanelNav(source: Input): void {
  if (input) return;
  input = source;
  source.onPress((code, e) => {
    const panel = openPanel();
    if (!panel) return;
    const focused = document.activeElement as HTMLElement | null;
    const inPanel = !!focused && panel.root.contains(focused);
    switch (code) {
      case 'GamepadUp':
      case 'GamepadDown':
        moveFocus(panel.root, code === 'GamepadDown' ? 1 : -1, FOCUSABLE_SELECTOR);
        return;
      case 'GamepadLeft':
      case 'GamepadRight':
        if (!panel.onSide?.(code === 'GamepadLeft' ? -1 : 1)) moveFocus(panel.root, code === 'GamepadLeft' ? -1 : 1, FOCUSABLE_SELECTOR);
        return;
      case 'ArrowUp':
      case 'ArrowDown':
        // Only reaches here when the focus is outside the panel (the panel's own listener handles the rest).
        if (inPanel) return;
        e.preventDefault();
        moveFocus(panel.root, code === 'ArrowDown' ? 1 : -1, FOCUSABLE_SELECTOR);
        return;
      case 'GamepadA':
        if (!inPanel) {
          moveFocus(panel.root, 1, FOCUSABLE_SELECTOR);
          return;
        }
        if (isField(focused)) {
          focused!.focus();
          return;
        }
        playUiSound('pick');
        focused!.click();
        return;
      case 'GamepadB':
        playUiSound('back');
        if (panel.onBack) panel.onBack();
        else source.pressVirtual('Escape');
        return;
    }
  });
}
