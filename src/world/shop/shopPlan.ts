import type { RoomOptions } from '../Room';
import type { Placement } from '../Placement';
import type { HomeShop } from '@/economy/homeGoods';
import type { ErrandId } from '@/errands/errands';
import type { HomeUpgrade } from '@/economy/HomeUpgrades';
import type { TagStyle } from './PriceTag';
import type { TvWallOptions } from './TvWall';
import type { GoodsShelfOptions } from './GoodsShelf';
import type { FlowerStandOptions } from './FlowerStand';
import type { DisplayTableOptions } from './DisplayTable';
import type { RugRollsOptions } from './RugRolls';
import type { ShopChore } from './ShopClerk';
import type { ShopBrowsing } from './ShopCustomer';
import type { ShopPropName, ShopPropOptions } from './shopProps';
import { FURNITURE_SHOP } from './plans/furnitureShop';
import { TV_SHOP } from './plans/tvShop';
import { PET_SHOP } from './plans/petShop';
import { FLOWER_SHOP } from './plans/flowerShop';

export { SHOP_DOOR } from './plans/shared';

/*
 * THE SHOPS OF FRONT STREET, INSIDE: the furniture shop (SECOND HOME), the TV repair shop, the pet shop (PAWS & CLAWS)
 * and the florist, each a room of its own reached by travel from its door on the street (`streetPlan.SHOP_ZONE_OF`),
 * the way RETRO GAMES leads to the flea market. Each shop's plan is its own file (`plans/<shop>.ts`), its own props
 * in its own folder (`<shop>/props.ts`, docs/shops.md). Zone-local coordinates, origin at the centre of the floor;
 * walls as named from the way in: the exit door on the front wall (+z), as big as the shop's door on the street, and
 * the shop window beside it (the street behind the glass, lit by the sky), a display plinth inside it (`windowDisplay`);
 * the arrival just inside it facing -z. What the flat can be sold stands on the floor or on a table with its price tag
 * (`displays`: a first click arms it, the second buys it); the counter at the back has the whole list (`HomeShopPanel`)
 * and the clerk behind it, who goes off on a chore now and then (`clerk.chores`) and thanks the player for a sale.
 * Another customer drops in now and then (`customer`). The rest is the shop's own (`fixtures`, each with its sound: the
 * fish tank's bubbler, the TV wall's snow, the budgies' cage, the clock, the radio on the bench; and its `prop`s, by
 * name from `shopProps`: signs, lights, clutter) and what it sounds like (`sounds`; a room tone by the window). The
 * window's lettering and the counter's paint are the shop's own in the street (`city/SHOP_LOOKS`), and the view through
 * the glass is what its door on the street looks out on (`shopOutlook`).
 */

/** The shops' zones (`ZoneId`s of kind `shop`). */
export type ShopZoneId = 'furnitureShop' | 'tvShop' | 'petShop' | 'flowerShop';

/**
 * What a surface-standing thing stands `on`: a table of the plan (by `id`), the counter's top, or the display plinth
 * inside the front window; `spot` is `[x, z]` on that top (its own frame), `yaw` about its y.
 */
export interface OnSurface {
  on: string | 'counter' | 'windowDisplay';
  spot: [x: number, z: number];
  yaw?: number;
}

/**
 * A prop by name (`shopProps`: the shared ones of `common/`, each shop's own of `<shop>/props.ts`) with its options,
 * placed like any fixture (`at`) or standing on a surface (`OnSurface`). Its options are type-checked against its maker.
 */
export type ShopPropFixture = {
  [K in ShopPropName]: { kind: 'prop'; prop: K; options?: NonNullable<ShopPropOptions<K>> } & ({ at: Placement } | OnSurface);
}[ShopPropName];

/** The shop's own furniture, not for sale: a TV wall, shelves of stock, the flower stand, the tables the small pieces stand on. */
export type ShopFixture =
  | { kind: 'tvWall'; at: Placement; options?: TvWallOptions }
  | { kind: 'goodsShelf'; at: Placement; options: GoodsShelfOptions }
  | { kind: 'flowerStand'; at: Placement; options?: FlowerStandOptions }
  /** A table the displays can stand `on` (by `id`). */
  | { kind: 'table'; id: string; at: Placement; options?: DisplayTableOptions }
  /** Rugs rolled up in a corner (the origin in the corner's angle). */
  | { kind: 'rugRolls'; at: Placement; options?: RugRollsOptions }
  /** A sack truck with a carton on it. */
  | { kind: 'trolley'; at: Placement }
  /** A wall clock, ticking (the shop's time). */
  | { kind: 'clock'; at: Placement }
  /** A radio set, on all day (`kitchen/Radio`, the shop's `ShopRadio` its voice), on a surface. */
  | ({ kind: 'radio' } & OnSurface)
  /** The budgies' cage on its floor stand, their chatter (`PetShopNoises`) from it. */
  | { kind: 'birdcage'; at: Placement }
  | ShopPropFixture;

/** A sound of the shop's own with nothing to see, at a point (zone-local x, y, z): the budgies' chatter, somewhere unseen. */
export type ShopSound = { kind: 'pets'; at: [x: number, y: number, z: number] };

/** One piece of the flat on show: where (on the floor, on a wall, or on a surface), which look, its tag. */
export type ShopDisplay = {
  good: HomeUpgrade;
  /** Which look (`displayPieces`: the plants' kinds, the prints' motifs, the armchairs' cushions). */
  variant?: number;
  tag?: TagStyle;
  /** Blocks the player; default true (false for rugs, prints, what stands on a table). */
  collides?: boolean;
} & ({ at: Placement } | OnSurface);

export interface ShopPlan {
  /** Whose goods (`HOME_GOODS`) it sells. */
  shop: Exclude<HomeShop, 'market' | 'agent'>;
  /** The shop's colour: its counter, the band across its price tags (its joinery in the street, `SHOP_LOOKS`). */
  accent: number;
  room: RoomOptions;
  /** Where the teleport sets the player down: just inside the exit, facing the shop (-z). */
  arrival: { at: [x: number, z: number]; yaw: number };
  exit: Placement;
  /** The front window by the exit: where along the front wall, how big (its name and view are the street's). */
  window: { along: number; width: number; height: number };
  /**
   * The display plinth inside the window (things stand `on: 'windowDisplay'`): how deep and high (the glass starts at
   * `ShopWindow.SILL`), its board's colour (default the shop's accent darkened), or `false` for none.
   */
  windowDisplay?: { depth?: number; height?: number; color?: number } | false;
  /**
   * The ceiling lamp and its switch by the door. The switch also works every `ShopFitting` among the props (tube
   * battens, track spots, glowing shades: `common/lights`).
   */
  lamp: { kind: 'pendant' | 'flush'; at: Placement; switchAt: Placement };
  /** Real (shadowless) point lights the shop's glows share (`LightPool`); default 2, 0 for none. See docs/shops.md. */
  glowLights?: number;
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
  /** What is sold over the counter to be used up, not for the flat (`errands/`, `CounterErrand`): the treats, the bunches. */
  errands?: readonly ({ errand: ErrandId } & OnSurface)[];
}

export const SHOP_PLANS: Record<ShopZoneId, ShopPlan> = {
  // SECOND HOME, across the street by the pharmacy.
  furnitureShop: FURNITURE_SHOP,
  // TV REPAIR, the workshop on Park Street.
  tvShop: TV_SHOP,
  // PAWS & CLAWS, by COMICS & MANGA.
  petShop: PET_SHOP,
  // The florist, by the launderette.
  flowerShop: FLOWER_SHOP,
};
