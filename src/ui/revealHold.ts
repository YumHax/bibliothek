/**
 * Money banked before it is shown: an arcade play's tickets go into the wallet the moment it ends (walking away
 * mid-count loses nothing), but the wallet chip's roll and float, and the reward banner, wait until the machine's
 * end card has counted them out (`game/ArcadePlay`). One hold at a time; it lets go when `until` says so, or after
 * `MAX_HOLD_MS` whatever happens (a reveal is never lost).
 */
type Until = () => boolean;

/** However long the initials take, the chip catches up after this (ms). */
const MAX_HOLD_MS = 60_000;

let holding: Until | null = null;
let since = 0;
let polling = false;
const waiting: (() => void)[] = [];

/** Holds the reveal until `until()` is true (checked every frame). */
export function holdReveal(until: Until): void {
  holding = until;
  since = performance.now();
  if (!polling) poll();
}

/** Whether a reveal is held right now (and lets it go when its time has come). */
export function revealHeld(): boolean {
  if (holding && (holding() || performance.now() - since > MAX_HOLD_MS)) release();
  return holding !== null;
}

/** Runs `fn` once the reveal is no longer held (at once when nothing holds it). */
export function afterReveal(fn: () => void): void {
  if (revealHeld()) waiting.push(fn);
  else fn();
}

function release(): void {
  holding = null;
  for (const fn of waiting.splice(0)) fn();
}

/** Checks every frame while held, so what waits runs even when nothing else asks. */
function poll(): void {
  polling = revealHeld() && typeof requestAnimationFrame === 'function';
  if (polling) requestAnimationFrame(poll);
}
