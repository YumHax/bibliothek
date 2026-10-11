/**
 * The hall's bed of demo sounds: an idle cabinet showing its game used to be silent, which left the
 * hall quiet between jingles. Now the demos nearest the camera (at most `VOICES`) are heard, very
 * low; every other demo stays silent, so the bed never turns into a din. Each showing cabinet asks
 * every frame with how far it is, and leaves the bed when its demo stops (`leaveDemoBed`).
 */

/** How many demos are heard at once, and how loud (a speaker's `level`: the player's own play is 1). */
const VOICES = 2;
export const DEMO_LEVEL = 0.16;

const asked = new Map<object, number>();

/** Whether the demo on `cabinet`, `distance` metres from the camera, is among the ones heard right now. */
export function demoHeard(cabinet: object, distance: number): boolean {
  asked.set(cabinet, distance);
  let closer = 0;
  for (const [other, far] of asked) if (other !== cabinet && far < distance) closer += 1;
  return closer < VOICES;
}

/** The cabinet stopped showing its demo (a play, a regular, the title card, its hall unloading): it leaves the bed. */
export function leaveDemoBed(cabinet: object): void {
  asked.delete(cabinet);
}
