import type { ShopContext, ShopPropMaker } from '../shopProps';
import { ShowroomLamps, type ShowroomLampsOptions } from './ShowroomLamps';
import { WindowVignette, type WindowVignetteOptions } from './WindowVignette';
import { SalonWall, type SalonWallOptions } from './SalonWall';
import { DustSheets, type DustSheetsOptions } from './DustSheets';
import { ChairStack, type ChairStackOptions } from './ChairStack';
import { FoldingScreen, type FoldingScreenOptions } from './FoldingScreen';
import { PendantCluster, type PendantClusterOptions } from './PendantCluster';
import { CeilingFan, type CeilingFanOptions } from './CeilingFan';
import { ArmchairThrow, BedCushions, DresserTop, TableDressing, type ArmchairThrowOptions, type BedCushionsOptions } from './dressing';
import { DeliveryLedger, SwatchBook } from './counterClutter';
import { Plant, type PlantOptions } from '../../props/Plant';

/**
 * SECOND HOME, the furniture shop's own props, by name, for its plan (`plans/`): `{ kind: 'prop', prop: '<name>', options, at | on }`. Each
 * maker takes its options (or undefined) and the `ShopContext`; its class lives in this folder. A name must not be
 * one of another shop's or of `common/props` (`shopProps` checks).
 */
export const FURNITURE_PROPS = {
  /** Every lamp on show lit with the shop's switch, a pooled light at each shade. Anywhere (`{ floor: [0, 0] }`). */
  showroomLamps: (o: ShowroomLampsOptions = {}) => new ShowroomLamps(o),
  /** The window's armchair, side table and lit floor lamp. On `windowDisplay`. */
  windowVignette: (o: WindowVignetteOptions = {}) => new WindowVignette(o),
  /** Mirrors, stopped clocks and small prints hung salon-style. Wall-hung at the cluster's middle height. */
  salonWall: (o: SalonWallOptions = {}, shop: ShopContext) => new SalonWall({ seed: shop.seed, ...o }),
  /** A wardrobe under a dust sheet with a RESERVED card, a sheeted frame leaning on it. Floor. */
  dustSheets: (o: DustSheetsOptions = {}, shop: ShopContext) => new DustSheets({ seed: shop.seed, ...o }),
  /** Café chairs stacked, a SOLD card tied on. Floor. */
  chairStack: (o: ChairStackOptions = {}) => new ChairStack(o),
  /** A folding screen standing in a zigzag between two rooms on show. Floor. */
  foldingScreen: (o: FoldingScreenOptions = {}) => new FoldingScreen(o),
  /** Enamel pendants on cords at different drops (a `ShopFitting`). Ceiling. */
  showroomPendants: (o: PendantClusterOptions = {}) => new PendantCluster(o),
  /** A slow ceiling fan. Ceiling. */
  showroomFan: (o: CeilingFanOptions = {}) => new CeilingFan(o),
  /** A throw over an armchair's arm: placed as the armchair is. */
  armchairThrow: (o: ArmchairThrowOptions = {}) => new ArmchairThrow(o),
  /** Cushions leaning on the bed's pillows: placed as the bed is. */
  bedCushions: (o: BedCushionsOptions = {}) => new BedCushions(o),
  /** A vase of grasses, a jewellery box and folded linen on the dresser: placed as the dresser is. */
  dresserTop: (_o: object | undefined, shop: ShopContext) => new DresserTop(shop.seed),
  /** A runner, a jug of flowers and a fruit bowl on the kitchen table: placed as the table is. */
  tableDressing: (_o: object | undefined, shop: ShopContext) => new TableDressing(shop.seed),
  /** The upholstery swatch book fanned open. On the counter. */
  swatchBook: (_o: object | undefined, shop: ShopContext) => new SwatchBook(shop.seed),
  /** A potted plant of the shop's own, not for sale (the florist sells the flat's): the rooms on show look lived in. Floor (collides). */
  showroomPlant: (o: PlantOptions = {}, shop: ShopContext) => new Plant({ seed: 70 + shop.seed, ...o }),
  /** The delivery ledger, a biro and a tape measure. On the counter. */
  deliveryLedger: (_o: object | undefined, shop: ShopContext) => new DeliveryLedger(shop.seed),
} satisfies Record<string, ShopPropMaker<never>>;
