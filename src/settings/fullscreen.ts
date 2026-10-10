/**
 * Settings > Display > Full screen: the page fills the screen and holds the Esc key (`navigator.keyboard.lock`, Chrome
 * and Edge), so a press of Esc in the room is the game's (it puts down the card being read, leaves the planning view,
 * else pauses: `Session`'s routes) while holding Esc still leaves full screen, the browser's way. Both need a user
 * gesture: they are asked when the setting is switched on (a click) and on each way into the room (`PointerLockFlow`).
 */

interface KeyboardLockApi {
  lock(codes?: string[]): Promise<void>;
  unlock(): void;
}

let wanted = false;

function keyboard(): KeyboardLockApi | undefined {
  return (navigator as Navigator & { keyboard?: Partial<KeyboardLockApi> }).keyboard as KeyboardLockApi | undefined;
}

/** The setting changed (`applySettings`): on, it asks for full screen now (a click on the switch is a gesture); off, leaves it. */
export function setFullscreenWanted(on: boolean): void {
  const was = wanted;
  wanted = on;
  if (on && !was) enterFullscreenIfWanted();
  else if (!on && was && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
}

/** Asks for full screen and the Esc key when the setting wants them and the page is not there yet. Call from a gesture. */
export function enterFullscreenIfWanted(): void {
  if (!wanted || typeof document === 'undefined' || !document.fullscreenEnabled) return;
  if (document.fullscreenElement) {
    void keyboard()?.lock(['Escape']).catch(() => {});
    return;
  }
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => keyboard()?.lock(['Escape']))
    .catch(() => {}); // no gesture (a controller's press), or refused: the room works the same windowed
}
