import type { Furniture } from '../Furniture';
import type { Placement } from '../Placement';
import type { Zone } from '../zone/Zone';
import { Plant, type PlantOptions } from './Plant';
import { Rug, type RugOptions } from './Rug';
import { PictureFrame, type PictureFrameOptions } from './PictureFrame';
import { FloorLamp, type FloorLampOptions } from './FloorLamp';
import { SideTable, type SideTableOptions } from './SideTable';
import { Garland, type GarlandOptions } from './Garland';
import { Crate, type CrateOptions } from './Crate';
import { Flyer, type FlyerOptions } from './Flyer';
import { Chalkboard, type ChalkboardOptions } from './Chalkboard';
import { IndustrialPendant, type IndustrialPendantOptions } from './IndustrialPendant';
import { NeonSign, type NeonSignOptions } from './NeonSign';
import { NeonTube, type NeonTubeOptions } from './NeonTube';
import { Cushion, type CushionOptions } from './Cushion';
import { Speaker, type SpeakerOptions } from './Speaker';
import { Sideboard, type SideboardOptions } from './Sideboard';
import { SmokeDetector, type SmokeDetectorOptions } from './SmokeDetector';
import { UmbrellaStand, type UmbrellaStandOptions } from './UmbrellaStand';
import { LeaningMirror, type LeaningMirrorOptions } from './LeaningMirror';
import { PedalBin, type PedalBinOptions } from './PedalBin';
import { BathroomScale, type BathroomScaleOptions } from './BathroomScale';
import { WallSocket, type WallSocketOptions } from './WallSocket';

/**
 * Decoration the room plan can list by name. Each kind builds a `Furniture` from its options;
 * the plan (`roomPlan.ts`) only ever names a kind, a `Placement` and options, so adding a plant
 * or a lamp is one data line and adding a new kind of prop is one line here.
 * Things that need runtime wiring (screens, seats, windows, the door, lights tied to the room) are
 * not decor: `layout.ts` builds them from their own plan entries.
 */
export const DECOR_KINDS = {
  plant: (o: PlantOptions = {}) => new Plant(o),
  rug: (o: RugOptions = {}) => new Rug(o),
  pictureFrame: (o: PictureFrameOptions = {}) => new PictureFrame(o),
  floorLamp: (o: FloorLampOptions = {}) => new FloorLamp(o),
  sideTable: (o: SideTableOptions = {}) => new SideTable(o),
  garland: (o: GarlandOptions = {}) => new Garland(o),
  crate: (o: CrateOptions = {}) => new Crate(o),
  flyer: (o: FlyerOptions = {}) => new Flyer(o),
  chalkboard: (o: ChalkboardOptions = {}) => new Chalkboard(o),
  industrialPendant: (o: IndustrialPendantOptions = {}) => new IndustrialPendant(o),
  neonSign: (o: NeonSignOptions = {}) => new NeonSign(o),
  neonTube: (o: NeonTubeOptions = {}) => new NeonTube(o),
  cushion: (o: CushionOptions = {}) => new Cushion(o),
  speaker: (o: SpeakerOptions = {}) => new Speaker(o),
  sideboard: (o: SideboardOptions = {}) => new Sideboard(o),
  smokeDetector: (o: SmokeDetectorOptions = {}) => new SmokeDetector(o),
  umbrellaStand: (o: UmbrellaStandOptions = {}) => new UmbrellaStand(o),
  leaningMirror: (o: LeaningMirrorOptions = {}) => new LeaningMirror(o),
  pedalBin: (o: PedalBinOptions = {}) => new PedalBin(o),
  bathroomScale: (o: BathroomScaleOptions = {}) => new BathroomScale(o),
  wallSocket: (o: WallSocketOptions = {}) => new WallSocket(o),
};

export type DecorKind = keyof typeof DECOR_KINDS;
type OptionsOf<K extends DecorKind> = Parameters<(typeof DECOR_KINDS)[K]>[0];

/** One line of the plan's `decor` list: what, where, how. */
export type DecorEntry = {
  [K in DecorKind]: { kind: K; at: Placement; options?: OptionsOf<K> };
}[DecorKind];

export function buildDecor(entry: DecorEntry): Furniture {
  const build = DECOR_KINDS[entry.kind] as (options?: object) => Furniture;
  return build(entry.options);
}

/** Builds and places every entry; returns them in plan order. */
export function placeDecor(zone: Zone, entries: readonly DecorEntry[]): Furniture[] {
  return entries.map((entry) => zone.placeAt(buildDecor(entry), entry.at));
}
