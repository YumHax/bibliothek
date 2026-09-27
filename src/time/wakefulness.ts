import * as THREE from 'three';

/**
 * How awake the city is at `hours` (0 ≤ hours < 24), 0..1: the share of homes still up, and with
 * it how busy the streets are. Full through the day and the evening, tailing off after ten, at
 * its lowest between two and four in the morning, waking again before dawn. The night lights
 * compare it with each window's curfew (see `Sheet.lit`) and `Life` paces its traffic by it.
 */
export function wakefulnessAt(hours: number): number {
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < CURVE.length - 1 && CURVE[i + 1][0] <= h) i++;
  const [h0, w0] = CURVE[i];
  const [h1, w1] = CURVE[i + 1];
  return THREE.MathUtils.lerp(w0, w1, THREE.MathUtils.smoothstep(h, h0, h1));
}

/** (hour, wakefulness) knots; eased between, wrapping at midnight. */
const CURVE: readonly [number, number][] = [
  [0, 0.3],
  [1, 0.18],
  [2, 0.1],
  [4, 0.08],
  [5, 0.14],
  [6, 0.4],
  [7.5, 1],
  [21, 1],
  [22, 0.8],
  [23, 0.55],
  [24, 0.3],
];
