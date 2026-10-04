import type { RoomOptions } from '../Room';
import { STOREY, STOREYS } from '../measures/building';

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

// The storey height and count and `landingY` are the building's measures (`measures/building`): the stairwell's
// classes and the other zones that climb it read them there, this plan lays the landings out with them.

/** The zone's box (the bounds the player is "in the stairwell" inside): from the landing strip to the street door, hall to roof. */
export const STAIRWELL_ROOM: RoomOptions = { width: 7.14, depth: 11.7, height: STOREYS * STOREY + 2.8 };

/** Rectangles on the floor (local x0, x1, z0, z1). */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * A resident met on the stairs (`STAIRWELL_PLAN.residents`): landing `k`, door `i`, the hours they go out and come
 * back, whether they take the lift, their look's seed, a few hellos of their own (said passing the player, in turn) and
 * their chat lines, in turn: a line may be for the `morning` (before noon), the `day` or the `evening` (from 18:00)
 * only, or only once a cat lives in the flat (`needsCat`).
 */
export interface ResidentOnStairs {
  k: number;
  i: number;
  out: number;
  back: number;
  lift: boolean;
  seed: number;
  /** Their murmur's voice, `pitch` 0 (deep) .. 1 (light). */
  voice: { pitch: number };
  hello: string[];
  lines: (string | { text: string; when?: 'morning' | 'day' | 'evening'; needsCat?: boolean })[];
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
  liftSpeed: 3.5,
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
  /** The window onto the courtyard on every half landing's south wall (local x of its middle; size; sill over the half landing). */
  courtyardWindow: { x: 1.35, width: 0.9, height: 1.3, sill: 1.0 },
  /**
   * The mailboxes on the hall's west wall (`y` their middle): a flap a flat, ours first (`ours`), then the residents'
   * surnames floor by floor, the concierge's, the rest blank.
   */
  mailboxes: { x: 0.62, y: 1.05, z: 2.6, rows: 3, columns: 6, ours: '5TH · YOU', concierge: 'CONCIERGE' },
  /** Who lives behind the neighbours' doors on each landing (floor 4 down to 1), two a floor (their doors: `doors`). */
  neighbours: [
    ['Mr & Mrs Moreau', 'A. Leclerc'],
    ['The Nguyens', 'P. Girard'],
    ['R. Haddad', 'Mrs Dubois'],
    ['J.-P. Martin', 'S. Rossi'],
  ] as [string, string][],
  /** The floors' names, painted by each landing. */
  floorNames: ['5th', '4th', '3rd', '2nd', '1st', 'G'],
  /** On our landing the west wall is the strip's opening: the name goes on the north wall, just past it, at this x. */
  ourFloorNameX: -0.9,
  /** Our landing's other door, and where it is; the other floors' two doors stand at `doorX`. */
  ourNeighbour: 'Mrs Roux',
  ourNeighbourX: 2.3,
  doorX: [-0.8, 2.3] as [number, number],
  /**
   * Each neighbour's door, landing by landing as `neighbours` (ours first: Mrs Roux's), door by door: its paint, its
   * doormat (none: null), what a knock gets while they are home (`line`), and what is heard behind it then (`sound`: a
   * TV, a dog, a piano, in its hours; out of them the knock gets footsteps). Nobody home, nobody answers.
   */
  doors: [
    [{ color: 0x3a4a5a, mat: 0x6a5040, line: 'A TV behind the door, loud.', sound: { voice: 'tv', from: 7, to: 24 } }],
    [
      { color: 0x5a2e2a, mat: 0x4a5a3a, line: 'Someone is practising the piano. Badly.', sound: { voice: 'piano', from: 9.5, to: 21 } },
      { color: 0x2f4a3a, mat: null, line: 'It smells of onions frying.' },
    ],
    [
      { color: 0x3a2e28, mat: 0x8a6a3a, line: 'You hear laughter, and a game show.', sound: { voice: 'tv', from: 11, to: 23.5 } },
      { color: 0x7a6a52, mat: 0x5a4a3a, line: 'A dog barks once, then thinks better of it.', sound: { voice: 'dog', from: 0, to: 24 } },
    ],
    [
      { color: 0x2a3a4a, mat: 0x7a3a2a, line: 'A kettle whistles, then stops. “Just a minute!” Nobody comes.' },
      { color: 0xe2dccf, mat: 0x6a5a48, line: 'The news on the TV, turned up for the deaf.', sound: { voice: 'tv', from: 8, to: 22 } },
    ],
    [
      { color: 0x4a3a4a, mat: null, line: 'A radio sings along with someone. Or the other way round.' },
      { color: 0x6a4a2a, mat: 0x3a4a5a, line: 'A small dog yaps, then a “shh!”.', sound: { voice: 'dog', from: 7, to: 23 } },
    ],
  ] as { color: number; mat: number | null; line: string; sound?: { voice: 'tv' | 'dog' | 'piano'; from: number; to: number } }[][],
  /** What a knock gets with nobody home, and with them home out of their sound's hours. */
  knock: { nobody: 'Nobody answers.', quiet: 'Footsteps behind the door, then nothing.' },
  /** The cellar door at the foot of the stairs, off the hall. */
  cellar: { label: 'The cellars', line: 'Locked. It always is.' },
  /**
   * The door out to the courtyard (`world/courtyard`, a travel door: the passage behind it runs down the shaft's east
   * side to our back wall), at the foot of the stairs on the shaft's east wall, across the ground floor's landing
   * (`at` local x, z; yaw faces it west onto the landing). `arrival`: where the player comes back in, facing the stairs
   * (`worldPlan`'s stairwell travel arrivals).
   */
  courtyardDoor: { at: [2.995, -1.11] as [number, number], yaw: -Math.PI / 2, width: 0.85, height: 2.05, arrival: { at: [2.35, -1.11] as [number, number], yaw: Math.PI / 2 } },
  /** Behind a neighbour's door, how far into their flat and how high its sound comes from (m off the door, over the landing). */
  behindDoor: { z: 1.2, y: 1.2 },
  /** The floor's name, this high on the wall over its landing, this far off the wall (the endless night's plates hang over it). */
  floorNameY: 1.55,
  floorNameOff: 0.01,
  /**
   * The stairwell's own air (`HallTone`): over every other landing (`landings`, `offset` from the landing's floor at
   * `x`, `z`) and one in the hall; the street heard behind the street door, this far in and this high.
   */
  hallTone: { landings: [0, 2, 4], x: 0.75, offset: -0.3, z: -3.0, hall: [2.1, 1.6, 1.5] as [number, number, number] },
  streetBehind: { inset: 0.4, y: 1.6 },
  /** The third step of the 4th floor's flight down creaks, as Mrs Moreau says (landing `k`, flight, tread from the top). */
  creak: { k: 1, flight: 'A' as 'A' | 'B', tread: 3 },
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
    {
      k: 0, i: 0, out: 9.5, back: 17, lift: true, seed: 11, voice: { pitch: 0.12 },
      hello: ['Ah, hello, young man.', 'Good day to you.', 'There you are.'],
      lines: [
        'The lift is a blessing at my age, young man.',
        { text: 'Your cat was on the landing again. Charming creature.', needsCat: true },
        'All those little boxes you carry up! Games, is it?',
      ],
    },
    {
      k: 1, i: 0, out: 8, back: 18.5, lift: false, seed: 23, voice: { pitch: 0.72 },
      hello: ['Hiya!', 'Oh, hi!', 'Hey, neighbour!'],
      lines: [
        { text: 'Morning! Off to work, as ever.', when: 'morning' },
        { text: 'Home at last. What a day.', when: 'evening' },
        'We heard music from your flat. Old video games? My son loves those.',
        'Mind the third step, it creaks.',
      ],
    },
    {
      k: 2, i: 1, out: 7.5, back: 19, lift: false, seed: 37, voice: { pitch: 0.45 },
      hello: ['Hey!', 'Morning, or whatever it is.', 'Up and down, up and down.'],
      lines: ['Stairs are my gym.', 'There is a new arcade machine down the street, I hear.', 'You collect games? I had a Game Boy once. No idea where it went.'],
    },
    {
      k: 3, i: 0, out: 10, back: 20, lift: false, seed: 41, voice: { pitch: 0.28 },
      hello: ['Hello, neighbour.', 'Ah, the collector.', 'Hello again.'],
      lines: ['Hello, neighbour.', 'The flea market had a lot of cartridges this week.', 'If you ever want to swap games, knock on my door.', 'Old Vasseur used to say the lift went higher than the 5th, if you asked it nicely. He scratched something in the car, I think.'],
    },
    {
      k: 4, i: 1, out: 8.5, back: 18, lift: false, seed: 59, voice: { pitch: 0.86 },
      hello: ['Hi there!', 'Hey hey!', 'Oh, hello!'],
      lines: ['Hi there!', 'The postman came by earlier, he looked lost.', 'I am on the first floor: I never take the lift.'],
    },
  ] as ResidentOnStairs[],
  /** The postman on our landing, waiting by the front door clear of its leaf's swing (local x, z; yaw towards the door). */
  postman: { at: [-2.4, -0.72] as [number, number], yaw: -Math.PI / 2, seed: 77 },
  /**
   * Théo, the attic's student (`social/people/building` 'student'), some nights (`share` of game days) on our landing
   * between `hours` (game hours, past 24 the small hours), waiting for the lift up to the attic: a step off its gate
   * (`fromGate`, m along x), headphones on, facing the stairs (`yaw`).
   */
  student: { seed: 151, hours: [22, 26] as [number, number], share: 0.6, fromGate: -0.9, yaw: Math.PI * 0.5 },
  /**
   * The estate sale on its days (`world/estateSale`, `building/estateSale`): the trestle table along the hall's west
   * wall in front of the mailboxes (its middle, turned so the buyers stand on the hall's side), the crate past it, the
   * late Mr Lambert's niece by the table's stairs end; the hours it is laid out. His name stays on a mailbox.
   */
  estateSale: {
    table: { at: [0.97, 2.7] as [number, number], yaw: Math.PI / 2 },
    crate: { at: [0.88, 3.85] as [number, number], yaw: Math.PI / 2 },
    seller: { at: [1.1, 1.62] as [number, number], yaw: Math.PI * 0.6, seed: 113 },
    hours: [9, 20] as [number, number],
    mailbox: 'LAMBERT',
  },
  /**
   * The hall's west wall (x 0.6, facing +x), from the stairs: the ballot box of the co-owners' meeting (`ballot`, its
   * middle's z and height), the building's notice board over it (`board`: middle, size), the mailboxes past them.
   */
  board: { z: 0.95, y: 1.55, width: 0.95, height: 0.7 },
  ballot: { z: 0.95, y: 1.0 },
  /**
   * The concierge's lodge, behind the hall's east wall (x 3.6, facing -x): its glazed door (`door`: the middle's z),
   * the window she is seen through (`window`: z of its middle, width, sill and height, the lace curtain's share of it),
   * the room behind (local x, z, its height), where she stands at the glass, the Christmas box on the sill.
   */
  lodge: {
    door: { z: 2.0 },
    window: { z: 3.3, width: 1.1, sill: 1.0, height: 1.25, curtain: 0.55 },
    room: { x0: 3.6, x1: 5.3, z0: 1.5, z1: 4.1, height: 2.7 },
    stand: [4.1, 3.3] as [number, number],
    tipBox: { z: 3.7, price: 10 },
  },
  /**
   * Mme Pereira, the concierge: behind her glass in her hours, some mornings mopping a landing instead (`mop`: the
   * share of mornings, its hours, where on the landing); the errand she asks before handing over the cellar key (the
   * timer buttons of the floors `errandFloors` tried, one of them sticky), her lines.
   */
  concierge: {
    name: 'Mme Pereira',
    seed: 97,
    voice: { pitch: 0.38 },
    hours: [
      [8, 12],
      [15, 19],
    ] as [number, number][],
    mop: { share: 0.35, from: 9, to: 11, at: [0.9, -1.0] as [number, number], yaw: Math.PI },
    errandFloors: [1, 2, 3, 4],
    /** The floor whose button sticks. */
    sticky: 3,
    hello: 'Ah, you are the new one on the fifth. Pereira, the concierge. The lodge is open mornings and afternoons.',
    lines: [
      'Parcels go to your door now. The postman takes the lift, the lazy thing.',
      'The light on the stairs is on a timer. Press the button, it stays on for a while.',
      'Mrs Dubois watered my plants once. Once.',
      'The rear building has no lift. They complain at every meeting.',
      'Wipe your feet. I have just done the hall.',
    ],
    askKey: 'Your cellar? Number five. I keep the keys. Do me a favour first: the electrician says one of the timer buttons sticks, and my knees are not what they were. Try the button on every floor, the first to the fourth, and tell me which one.',
    stillAsking: 'The timer buttons, first to fourth floor. Which one sticks?',
    given: 'The third floor\u2019s sticks? I knew it. Here: your cellar key. Number five, at the end on the left. Mind the step.',
    after: 'The cellars? Take a torch. The light in there is older than me.',
    tipThanks: 'For the Christmas box? You are a dear.',
    tipKey: 'Oh, you are a dear. Here, take your cellar key, and do not tell the syndic.',
    closed: { lunch: 'Back at 3 pm', night: 'Closed', stairs: 'On the stairs' },
  },
  /** The timer buttons: on every floor landing's north wall at this x (clear of the doors), this high. */
  timerButton: { x: 0.15, y: 1.2 },
  /**
   * What the co-owners' votes change (`stairwell/coproLook`): the runner on the flights (its width), the plants under the
   * courtyard windows (local x, z off the half landing), the bikes along the hall's east wall (z each), the mirror on the
   * hall's east wall, the doormat in the sas (z), the fibre's junction box (hall, by the opening), the lift's plaque.
   */
  coproLook: {
    runner: { width: 0.72 },
    plant: { x: 2.65, z: -5.45 },
    /** Along the hall's east wall, before the lodge's door: each bike's middle (x, z). */
    bikes: [
      [3.32, 0.45],
      [3.08, 0.75],
    ] as [number, number][],
    /** On the hall's west wall, past the mailboxes (x 0.6, facing +x). */
    mirror: { z: 3.75, y: 1.55, width: 0.62, height: 1.35 },
    /** In front of the sas's glass door. */
    doormat: { z: 3.95 },
    fibre: { z: -0.15, y: 2.25 },
    /** On the shaft's north wall by the lift, at the foot (x, height). */
    liftPlaque: { x: 0.3, y: 1.65 },
  },
  /** The co-owners' meeting in the hall on its day (`building/coproMeeting`): the syndic's place, the folding chairs' (x, z), facing him. */
  meeting: {
    syndic: [2.1, 0.35] as [number, number],
    chairs: [
      [1.5, 1.4],
      [2.1, 1.4],
      [2.7, 1.4],
      [1.5, 2.1],
      [2.1, 2.1],
      [2.7, 2.1],
    ] as [number, number][],
  },
};
