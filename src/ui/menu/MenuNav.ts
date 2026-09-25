/** Elements of a menu screen the arrow keys and the D-pad walk through, in document order. */
const NAV_SELECTOR = '[data-nav]:not([disabled]):not([hidden])';

/** The navigable elements of `scope`, skipping those inside a hidden ancestor. */
export function navItems(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(NAV_SELECTOR)].filter((el) => el.offsetParent !== null);
}

/** Moves the focus `step` items along (wrapping); from nothing focused, lands on the first or the last. */
export function moveFocus(scope: HTMLElement, step: 1 | -1): void {
  const items = navItems(scope);
  if (!items.length) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = at === -1 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length;
  items[next]!.focus();
}

/** True for a text field or a select, where the keys belong to the field, not to the menu. */
export function isField(el: Element | null): boolean {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}
