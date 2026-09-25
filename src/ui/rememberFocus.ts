/** What a panel list's controls are recognised by across a re-render. */
const KEYS = ['action', 'id', 'result', 'prize'] as const;
const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Call before rewriting `scope`'s HTML; the returned function, called after, puts the focus back on the
 * control with the same data attributes, else on the one now at its place (the row bought, sold or
 * removed is gone or disabled), so a controller or keyboard user keeps their spot in a list.
 * A no-op when the focus was not inside `scope`.
 */
export function rememberFocus(scope: HTMLElement): () => void {
  const before = document.activeElement;
  if (!(before instanceof HTMLElement) || !scope.contains(before)) return () => {};
  const index = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].indexOf(before);
  const selector = KEYS.filter((k) => before.dataset[k] !== undefined)
    .map((k) => `[data-${k}="${CSS.escape(before.dataset[k]!)}"]`)
    .join('');
  return () => {
    if (before.isConnected && document.activeElement === before) return;
    const same = selector ? scope.querySelector<HTMLElement>(`${before.tagName.toLowerCase()}${selector}`) : null;
    if (same && !same.matches(':disabled')) return same.focus();
    const items = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)];
    items[Math.min(Math.max(index, 0), items.length - 1)]?.focus();
  };
}
