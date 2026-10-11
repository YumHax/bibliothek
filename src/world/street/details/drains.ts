import { STREET_PLAN, type Vec2 } from '../streetPlan';
import { FRONT, PARK_STREET } from '@/world/measures/street';
import { lcg } from '@/random';

/** Gutter drains along the kerbs about every so many metres, each a little off (as the road's fall put it). */
const DRAIN_EVERY = 13;
const DRAIN_JITTER = 4;

/** A gutter drain's grate: where it lies (zone-local, in the gutter by the kerb) and which way it runs (yaw). */
interface Drain {
  at: Vec2;
  yaw: number;
}

/**
 * Every gutter drain of the street, drawn once from a fixed seed: along both of Front Street's kerbs (none on a
 * crossing) and Park Street's. `details/StreetDetails` lays their grates; the street's sound reads them too.
 */
export const DRAINS: readonly Drain[] = (() => {
  const drains: Drain[] = [];
  const fall = lcg(1313);
  const step = (): number => DRAIN_EVERY + (fall() - 0.5) * DRAIN_JITTER;
  for (const side of [-1, 1]) {
    for (let x = PARK_STREET.farKerb + 2 + fall() * 4; x < 100; x += step()) {
      if (STREET_PLAN.crossings.some((c) => x > c.from - 1 && x < c.to + 1)) continue;
      drains.push({ at: [x, side * (FRONT.farKerb - 0.2)], yaw: 0 });
    }
  }
  for (let z = -20; z > -90; z -= step()) {
    drains.push({ at: [PARK_STREET.nearKerb - 0.2, z], yaw: Math.PI / 2 });
    drains.push({ at: [PARK_STREET.farKerb + 0.2, z - 4 - fall() * 4], yaw: Math.PI / 2 });
  }
  return drains;
})();
