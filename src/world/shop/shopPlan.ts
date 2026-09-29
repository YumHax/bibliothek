import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { HomeShop } from '@/economy/homeGoods';
import type { HomeUpgrade } from '@/economy/HomeUpgrades';
import type { TagStyle } from './PriceTag';
import type { TvWallOptions } from './TvWall';
import type { GoodsShelfOptions } from './GoodsShelf';
import type { FlowerStandOptions } from './FlowerStand';
import type { DisplayTableOptions } from './DisplayTable';
import type { RugRollsOptions } from './RugRolls';
import type { ShopChore } from './ShopClerk';
import type { ShopBrowsing } from './ShopCustomer';

/*
 * THE SHOPS OF FRONT STREET, INSIDE: the furniture shop (SECOND HOME), the TV repair shop, the pet shop (PAWS & CLAWS)
 * and the florist, each a room of its own reached by travel from its door on the street (`streetPlan.SHOP_ZONE_OF`),
 * the way RETRO GAMES leads to the flea market. Zone-local coordinates, origin at the centre of the floor; walls as
 * named from the way in: the exit door on the front wall (+z), as big as the shop's door on the street, and the shop
 * window beside it (the street painted behind the glass, lit by the sky); the arrival just inside it facing -z. What
 * the flat can be sold stands on the floor or on a table with its price tag (`displays`: a first click arms it, the
 * second buys it); the counter at the back has the whole list (`HomeShopPanel`) and the clerk behind it, who goes off
 * on a chore now and then (`clerk.chores`) and thanks the player for a sale. Another customer drops in now and then
 * (`customer`). The rest is the shop's own (`fixtures`, each with its sound: the fish tank's bubbler, the TV wall's
 * snow, the budgies' cage, the clock, the radio on the bench) and what it sounds like (`sounds`; a room tone by the
 * window). The window's lettering and the counter's paint are the shop's own in the street (`city/SHOP_LOOKS`), and the
 * view through the glass is what its door on the street looks out on (`shopOutlook`).
 */

/** The shops' zones (`ZoneId`s of kind `shop`). */
export type ShopZoneId = 'furnitureShop' | 'tvShop' | 'petShop' | 'flowerShop';

/** The shop's own furniture, not for sale: a TV wall, shelves of stock, the fish tank, the flower stand, the tables the small pieces stand on. */
export type ShopFixture =
  | { kind: 'tvWall'; at: Placement; options?: TvWallOptions }
  | { kind: 'goodsShelf'; at: Placement; options: GoodsShelfOptions }
  | { kind: 'fishTank'; at: Placement }
  | { kind: 'flowerStand'; at: Placement; options?: FlowerStandOptions }
  /** A table the displays can stand `on` (by `id`). */
  | { kind: 'table'; id: string; at: Placement; options?: DisplayTableOptions }
  /** Rugs rolled up in a corner (the origin in the corner's angle). */
  | { kind: 'rugRolls'; at: Placement; options?: RugRollsOptions }
  /** A sack truck with a carton on it. */
  | { kind: 'trolley'; at: Placement }
  /** A wall clock, ticking (the shop's time). */
  | { kind: 'clock'; at: Placement }
  /** A radio set, on all day (`kitchen/Radio`, the shop's `ShopRadio` its voice), `on` a table (by `id`) or the counter. */
  | { kind: 'radio'; on: string | 'counter'; spot: [x: number, z: number]; yaw?: number }
  /** The budgies' cage on its floor stand, their chatter (`PetShopNoises`) from it. */
  | { kind: 'birdcage'; at: Placement };

/** A sound of the shop's own with nothing to see, at a point (zone-local x, y, z): the hamster somewhere in the back. */
export type ShopSound = { kind: 'pets'; at: [x: number, y: number, z: number] };

