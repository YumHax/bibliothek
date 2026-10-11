/*
 * THE LOCAL's dartboard (docs/economy.md "Front Street's shops and finds"): a standard board, scored as in any pub.
 * Points are in the board's own units: its radius is 1 (the double ring's outer edge), the bull in the middle.
 */

/** The numbers round the board, clockwise from the top. */
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;

/** The rings' edges, as shares of the scoring radius (a regulation board: 6.35, 15.9, 99, 107, 162, 170 mm of 170). */
export const RINGS = { bull: 0.037, outerBull: 0.094, trebleIn: 0.582, trebleOut: 0.629, doubleIn: 0.953, doubleOut: 1 } as const;

/** Which number's sector a direction falls in: `angle` in radians, 0 straight up, clockwise. */
function sectorAt(angle: number): number {
  const turn = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
  return SECTORS[Math.floor(turn * 20 + 0.5) % 20]!;
}

/** What a dart scores landing at (`x`, `y`) on the board (`y` up, the board's radius 1), and how it is called. */
export function dartScore(x: number, y: number): { points: number; call: string } {
  const r = Math.hypot(x, y);
  if (r <= RINGS.bull) return { points: 50, call: 'Bullseye!' };
  if (r <= RINGS.outerBull) return { points: 25, call: 'Outer bull' };
  if (r > RINGS.doubleOut) return { points: 0, call: 'Off the board' };
  const n = sectorAt(Math.atan2(x, y));
  if (r >= RINGS.doubleIn) return { points: n * 2, call: `Double ${n}` };
  if (r >= RINGS.trebleIn && r <= RINGS.trebleOut) return { points: n * 3, call: `Treble ${n}` };
  return { points: n, call: String(n) };
}

/** The sector numbers in order round the board, from the top (for drawing it). */
export function sectorNumbers(): readonly number[] {
  return SECTORS;
}
