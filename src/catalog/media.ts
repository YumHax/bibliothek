import type { BoxDimensions, Game, PlatformId } from './types';
import { parseNoIntroName } from './nointro';

/**
 * Where a copy was sold: its box, its cartridge and the art that goes with them differ by market.
 * `na` North America (and the "World" prints), `eu` Europe / PAL, `jp` Japan.
 */
export type MediaRegion = 'na' | 'eu' | 'jp';

/**
 * What the game comes in: a `cardboard` box (NES, SNES, N64, Game Boy), a plastic `clamshell`
 * (Mega Drive / Genesis) or a CD `jewel` case (PlayStation).
 */
export type CaseKind = 'cardboard' | 'clamshell' | 'jewel';

interface CaseSpec {
  kind: CaseKind;
  /** Outer size in metres: width and height as seen facing the front cover, depth its thickness. */
  dims: BoxDimensions;
}

const mm = (w: number, h: number, d: number): BoxDimensions => ({ width: w / 1000, height: h / 1000, depth: d / 1000 });

/**
 * Retail cases by platform and region, outer sizes measured on real copies (the sources are in docs/media.md). A region without an entry sells the North American one.
 */
const CASES: Record<PlatformId, { na: CaseSpec } & Partial<Record<MediaRegion, CaseSpec>>> = {
  // The NES's "black box" is the same in both markets; the Famicom's is smaller and portrait.
  nes: {
    na: { kind: 'cardboard', dims: mm(128, 179, 24) },
    jp: { kind: 'cardboard', dims: mm(98, 142, 22) },
  },
  // North America turned the box on its side; Europe kept it upright; Japan's is tall and narrow.
  snes: {
    na: { kind: 'cardboard', dims: mm(179, 128, 31) },
    eu: { kind: 'cardboard', dims: mm(128, 179, 31) },
    jp: { kind: 'cardboard', dims: mm(107, 190, 31) },
  },
  gb: {
    na: { kind: 'cardboard', dims: mm(125, 125, 23) },
    jp: { kind: 'cardboard', dims: mm(95, 120, 20) },
  },
  // The plastic case, without the hang tab some had.
  megadrive: {
    na: { kind: 'clamshell', dims: mm(129, 177, 26) },
  },
  n64: {
    na: { kind: 'cardboard', dims: mm(180, 128, 32) },
    jp: { kind: 'cardboard', dims: mm(135, 188, 29) },
  },
  // The standard CD jewel case, every market.
  ps1: {
    na: { kind: 'jewel', dims: mm(142, 125, 10.4) },
  },
};

const NA = new Set(['USA', 'World', 'Canada', 'Brazil', 'Latin America']);
const JP = new Set(['Japan', 'Asia', 'Korea', 'Taiwan', 'Hong Kong', 'China']);

/** The region a copy was printed for, from its No-Intro name ("(USA)", "(Europe)"...), else its `region` field. */
export function regionOf(game: Pick<Game, 'region' | 'externalIds'>): MediaRegion {
  const named = game.externalIds?.libretroName;
  const tag = (named ? parseNoIntroName(named).region : undefined) ?? game.region ?? '';
  const parts = tag.split(',').map((p) => p.trim()).filter(Boolean);
  // One dump sold in several markets ("Japan, USA": No-Intro lists them alphabetically) is the American copy, then the European one.
  if (!parts.length || parts.some((p) => NA.has(p))) return 'na';
  if (parts.some((p) => !JP.has(p))) return 'eu';
  return 'jp';
}

/** The case this copy came in. */
export function caseOf(game: Pick<Game, 'platform' | 'region' | 'externalIds'>): CaseSpec {
  const cases = CASES[game.platform];
  return cases[regionOf(game)] ?? cases.na;
}

/** Outer box size of this copy (metres): what the shelves, the hand and the art are sized from. */
export function boxDimensionsOf(game: Pick<Game, 'platform' | 'region' | 'externalIds'>): BoxDimensions {
  return caseOf(game).dims;
}

/** The platform's usual box (North America): for what is sized before a copy is known (a stall's slots). */
export function defaultCaseOf(platform: PlatformId): CaseSpec {
  return CASES[platform].na;
}

/** The widest box any region sold for the platform: a stall's slots fit every copy it may get. */
export function widestCaseOf(platform: PlatformId): BoxDimensions {
  return Object.values(CASES[platform]).reduce((wide, spec) => (spec.dims.width > wide.width ? spec.dims : wide), CASES[platform].na.dims);
}