/** One piece of the flat on show: where (on the floor, on a wall, or `on` a table at a spot of its top), which look, its tag. */
export type ShopDisplay = {
  good: HomeUpgrade;
  /** Which look (`displayPieces`: the plants' kinds, the prints' motifs, the armchairs' cushions). */
  variant?: number;
  tag?: TagStyle;
  /** Blocks the player; default true (false for rugs, prints, what stands on a table). */
  collides?: boolean;
} & ({ at: Placement } | { on: string; spot: [x: number, z: number]; yaw?: number });

export interface ShopPlan {
  /** Whose goods (`HOME_GOODS`) it sells. */
  shop: HomeShop;
  /** The shop's colour: its counter, the band across its price tags (its joinery in the street, `SHOP_LOOKS`). */
  accent: number;
  room: RoomOptions;
  /** Where the teleport sets the player down: just inside the exit, facing the shop (-z). */
  arrival: { at: [x: number, z: number]; yaw: number };
  exit: Placement;
  /** The front window by the exit: where along the front wall, how big (its name and view are the street's). */
  window: { along: number; width: number; height: number };
  lamp: { kind: 'pendant' | 'flush'; at: Placement; switchAt: Placement };
  counter: { at: Placement; width: number };
  clerk: {
    seed: number;
    lines: readonly string[];
    callOuts?: readonly string[];
    /** After a sale, one of these. */
    thanks: readonly string[];
    /** What they go and do when the shop is quiet: paths start behind the counter. */
    chores: readonly ShopChore[];
  };
  /** Another customer dropping in now and then. */
  customer: ShopBrowsing & { seed: number; lines: readonly string[] };
  fixtures: readonly ShopFixture[];
  sounds?: readonly ShopSound[];
  displays: readonly ShopDisplay[];
}

/** A shop room: no doorway (teleport only), every wall light-tight; its one window looks onto the street (`ShopWindow`, `outlook/`). */
function shopRoom(width: number, depth: number, finish: RoomOptions['finish']): RoomOptions {
  return { width, depth, height: 3, opaqueWalls: ['front', 'back', 'left', 'right'], finish: { moulding: false, ...finish } };
}

const FRONT_EXIT: Placement = { wall: 'front', along: 0, y: 0 };
/** The exit's leaf: as wide and tall as the shop's door on the street (`furnishStreet`). */
export const SHOP_DOOR = { width: 1.3, height: 2.5 };
const arrival = (depth: number): ShopPlan['arrival'] => ({ at: [0, depth / 2 - 0.9], yaw: 0 });
/** Where another customer comes in and goes out: just inside the exit, on its latch side, clear of the arrival spot. */
const customerDoor = (depth: number): [x: number, z: number] => [0.45, depth / 2 - 0.45];

const FURNITURE_ROOM = shopRoom(10, 8, { walls: 0xe8dcc8, ceiling: 0xf2ede4, trim: 0x6a5a48 });
const TV_ROOM = shopRoom(6, 5, { floor: 'concrete', walls: 0xc8ccc4, ceiling: 0xd8d8d4, trim: 0x4a4e52 });
const PETS_ROOM = shopRoom(6, 5, { floor: 'tiles', walls: 0xe4ecd8, ceiling: 0xf4f4ee, trim: 0x5a7a4a });
const FLORIST_ROOM = shopRoom(6, 5, { floor: 'concrete', walls: 0xeae4dc, ceiling: 0xf4f0ea, trim: 0x6a7a5a });

