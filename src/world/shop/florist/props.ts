import type { ShopContext, ShopPropMaker } from '../shopProps';
import { FlowerChiller, type FlowerChillerOptions } from './FlowerChiller';
import { BouquetStand, type BouquetStandOptions } from './BouquetStand';
import { HangingGreens, type HangingGreensOptions } from './HangingGreens';
import { FernWall, type FernWallOptions } from './FernWall';
import { ClimbingTrellis, type ClimbingTrellisOptions } from './ClimbingTrellis';
import { TrailingPothos, type TrailingPothosOptions } from './TrailingPothos';
import { FloristBench, type FloristBenchOptions } from './FloristBench';
import { WateringCan, type WateringCanOptions } from './WateringCan';
import { CounterFlowers, type CounterFlowersOptions } from './CounterFlowers';

/**
 * the florist's own props, by name, for its plan (`plans/`): `{ kind: 'prop', prop: '<name>', options, at | on }`. Each
 * maker takes its options (or undefined) and the `ShopContext`; its class lives in this folder. A name must not be
 * one of another shop's or of `common/props` (`shopProps` checks).
 */
export const FLORIST_PROPS = {
  /** The glass-door chiller of cut flowers, lit cold, humming (collides). Wall-hung with `y: 0`. */
  flowerChiller: (o: FlowerChillerOptions = {}, shop: ShopContext) => new FlowerChiller({ seed: shop.seed, ...o }),
  /** The window's stepped stand of bouquets in vases (`on: 'windowDisplay'`). */
  bouquetStand: (o: BouquetStandOptions = {}, shop: ShopContext) => new BouquetStand({ seed: shop.seed, ...o }),
  /** Hanging baskets of trailing greens and poles of dried bunches, in the room's frame. At `{ ceiling: [0, 0] }`. */
  hangingGreens: (o: HangingGreensOptions = {}, shop: ShopContext) => new HangingGreens({ seed: shop.seed, ...o }),
  /** A living wall of ferns in felt pockets (collides). Wall-hung with `y: 0`. */
  fernWall: (o: FernWallOptions = {}, shop: ShopContext) => new FernWall({ seed: shop.seed, ...o }),
  /** A white trellis with a jasmine climbing it from a trough (collides). Wall-hung with `y: 0`. */
  climbingTrellis: (o: ClimbingTrellisOptions = {}, shop: ShopContext) => new ClimbingTrellis({ seed: shop.seed, ...o }),
  /** Pots of pothos along a shelf's top, their vines down its face. Wall-hung at the shelf top's height. */
  trailingPothos: (o: TrailingPothosOptions = {}, shop: ShopContext) => new TrailingPothos({ seed: shop.seed, ...o }),
  /** The work table's things: paper roll, a half-made bouquet, twine, tools, petals (`on` a table). */
  floristBench: (o: FloristBenchOptions = {}, shop: ShopContext) => new FloristBench({ seed: shop.seed, ...o }),
  /** A watering can on the floor and the day's buckets beside it. */
  wateringCan: (o: WateringCanOptions = {}, shop: ShopContext) => new WateringCan({ seed: shop.seed, ...o }),
  /** A jug of sweet peas and a rack of cards (`on: 'counter'`). */
  counterFlowers: (o: CounterFlowersOptions = {}, shop: ShopContext) => new CounterFlowers({ seed: shop.seed, ...o }),
} satisfies Record<string, ShopPropMaker<never>>;
