import { COURTYARD, PARK_STREET, type Vec2 } from '../measures/street';
import type { BulkyJunk } from '@/building/bulkyWaste';

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
  /** Ivy up the workshop's back wall between its door and the window towards our building: its middle (z), width, height. */
  ivy: { z: -29.6, width: 2.4, height: 3.6 },
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
  /** The lantern over it (`YardLantern`): how far over the door's head its glass starts (m). */
  lantern: { overDoor: 0.28 },
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
  /**
   * Bulky-waste day (`building/bulkyWaste`, `placeBulky`): the pile against the rear building east of the bins. `area`
   * is what stops the player (they reach in); each kind of junk has its own spot along the wall, the piece for the flat
   * stands at its east end, the carton of games, the console and the owner's sign lie in front, within reach.
   */
  bulky: {
    area: { x0: -7.7, x1: -1.8, z0: COURTYARD.far, z1: -38.15 },
    junk: {
      mattress: { at: [-6.3, -39.05] as Vec2, yaw: 0 },
      skis: { at: [-7.55, -38.95] as Vec2, yaw: 0.2 },
      carpet: { at: [-5.4, -38.45] as Vec2, yaw: 0.15 },
      chair: { at: [-4.2, -38.75] as Vec2, yaw: 0.3 },
      crockery: { at: [-7.0, -38.35] as Vec2, yaw: 0.3 },
      deadTv: { at: [-4.95, -38.95] as Vec2, yaw: -0.1 },
      pram: { at: [-2.35, -38.7] as Vec2, yaw: Math.PI / 2 },
    } satisfies Record<BulkyJunk, { at: Vec2; yaw: number }>,
    piece: { at: [-3.4, -38.75] as Vec2, yaw: 0 },
    carton: { at: [-5.6, -37.75] as Vec2, yaw: 0.15 },
    /** Where each loose game lies in the carton, from its middle (m, the carton's frame): they pile up in turn. */
    games: [[-0.11, -0.07], [0.11, -0.06], [-0.1, 0.08], [0.12, 0.09]] as Vec2[],
    console: { at: [-4.6, -37.8] as Vec2, yaw: 0.4 },
    sign: { at: [-6.5, -37.95] as Vec2, yaw: 0.2 },
  },
  /**
   * What makes the walked yard lived in (`YardDressing`; the window views keep to `COURTYARD_YARD`): the bench by our
   * wall, the rotary airer on the lawn, the downpipe in the corner and the drains, the puddles after rain, the tap and
   * its hose, the meters on the wing, the climber up it, the lean-to over the bins, the solar stakes round the lawn,
   * the children's things, weeds at the walls' foot.
   */
  dressing: {
    /** The bench against our back wall, facing the yard (yaw: π looks down -z). */
    bench: { at: [-9.3, -24.32] as Vec2, yaw: Math.PI, width: 1.6 },
    /** The rotary airer: its pole on the lawn, the arms' reach and height; washing out on dry days. */
    airer: { at: [-3.0, -34.9] as Vec2, radius: 1.05, height: 1.75 },
    /** The downpipe down our back wall by the wing's corner, its shoe over a gully. */
    downpipe: { x: 1.9, storeys: 6 },
    /** Drain gratings in the setts (street frame), and the puddles that stand round them after rain (radius, stretch). */
    drains: [[1.9, -24.3], [-10.0, -35.2], [-1.0, -37.0]] as Vec2[],
    puddles: [
      { at: [1.4, -24.75] as Vec2, radius: 0.55, stretch: 1.6, yaw: 0.3 },
      { at: [-9.8, -35.6] as Vec2, radius: 0.7, stretch: 1.3, yaw: -0.5 },
      { at: [-0.6, -36.7] as Vec2, radius: 0.5, stretch: 1.8, yaw: 1.1 },
      { at: [-4.6, -25.1] as Vec2, radius: 0.4, stretch: 1.4, yaw: 0.2 },
    ],
    /** The yard's tap on our wall and its hose reel under it. */
    tap: { x: -7.7, y: 0.7 },
    /** The meter cabinet on the wing's wall (its middle along it, z). */
    meters: { z: -33.6, bottom: 0.85, width: 0.7, height: 0.75 },
    /** The climber up the wing's wall near our corner: its middle (z), width, height. */
    climber: { z: -25.6, width: 1.4, height: 4.6 },
    /** The lean-to over the bins: from the workshop's corner along the rear building, its depth, roof heights, posts. */
    binShelter: { x0: -12.3, x1: -7.9, depth: 1.18, high: 1.62, low: 1.46, posts: [-12.25, -10.05, -7.95] },
    /** Solar stakes round the lawn's curb, lit from dusk: how many a side (x, z). */
    stakes: { alongX: 4, alongZ: 3 },
    /** A bucket and spade in the sandpit, a ball left on the lawn. */
    bucket: [-11.55, -26.4] as Vec2,
    ball: [-7.6, -31.1] as Vec2,
    /** Weeds along the walls' foot (street frame), clear of the door, the bench and the pots. */
    weeds: [
      { from: [-12.9, -24.02] as Vec2, to: [-11.95, -24.02] as Vec2 },
      { from: [-1.6, -24.02] as Vec2, to: [1.6, -24.02] as Vec2 },
      { from: [-1.75, -39.2] as Vec2, to: [-1.4, -39.2] as Vec2 },
      { from: [2.2, -35.8] as Vec2, to: [2.2, -32.3] as Vec2 },
    ],
  },
  /**
   * The ground floors round the yard, built (`YardGroundFloors`; the facades over them are painted bare there,
   * `FacadeSpec.builtGround`): a stone plinth along each wall's foot, the doors and the ground-floor windows in their
   * stone surrounds, the cellars' vents in the plinth, a downpipe on the rear building. Each wall is a line of the
   * street's frame looking into the yard (`out`: the sign of the yard's side along the other axis); what stands on it
   * is `at` along that line (x on our back and the rear building, z on the wing and the workshop).
   */
  groundFloors: {
    /** The facades painted bare under it (`streetPlan`'s ids). */
    facades: ['oursBack', 'courtRear', 'courtEast'],
    walls: {
      back: { runs: 'x', line: COURTYARD.back, out: -1, from: PARK_STREET.line + WORKSHOP_DEPTH, to: COURTYARD.east, facade: 'oursBack' },
      rear: { runs: 'x', line: COURTYARD.far, out: 1, from: PARK_STREET.line + WORKSHOP_DEPTH, to: COURTYARD.east, facade: 'courtRear' },
      wing: { runs: 'z', line: COURTYARD.east, out: -1, from: COURTYARD.far, to: COURTYARD.back, facade: 'courtEast' },
      workshop: { runs: 'z', line: PARK_STREET.line + WORKSHOP_DEPTH, out: 1, from: COURTYARD.far, to: COURTYARD.back, facade: null },
    },
    /** The plinth: its height, how far it stands out of the wall, the length of a block. */
    plinth: { height: 0.42, proud: 0.05, block: 0.9 },
    /** Where the plinth stops for something standing at the wall's foot (wall, from, to along it): our back door, the workshop's, the shed. */
    gaps: [
      { wall: 'back', from: -4.62, to: -3.38 },
      { wall: 'workshop', from: -32.08, to: -30.92 },
      { wall: 'wing', from: -38.95, to: -36.25 },
    ],
    /**
     * The doors: the bike room under our stairs, the wing's staircase, the rear building's (to its cellars and its
     * stair); `look` its leaf, `step` a stone step before it, `canopy` a zinc hood over it, `plate` its enamel plate.
     */
    doors: [
      { wall: 'back', at: -11.3, width: 0.9, height: 2.1, look: 'boarded', color: 0x3d5a48, step: false, canopy: false, plate: 'VÉLOS' },
      { wall: 'wing', at: -31.6, width: 1.0, height: 2.3, look: 'glazed', color: 0x6a2e26, step: true, canopy: true, plate: 'ESCALIER B' },
      { wall: 'rear', at: -0.82, width: 0.95, height: 2.2, look: 'panelled', color: 0x4a5258, step: true, canopy: false, plate: 'BÂT. C' },
    ],
    /**
     * The ground-floor windows, barred: the bottom of the opening and its height, `curtain` a café curtain on its lower
     * half or a pair drawn half-way, `lit` the evening hours a lamp is on behind it (none: a store room).
     */
    windows: [
      { wall: 'back', at: -9.3, width: 0.9, sill: 1.4, height: 1.35, curtain: 'cafe', lit: null },
      { wall: 'back', at: -1.25, width: 0.95, sill: 1.2, height: 1.5, curtain: 'cafe', lit: { from: 17.5, to: 23 } },
      { wall: 'wing', at: -35.2, width: 0.9, sill: 1.25, height: 1.45, curtain: 'pair', lit: { from: 18, to: 22.5 } },
      { wall: 'wing', at: -27.6, width: 0.9, sill: 1.4, height: 1.4, curtain: 'cafe', lit: { from: 19, to: 24.5 } },
      { wall: 'rear', at: -10.1, width: 0.9, sill: 2.0, height: 1.1, curtain: null, lit: null },
      { wall: 'rear', at: -6.0, width: 0.9, sill: 2.0, height: 1.1, curtain: null, lit: null },
      { wall: 'rear', at: -3.2, width: 0.9, sill: 2.0, height: 1.1, curtain: 'pair', lit: { from: 20, to: 25 } },
    ],
    /** The cellars' vents in the plinth (wall, along). */
    vents: [
      { wall: 'back', at: -5.6 },
      { wall: 'back', at: -0.2 },
      { wall: 'wing', at: -33.0 },
    ],
    /** A cast-iron downpipe from the rear building's gutter to the setts (wall, along). */
    downpipes: [{ wall: 'rear', at: -1.62 }],
  } as const,
  /**
   * The building's kids after school (`YardKids`, `building/kids`): Hugo and Mai on the bench (sat at its seat's back
   * edge, facing the yard), Tuan standing off its west end leaning in to Mai's screen, Lina on the sandpit's east edge.
   * `seat`: the height they sit at (the bench's slats, the sandpit's timber), null standing.
   */
  kids: {
    hugo: { at: [-8.85, -24.14] as Vec2, yaw: Math.PI, seat: 0.455 },
    mai: { at: [-9.55, -24.14] as Vec2, yaw: Math.PI, seat: 0.455 },
    tuan: { at: [-10.35, -24.5] as Vec2, yaw: 1.4, seat: null, lean: 0.35 },
    lina: { at: [-10.3, -26.7] as Vec2, yaw: Math.PI / 2, seat: 0.28 },
  },
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
  /**
   * The film night (`building/yardCinema`, `YardCinema`): the sheet on the workshop's back wall over its door (between
   * the far window and the ivy), the projector on its crates on the lawn's edge, two rows of folding chairs between.
   */
  cinema: {
    /** The sheet: its middle along the wall (z), how far off the wall its cord runs, its cloth (width, top, bottom) and the picture on it (width, middle's height). */
    sheet: { z: -32.4, off: 0.06, width: 3.0, top: 3.0, bottom: 0.95, picture: 2.7, pictureY: 1.98 },
    /** Rolled up until a film is put on: tied under the parapet, over the sheet's middle. */
    rollY: 3.25,
    /** The folding chairs stacked against the wall until then (along the wall, z). */
    stack: -34.45,
    /** The trestle with the projector on two crates, before the lawn, facing the sheet; the drinks at its end. */
    table: { at: [-8.95, -32.4] as Vec2, yaw: -Math.PI / 2 },
    /** The chairs, facing the sheet (-x): two rows. */
    chairs: [
      [-11.15, -33.45], [-11.15, -32.8], [-11.15, -32.0], [-11.15, -31.35],
      [-10.1, -33.75], [-10.1, -33.05], [-10.1, -31.75], [-10.1, -31.05],
    ] as Vec2[],
    /** The way down from our back door to behind the chairs (the residents walk it to their seat and back). */
    path: [[-4.0, -24.4], [-4.6, -26.2], [-9.6, -29.7]] as Vec2[],
    /** The projector's lead, along the setts from the trestle to our back door. */
    lead: [[-8.95, -32.1], [-9.0, -29.9], [-6.9, -27.6], [-4.55, -24.7], [-4.5, COURTYARD.back]] as Vec2[],
  },
};