/**
 * The outline of a cartridge's front, one per family of shells: the NES's tall slab with its top
 * lip, the Famicom's short one, the North American SNES's with its two grooved shoulders, the
 * rounded PAL / Super Famicom one, the N64's with its sloped top corners, the Game Boy's notched
 * corner, the Genesis's and the Mega Drive's. `disc` is a CD.
 */
export type MediaShape = 'nes' | 'famicom' | 'snes' | 'sfc' | 'n64' | 'gb' | 'genesis' | 'megadrive' | 'disc';

/** A rectangle on the media's front, in metres from its centre (x right, y up). */
export interface FaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MediaSpec {
  shape: MediaShape;
  /** Outer size (metres): width and height of the front (label) face, depth its thickness. */
  size: BoxDimensions;
  /** The shell's plastic (a disc: its underside). */
  colour: number;
  /** Where the front label is stuck. */
  label: FaceRect;
  /** How deep the label sits in its recess (m). */
  recess: number;
  /** How far it goes into the console (m): what is left sticking out shows. */
  insert: number;
}

const rect = (x: number, y: number, w: number, h: number): FaceRect => ({ x: x / 1000, y: y / 1000, width: w / 1000, height: h / 1000 });

/** Measured shells, labels placed from photographs of real ones (see docs/media.md). */
const MEDIA: Record<MediaShape, MediaSpec> = {
  // Label on the upper right of the front (grip grooves down its left), folded 7 mm over the top; the whole cart goes in, then is pressed down.
  nes: { shape: 'nes', size: mm(120, 134, 17), colour: 0x8e8e90, label: rect(16, 19, 56, 91), recess: 0.0005, insert: 0.138 },
  famicom: { shape: 'famicom', size: mm(108, 70.5, 17), colour: 0xc8c1ae, label: rect(0, 2, 92, 48), recess: 0.0005, insert: 0.03 },
  snes: { shape: 'snes', size: mm(136, 88, 20), colour: 0x9a9aa0, label: rect(0, 23, 82.5, 38), recess: 0.0006, insert: 0.033 },
  sfc: { shape: 'sfc', size: mm(129, 87, 20), colour: 0x9c9ca2, label: rect(0, 10, 104, 36), recess: 0.0006, insert: 0.033 },
  n64: { shape: 'n64', size: mm(116, 76.6, 18.5), colour: 0x77777d, label: rect(0, 1, 54.5, 62.5), recess: 0.0008, insert: 0.031 },
  gb: { shape: 'gb', size: mm(57, 65, 7.8), colour: 0x8e8e92, label: rect(1.5, -8, 42, 38), recess: 0.0005, insert: 0.053 },
  // The label (its red GENESIS band down the left) covers most of the front and wraps over the top.
  genesis: { shape: 'genesis', size: mm(109, 70, 17), colour: 0x161618, label: rect(-3, -1.5, 99, 58), recess: 0.0006, insert: 0.022 },
  megadrive: { shape: 'megadrive', size: mm(93, 67, 17), colour: 0x161618, label: rect(0, 3, 72, 50), recess: 0.0006, insert: 0.022 },
  disc: { shape: 'disc', size: mm(120, 120, 1.2), colour: 0x0c0c0e, label: rect(0, 0, 118, 118), recess: 0, insert: 0 },
};

/** The media this copy plays from: the region's cartridge shell, or the disc. */
export function mediaOf(game: Pick<Game, 'platform' | 'region' | 'externalIds'>): MediaSpec {
  const region = regionOf(game);
  switch (game.platform) {
    case 'nes':
      return region === 'jp' ? MEDIA.famicom : MEDIA.nes;
    case 'snes':
      return region === 'na' ? MEDIA.snes : MEDIA.sfc;
    case 'n64':
      return MEDIA.n64;
    case 'gb':
      return MEDIA.gb;
    case 'megadrive':
      return region === 'jp' ? MEDIA.megadrive : MEDIA.genesis; // Europe's Mega Drive carts are the Genesis shell
    case 'ps1':
      return MEDIA.disc;
  }
}

/**
 * Whether the box lies landscape (the North American SNES and N64 boxes): its spine, with the title,
 * runs along its top and bottom, and it opens by its right end.
 */
export function isLandscape(dims: BoxDimensions): boolean {
  return dims.width > dims.height * 1.15;
}
