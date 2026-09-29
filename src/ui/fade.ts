/**
 * Short fade-outs for elements shown with `hidden` (which is `display: none !important` globally, so it
 * cannot transition): `fadeOut` adds a closing class (the element's CSS fades it), then hides it once
 * the fade is over; `fadeIn` shows it at once and cancels a fade under way. With reduced motion the CSS
 * transitions last a blink, so the delay is kept short too.
 */
import { reduceMotion } from '@/settings/motion';

const pending = new WeakMap<HTMLElement, number>();

export function fadeIn(el: HTMLElement, closingClass: string): void {
  const timer = pending.get(el);
  if (timer === undefined && !el.hidden) return; // up already
  if (timer !== undefined) {
    window.clearTimeout(timer);
    pending.delete(el);
  }
  el.classList.remove(closingClass);
  el.hidden = false;
}

/** Fades `el` out over `ms` (its CSS for `closingClass`), then hides it and calls `done`. No-op when hidden or fading. */
export function fadeOut(el: HTMLElement, closingClass: string, ms: number, done?: () => void): void {
  if (el.hidden || pending.has(el)) return;
  el.classList.add(closingClass);
  const timer = window.setTimeout(() => {
    pending.delete(el);
    el.hidden = true;
    el.classList.remove(closingClass);
    done?.();
  }, reduceMotion() ? 0 : ms);
  pending.set(el, timer);
}

/** True while `el` is fading out (still on screen, already closed). */
export function isFading(el: HTMLElement): boolean {
  return pending.has(el);
}
