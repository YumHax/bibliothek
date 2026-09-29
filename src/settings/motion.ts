/**
 * Reduced motion, for code and for the CSS: Settings > Display's switch or the system's preference.
 * Either one puts `reduce-motion` on <html> (the one selector every stylesheet uses, no media query of
 * its own); code reads `reduceMotion()` (the head bob, the sit / stand move, the Inspector's spin, the
 * photo flash, the tips' and rewards' entrances).
 */
let forced = false;
const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function applyClass(): void {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('reduce-motion', reduceMotion());
}

query?.addEventListener?.('change', applyClass);
applyClass();

/** Settings > Display (`applySettings`). */
export function setReduceMotion(on: boolean): void {
  forced = on;
  applyClass();
}

/** True when motion should be kept to the least: the player's setting or the system's. */
export function reduceMotion(): boolean {
  return forced || (query?.matches ?? false);
}
