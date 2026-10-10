import { lastDevice } from '@/input/lastDevice';
import { capitalise } from '@/text/strings';

/**
 * The word for "use it" on the device in hand, for tips and captions written as a sentence: `click`
 * (the mouse), `press A` (a controller), `tap` (a touchscreen). `useVerb()` is lowercase, `useVerbCap()`
 * starts a sentence. Read when the line is written, so a tip says what the player's hands can do now.
 */
export function useVerb(): string {
  const device = lastDevice();
  return device === 'gamepad' ? 'press A' : device === 'touch' ? 'tap' : 'click';
}

/** `useVerb()` at the start of a sentence: Click, Press A, Tap. */
export function useVerbCap(): string {
  return capitalise(useVerb());
}

/** "click it" / "press A on it" / "tap it": the verb with its object, `it` by default. */
export function useVerbOn(what = 'it'): string {
  return lastDevice() === 'gamepad' ? `press A on ${what}` : `${useVerb()} ${what}`;
}

/** The word for "take it to move it" on the device in hand: right-click, press B, hold a finger on it. */
export function grabVerb(): string {
  const device = lastDevice();
  return device === 'gamepad' ? 'press B' : device === 'touch' ? 'hold a finger on it' : 'right-click';
}

/** `grabVerb()` at the start of a sentence. */
export function grabVerbCap(): string {
  return capitalise(grabVerb());
}

/** "Space or click" on the keyboard (a key that also does it), else the device's own verb: "press A", "tap". */
export function keyOrUse(key: string): string {
  return lastDevice() === 'keyboard' ? `${key} or click` : useVerb();
}

/** The device's "use" as a key cap for a prompt line: `[Click]`, `[A]`, `[Tap]`. */
export function useCap(): string {
  const device = lastDevice();
  return device === 'gamepad' ? 'A' : device === 'touch' ? 'Tap' : 'Click';
}

/** The device's "take it to move it" as a key cap: `[Right-click]`, `[B]`, `[Hold]`. */
export function grabCap(): string {
  const device = lastDevice();
  return device === 'gamepad' ? 'B' : device === 'touch' ? 'Hold' : 'Right-click';
}

/** `useVerbOn(what)` at the start of a sentence: "Click a machine", "Press A on a machine", "Tap a machine". */
export function useVerbOnCap(what = 'it'): string {
  return capitalise(useVerbOn(what));
}
