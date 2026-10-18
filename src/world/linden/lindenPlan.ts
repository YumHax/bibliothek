import type { FacadeSpec } from '@/world/city/facades';
import type { PlantedTree } from '@/world/city/trees';
import type { ParkedShape } from '@/world/city/parkedCars';
import type { LampDesign } from '@/world/street/streetPlan';
import type { Vec2 } from '@/world/measures/street';

/*
 * LINDEN AVENUE, walked (docs/grandma.md "Around her flat"): the stretch of the avenue outside Mémé's building, across
 * town at the end of bus line 38; the same avenue her window shows (`grandma/LindenView`, `lindenPainters`: stone
 * facades, plane trees along both kerbs, cars parked both sides). Zone-local metres, the origin in the middle of the
 * roadway; the avenue runs along x.
 *
 *   z  8  ═══ LE TILLEUL café ═══ books ══ [shelter] ════ tabac ═══════════   (the far side, facing -z)
 *   z  5    tree   lamp    stop·pole        tree         lamp    tree
 *   z  3.6   car    car   (bus bay)    zebra   car    car    car
 *   z  0  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
 *   z -3.6   car    car              zebra      car     car     van
 *   z -5    tree   lamp   tree                 [depot table]    lamp tree
 *   z -8  ═══ pharmacy ═══ LEBRUN bakery ═ [no 14: her door] ═ DÉPÔT-VENTE ═══   (her side, facing +z)
 *          x -18 works' fence                                   works' fence x 18
 *
 * The roadway is level with the pavements (a quiet avenue's "plateau", flush granite kerbs and bollards): nothing to
 * step down, so the player's ground is the zone's floor everywhere. The walked stretch is closed at both ends by the
 * avenue's resurfacing works (fences across, `ends`); the facades and the trees go on past them to where the avenue
 * bends (the end facades at x ±40).
 */

/** The facade lines and the kerbs (z), and the walked stretch's ends (x). */
const HERS = -8;
const FAR = 8;
const KERB = 4.6;
const ENDS = 18;

/** Her building's street door: along its facade (from its left end, x -8), its size. */
const HER_DOOR = { along: 8.8, width: 1.16, height: 2.4 } as const;

/** Every face of the avenue in view: her side, the far side, and the two where it bends. Street-frame `FacadeSpec`s in the zone's frame. */
const FACADES: readonly FacadeSpec[] = [
  // Her side (faces +z; left end is -x).
  { id: 'lindenW2', from: [-40, HERS], to: [-24, HERS], storeys: 5, seed: 401, shops: [{ kind: 'cafe', from: 0.6, to: 6.8, name: 'CAFÉ DES PLATANES' }], door: 11, detail: 16 },
  { id: 'lindenW1', from: [-24, HERS], to: [-8, HERS], storeys: 6, seed: 403, shops: [{ kind: 'pharmacy', from: 0.6, to: 6.4 }], door: 11.5, detail: 24 },
  {
    // Number 14: Mémé's building. Its street door is a hole the travel door stands in (up to her landing).
    id: 'lindenHers', from: [-8, HERS], to: [8, HERS], storeys: 6, seed: 1931, detail: 32,
    shops: [{ kind: 'bakery', from: 0.4, to: 5.6, door: 3, name: 'LEBRUN' }, { kind: 'retro', from: 10.6, to: 15.6, door: 13, name: 'DÉPÔT-VENTE' }],
    door: HER_DOOR.along,
    openings: [{ at: HER_DOOR.along, width: HER_DOOR.width + 0.14, height: HER_DOOR.height + 0.07 }],
    nameplates: [{ at: 0.9, name: 'LINDEN AVENUE' }],
  },
  { id: 'lindenE1', from: [8, HERS], to: [24, HERS], storeys: 6, seed: 407, shops: [{ kind: 'florist', from: 0.6, to: 6 }, { kind: 'shut', from: 9.6, to: 15.4 }], detail: 24 },
  { id: 'lindenE2', from: [24, HERS], to: [40, HERS], storeys: 5, seed: 409, shops: [{ kind: 'grocer', from: 8.4, to: 15.4 }], door: 4, detail: 16 },
  // The far side (faces -z; left end is +x).
  { id: 'lindenFarE2', from: [40, FAR], to: [24, FAR], storeys: 6, seed: 411, shops: [{ kind: 'bar', from: 0.6, to: 6.6 }], door: 11, detail: 16 },
  { id: 'lindenFarE1', from: [24, FAR], to: [8, FAR], storeys: 5, seed: 413, shops: [{ kind: 'tabac', from: 0.6, to: 5 }, { kind: 'laundry', from: 9.8, to: 15.4 }], detail: 24 },
  { id: 'lindenFar', from: [8, FAR], to: [-8, FAR], storeys: 6, seed: 415, shops: [{ kind: 'cafe', from: 0.6, to: 7.6, name: 'LE TILLEUL' }], door: 12, detail: 24 },
  { id: 'lindenFarW1', from: [-8, FAR], to: [-24, FAR], storeys: 5, seed: 417, shops: [{ kind: 'books', from: 0.6, to: 6.4 }], door: 11, detail: 24, nameplates: [{ at: 15.1, name: 'LINDEN AVENUE' }] },
  { id: 'lindenFarW2', from: [-24, FAR], to: [-40, FAR], storeys: 6, seed: 419, shops: [{ kind: 'butcher', from: 9.4, to: 15.4 }], door: 4, detail: 16 },
  // Where the avenue bends, closing the view either way.
  { id: 'lindenBendE', from: [40, HERS], to: [40, FAR], storeys: 6, seed: 421, shops: [{ kind: 'pharmacy', from: 4.6, to: 11.4 }], detail: 12 },
  { id: 'lindenBendW', from: [-40, FAR], to: [-40, HERS], storeys: 5, seed: 423, shops: [{ kind: 'bakery', from: 4.6, to: 11.4 }], detail: 12 },
];

