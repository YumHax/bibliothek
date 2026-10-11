/**
 * BRICK STORM's wall shapes: whether the brick at row `r`, column `c` of a `rows` x `cols` grid is
 * there. The first is the plain block the first wall always is; the others are drawn from the run's
 * seed for every wall after it. Each keeps at least half the grid, so a wall still takes a while.
 */
type WallPattern = (r: number, c: number, rows: number, cols: number) => boolean;

export const WALL_PATTERNS: readonly WallPattern[] = [
  // The block.
  () => true,
  // A checkerboard with a full top row.
  (r, c) => r === 0 || (r + c) % 2 === 0,
  // A pyramid: each row a brick narrower at either end, from the bottom up.
  (r, c, rows, cols) => {
    const inset = Math.max(0, rows - 1 - r) >> 1;
    return c >= inset && c < cols - inset;
  },
  // A diamond, full in the middle rows.
  (r, c, rows, cols) => {
    const mid = (rows - 1) / 2;
    const inset = Math.floor(Math.abs(r - mid));
    return c >= inset && c < cols - inset;
  },
  // Pillars: pairs of columns with a gap, joined by the top row.
  (r, c) => r === 0 || c % 3 !== 2,
  // Stripes: full rows with gaps every other row.
  (r, c) => r % 2 === 0 || c % 4 === 0 || c % 4 === 3,
  // An arch: the top two rows full, then the sides only.
  (r, c, _rows, cols) => r < 2 || c < 2 || c >= cols - 2,
];
