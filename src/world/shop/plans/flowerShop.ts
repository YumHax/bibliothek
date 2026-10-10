import type { ShopPlan } from '../shopPlan';
import { DOORMAT_AT, FRONT_EXIT, OPEN_SIGN_AT, arrival, customerDoor, shopRoom } from './shared';

// Old boards underfoot (the parquet the furniture shop has too: no new map on a floor).
const FLORIST_ROOM = shopRoom(6, 5, { floor: 'parquet', walls: 0xeae4dc, ceiling: 0xf4f0ea, trim: 0x6a7a5a });

// The florist, by the launderette: buckets of cut flowers on a stepped stand along the back under warm spots, the
// glass-door chiller humming on the right with the work table by the window, a living wall of ferns and a shelf of
// pots under trailing pothos on the left, a jasmine up a trellis by the door, baskets hanging from the ceiling and
// dried bunches over the counter; the potted plants for the flat on the floor and on the table, bouquets in the window.
export const FLOWER_SHOP: ShopPlan = {
  shop: 'florist',
  // The florist's plum in the street (`SHOP_LOOKS.florist`).
  accent: 0x5a3f6a,
  look: 'florist',
  room: FLORIST_ROOM,
  arrival: arrival(FLORIST_ROOM.depth),
  exit: FRONT_EXIT,
  lamp: { kind: 'flush', at: { ceiling: [0, 0] }, switchAt: { wall: 'front', along: -1.0, y: 1.1 } },
  // The chiller, the spots on the stand and the window's: three glows to lend real lights to.
  glowLights: 3,
  counter: { at: { floor: [1.8, -1.4] }, width: 1.3 },
  clerk: {
    seed: 59,
    lines: [
      '“A fig for the corner, a monstera by the window. Water them on Sundays.”',
      '“The cut flowers are for the street’s tables. The pots are for you.”',
      '“The balcony pots like the sun. The bathroom one likes the steam.”',
      '“The roses in the chiller came in at five this morning. So did I.”',
      '“Tulips, three for two. Nobody ever takes just the three.”',
    ],
    thanks: [
      '“Lovely choice. It’ll be on your sill by tonight.”',
      '“Thank you! Water it on Sundays, and talk to it a bit.”',
      '“Sold. It liked you, I could tell.”',
    ],
    chores: [
      // Sprinkling the buckets on the stand.
      { path: [[0.9, -2.0], [0.6, -1.55], [-0.9, -1.5]], yaw: Math.PI, pose: 'play', seconds: 5, sound: 'water' },
      // A bouquet to finish at the work table: round the counter's right end and along the chiller's front.
      { path: [[2.72, -2.0], [2.72, -0.95], [2.02, -0.9], [2.1, 0.9], [2.08, 1.37]], yaw: Math.PI / 2, pose: 'play', seconds: 8, mutter: 'Ribbon, ribbon…' },
    ],
  },
  customer: {
    seed: 29,
    door: customerDoor(FLORIST_ROOM.depth),
    hub: [-1.2, 1.2],
    spots: [
      // Along the flower stand, off the end the clerk sprinkles from.
      { at: [-1.75, -1.45], yaw: Math.PI },
      // At the fern wall, off the fig in front of the pots.
      { at: [-2.2, -0.9], yaw: -Math.PI / 2 },
      { at: [0, 1.15], yaw: Math.PI },
      // At the chiller's glass, clear of the clerk's way along it.
      { at: [1.6, 0.05], yaw: Math.PI / 2 },
    ],
    lines: [
      '“Tulips for my mother. She’ll say they’re the wrong colour.”',
      '“It smells like spring in here, whatever the weather.”',
      '“Which ones say sorry without saying too much sorry?”',
    ],
  },
  window: { along: 1.7, width: 1.5, height: 1.7 },
  fixtures: [
    // The shop's name over the back wall, the OPEN card on the door's glass, the mat inside the door (`common/`).
    { kind: 'prop', prop: 'nameBoard', options: { width: 1.5, height: 0.34 }, at: { wall: 'back', along: -0.9, y: 2.35 } },
    { kind: 'prop', prop: 'openSign', at: OPEN_SIGN_AT },
    { kind: 'prop', prop: 'doormat', options: { width: 0.95, depth: 0.55 }, at: DOORMAT_AT(FLORIST_ROOM.depth) },

    // The back: the stepped stand of cut flowers under a track of warm spots, today's prices chalked behind the counter.
    { kind: 'flowerStand', at: { wall: 'back', along: -0.9, y: 0 }, options: { width: 2.4, seed: 21 } },
    { kind: 'prop', prop: 'trackSpots', options: { length: 2.0, count: 4, aim: 0.55, reach: 1.1, light: 1.0 }, at: { ceiling: [-0.9, -1.35], rotationY: Math.PI } },
    { kind: 'prop', prop: 'wallChalkboard', options: { lines: ['Today', 'Tulips 3 for 2', 'Roses £2 a stem', 'Bouquets made while you wait'], width: 0.62, height: 0.78 }, at: { wall: 'back', along: 1.75, y: 1.62 } },
    { kind: 'prop', prop: 'floorScuffs', options: { kind: 'petals', width: 2.3, depth: 0.55, amount: 0.7 }, at: { floor: [-0.9, -1.6] } },
    { kind: 'prop', prop: 'floorScuffs', options: { kind: 'heels', width: 1.3, depth: 0.5, amount: 0.5 }, at: { floor: [1.8, -0.85] } },

    // The right: the chiller, the work table by the window, its watering can under it.
    { kind: 'prop', prop: 'flowerChiller', at: { wall: 'right', along: 0, y: 0 } },
    { kind: 'table', id: 'work', at: { floor: [2.68, 1.37], rotationY: -Math.PI / 2 }, options: { width: 1.15, depth: 0.6, height: 0.86, wood: 0x8a6a48 } },
    { kind: 'prop', prop: 'floristBench', on: 'work', spot: [0, 0] },
    { kind: 'prop', prop: 'wateringCan', options: { buckets: false }, at: { floor: [2.72, 1.7], rotationY: Math.PI } },
    { kind: 'prop', prop: 'floorScuffs', options: { kind: 'petals', width: 1.2, depth: 0.7, amount: 0.8 }, at: { floor: [2.05, 1.37], rotationY: Math.PI / 2 } },
    { kind: 'prop', prop: 'notice', options: { lines: ['Weddings', '& all occasions', 'ask at the counter'], hand: 'hand', paper: 0xf4ecdc, ink: 0x5a3f6a }, at: { wall: 'right', along: 1.6, y: 1.62 } },

    // The left: a living wall of ferns, the shelf of pots with pothos spilling off its top.
    { kind: 'prop', prop: 'fernWall', at: { wall: 'left', along: -1.15, y: 0 } },
    // The day's buckets waiting to be sorted in the corner past the stand, a can beside them.
    { kind: 'prop', prop: 'wateringCan', at: { floor: [-2.55, -2.04], rotationY: -0.6 } },
    { kind: 'goodsShelf', at: { wall: 'left', along: 0.5, y: 0 }, options: { width: 1.4, shelves: 3, stock: 'pots', seed: 5 } },
    { kind: 'prop', prop: 'trailingPothos', options: { width: 1.34, trail: 0.75 }, at: { wall: 'left', along: 0.5, y: 1.36 } },

    // By the door: the jasmine up its trellis, left of the light switch.
    { kind: 'prop', prop: 'climbingTrellis', options: { width: 1.2, height: 2.3 }, at: { wall: 'front', along: -2.2, y: 0 } },

    // Overhead: baskets of greens (their vines above head height), dried bunches on a pole over the counter.
    {
      kind: 'prop',
      prop: 'hangingGreens',
      options: {
        baskets: [{ at: [-2.3, -0.4], drop: 0.4 }, { at: [-1.3, 0.7], drop: 0.4 }, { at: [0.95, 0.75], drop: 0.4 }, { at: [2.55, 1.35], drop: 0.6, trail: 0.45 }],
        rails: [{ at: [1.8, -1.4], length: 1.1, drop: 0.5 }],
      },
      at: { ceiling: [0, 0] },
    },

    // The middle table of pots for the flat.
    { kind: 'table', id: 'pots', at: { floor: [0, 0.4] }, options: { width: 1.4, depth: 0.6, height: 0.72 } },

    // The window: bouquets on a stepped stand, lit by two spots (the street sees the same).
    { kind: 'prop', prop: 'bouquetStand', on: 'windowDisplay', spot: [0, 0] },
    { kind: 'prop', prop: 'trackSpots', options: { length: 0.9, count: 2, aim: 0.5, reach: 0.9, light: 0.6 }, at: { ceiling: [1.7, 1.75] } },

    // A clock on the right wall by the counter, the radio and a jug of sweet peas on the counter.
    { kind: 'clock', at: { wall: 'right', along: -1.4, y: 2.0 } },
    { kind: 'radio', on: 'counter', spot: [0.05, -0.12] },
    { kind: 'prop', prop: 'counterFlowers', on: 'counter', spot: [0.45, -0.1] },
  ],
  displays: [
    // The fig before the shelf of pots, the monstera in the corner by the trellis, the yucca (the widest) by the
    // window, clear of its display bed and of the clerk's way to the work table.
    { good: 'houseplant', variant: 0, at: { floor: [-2.3, 0.55] }, collides: false },
    { good: 'houseplant', variant: 1, at: { floor: [1.3, 1.2] }, collides: false },
    { good: 'houseplant', variant: 2, at: { floor: [-2.05, 1.66] }, collides: false },
    { good: 'houseplant', variant: 3, on: 'pots', spot: [-0.45, 0], collides: false },
    { good: 'plant', variant: 0, on: 'pots', spot: [0.05, 0], collides: false },
    { good: 'plant', variant: 1, on: 'pots', spot: [0.5, 0.05], collides: false },
  ],
  // The season's cut flowers lying on the counter in brown paper, in front of the radio (three bunches for two: the board outside).
  errands: [{ errand: 'bunch', on: 'counter', spot: [-0.05, 0.14] }],
};
