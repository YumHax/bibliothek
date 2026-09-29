import { CORNER_BAY, FRONT, PARK_STREET, STREET_PLAN, type Vec2 } from '../streetPlan';

/*
 * The stray cat's ways between his perches: along the pavements on a line clear of the lamp posts,
 * the trees, the kiosk and the parked cars, over the road at the crossings (the zebra at Park
 * Street's end, the signalled one) and over Park Street clear of its parked cars, round the corners.
 */

/** The four stretches of pavement he walks along, each a line (z for Front Street's, x for Park Street's). */
type Stretch = 'far' | 'ours' | 'parkOurs' | 'parkFar';

/** Where on each stretch: Front Street's pavements inside the trees and lamps (and the kiosk), Park Street's the same. */
const LANE = { far: FRONT.farKerb + 1.95, ours: FRONT.nearKerb - 1.95, parkOurs: PARK_STREET.line - 1.55, parkFar: PARK_STREET.farKerb - 2.2 } as const;
/** He crosses Park Street here (z), clear of its parked cars. */
const PARK_CROSSING = CORNER_BAY.z0 + 3.7;
/** Front Street's crossings (x): the plain zebra and the signalled one. */
const CROSSINGS = STREET_PLAN.crossings.map((c) => (c.from + c.to) / 2);

function stretchOf([x, z]: Vec2): Stretch {
  if (x <= PARK_STREET.farKerb) return 'parkFar';
  if (z >= 0) return 'far';
  if (x <= PARK_STREET.line + 0.5 && z < FRONT.nearKerb) return 'parkOurs';
  return 'ours';
}

/** The point of stretch `s` level with `p`. */
function onto(s: Stretch, [x, z]: Vec2): Vec2 {
  switch (s) {
    case 'far':
      return [Math.max(x, LANE.parkFar), LANE.far];
    case 'ours':
      return [Math.max(x, LANE.parkOurs), LANE.ours];
    case 'parkOurs':
      return [LANE.parkOurs, Math.min(z, LANE.ours)];
    case 'parkFar':
      return [LANE.parkFar, Math.min(z, LANE.far)];
  }
}

/** Where two stretches meet (their corner, or a crossing of the road between them: the one nearer `x`). */
function link(a: Stretch, b: Stretch, x: number): Vec2[] {
  const key = [a, b].sort().join('-');
  switch (key) {
    case 'far-ours': {
      const cx = CROSSINGS.reduce((best, c) => (Math.abs(c - x) < Math.abs(best - x) ? c : best), CROSSINGS[0] ?? 0);
      return a === 'far' ? [[cx, LANE.far], [cx, LANE.ours]] : [[cx, LANE.ours], [cx, LANE.far]];
    }
    case 'ours-parkOurs':
      return [[LANE.parkOurs, LANE.ours]];
    case 'far-parkFar':
      return [[LANE.parkFar, LANE.far]];
    case 'parkFar-parkOurs':
      return a === 'parkOurs' ? [[LANE.parkOurs, PARK_CROSSING], [LANE.parkFar, PARK_CROSSING]] : [[LANE.parkFar, PARK_CROSSING], [LANE.parkOurs, PARK_CROSSING]];
    default:
      return [];
  }
}

/** Which stretches follow each other on the way round (the two Front Street pavements, the Park Street ones). */
const NEXT: Record<Stretch, readonly Stretch[]> = { far: ['ours', 'parkFar'], ours: ['far', 'parkOurs'], parkOurs: ['ours', 'parkFar'], parkFar: ['far', 'parkOurs'] };

/** The stretches from `a` to `b`, fewest first (breadth first over four). */
function stretches(a: Stretch, b: Stretch): Stretch[] {
  const from = new Map<Stretch, Stretch | null>([[a, null]]);
  const queue: Stretch[] = [a];
  while (queue.length) {
    const s = queue.shift()!;
    if (s === b) break;
    for (const n of NEXT[s]) if (!from.has(n)) {
      from.set(n, s);
      queue.push(n);
    }
  }
  const path: Stretch[] = [];
  for (let s: Stretch | null | undefined = b; s; s = from.get(s)) path.unshift(s);
  return path;
}

/** The way from ground point `from` to ground point `to` (zone-local): waypoints after `from`, ending at `to`. */
export function catRoute(from: Vec2, to: Vec2): Vec2[] {
  const route = stretches(stretchOf(from), stretchOf(to));
  const points: Vec2[] = [onto(route[0]!, from)];
  for (let i = 1; i < route.length; i++) points.push(...link(route[i - 1]!, route[i]!, (from[0] + to[0]) / 2));
  points.push(onto(route[route.length - 1]!, to), to);
  return points;
}
