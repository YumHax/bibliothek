/*
 * THE LOCAL's dartboard (docs/economy.md "Front Street's shops and finds"): a standard board, scored as in any pub,
 * and the checkout the regulars play on it: a number taken down to nought exactly, the last dart in a double (the bull
 * is double 25). Points are in the board's own units: its radius is 1 (the double ring's outer edge), the bull in the middle.
 */

/** The numbers round the board, clockwise from the top. */
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;

/** The rings' edges, as shares of the scoring radius (a regulation board: 6.35, 15.9, 99, 107, 162, 170 mm of 170). */
export const RINGS = { bull: 0.037, outerBull: 0.094, trebleIn: 0.582, trebleOut: 0.629, doubleIn: 0.953, doubleOut: 1 } as const;

/** What one dart scores and how it is called; `double` when it may finish a checkout (a double or the bull). */
interface DartHit {
  points: number;
  call: string;
  double: boolean;
}

/** Which number's sector a direction falls in: `angle` in radians, 0 straight up, clockwise. */
function sectorAt(angle: number): number {
  const turn = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
  return SECTORS[Math.floor(turn * 20 + 0.5) % 20]!;
}

/** What a dart scores landing at (`x`, `y`) on the board (`y` up, the board's radius 1), and how it is called. */
export function dartScore(x: number, y: number): DartHit {
  const r = Math.hypot(x, y);
  if (r <= RINGS.bull) return { points: 50, call: 'Bullseye', double: true };
  if (r <= RINGS.outerBull) return { points: 25, call: 'Outer bull', double: false };
  if (r > RINGS.doubleOut) return { points: 0, call: 'Off the board', double: false };
  const n = sectorAt(Math.atan2(x, y));
  if (r >= RINGS.doubleIn) return { points: n * 2, call: `Double ${n}`, double: true };
  if (r >= RINGS.trebleIn && r <= RINGS.trebleOut) return { points: n * 3, call: `Treble ${n}`, double: false };
  return { points: n, call: String(n), double: false };
}

/** The sector numbers in order round the board, from the top (for drawing it). */
export function sectorNumbers(): readonly number[] {
  return SECTORS;
}

/** Where a checkout stands after a dart: on, checked out, or bust (below nought, at one, or nought off a double). */
export function afterDart(left: number, hit: DartHit): { left: number; state: 'on' | 'out' | 'bust' } {
  const next = left - hit.points;
  if (next === 0) return hit.double ? { left: 0, state: 'out' } : { left, state: 'bust' };
  if (next < 0 || next === 1) return { left, state: 'bust' };
  return { left: next, state: 'on' };
}

/** A finishing dart for `left`: its double, or the bull for 50. */
function finish(left: number): string | null {
  if (left === 50) return 'Bull';
  return left % 2 === 0 && left >= 2 && left <= 40 ? `D${left / 2}` : null;
}

/** One dart that scores `points`, as a regular would throw it: a single, the outer bull, a treble, else a double. */
function setUp(points: number): string | null {
  if (points < 1) return null;
  if (points <= 20) return String(points);
  if (points === 25) return '25';
  if (points % 3 === 0 && points <= 60) return `T${points / 3}`;
  if (points % 2 === 0 && points <= 40) return `D${points / 2}`;
  return points === 50 ? 'Bull' : null;
}

/** The doubles a regular likes to leave, best first (they split into another double). */
const LEAVES = [40, 32, 36, 24, 16, 20, 50, 38, 34, 30, 28, 26, 22, 18, 14, 12, 10, 8, 6, 4, 2] as const;
/** The first darts of a long checkout, trebles first. */
const OPENERS = [60, 57, 54, 51, 48, 45, 42, 39, 50, 25, 20, 19, 18, 17, 16, 15] as const;

/** The usual way to check `left` out in `darts` darts (`['T19', 'D12']`), or null when it cannot be done. */
export function checkoutRoute(left: number, darts: number): string[] | null {
  if (darts < 1) return null;
  const one = finish(left);
  if (one) return [one];
  if (darts === 1) return null;
  for (const leave of LEAVES) {
    const first = setUp(left - leave);
    if (first) return [first, finish(leave)!];
  }
  if (darts === 2) return null;
  for (const opener of OPENERS) {
    const rest = left > opener ? checkoutRoute(left - opener, 2) : null;
    if (rest) return [setUp(opener)!, ...rest];
  }
  return null;
}
