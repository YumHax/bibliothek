import { STAIRWELL_PLAN as plan, STOREY, STOREYS, landingY } from './stairwellPlan';

/** A tread of a flight (zone-local): its box, and the riser above it (the face up to the tread or landing above). */
interface Tread {
  /** 1 from the top of the flight. */
  i: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  bottom: number;
  /** The riser above this tread: its plane's z, which way it faces (towards someone climbing), its height. */
  riserZ: number;
  riserFacing: 1 | -1;
  rise: number;
  /** The building's last tread (flight B's foot into the hall): the shaft's stone floor is that tread, none is built. */
  floor: boolean;
}

/**
 * The nine treads of flight `which` under floor landing `k`: flight A down the west side from the floor landing south
 * to the half landing, flight B down the east side from the half landing north to the next floor. The one place their
 * geometry is worked out (the staircase builds them, the runner lies on them).
 */
export function flightTreads(k: number, which: 'A' | 'B'): Tread[] {
  const { floorLanding, halfLanding, treads } = plan;
  const lane = which === 'A' ? plan.flightA : plan.flightB;
  const half = STOREY / 2;
  const rise = half / treads;
  const depth = (treads * 0.28) / treads;
  const head = which === 'A' ? landingY(k) : landingY(k) - half;
  const list: Tread[] = [];
  for (let i = 1; i <= treads; i++) {
    const top = head - i * rise;
    // Flight A runs south (-z) from the floor landing; flight B north (+z) from the half landing.
    const z0 = which === 'A' ? floorLanding.z0 - i * depth : halfLanding.z1 + (i - 1) * depth;
    const z1 = z0 + depth;
    list.push({
      i,
      x0: lane.x0,
      x1: lane.x1,
      z0,
      z1,
      top,
      bottom: top - rise - 0.02,
      riserZ: which === 'A' ? z1 : z0,
      riserFacing: which === 'A' ? -1 : 1,
      rise,
      floor: i === treads && which === 'B' && k === STOREYS - 1,
    });
  }
  return list;
}
