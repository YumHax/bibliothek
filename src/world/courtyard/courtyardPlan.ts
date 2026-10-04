import { COURTYARD, PARK_STREET, type Vec2 } from '../measures/street';

/*
 * THE COURTYARD, walked: our block's yard behind the building, the same place the stairwell's windows look down on
 * (`COURTYARD_YARD`, below: setts, lawn and chestnut, bins, shed, rack, sandpit, bikes, read by the stairwell's window views
 * and the painted view too; the facades round it are the street's).
 * Reached through a door at the back of the entrance hall (`STAIRWELL_PLAN.courtyardDoor`, a travel door: the yard
 * is a lazy zone of its own, so it costs nothing while the player is in the flat), out of our back wall.
 *
 * Every spot here is in the STREET's frame (`STREET_PLAN`'s metres), like `COURTYARD_YARD`: the builder places what
 * it builds from the street's plan at `-CENTRE`, so the zone's origin is the yard's middle.
 *
 *   z -23.9  ════ our back wall ═══ [door] ══════════ (stairwell's windows above the door's west)
 *            sandpit      tables · guests          rack        bikes │
 *   workshop                lawn + chestnut                  sale ·  │ the wing
 *   (x -13.1)  cabinet                                          shed │ (x 2.3)
 *   z -39.3  ════ the rear building ═══ bins ══════════════════════════
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

const { setts } = COURTYARD_YARD;

/** The yard's middle in the street's frame: the zone's origin. */
export const COURTYARD_CENTRE: Vec2 = [(setts.x0 + setts.x1) / 2, (setts.z0 + setts.z1) / 2];

/** The zone's box: the setts from wall to wall, up past the roofs. */
export const COURTYARD_ROOM = { width: setts.x1 - setts.x0, depth: setts.z1 - setts.z0, height: 24 };

/** A street-frame spot in the zone's frame. */
export function inYard([x, z]: Vec2): Vec2 {
  return [x - COURTYARD_CENTRE[0], z - COURTYARD_CENTRE[1]];
}

/** A string of party bulbs between two walls: from one end to the other (street frame), hung `high` at the walls, sagging `sag` in the middle. */
export interface BulbString {
  from: Vec2;
  to: Vec2;
  high: number;
  sag: number;
  bulbs: number;
}

export const COURTYARD_PLAN = {
  /** Our back door: on our back wall, east of the stairwell's shaft; the way back into the entrance hall. */
  backDoor: { at: [-4.0, COURTYARD.back] as Vec2, width: 0.9, height: 2.1 },
  /** Where the player comes out (yaw 0 looks down -z, away from the door). */
  arrival: { at: [-4.0, COURTYARD.back - 1.1] as Vec2, yaw: 0 },
  /** The chestnut's trunk (it is planted with the street's trees): a collider. */
  trunk: { radius: 0.35 },
  /**
   * Where another feature puts something of its own (`huntHook.dressCourtyard`), in the STREET's frame like the rest:
   * `chestnut`, on the trunk's bark facing our back door, `y` up (the building's treasure hunt carves its initials there).
   */
  huntSpots: {
    chestnut: { at: [COURTYARD_YARD.chestnut.at[0], COURTYARD_YARD.chestnut.at[1] + 0.37] as Vec2, y: 1.45, yaw: 0 },
  },
  /** The concierge's pots along our back wall (`Plant` kinds, terracotta). */
  pots: [
    { kind: 'small', at: [-6.4, COURTYARD.back - 0.3] as Vec2, seed: 3 },
    { kind: 'small', at: [-6.95, COURTYARD.back - 0.3] as Vec2, seed: 7 },
    { kind: 'yucca', at: [-2.4, COURTYARD.back - 0.4] as Vec2, seed: 11 },
  ] as const,
  /** Bin day: the bags left by the bins, one game day in `every`. */
  binDay: { every: 7, phase: 2, bags: [[-12.4, -38.5], [-7.7, -38.6], [-7.2, -38.3]] as Vec2[] },
  /** The party (`building/neighboursParty`): where everything stands on its day. */
  party: {
    /** Two trestle tables end to end, a cloth, dishes on them. */
    tables: [
      { at: [-8.6, -28.6] as Vec2, yaw: 0 },
      { at: [-6.4, -28.6] as Vec2, yaw: 0 },
    ],
    /** The guests, in `STAIRWELL_PLAN.residents`' order: where each stands and which way they face (yaw 0: +z). */
    guests: [
      { at: [-9.4, -27.75] as Vec2, yaw: Math.PI },
      { at: [-7.5, -29.45] as Vec2, yaw: 0 },
      { at: [-5.6, -27.75] as Vec2, yaw: Math.PI },
      { at: [0.95, -32.6] as Vec2, yaw: -Math.PI / 2 },
      { at: [-10.9, -32.2] as Vec2, yaw: -Math.PI * 0.76 },
    ],
    /** The residents' table, where they buy the player's games (its buyer stands behind it: guest 3). */
    sale: { at: [0.3, -32.6] as Vec2, yaw: -Math.PI / 2 },
    /** The old cabinet wheeled up from the cellars, its lead run to the workshop's wall. */
    cabinet: { at: [-12.25, -33.6] as Vec2, yaw: Math.PI / 2 },
    /** The radio on the first table, and where the chatter is heard from. */
    radio: [-8.6, 0.9, -28.6] as [number, number, number],
    /** The one real light of the party, over the tables (shadowless): candela and reach. */
    lamp: { at: [-7.5, 2.6, -28.6] as [number, number, number], intensity: 6, distance: 10, color: 0xffc27a },
    /** The bulbs between our back wall and the rear building (clear of the chestnut's crown), one across over the tables. */
    strings: [
      { from: [-11.2, COURTYARD.back], to: [-11.2, COURTYARD.far], high: 3.3, sag: 1.0, bulbs: 22 },
      { from: [-8.9, COURTYARD.back], to: [-8.9, COURTYARD.far], high: 3.4, sag: 1.1, bulbs: 22 },
      { from: [-1.2, COURTYARD.back], to: [-1.2, COURTYARD.far], high: 3.3, sag: 1.0, bulbs: 22 },
      { from: [COURTYARD_YARD.setts.x0, -27.2], to: [COURTYARD.east, -27.2], high: 3.6, sag: 0.9, bulbs: 26 },
    ] as BulbString[],
  },
};
