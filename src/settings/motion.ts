import type { MotionMode } from './Settings';

/**
 * Reduced motion, for code and for the CSS: Settings > Display's choice (as the system asks, always, never).
 * When it holds, `reduce-motion` goes on <html> (the one selector every stylesheet uses, no media query of
 * its own); code reads `reduceMotion()` (the head bob, the sit / stand move, the Inspector's spin, the
 * photo flash, the tips' and rewards' entrances).
 */
let mode: MotionMode = 'system';
const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function applyClass(): void {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('reduce-motion', reduceMotion());
}

query?.addEventListener?.('change', applyClass);
applyClass();

/** Settings > Display (`applySettings`). */
export function setReduceMotion(next: MotionMode): void {
  mode = next;
  applyClass();
}

/** True when motion should be kept to the least: the player asked for it, or left it to a system that does. */
export function reduceMotion(): boolean {
  return mode === 'reduce' || (mode === 'system' && (query?.matches ?? false));
}
