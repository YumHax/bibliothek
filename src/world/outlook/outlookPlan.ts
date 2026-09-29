import { COURTYARD, PARK_STREET, type Vec2 } from '../street/streetPlan';

/*
 * What the views through the windows onto the street (`outlook/`) add to the street's own plan: the courtyard behind
 * our building, which the walkable street never reaches (its facades are the street's, `courtEast`, `courtRear`; its
 * ground and what stands on it are here), seen from the stairwell's half landings. Street-local metres, like
 * `STREET_PLAN`: the courtyard runs from Park Street's workshop (x) to the neighbour's wing at `COURTYARD.east`, from
 * our back wall (`COURTYARD.back`) to the rear building (`COURTYARD.far`).
 */

/** How deep the workshop on Park Street runs into the yard (its front is the street's `courtWorkshop`), and its back wall. */
const WORKSHOP_DEPTH = 6.2;

export const COURTYARD_YARD = {
  /** The setts, from the workshop's back wall to the wing, from the rear building to our wall. */
  setts: { x0: PARK_STREET.line + WORKSHOP_DEPTH, x1: COURTYARD.east, z0: COURTYARD.far, z1: COURTYARD.back },
  /** The workshop's block seen from the yard: its back wall (facing +x) and its tarred flat roof; a door and two barred windows. */
  workshop: { x0: PARK_STREET.line, x1: PARK_STREET.line + WORKSHOP_DEPTH, z0: COURTYARD.far, z1: COURTYARD.back, wall: 0xb8ae9c, roof: 0x4a4a4c, door: -31.5, windows: [-35.6, -27.4] },
  /** The lawn in the middle, a curb of concrete round it; the chestnut on it. */
  lawn: { x0: -8.6, x1: -1.8, z0: -36.2, z1: -30.2 },
  chestnut: { at: [-5.3, -33.3] as Vec2, scale: 1.2 },
  /** The wheelie bins along the rear building's wall: where each stands (its middle), its lid's colour. */
  bins: [
    { at: [-11.8, -38.75] as Vec2, color: 0x4a4d50 },
    { at: [-11.1, -38.75] as Vec2, color: 0x4a4d50 },
    { at: [-10.4, -38.75] as Vec2, color: 0x2d5aa0 },
    { at: [-9.7, -38.75] as Vec2, color: 0xe0b93a },
    { at: [-9.0, -38.75] as Vec2, color: 0x6b4a2e },
    { at: [-8.3, -38.75] as Vec2, color: 0x3d7a45 },
  ],
  /** The shed against the wing, its pent roof falling towards the yard. */
  shed: { x0: 0.2, x1: 2.25, z0: -38.9, z1: -36.3, height: 2.3, low: 1.9 },
  /** The carpet-beating rack: two posts and a bar across. */
  rack: { at: [-2.6, -26.6] as Vec2, width: 2.2, height: 1.7 },
  /** The sandpit's timber frame, by our wall. */
  sandpit: { x0: -12.4, x1: -10.2, z0: -27.8, z1: -25.6 },
  /** Bikes leaned on the wing's wall: where each stands (its middle, it runs along z), its frame's colour. */
  bikes: [
    { at: [1.95, -29.5] as Vec2, color: 0x2a5a8a },
    { at: [1.95, -28.6] as Vec2, color: 0x9a2a2a },
    { at: [1.95, -27.7] as Vec2, color: 0x2f2f33 },
  ],
} as const;
