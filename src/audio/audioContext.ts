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
