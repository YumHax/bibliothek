/**
 * One lazily created AudioContext for the whole room. Browsers only let a context start after
 * a user gesture; every sound in the room is triggered by a click, so callers ask for it at
 * that moment and `resume()` covers the case where it was created while still suspended.
 */
let context: AudioContext | null = null;

export function audioContext(): AudioContext {
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

/**
 * The context if a gesture already started it, else null: for sounds nobody clicked for (a cabinet
 * nobody plays, a hall's hum), which must never be the ones creating it (the browser would refuse).
 */
export function startedAudioContext(): AudioContext | null {
  return context && context.state === 'running' ? context : null;
}

/** Creates the context on the page's first click or key press, so ambient sounds can start then. Call once. */
export function unlockAudioOnFirstGesture(target: EventTarget = window): void {
  const unlock = (): void => {
    audioContext();
    target.removeEventListener('pointerdown', unlock, true);
    target.removeEventListener('keydown', unlock, true);
  };
  target.addEventListener('pointerdown', unlock, true);
  target.addEventListener('keydown', unlock, true);
}
