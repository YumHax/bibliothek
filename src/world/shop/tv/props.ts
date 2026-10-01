import type { ShopContext, ShopPropMaker } from '../shopProps';
import { OpenSet, type OpenSetOptions } from './OpenSet';
import { SolderingStation } from './SolderingStation';
import { SolderWisp, type SolderWispOptions } from './SolderWisp';
import { MagnifierLamp, type MagnifierLampOptions } from './MagnifierLamp';
import { BenchTools } from './BenchTools';
import { Pegboard, type PegboardOptions } from './Pegboard';
import { PartsCabinet, type PartsCabinetOptions } from './PartsCabinet';
import { RepairsShelf, type RepairsShelfOptions } from './RepairsShelf';
import { GadgetCase, type GadgetCaseOptions } from './GadgetCase';
import { BoxStack, type BoxStackOptions } from './BoxStack';
import { CableTray, type CableTrayOptions } from './CableTray';
import { WallCalendar, type WallCalendarOptions } from './WallCalendar';
import { CrtStack, type CrtStackOptions } from './CrtStack';
import { TentCard, type TentCardOptions } from './TentCard';
import { ReceiptSpike, type ReceiptSpikeOptions } from './ReceiptSpike';
import { ValveJar, type ValveJarOptions } from './ValveJar';

/**
 * TV REPAIR's own props, by name, for its plan (`plans/`): `{ kind: 'prop', prop: '<name>', options, at | on }`. Each
 * maker takes its options (or undefined) and the `ShopContext`; its class lives in this folder. A name must not be
 * one of another shop's or of `common/props` (`shopProps` checks): TV REPAIR's all start with `tv`.
 */
export const TV_PROPS = {
  /** A set on the bench with its back off, its insides to the repairer (+z). On a surface. */
  tvOpenSet: (o: OpenSetOptions = {}) => new OpenSet(o),
  /** The soldering station: control box, the iron in its holder (tip at `SolderingStation.IRON_TIP`), sponge, solder. On a surface. */
  tvSolderingStation: () => new SolderingStation(),
  /** A wisp of flux smoke now and then, placed at the iron's tip. On a surface. */
  tvSolderWisp: (o: SolderWispOptions = {}) => new SolderWisp(o),
  /** The clamp-on magnifier lamp with its ring tube (a `ShopFitting`, a pooled light). On a surface at the back edge. */
  tvMagnifierLamp: (o: MagnifierLampOptions = {}) => new MagnifierLamp(o),
  /** Multimeter and probes, screwdrivers, spare valves, desoldering pump, a mug, the open service manual. On a surface. */
  tvBenchTools: () => new BenchTools(),
  /** The tool board: tools in their painted outlines, wire reels, cable coils on hooks. Wall-hung (centre). */
  tvPegboard: (o: PegboardOptions = {}, shop: ShopContext) => new Pegboard({ seed: shop.seed, ...o }),
  /** Steel cabinet of labelled little drawers, service manuals on top. Floor, against a wall. */
  tvPartsCabinet: (o: PartsCabinetOptions = {}, shop: ShopContext) => new PartsCabinet({ seed: shop.seed, ...o }),
  /** The shelf of repairs waiting for collection, each with its ticket. Floor, against a wall. */
  tvRepairsShelf: (o: RepairsShelfOptions = {}, shop: ShopContext) => new RepairsShelf({ seed: shop.seed, ...o }),
  /** Glass case of small second-hand electronics with price cards. Floor. */
  tvGadgetCase: (o: GadgetCaseOptions = {}) => new GadgetCase(o),
  /** Cardboard boxes stacked in a corner. Floor. */
  tvBoxStack: (o: BoxStackOptions = {}, shop: ShopContext) => new BoxStack({ seed: shop.seed, ...o }),
  /** A ladder tray of cables hung from the ceiling on rods. Ceiling. */
  tvCableTray: (o: CableTrayOptions = {}, shop: ShopContext) => new CableTray({ seed: shop.seed, ...o }),
  /** A supplier's calendar, days ringed. Wall-hung (centre). */
  tvWallCalendar: (o: WallCalendarOptions = {}, shop: ShopContext) => new WallCalendar({ seed: shop.seed, ...o }),
  /** Three portable sets stacked, on snow (the window display). On a surface, screens +z. */
  tvCrtStack: (o: CrtStackOptions = {}) => new CrtStack(o),
  /** A folded card lettered on both leaves (REPAIRS · ALL MAKES). On a surface, front +z. */
  tvTentCard: (o: TentCardOptions = {}) => new TentCard(o),
  /** The till's spike of job slips. On a surface. */
  tvReceiptSpike: (o: ReceiptSpikeOptions = {}, shop: ShopContext) => new ReceiptSpike({ seed: shop.seed, ...o }),
  /** A sweet jar of old valves. On a surface. */
  tvValveJar: (o: ValveJarOptions = {}, shop: ShopContext) => new ValveJar({ seed: shop.seed, ...o }),
} satisfies Record<string, ShopPropMaker<never>>;