export const SHOP_PLANS: Record<ShopZoneId, ShopPlan> = {
  // SECOND HOME, across the street by the pharmacy: a showroom of second-hand furniture, a bedroom along the back
  // wall, a living room in the middle, a kitchen and a reading corner on the right, the hall and the prints on the left.
  furnitureShop: {
    shop: 'furniture',
    accent: 0x7a5234,
    room: FURNITURE_ROOM,
    arrival: arrival(FURNITURE_ROOM.depth),
    exit: FRONT_EXIT,
    lamp: { kind: 'pendant', at: { ceiling: [0, 0] }, switchAt: { wall: 'front', along: -0.8, y: 1.1 } },
    counter: { at: { floor: [3.9, 2.4], rotationY: -Math.PI / 2 }, width: 1.6 },
    clerk: {
      seed: 71,
      lines: [
        '“Whatever you buy goes up your stairs today. Five floors, and the lads don’t complain. Much.”',
        '“That armchair? Came out of a house on Park Street. Sat in by a retired projectionist.”',
        '“The bed is only for looking at, I’m afraid. The last man who tried it slept till closing.”',
        '“The list of everything is on the counter, if you’d rather not walk round.”',
      ],
      callOuts: ['All in good nick!', 'Delivered today!'],
      thanks: [
        '“Good choice. It’ll be upstairs by tonight: the lads are on their way.”',
        '“Sold! Mind the stairs when they bring it up, it’s heavier than it looks.”',
        '“Lovely. That one’s been waiting for the right flat.”',
      ],
      chores: [
        // Straightens the kitchen chairs, then back behind the counter.
        { path: [[4.55, 1.5], [4.45, -0.9], [3.9, -1.05]], yaw: Math.PI, pose: 'play', seconds: 6, mutter: 'There.' },
        // A look at the reading corner's lamp.
        { path: [[4.55, 1.6], [3.2, 1.3], [2.5, 1.25]], yaw: Math.PI, pose: 'think', seconds: 5 },
      ],
    },
    customer: {
      seed: 5,
      door: customerDoor(FURNITURE_ROOM.depth),
      hub: [0.3, 2.3],
      spots: [
        { at: [-0.6, 1.5], yaw: Math.PI },
        // Off the spot the clerk looks over the reading corner's lamp from.
        { at: [1.75, 1.85], yaw: Math.PI },
        { at: [-3.0, 0.0], yaw: Math.PI },
      ],
      lines: ['“Just looking. My wife wants a sideboard. I want a bed.”', '“Everything here has a story, he says. I just want a chair.”'],
    },
    window: { along: -3.0, width: 2.2, height: 1.85 },
    fixtures: [
      // Cushions and table lamps on the front wall's shelf, the rugs still rolled up in the back corner, the sack truck by the counter.
      { kind: 'goodsShelf', at: { wall: 'front', along: 2.6, y: 0 }, options: { width: 1.4, shelves: 4, stock: 'homewares', seed: 17 } },
      { kind: 'rugRolls', at: { floor: [4.95, -3.95], rotationY: -Math.PI / 2 }, options: { count: 4, seed: 23 } },
      { kind: 'trolley', at: { floor: [4.45, 3.55], rotationY: -Math.PI / 2 } },
      // The shop's clock over the dresser and the mirror, ticking.
      { kind: 'clock', at: { wall: 'back', along: 0.2, y: 2.1 } },
    ],
    displays: [
      // The bedroom along the back wall.
      { good: 'bed', at: { wall: 'back', along: -3.0, y: 0 } },
      { good: 'nightstands', at: { wall: 'back', along: -1.8, y: 0 } },
      { good: 'bedroomRug', at: { floor: [-3.0, -1.5] }, collides: false, tag: 'card' },
      { good: 'dresser', at: { wall: 'back', along: -0.4, y: 0 } },
      { good: 'mirror', at: { wall: 'back', along: 0.75, y: 0 } },
      { good: 'sideboard', at: { wall: 'back', along: 2.6, y: 0 } },
      // The living room in the middle.
      { good: 'livingRug', at: { floor: [-0.6, 0.45] }, collides: false, tag: 'card' },
      { good: 'armchair', variant: 0, at: { floor: [-1.15, 0.35], rotationY: 0.5 } },
      { good: 'armchair', variant: 1, at: { floor: [0.0, 0.35], rotationY: -0.5 } },
      { good: 'sideTable', at: { floor: [-0.55, -0.15] } },
      { good: 'floorLamp', at: { floor: [-1.95, -0.3] } },
      { good: 'floorCushions', at: { floor: [1.0, 1.1], rotationY: 0.3 }, tag: 'card' },
      // A kitchen and a reading corner on the right.
      { good: 'kitchenTable', at: { floor: [3.9, -1.9] } },
      // The runner under the table, as it would lie in the kitchen.
      { good: 'kitchenRug', at: { floor: [3.9, -1.9] }, collides: false, tag: 'card' },
      { good: 'readingCorner', at: { floor: [2.2, 0.3], rotationY: -0.4 } },
      // The hall and the walls on the left, the balcony's set by the window.
      { good: 'framedPrint', variant: 0, at: { wall: 'left', along: -2.6, y: 1.65 }, collides: false, tag: 'wall' },
      { good: 'framedPrint', variant: 1, at: { wall: 'left', along: -1.9, y: 1.65 }, collides: false, tag: 'wall' },
      { good: 'framedPrint', variant: 2, at: { wall: 'left', along: -1.2, y: 1.65 }, collides: false, tag: 'wall' },
      { good: 'hallStand', at: { wall: 'left', along: 0.3, y: 0 } },
      { good: 'bathMat', at: { floor: [-4.1, 1.7] }, collides: false, tag: 'card' },
      { good: 'bistroSet', at: { floor: [-3.5, 2.8] } },
    ],
  },
  // TV REPAIR, the workshop on Park Street: a wall of sets all showing snow, the bench with the projector on it, the
  // tables with the sets and the kitchen things for sale, shelves of spares.
  tvShop: {
    shop: 'electronics',
    accent: 0x2e5a8a,
    room: TV_ROOM,
    arrival: arrival(TV_ROOM.depth),
    exit: FRONT_EXIT,
    lamp: { kind: 'flush', at: { ceiling: [0, 0] }, switchAt: { wall: 'front', along: -1.0, y: 1.1 } },
    counter: { at: { floor: [-1.9, -1.3] }, width: 1.3 },
    clerk: {
      seed: 83,
      lines: [
        '“Everything on the tables is tested. The wall? Those are waiting for their owners.”',
        '“Projectors? I have one on the bench. Runs like new.”',
        '“A soldering iron, a radio in pieces, a smell of warm dust. You get used to it.”',
        '“They all show snow because there is nothing on. Nothing worth watching, anyway.”',
      ],
      callOuts: ['All tested!'],
      thanks: [
        '“There you go. If it ever goes fuzzy, you know where I am.”',
        '“Good pick. Give it a knock on the side if it sulks.”',
        '“Sold. It’ll be upstairs tonight, warmed up and all.”',
      ],
      chores: [
        // A knock on a set of the wall that has gone too quiet.
        { path: [[-1.0, -1.85], [0.2, -1.75]], yaw: Math.PI, pose: 'play', seconds: 4, sound: 'tap', mutter: 'Come on, you.' },
        // A look over the bench.
        { path: [[-1.0, -1.85], [1.4, -1.5], [1.75, -0.4]], yaw: Math.PI / 2, pose: 'think', seconds: 6 },
      ],
    },
    customer: {
      seed: 11,
      door: customerDoor(TV_ROOM.depth),
      // Down the aisle between the two tables, not across the kitchen table's corner.
      entry: [0, 1.3],
      hub: [0, -0.4],
      spots: [
        { at: [0.8, -1.6], yaw: Math.PI },
        { at: [1.7, 0.0], yaw: Math.PI / 2 },
        { at: [-0.8, 0.05], yaw: 0 },
      ],
      lines: ['“He fixed my mum’s set in ten minutes. Twenty years it had been broken.”', '“Just waiting for my radio. It’s always tomorrow.”'],
    },
    window: { along: 1.8, width: 1.6, height: 1.7 },
    fixtures: [
      { kind: 'tvWall', at: { wall: 'back', along: 0.4, y: 0 }, options: { width: 3.4, rows: 3, seed: 9 } },
      { kind: 'goodsShelf', at: { wall: 'left', along: 0.6, y: 0 }, options: { width: 1.4, stock: 'spares', seed: 4 } },
      { kind: 'table', id: 'bench', at: { floor: [2.45, -0.3], rotationY: -Math.PI / 2 }, options: { width: 1.4, depth: 0.6, bench: true, wood: 0x6a5238 } },
      { kind: 'table', id: 'sets', at: { floor: [-0.8, 0.7] }, options: { width: 1.1, depth: 0.55 } },
      { kind: 'table', id: 'kitchen', at: { floor: [0.8, 0.7] }, options: { width: 1.1, depth: 0.55 } },
      // The radio on the bench, never off (its far end from the projector).
      { kind: 'radio', on: 'bench', spot: [-0.42, 0.05] },
    ],
    displays: [
      { good: 'projector', on: 'bench', spot: [0.25, 0.08], collides: false },
      { good: 'crt', on: 'sets', spot: [-0.25, 0], collides: false },
      { good: 'bedroomTv', on: 'sets', spot: [0.3, 0], collides: false },
      { good: 'radio', on: 'kitchen', spot: [-0.28, 0], collides: false },
      { good: 'appliances', on: 'kitchen', spot: [0.22, 0], collides: false },
      { good: 'speakers', at: { floor: [-2.2, 1.7] } },
    ],
  },
  // PAWS & CLAWS, by COMICS & MANGA: the rescue cat asleep in her basket, the scratching post, a table of toys, the
  // shelves of food and the tank of lazy fish.
  petShop: {
    shop: 'pets',
    // PAWS & CLAWS' teal in the street (`SHOP_LOOKS.pets`).
    accent: 0x2f6a6a,
    room: PETS_ROOM,
    arrival: arrival(PETS_ROOM.depth),
    exit: FRONT_EXIT,
    lamp: { kind: 'flush', at: { ceiling: [0, 0] }, switchAt: { wall: 'front', along: -1.0, y: 1.1 } },
    // Turned to face the room, the clerk behind it with their back a step off the right wall (x 3).
    counter: { at: { floor: [2.0, -1.0], rotationY: -Math.PI / 2 }, width: 1.3 },
    clerk: {
      seed: 97,
      lines: [
        '“She’s a rescue. She needs a quiet flat. Full of games, you say? Perfect.”',
        '“Her bowls and her bed go with her. You only need to love her.”',
        '“The fish aren’t for sale. They’re the shop’s. They know it, too.”',
        '“A scratching post saves an armchair. Ask anyone.”',
      ],
      thanks: [
        '“Thank you! She’ll be so happy. Well, she’ll pretend not to be.”',
        '“Good choice. It’ll be up at yours by tonight.”',
        '“Lovely. Tell her the fish say hello.”',
      ],
      chores: [
        // Feeding the fish: a pinch of flakes over the tank.
        // Round the counter's end (x 1.72..2.28, from z -1.65), not through it.
        { path: [[2.6, -2.05], [1.5, -2.0], [0.9, -1.5]], yaw: Math.PI, pose: 'play', seconds: 5, sound: 'feed', mutter: 'Breakfast!' },
      ],
    },
    customer: {
      seed: 19,
      door: customerDoor(PETS_ROOM.depth),
      hub: [0, 1.1],
      spots: [
        // By the back shelf, off the fish tank the clerk feeds, and clear of the scratching post on the way.
        { at: [-0.2, -1.55], yaw: Math.PI },
        { at: [1.4, 1.0], yaw: Math.PI / 2 },
        { at: [-2.2, 0.6], yaw: -Math.PI / 2 },
      ],
      lines: ['“I only came for the fish food. I always leave with a toy.”', '“Look at that one, asleep in her basket. I’d take her if I could.”'],
    },
    window: { along: 1.6, width: 1.4, height: 1.7 },
    fixtures: [
      { kind: 'goodsShelf', at: { wall: 'back', along: -1.3, y: 0 }, options: { width: 2.2, stock: 'pets', seed: 3 } },
      { kind: 'goodsShelf', at: { wall: 'left', along: 0.6, y: 0 }, options: { width: 1.4, stock: 'pets', seed: 7 } },
      { kind: 'fishTank', at: { floor: [0.9, -2.05] } },
      { kind: 'table', id: 'toys', at: { floor: [2.1, 1.0], rotationY: -Math.PI / 2 }, options: { width: 0.8, depth: 0.5, height: 0.7 } },
      // The budgies on their stand in the corner past the back shelf, the cage hung towards the room.
      { kind: 'birdcage', at: { floor: [-2.75, -2.25], rotationY: -Math.PI / 4 } },
    ],
    displays: [
      { good: 'cat', at: { floor: [-0.6, 0.3], rotationY: 0.4 }, collides: false, tag: 'card' },
      { good: 'scratcher', at: { floor: [0.6, 0.1] } },
      { good: 'catToy', on: 'toys', spot: [0, 0], collides: false },
    ],
  },
  // The florist, by the launderette: buckets of cut flowers on a stepped stand, the potted plants for the flat on the
  // floor and on the table, stacks of pots.
  flowerShop: {
    shop: 'florist',
    // The florist's plum in the street (`SHOP_LOOKS.florist`).
    accent: 0x5a3f6a,
    room: FLORIST_ROOM,
    arrival: arrival(FLORIST_ROOM.depth),
    exit: FRONT_EXIT,
    lamp: { kind: 'flush', at: { ceiling: [0, 0] }, switchAt: { wall: 'front', along: -1.0, y: 1.1 } },
    counter: { at: { floor: [1.8, -1.4] }, width: 1.3 },
    clerk: {
      seed: 59,
      lines: [
        '“A fig for the corner, a monstera by the window. Water them on Sundays.”',
        '“The cut flowers are for the street’s tables. The pots are for you.”',
        '“The balcony pots like the sun. The bathroom one likes the steam.”',
      ],
      thanks: [
        '“Lovely choice. It’ll be on your sill by tonight.”',
        '“Thank you! Water it on Sundays, and talk to it a bit.”',
        '“Sold. It liked you, I could tell.”',
      ],
      chores: [
        // Sprinkling the buckets on the stand.
        { path: [[0.9, -2.0], [0.6, -1.55], [-0.9, -1.5]], yaw: Math.PI, pose: 'play', seconds: 5, sound: 'water' },
      ],
    },
    customer: {
      seed: 29,
      door: customerDoor(FLORIST_ROOM.depth),
      hub: [-1.2, 1.2],
      spots: [
        // Along the flower stand, off the end the clerk sprinkles from.
        { at: [-1.75, -1.45], yaw: Math.PI },
        { at: [-2.3, 0.5], yaw: -Math.PI / 2 },
        { at: [0, 1.15], yaw: Math.PI },
      ],
      lines: ['“Tulips for my mother. She’ll say they’re the wrong colour.”', '“It smells like spring in here, whatever the weather.”'],
    },
    window: { along: 1.7, width: 1.5, height: 1.7 },
    fixtures: [
      { kind: 'flowerStand', at: { wall: 'back', along: -0.9, y: 0 }, options: { width: 2.4, seed: 21 } },
      { kind: 'goodsShelf', at: { wall: 'left', along: 0.5, y: 0 }, options: { width: 1.4, shelves: 3, stock: 'pots', seed: 5 } },
      { kind: 'table', id: 'pots', at: { floor: [0, 0.4] }, options: { width: 1.4, depth: 0.6, height: 0.72 } },
      // A clock on the right wall by the counter, a radio on the counter between the till and the bell.
      { kind: 'clock', at: { wall: 'right', along: -1.4, y: 2.0 } },
      { kind: 'radio', on: 'counter', spot: [0.05, -0.12] },
    ],
    displays: [
      { good: 'houseplant', variant: 0, at: { floor: [-1.9, 1.7] }, collides: false },
      { good: 'houseplant', variant: 1, at: { floor: [2.3, 1.6] }, collides: false },
      { good: 'houseplant', variant: 2, at: { floor: [2.3, 0.3] }, collides: false },
      { good: 'houseplant', variant: 3, on: 'pots', spot: [-0.45, 0], collides: false },
      { good: 'plant', variant: 0, on: 'pots', spot: [0.05, 0], collides: false },
      { good: 'plant', variant: 1, on: 'pots', spot: [0.5, 0.05], collides: false },
    ],
  },
};
