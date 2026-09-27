import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { HomeShop } from '@/economy/homeGoods';
import type { HomeUpgrade } from '@/economy/HomeUpgrades';
import type { TagStyle } from './PriceTag';
import type { TvWallOptions } from './TvWall';
import type { GoodsShelfOptions } from './GoodsShelf';
import type { FlowerStandOptions } from './FlowerStand';
import type { DisplayTableOptions } from './DisplayTable';

/*
 * THE SHOPS OF FRONT STREET, INSIDE: the furniture shop (SECOND HOME), the TV repair shop, the pet shop (PAWS & CLAWS)
 * and the florist, each a room of its own reached by travel from its door on the street (`streetPlan.SHOP_ZONE_OF`),
 * the way RETRO GAMES leads to the flea market. Zone-local coordinates, origin at the centre of the floor; walls as
 * named from the way in: the exit door on the front wall (+z), the arrival just inside it facing -z. What the flat can
 * be sold stands on the floor or on a table with its price tag (`displays`: a click buys it); the counter at the
 * back has the whole list (`HomeShopPanel`) and the clerk behind it. The rest is the shop's own (`fixtures`).
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
  | { kind: 'table'; id: string; at: Placement; options?: DisplayTableOptions };

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
  /** The shop's colour: its counter, the band across its price tags. */
  accent: number;
  room: RoomOptions;
  /** Where the teleport sets the player down: just inside the exit, facing the shop (-z). */
  arrival: { at: [x: number, z: number]; yaw: number };
  exit: Placement;
  lamp: { kind: 'pendant' | 'flush'; at: Placement; switchAt: Placement };
  counter: { at: Placement; width: number };
  clerk: { seed: number; lines: readonly string[]; callOuts?: readonly string[] };
  fixtures: readonly ShopFixture[];
  displays: readonly ShopDisplay[];
}

/** A shop room: no window, no doorway (teleport only), every wall light-tight. */
function shopRoom(width: number, depth: number, finish: RoomOptions['finish']): RoomOptions {
  return { width, depth, height: 3, opaqueWalls: ['front', 'back', 'left', 'right'], finish: { moulding: false, ...finish } };
}

const FRONT_EXIT: Placement = { wall: 'front', along: 0, y: 0 };
const arrival = (depth: number): ShopPlan['arrival'] => ({ at: [0, depth / 2 - 0.9], yaw: 0 });

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
        '“Try the bed. No, really. Everyone does.”',
        '“The list of everything is on the counter, if you’d rather not walk round.”',
      ],
      callOuts: ['All in good nick!', 'Delivered today!'],
    },
    fixtures: [],
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
      { good: 'kitchenRug', at: { floor: [1.9, -1.9] }, collides: false, tag: 'card' },
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
    },
    fixtures: [
      { kind: 'tvWall', at: { wall: 'back', along: 0.4, y: 0 }, options: { width: 3.4, rows: 3, seed: 9 } },
      { kind: 'goodsShelf', at: { wall: 'left', along: 0.6, y: 0 }, options: { width: 1.4, stock: 'spares', seed: 4 } },
      { kind: 'table', id: 'bench', at: { floor: [2.45, -0.3], rotationY: -Math.PI / 2 }, options: { width: 1.4, depth: 0.6, bench: true, wood: 0x6a5238 } },
      { kind: 'table', id: 'sets', at: { floor: [-0.8, 0.7] }, options: { width: 1.1, depth: 0.55 } },
      { kind: 'table', id: 'kitchen', at: { floor: [0.8, 0.7] }, options: { width: 1.1, depth: 0.55 } },
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
    accent: 0x3a8a4a,
    room: PETS_ROOM,
    arrival: arrival(PETS_ROOM.depth),
    exit: FRONT_EXIT,
    lamp: { kind: 'flush', at: { ceiling: [0, 0] }, switchAt: { wall: 'front', along: -1.0, y: 1.1 } },
    counter: { at: { floor: [2.3, -1.0], rotationY: -Math.PI / 2 }, width: 1.3 },
    clerk: {
      seed: 97,
      lines: [
        '“She’s a rescue. She needs a quiet flat. Full of games, you say? Perfect.”',
        '“Her bowls and her bed go with her. You only need to love her.”',
        '“The fish aren’t for sale. They’re the shop’s. They know it, too.”',
        '“A scratching post saves an armchair. Ask anyone.”',
      ],
    },
    fixtures: [
      { kind: 'goodsShelf', at: { wall: 'back', along: -1.3, y: 0 }, options: { width: 2.2, stock: 'pets', seed: 3 } },
      { kind: 'goodsShelf', at: { wall: 'left', along: 0.6, y: 0 }, options: { width: 1.4, stock: 'pets', seed: 7 } },
      { kind: 'fishTank', at: { floor: [0.9, -2.05] } },
      { kind: 'table', id: 'toys', at: { floor: [2.1, 1.0], rotationY: -Math.PI / 2 }, options: { width: 0.8, depth: 0.5, height: 0.7 } },
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
    accent: 0xc84a6a,
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
    },
    fixtures: [
      { kind: 'flowerStand', at: { wall: 'back', along: -0.9, y: 0 }, options: { width: 2.4, seed: 21 } },
      { kind: 'goodsShelf', at: { wall: 'left', along: 0.5, y: 0 }, options: { width: 1.4, shelves: 3, stock: 'pots', seed: 5 } },
      { kind: 'table', id: 'pots', at: { floor: [0, 0.4] }, options: { width: 1.4, depth: 0.6, height: 0.72 } },
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
