let touchSeen = false;

/**
 * Remembers the first real touch so a device the media queries misjudge (desktop Chrome with a
 * touchscreen, some emulators) still flips to touch mode as soon as it is touched.
 */
export function watchForTouch(onFirstTouch?: () => void): void {
  if (touchSeen) {
    onFirstTouch?.();
    return;
  }
  window.addEventListener(
    'touchstart',
    () => {
      touchSeen = true;
      onFirstTouch?.();
    },
    { once: true, passive: true },
  );
}

/** Coarse-pointer device (phone / tablet, DevTools device emulation) or a touch already happened. */
export function isTouchDevice(): boolean {
  if (touchSeen) return true;
  if (typeof window.matchMedia !== 'function') return navigator.maxTouchPoints > 0;
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  // Touch points but no fine pointer at all: a tablet whose UA hides the media feature.
  return navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches;
}
