import type { RoomOptions } from '../Room';

/*
 * THE STAIRWELL: the building's staircase behind the flat's front door, from our landing on the
 * fifth floor down to the entrance hall on the street. Zone-local metres: the origin is on the
 * entrance hall's floor level (world y -16.3, the street's height under the flat), under the
 * middle of the zone's box; x as the flat's, z towards Front Street (+z).
 *
 *   z  -5.8 ┌──────────────── half landings (H) ────────────────┐
 *           │ flight A  │   well: the lift's cage   │  flight B │
 *           │ (down, -z)│  car x 0.2..1.3           │  (down,+z)│
 *     -1.76 ├───────────┴─ gate ──────────────────────┴──────────┤
 *           │               floor landings (F)                 │  neighbours' doors (north wall)
 *     -0.46 └──────┬─────────────────── opening, RDC only ──────┘
 *   strip ─ our    │  x -1.5 ........................... 3.0
 *   landing, 5e    │                 entrance hall x 0.6 .. 3.6, z -0.46 .. 5.9, the street door at z 5.9
 *   x -3.54..-1.5  │
 *
 * Every storey is 3.26 m (the painted view's `STREET_DROP` over five storeys): from each floor
 * landing, flight A goes down the west side to the half landing, flight B comes back up the east
 * side... down to the next floor landing. Our landing (k = 0) is level with the flat's floor
 * (world y 0); the entrance hall (k = 5) with the street. The lift rides the well between the two.
 */

/** Height of one storey, and how many there are between our landing and the street. */
export const STOREY = 3.26;
export const STOREYS = 5;
/** Local y of floor landing `k` (0 = ours, at the top; `STOREYS` = the entrance hall's). */
export function landingY(k: number): number {
  return (STOREYS - k) * STOREY;
}

/** The zone's box (the bounds the player is "in the stairwell" inside): from the landing strip to the street door, hall to roof. */
export const STAIRWELL_ROOM: RoomOptions = { width: 7.14, depth: 11.7, height: STOREYS * STOREY + 2.8 };