/** Plane trees along both kerbs (big ones: the avenue is old). */
const TREES: readonly PlantedTree[] = [
  ...[-34, -26, -15, -9.5, 10.5, 16, 26, 34].map((x, i): PlantedTree => ({ at: [x, -5.3], scale: 1.05 + ((i * 7) % 5) * 0.05 })),
  ...[-33, -25, -15.5, -3, 5, 13, 24, 33].map((x, i): PlantedTree => ({ at: [x, 5.3], scale: 1.0 + ((i * 3) % 5) * 0.06 })),
];

export const LINDEN_PLAN = {
  /** The facades' lines and the kerbs. */
  lines: { hers: HERS, far: FAR, kerb: KERB },
  facades: FACADES,
  /** The roadway and pavements laid (x from, to): past the walked stretch to the bends. */
  ground: { x0: -40, x1: 40 },
  /** The kerb: a flush granite strip on the pavement's edge (wide), the gutter's darker line in the road (wide). */
  kerb: { stone: 0.28, gutter: 0.3 },
  /** The zebra across, from her door to the far side (x from, to). */
  zebra: { x0: -2.6, x1: -0.4 },
  /** The lane markings: the dashed middle line, and the parking lanes' edge (from the kerb). */
  lanes: { dash: 3, gap: 3, parking: 2.0 },
  trees: TREES,
  /** Cast-iron lamps on a crook, reaching out over the road; how high their lanterns hang, how many real lights follow the player. */
  lamps: [
    { at: [-12.5, -5.0], yaw: 0, design: 'crook' },
    { at: [13, -5.0], yaw: 0, design: 'crook' },
    { at: [-30, -5.0], yaw: 0, design: 'crook' },
    { at: [-8.5, 5.0], yaw: Math.PI, design: 'crook' },
    { at: [9, 5.0], yaw: Math.PI, design: 'crook' },
    { at: [30, 5.0], yaw: Math.PI, design: 'crook' },
  ] as { at: Vec2; yaw: number; design?: LampDesign }[],
  lampHeight: 4.6,
  lampLights: 2,
  /** Bollards along both kerbs, every few metres between the cars (the plateau's edge): x of each, both sides. */
  bollards: { every: 2.6, skip: [[-3.2, 0.2], [-15.2, -7.8]] as [number, number][], height: 0.85 },
  /** The cars parked along both kerbs (none on the zebra nor in the bus's bay); nose to +x is yaw 0. */
  parked: [
    { at: [-14.5, -3.55], yaw: 0, shape: 'hatch', paint: 0x8a2a2a },
    { at: [-9.8, -3.55], yaw: 0, shape: 'city', paint: 0xe8e6e0 },
    { at: [-5.5, -3.55], yaw: 0, shape: 'saloon', paint: 0x2a3a5a },
    { at: [4.6, -3.55], yaw: 0, shape: 'estate', paint: 0x6a6e72 },
    { at: [9.6, -3.55], yaw: 0, shape: 'hatch', paint: 0xd9b44a },
    { at: [14.6, -3.65], yaw: 0, shape: 'van', paint: 0xe8e6e0 },
    { at: [-5.6, 3.55], yaw: Math.PI, shape: 'city', paint: 0x3f6b4f },
    { at: [3.6, 3.55], yaw: Math.PI, shape: 'hatch', paint: 0x2a2c30 },
    { at: [8.6, 3.55], yaw: Math.PI, shape: 'saloon', paint: 0x9aa8b4 },
    { at: [13.8, 3.55], yaw: Math.PI, shape: 'hatch', paint: 0xb8322a },
    { at: [-26, -3.55], yaw: 0, shape: 'saloon', paint: 0x1f3040 },
    { at: [25, 3.55], yaw: Math.PI, shape: 'estate', paint: 0x8a9096 },
  ] as { at: Vec2; yaw: number; shape: ParkedShape; paint: number }[],
  /** The resurfacing works closing the walked stretch: fences across at x ±`at`, with their signs. */
  ends: { at: ENDS, fence: 0.06 },
  /** Line 38's stop on the far pavement: the shelter's middle (its back to the facades), the pole by the kerb. */
  stop: { shelter: [-11.5, 7.1] as Vec2, pole: [-14.2, 5.05] as Vec2, width: 3.2 },
  /** Her building's street door (number 14), on her facade: up to her landing. */
  herDoor: { at: [-8 + HER_DOOR.along, HERS + 0.005] as Vec2, width: HER_DOOR.width, height: HER_DOOR.height, colour: 0x2f4a3c, number: '14' },
  /** The bakery's door and window on her facade (x): the door sells a baguette, the window a croissant. */
  bakery: { door: -5, window: -7.0, name: 'Lebrun’s bakery', hours: [7, 19.5] as [number, number], closedWeekday: 0 },
  /** LE TILLEUL's window on the far side (its shop on `lindenFar`, x 7.4 to 0.4), faced from the pavement. */
  tilleul: { at: [3.9, FAR - 0.005] as Vec2, yaw: Math.PI },
  /** The dépôt-vente's trestle out on the pavement before its window, the buyer on the road's side; how many games on it. */
  depot: { table: [5.1, -6.95] as Vec2, yaw: 0, games: 4 },
  /** Mrs Bassot (number 14, first floor) and Biscotte, out on the avenue at their hours: the walk, there and back along her side. */
  dogWalk: { from: [-1.8, -6.6] as Vec2, path: [[-1.8, -6.2], [-12, -6.1], [-16.5, -6.3], [-12, -6.3], [-1.8, -6.0], [16, -5.95], [10, -6.0], [-0.6, -6.4]] as Vec2[], hours: [[8.5, 9.5], [12.5, 13.2], [17.5, 18.8]] as [number, number][] },
  /** Mémé off the bus with her shopping (`grandma/sharedRide`): beside the player at the stop, then over the zebra to her street door. */
  memeWalk: [[-10.8, 5.3], [-9.8, 5.8], [-1.5, 5.8], [-1.5, -5.0], [0.8, -6.6], [0.8, -7.7]] as Vec2[],
  /** Where the player stands on arriving: off the bus at the stop (the default), or out of number 14 (down from her landing). */
  arrival: { at: [-11.5, 5.9] as Vec2, yaw: 0 },
  fromLanding: { at: [0.8, -6.75] as Vec2, yaw: Math.PI },
};

/** The zone's box: the walked stretch and the facades round it (the views past the fences are outside it). */
export const LINDEN_EXTENT = { width: 2 * ENDS + 4, depth: FAR - HERS + 1, height: 28 };
