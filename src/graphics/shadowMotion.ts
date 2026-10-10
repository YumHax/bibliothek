/** How long (ms) after a caster last moved the live shadow maps keep redrawing at their fastest. */
const HOLD_MS = 150;

let movedAt = -Infinity;

/**
 * Something that casts a live shadow moved this frame (the box held up, the cat walking): the lit
 * lamps and suns of the player's room redraw their maps faster for a moment
 * (`world/lighting/shadowRefresh`), so its shadow keeps up with it instead of stepping at the
 * level's still-scene rate. Cheap to call every frame something moves.
 */
export function noteShadowMotion(): void {
  movedAt = performance.now();
}

/** Whether a caster moved within the last moment. */
export function shadowsInMotion(): boolean {
  return performance.now() - movedAt < HOLD_MS;
}
