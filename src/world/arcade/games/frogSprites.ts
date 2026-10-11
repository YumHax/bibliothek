import { Sprite } from './sprite';

/*
 * LEAP FROG's traffic and river, as pixel sprites seen from above: cars and trucks built to their
 * lane's length (wheels at the corners, a windscreen and headlights at the front, red lamps at the
 * back), logs with ringed ends and bark, turtles paddling. Each built once per size and direction.
 * Inks: `x` the body, `w` glass, `t` tyres, `h` headlights, `r` tail lamps; on a log `x` the wood,
 * `d` the bark's shadow, `r` the cut end; on a turtle `x` the skin, `s` the shell's plates.
 */

const CAR_H = 10;
const LOG_H = 12;

function grid(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
}

function fill(g: string[][], x0: number, y0: number, x1: number, y1: number, ink: string): void {
  for (let y = Math.max(0, y0); y <= Math.min(g.length - 1, y1); y++) {
    const row = g[y]!;
    for (let x = Math.max(0, x0); x <= Math.min(row.length - 1, x1); x++) row[x] = ink;
  }
}

/** A car or truck `w` px long, facing right; flipped for the other way. */
function vehicleRows(kind: 'car' | 'truck', w: number): string[] {
  const g = grid(w, CAR_H);
  if (kind === 'car') {
    fill(g, 1, 1, w - 2, CAR_H - 2, 'x');
    fill(g, 3, 0, 6, 0, 't');
    fill(g, 3, CAR_H - 1, 6, CAR_H - 1, 't');
    fill(g, w - 7, 0, w - 4, 0, 't');
    fill(g, w - 7, CAR_H - 1, w - 4, CAR_H - 1, 't');
    fill(g, w - 8, 2, w - 6, CAR_H - 3, 'w');
    fill(g, 3, 3, 4, CAR_H - 4, 'w');
  } else {
    // A trailer, a gap, a cab.
    const cab = 9;
    fill(g, 1, 1, w - cab - 3, CAR_H - 2, 'x');
    fill(g, w - cab - 1, 1, w - 2, CAR_H - 2, 'x');
    for (const x of [3, 7, w - cab - 8, w - cab - 4, w - 6]) {
      fill(g, x, 0, x + 2, 0, 't');
      fill(g, x, CAR_H - 1, x + 2, CAR_H - 1, 't');
    }
    fill(g, w - 5, 2, w - 4, CAR_H - 3, 'w');
  }
  fill(g, w - 2, 2, w - 2, 2, 'h');
  fill(g, w - 2, CAR_H - 3, w - 2, CAR_H - 3, 'h');
  fill(g, 1, 2, 1, 2, 'r');
  fill(g, 1, CAR_H - 3, 1, CAR_H - 3, 'r');
  return g.map((row) => row.join(''));
}

const vehicles = new Map<string, Sprite>();

/** The sprite of a `kind` `w` px long going `dir` (+1 right). */
export function carSprite(kind: 'car' | 'truck', w: number, dir: 1 | -1): Sprite {
  const key = `${kind}:${w}:${dir}`;
  let sprite = vehicles.get(key);
  if (!sprite) {
    const rows = vehicleRows(kind, w);
    sprite = new Sprite([dir > 0 ? rows : rows.map((row) => [...row].reverse().join(''))]);
    vehicles.set(key, sprite);
  }
  return sprite;
}

const logs = new Map<number, Sprite>();

/** A log `w` px long: ringed cut ends, bark lines along it, a knot or two. */
export function logSprite(w: number): Sprite {
  let sprite = logs.get(w);
  if (!sprite) {
    const g = grid(w, LOG_H);
    fill(g, 2, 0, w - 3, LOG_H - 1, 'x');
    fill(g, 0, 2, 1, LOG_H - 3, 'r');
    fill(g, w - 2, 2, w - 1, LOG_H - 3, 'r');
    fill(g, 1, 1, 1, LOG_H - 2, 'r');
    fill(g, w - 2, 1, w - 2, LOG_H - 2, 'r');
    for (let y = 2; y < LOG_H - 1; y += 3) for (let x = 4 + (y % 2) * 3; x < w - 6; x += 9) fill(g, x, y, x + 4, y, 'd');
    for (let x = 12; x < w - 10; x += 23) fill(g, x, 5, x + 1, 6, 'd');
    sprite = new Sprite([g.map((row) => row.join(''))]);
    logs.set(w, sprite);
  }
  return sprite;
}

/** One turtle from above, 14 x 12, its flippers in two strokes, swimming right. */
const TURTLE_FRAMES = [
  ['..............', '..x.......x...', '...x.ssss.x...', '....ssssss....', '...ssxsxss.xx.', '...sxssxsssxxx', '...sxssxsssxxx', '...ssxsxss.xx.', '....ssssss....', '...x.ssss.x...', '..x.......x...', '..............'],
  ['..............', '.x.........x..', '..xx.ssss.xx..', '....ssssss....', '...ssxsxss.xx.', '...sxssxsssxxx', '...sxssxsssxxx', '...ssxsxss.xx.', '....ssssss....', '..xx.ssss.xx..', '.x.........x..', '..............'],
];
const TURTLE_RIGHT = new Sprite(TURTLE_FRAMES);
const TURTLE_LEFT = new Sprite(TURTLE_FRAMES.map((rows) => rows.map((row) => [...row].reverse().join(''))));

/** A turtle swimming `dir` (+1 right). */
export function turtleSprite(dir: 1 | -1): Sprite {
  return dir > 0 ? TURTLE_RIGHT : TURTLE_LEFT;
}
