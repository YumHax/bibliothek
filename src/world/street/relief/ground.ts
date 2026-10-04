import { STREET_PLAN } from '../streetPlan';
import { FRONT, KERB_HEIGHT, PARK_STREET, SIDE_STREET, STREET_ENDS } from '@/world/measures/street';

/** The road's three rectangles (zone-local x0, z0, x1, z1): Front Street, Park Street, the side street. */
const ROAD_RECTS: readonly (readonly [number, number, number, number])[] = [
  [PARK_STREET.farKerb, FRONT.nearKerb, STREET_ENDS.east, FRONT.farKerb],
  [PARK_STREET.farKerb, STREET_ENDS.south, PARK_STREET.nearKerb, FRONT.nearKerb],
  [SIDE_STREET.nearKerb, STREET_ENDS.side, SIDE_STREET.farKerb, FRONT.nearKerb],
];

/** How round the kerbs turn at the junctions (metres). */
export const KERB_RADIUS = 1.5;

/**
 * Where two kerb lines meet at a right angle, rounded (`KERB_RADIUS`): the corner point, the
 * quadrant whose corner is the convex one (`into`, signs along x and z), and whether that quadrant
 * is pavement (its corner rounded off: the road takes what is cut) or road (the pavement takes it).
 * Park Street's mouth on our side and across, the side street's two.
 */
export const KERB_CORNERS: readonly { at: readonly [number, number]; into: readonly [1 | -1, 1 | -1]; pavement: boolean }[] = [
  { at: [PARK_STREET.nearKerb, FRONT.nearKerb], into: [1, -1], pavement: true },
  { at: [PARK_STREET.farKerb, FRONT.farKerb], into: [1, -1], pavement: false },
  { at: [SIDE_STREET.nearKerb, FRONT.nearKerb], into: [-1, -1], pavement: true },
  { at: [SIDE_STREET.farKerb, FRONT.nearKerb], into: [1, -1], pavement: true },
];

/** The corner whose rounding cuts (x, z): the share of its square between the corner point and the arc. */
function cutCorner(x: number, z: number): (typeof KERB_CORNERS)[number] | null {
  const r = KERB_RADIUS;
  for (const corner of KERB_CORNERS) {
    const u = (x - corner.at[0]) * corner.into[0];
    const v = (z - corner.at[1]) * corner.into[1];
    if (u < 0 || v < 0 || u > r || v > r) continue;
    if ((u - r) * (u - r) + (v - r) * (v - r) > r * r) return corner;
  }
  return null;
}

/** Whether zone-local (x, z) is on the road (Front Street, Park Street, the side street), a kerb below the pavements. */
export function isRoad(x: number, z: number): boolean {
  const cut = cutCorner(x, z);
  if (cut) return cut.pavement;
  for (const [x0, z0, x1, z1] of ROAD_RECTS) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return true;
  return false;
}

/**
 * `isRoad` in GLSL (`bool onRoad(vec2 p)`, p = zone-local x, z), written from the same rectangles and
 * corners, so a shader's idea of the road never drifts from the plan's.
 */
export function roadGlsl(): string {
  const f = (n: number): string => n.toFixed(2);
  const r = f(KERB_RADIUS);
  const corners = KERB_CORNERS.map(({ at: [x, z], into: [sx, sz], pavement }) => {
    const u = `(p.x - ${f(x)}) * ${f(sx)}`;
    const v = `(p.y - ${f(z)}) * ${f(sz)}`;
    return `  { vec2 c = vec2(${u}, ${v}); if (all(greaterThanEqual(c, vec2(0.0))) && all(lessThanEqual(c, vec2(${r}))) && length(c - vec2(${r})) > ${r}) return ${pavement}; }`;
  });
  const tests = ROAD_RECTS.map(([x0, z0, x1, z1]) => `  if (p.x >= ${f(x0)} && p.x <= ${f(x1)} && p.y >= ${f(z0)} && p.y <= ${f(z1)}) return true;`);
  return `bool onRoad(vec2 p) {\n${[...corners, ...tests].join('\n')}\n  return false;\n}`;
}

/** Whether x is across one of Front Street's pedestrian crossings (where the kerbs are dropped). */
export function atCrossing(x: number): boolean {
  return STREET_PLAN.crossings.some((c) => x >= c.from && x <= c.to);
}

/**
 * The ground's height at zone-local (x, z): the road's, else the pavement's (0), ramping down to
 * the dropped kerb's lip at the crossings (`STREET_PLAN.droppedKerb`, as `StreetGround` lays it).
 */
export function groundHeight(x: number, z: number): number {
  if (isRoad(x, z)) return -KERB_HEIGHT;
  const { rise, run } = STREET_PLAN.droppedKerb;
  // Front Street's kerbs are at z = ±farKerb (the near one at -farKerb).
  const fromKerb = Math.abs(z) - FRONT.farKerb;
  if (fromKerb >= 0 && fromKerb < run && atCrossing(x)) return -KERB_HEIGHT + rise + (KERB_HEIGHT - rise) * (fromKerb / run);
  return 0;
}