/** Rectangles on the floor (local x0, x1, z0, z1). */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export const STAIRWELL_PLAN = {
  /** World position of the zone's origin (see `worldPlan.ts`). */
  origin: [4.6, -STOREYS * STOREY, -2.6] as [number, number, number],
  /** Our landing's strip from the flat's front door (the hallway's right wall, world x 1) to the stairs. */
  strip: { x0: -3.54, x1: -1.5, z0: -1.76, z1: -0.46, ceiling: 2.6 } as Rect & { ceiling: number },
  /** The shaft's inside faces. */
  shaft: { x0: -1.5, x1: 3.0, z0: -5.8, z1: -0.46 } as Rect,
  /** The floor landings (north), the half landings (south); the flights on either side of the well. */
  floorLanding: { z0: -1.76, z1: -0.46 },
  halfLanding: { z0: -5.8, z1: -4.28 },
  flightA: { x0: -1.5, x1: -0.3 },
  flightB: { x0: 1.8, x1: 3.0 },
  /** Treads per flight (each 0.28 deep): two flights a storey. */
  treads: 9,
  /** The well between the flights, and the lift's car in it (its gate on the floor landings' edge, z -1.76). */
  well: { x0: -0.3, x1: 1.8, z0: -4.28, z1: -1.76 } as Rect,
  car: { x0: 0.2, x1: 1.3, z0: -2.9, z1: -1.76, height: 2.15 },
  /** The lift runs between our landing and the entrance hall, this fast (m/s). */
  liftSpeed: 1.15,
  /** The entrance hall on the street, through the opening in the shaft's north wall at the bottom. */
  hall: { x0: 0.6, x1: 3.6, z0: -0.46, z1: 5.9, height: 3.1 } as Rect & { height: number },
  opening: { x0: 0.6, x1: 3.0, height: 2.4 },
  /**
   * The street door, on the hall's north wall (world x 6.7, z 3.3: the street's home door at x -6):
   * the outer face of the sas's street door (`world/airlock`), whose partition and glass door stand
   * `SAS.depth` (1.7 m) into the hall.
   */
  streetDoor: { at: [2.1, 5.9] as [number, number] },
  /** Set down here coming home from the street by travel (the "Go home" of the menu), in front of the sas's glass door, facing the stairs (yaw 0 looks down -z). */
  arrival: { at: [2.1, 3.6] as [number, number], yaw: 0 },
  /** Where the flat's front door is, and the doorway through the shaft's west wall onto our landing. */
  frontDoor: { x: -3.54, z: -1.11, width: 0.83, height: 2.04 },
  /** The mailboxes on the hall's west wall, a doormat by the street door. */
  mailboxes: { x: 0.62, z: 2.6, rows: 3, columns: 6 },
  /** Who lives behind the neighbours' doors on each landing (floor 4 down to 1), two a floor. */
  neighbours: [
    ['M. & Mme Moreau', 'A. Leclerc'],
    ['Famille Nguyen', 'P. Girard'],
    ['R. Haddad', 'Mme Dubois'],
    ['J.-P. Martin', 'S. Rossi'],
  ] as [string, string][],
  /** The floors' names, painted by each landing. */
  floorNames: ['5e', '4e', '3e', '2e', '1er', 'RDC'],
  /** Our landing's other door, and where it is; the other floors' two doors stand at `doorX`. */
  ourNeighbour: 'Mme Roux',
  ourNeighbourX: 2.3,
  doorX: [-0.8, 2.3] as [number, number],
  /**
   * How the residents get about the stairs (local x, z): the line walked across a landing, down the
   * middle of each flight, across the half landings; the spot in front of a door, of the lift's
   * gate, and where the hall's walkers go out of (and come in by) the street door.
   */
  walk: {
    landingZ: -1.15,
    flightAX: -0.9,
    flightBX: 2.4,
    /** The flights' ends, just off the landings. */
    flightTopZ: -1.7,
    flightFootZ: -4.35,
    halfLandingZ: -5.05,
    /** In front of a door (its z), in front of the lift's gate, the hall's middle, the street door. */
    doorZ: -0.85,
    liftGate: [0.75, -1.3] as [number, number],
    hall: [2.1, 1.2] as [number, number],
    /** In front of the sas's glass door (the partition stands at z 4.2). */
    streetDoor: [2.1, 3.8] as [number, number],
  },
  /**
   * The residents seen on the stairs: who (landing `k`, door `i` of that landing), when they go out
   * and come home (the game's hours), whether they take the lift (only ours and the hall have a
   * stop), and a few words for a chat.
   */
  residents: [
    { k: 0, i: 0, out: 9.5, back: 17, lift: true, seed: 11, lines: ['The lift is a blessing at my age, young man.', 'Your cat was on the landing again. Charming creature.', 'All those little boxes you carry up! Games, is it?'] },
    { k: 1, i: 0, out: 8, back: 18.5, lift: false, seed: 23, lines: ['Morning! Off to work, as ever.', 'We heard music from your flat. Old video games? My son loves those.', 'Mind the third step, it creaks.'] },
    { k: 2, i: 1, out: 7.5, back: 19, lift: false, seed: 37, lines: ['Stairs are my gym.', 'There is a new arcade machine down the street, I hear.', 'You collect games? I had a Game Boy once. No idea where it went.'] },
    { k: 3, i: 0, out: 10, back: 20, lift: false, seed: 41, lines: ['Hello, neighbour.', 'The flea market had a lot of cartridges this week.', 'If you ever want to swap games, knock on my door.'] },
    { k: 4, i: 1, out: 8.5, back: 18, lift: false, seed: 59, lines: ['Ciao!', 'The postman came by earlier, he looked lost.', 'I am on the first floor: I never take the lift.'] },
  ] as { k: number; i: number; out: number; back: number; lift: boolean; seed: number; lines: string[] }[],
  /** The postman on our landing, waiting by the front door clear of its leaf's swing (local x, z; yaw towards the door). */
  postman: { at: [-2.4, -0.72] as [number, number], yaw: -Math.PI / 2, seed: 77 },
};
