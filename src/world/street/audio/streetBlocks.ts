import { CORNER_BAY, COURTYARD, FRONT, PARK_STREET, SIDE_STREET, STREET_ENDS } from '@/world/measures/street';

/*
 * The street's blocks as the sound meets them (zone-local rectangles of ground, a little inside their building lines so
 * a shop door on the line is outside): a sound whose straight path from the source to the ears crosses one comes round
 * a corner or over a roof, its highs gone (`StreetEar`). Our block (split round the corner bay, open to the sky), the
 * row across Front Street, the side street's far side and the building across Front Street's end.
 */

interface Block {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** How far inside its building lines a block is taken (m): what stands on the line is out in the street. */
const INSET = 0.3;
/** How deep the blocks run back from their building lines (m): deeper than any sound worth hearing round them. */
const DEEP = 48;

function block(minX: number, maxX: number, minZ: number, maxZ: number): Block {
  return { minX: minX + INSET, maxX: maxX - INSET, minZ: minZ + INSET, maxZ: maxZ - INSET };
}

const BLOCKS: readonly Block[] = [
  // Ours, from Park Street to the side street; the corner bay is open ground.
  block(CORNER_BAY.x1, SIDE_STREET.line, FRONT.ourLine - DEEP, FRONT.ourLine),
  block(PARK_STREET.line, CORNER_BAY.x1, COURTYARD.far, CORNER_BAY.z0),
  // Across Front Street, its whole length (it closes Park Street's end).
  block(PARK_STREET.hedge - 8, STREET_ENDS.east + 8, FRONT.farLine, FRONT.farLine + DEEP),
  // The side street's far side, and the building across Front Street's end.
  block(SIDE_STREET.farLine, STREET_ENDS.east + 8, FRONT.ourLine - DEEP, FRONT.ourLine),
  block(STREET_ENDS.east, STREET_ENDS.east + DEEP / 2, FRONT.ourLine, FRONT.farLine),
];

/** Whether the straight line from (ax, az) to (bx, bz) (zone-local) runs through a block. */
export function blockedBetween(ax: number, az: number, bx: number, bz: number): boolean {
  return BLOCKS.some((b) => crosses(ax, az, bx - ax, bz - az, b));
}

/** Slab test: whether the segment from (x, z) along (dx, dz) passes through the inside of `b`. */
function crosses(x: number, z: number, dx: number, dz: number, b: Block): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const [origin, delta, min, max] of [[x, dx, b.minX, b.maxX], [z, dz, b.minZ, b.maxZ]] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (origin <= min || origin >= max) return false;
      continue;
    }
    const a = (min - origin) / delta;
    const c = (max - origin) / delta;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
    if (t0 >= t1) return false;
  }
  return true;
}
