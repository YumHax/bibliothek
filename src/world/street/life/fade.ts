import { smooth } from '@/math/scalar';
/**
 * How much of someone at `distance` from the player shows: all of it nearer than `drawDistance -
 * fade`, nothing beyond `drawDistance`, a smooth fade between (so nobody pops in or out of sight).
 */
export function distanceFade(distance: number, drawDistance: number, fade: number): number {
  return smooth((drawDistance - distance) / Math.max(0.001, fade));
}
