import type { ShopContext, ShopPropMaker } from '../shopProps';
import { Chalkboard, type ChalkboardOptions } from '../../props/Chalkboard';
import { Doormat, type DoormatOptions } from '../../props/Doormat';
import { Flyer, type FlyerOptions } from '../../props/Flyer';
import { TiledWainscot, type TiledWainscotOptions } from '../../props/TiledWainscot';
import { NameBoard, type NameBoardOptions } from './NameBoard';
import { ShopNotice, type ShopNoticeOptions } from './ShopNotice';
import { CorkBoard, type CorkBoardOptions } from './CorkBoard';
import { WallChalkboard, type WallChalkboardOptions } from './WallChalkboard';
import { OpenSign, type OpenSignOptions } from './OpenSign';
import { FloorScuffs, type FloorScuffsOptions } from './FloorScuffs';
import { TubeBatten, type TubeBattenOptions } from './TubeBatten';
import { TrackSpots, type TrackSpotsOptions } from './TrackSpots';
import { GlowPanel, type GlowPanelOptions } from './GlowPanel';
import { PanelledDado, type PanelledDadoOptions } from './PanelledDado';

/**
 * The props every shop can name in its plan (`{ kind: 'prop', prop: '<name>', options, at | on }`), made for that
 * shop (`ShopContext`: its name and colours, its hours, its room). What each is and how it is placed: its class's
 * comment, and docs/shops.md. Room-wide ones (`panelledDado`, `tiledWainscot`) are placed at `{ floor: [0, 0] }`.
 */
export const COMMON_PROPS = {
  /** The shop's name on a painted board (default its name, in its fascia's colours). Wall-hung. */
  nameBoard: (o: NameBoardOptions = {}, shop: ShopContext) => new NameBoard({ ...o, lines: o.lines ?? [shop.name], color: o.color ?? shop.fascia, letters: o.letters ?? shop.letters }),
  /** A handwritten card, a typed notice or a printed poster, taped, pinned or framed. Wall-hung (or on any face). */
  notice: (o: ShopNoticeOptions = {}, shop: ShopContext) => new ShopNotice({ seed: shop.seed, ...o }),
  /** A cork board of cards and polaroids, with a heading. Wall-hung. */
  corkBoard: (o: CorkBoardOptions = {}, shop: ShopContext) => new CorkBoard({ seed: shop.seed, ...o }),
  /** A framed slate on the wall, chalked. Wall-hung. */
  wallChalkboard: (o: WallChalkboardOptions = {}, shop: ShopContext) => new WallChalkboard({ seed: shop.seed, ...o }),
  /** The A-frame chalkboard of a pavement, standing on the floor (collides). */
  aFrameBoard: (o: ChalkboardOptions = {}, shop: ShopContext) => new Chalkboard({ seed: shop.seed, ...o }),
  /** A printed flyer (a little askew, pinned) or a cloth banner. Wall-hung. */
  flyer: (o: FlyerOptions = {}, shop: ShopContext) => new Flyer({ seed: shop.seed, ...o }),
  /** The OPEN / CLOSED card on the exit's glass, turned with the shop's hours (`plans/shared.OPEN_SIGN_AT`). */
  openSign: (o: OpenSignOptions = {}, shop: ShopContext) => new OpenSign(shop.kind, shop.dayNight, shop.accent, o),
  /** A coir doormat (`plans/shared.DOORMAT_AT`). */
  doormat: (o: DoormatOptions = {}, shop: ShopContext) => new Doormat({ seed: shop.seed, ...o }),
  /** Heel marks, grime, petals or sawdust on the floor. Floor placement. */
  floorScuffs: (o: FloorScuffsOptions = {}, shop: ShopContext) => new FloorScuffs({ seed: shop.seed, ...o }),
  /** A fluorescent batten on the ceiling (a `ShopFitting`, hums, may flicker). Ceiling placement. */
  tubeBatten: (o: TubeBattenOptions = {}) => new TubeBatten(o),
  /** A ceiling track of spots aimed towards local +z (a `ShopFitting`). Ceiling placement. */
  trackSpots: (o: TrackSpotsOptions = {}) => new TrackSpots(o),
  /** A glowing face (an aquarium's, a chiller's, a lightbox's), its light pooled. Wall-hung or on a face. */
  glowPanel: (o: GlowPanelOptions = {}) => new GlowPanel(o),
  /** Panelled boarding and a dado rail round the lower walls, cut at the door and the window. At `{ floor: [0, 0] }`. */
  panelledDado: (o: PanelledDadoOptions = {}, shop: ShopContext) => new PanelledDado(shop.room, shop.openings, o),
  /** Half-height metro tiles round the walls (a butcher's, a pet shop's washable wall), cut at the door and the window. At `{ floor: [0, 0] }`. */
  tiledWainscot: (o: TiledWainscotOptions = {}, shop: ShopContext) => new TiledWainscot(shop.room, { ...o, openings: [...shop.openings.filter((g) => g.bottom < (o.height ?? 1.2)), ...(o.openings ?? [])] }),
} satisfies Record<string, ShopPropMaker<never>>;
