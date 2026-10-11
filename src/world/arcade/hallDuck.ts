import { damp } from '@/math/damp';

/**
 * The hall gets out of the way while the player plays: from the coin to walking away, the jukebox
 * and the crowd's murmur drop about 6 dB (`DUCK_GAIN`) so the machine in front of them is what is
 * heard. Each machine's run says when the player stands at it (`MachineRun`); the jukebox and the
 * ambience ease their own level towards `duckGain()`.
 */

/** About -6 dB. */
const DUCK_GAIN = 0.5;
/** How fast a level eases to the new gain (`damp`'s rate): about half a second. */
const EASE = 4;

const at = new Set<object>();

/** The player took the controls of `machine` (`on`), or walked away from it. */
export function playerAtMachine(machine: object, on: boolean): void {
  if (on) at.add(machine);
  else at.delete(machine);
}

/** The gain the hall's music and murmur go towards right now: 1, or `DUCK_GAIN` while the player plays. */
function duckGain(): number {
  return at.size > 0 ? DUCK_GAIN : 1;
}

/** One frame of a level easing towards `duckGain()` from `current`. */
export function easeDuck(current: number, dt: number): number {
  return damp(current, duckGain(), EASE, dt);
}
