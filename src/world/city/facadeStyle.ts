import { shade } from './colour';
import { GROUND_FLOOR, STOREY } from '@/world/measures/street';
import { lcg, pick } from '@/random';

/*
 * How a building of the neighbourhood looks, drawn from its plan's `seed` (`street/streetPlan.FACADES`):
 * its wall, trims, windows, balconies and roof. The one description both renderers read, the walkable
 * street's facade atlas (`street/facadePainter`, the 3D roofs of `street/Buildings`) and the window
 * view (`props/outdoors/Facades`), so a building across the road looks the same from the pavement
 * and from the balcony. Only the buildings no plan names (the lots beyond the walkable street) draw
 * their own.
 */

export type WallKind = 'stone' | 'brick' | 'render';
export type WindowHead = 'plain' | 'lintel' | 'arched' | 'pediment';
export type RoofKind = 'mansard' | 'pitched' | 'flat';

export interface FacadeStyle {
  seed: number;
  kind: WallKind;
  wall: string;
  /** Stone of the sills, heads, string courses and cornice. */
  trim: string;
  /** Window frames and bars. */
  frame: string;
  /** Colour of the open shutters either side of the windows, or none. */
  shutters: string | null;
  /** How the windows are dressed: a painted frame, a stone lintel, a keystoned arch, a carved head with a pediment on the first floor. */
  window: WindowHead;
  /** None; the odd balcony across a few bays; wrought-iron balconies right across the first and top floors. */
  balconies: 'none' | 'few' | 'haussmann';
  /** Share of the windows with a flower box on the sill. */
  flowers: number;
  /** Grooved stone ground floor, a stone band at every floor, stone blocks up the corners. */
  rusticated: boolean;
  courses: boolean;
  quoins: boolean;
  roof: RoofKind;
  /** Slate or tile. */
  roofColor: string;
  /** The upper floors' windows: how far over the floor the sill is, how tall, how wide at most (or this share of a bay). */
  windows: WindowSize;
  /** How far under the facade's top its cornice runs (the parapet's height over it), metres. */
  parapet: number;
  /** The residents' door: its paint, the house number over it. */
  door: string;
  number: number;
  /** Which end of the front its downpipe runs down from the gutter, if any. */
  downpipe: 'left' | 'right' | null;
  /** Its own roof's slope (the kind's, steeper or shallower by the building): none on a flat roof. */
  slope: { rise: number; run: number } | null;
  /** Its dormers' heads (a mansard's), and whether the odd bay goes without one or an oeil-de-boeuf. */
  dormer: DormerKind;
  dormerSkip: number;
  dormerOeil: boolean;
}

/** A dormer's head: a little triangular pediment, a segmental arch, a flat zinc hood. */
export type DormerKind = 'pediment' | 'segment' | 'hood';

export interface WindowSize {
  sill: number;
  height: number;
  maxWidth: number;
  share: number;
}

/** The residents' doors' paints (both pictures paint them). */
const DOORS = ['#2c2622', '#3a2418', '#1f3a34', '#2a3450', '#5a1f1f'];

export const BRICKS = ['#b8654b', '#a86a52', '#9c6b55', '#8e4f3c', '#b0735a'];
const RENDERS = ['#c9a583', '#b99b6d', '#cdb79b', '#d8b49a', '#c8c2a8', '#e2cf9e', '#b9c2b0', '#8f8a80', '#d9b8b0'];
const STONES = ['#d9ccb4', '#e0d5c1', '#d4c6a8', '#cfc4b0'];
const SHUTTERS = ['#4f6b5a', '#5a7189', '#8c3b2e', '#e6dfcf', '#6b6f4a', '#3f4f6a'];
const SLATES = ['#4a4f58', '#545a63', '#3f454e'];
const TILES = ['#9a5a3d', '#8a4a32', '#a8664a'];
const WINDOW_FRAME = '#e8e4dc';

/** How far a sloping roof rises over the cornice and how far back it reaches while it does, metres (each building's own: `FacadeStyle.slope`; our own building keeps these). */
export const ROOF_SLOPE: Record<Exclude<RoofKind, 'flat'>, { rise: number; run: number }> = {
  mansard: { rise: 3.2, run: 1.4 },
  pitched: { rise: 2.6, run: 3.6 },
};

/** How wide a style's upper windows are in a bay `bay` metres wide. */
export function windowWidth(style: FacadeStyle, bay: number): number {
  return Math.min(style.windows.maxWidth, bay * style.windows.share);
}

/** How many window bays a storey of a facade `width` long has (`bays`: the plan's own count). */
export function facadeBays(width: number, bays?: number): number {
  return bays ?? Math.max(1, Math.round(width / 2.7));
}

/**
 * A building's look from its seed (`stoneShare`: the chance of a dressed stone front). The same seed
 * always gives the same building, whichever renderer asks. `random` draws a lot's look instead (the
 * window view's unplanned buildings, from its shared sequence).
 */
export function facadeStyle(seed: number, stoneShare = 0.25, random: () => number = lcg(seed * 7919 + 17)): FacadeStyle {
  const base = baseStyle(seed, stoneShare, random);
  // The finer points from a draw of their own, so the main draw (and every lot drawn after it) is as it was.
  const more = lcg(seed * 6151 + 29);
  const grand = base.kind === 'stone';
  const windows: WindowSize = {
    sill: grand ? 0.75 + more() * 0.1 : 0.82 + more() * 0.18,
    height: grand ? 1.85 + more() * 0.1 : 1.5 + more() * 0.28,
    maxWidth: grand ? 1.2 : 1.0 + more() * 0.2,
    share: grand ? 0.52 : 0.42 + more() * 0.16,
  };
  const parapet = grand ? 0.9 : 0.85 + more() * 0.25;
  const door = DOORS[Math.floor(more() * DOORS.length)]!;
  const number = 1 + Math.floor(more() * 58);
  const pipe = more();
  const downpipe = pipe < 0.3 ? 'left' : pipe < 0.6 ? 'right' : null;
  // The roof's own pitch and its dormers, from a draw of their own again (everything above stays where it was).
  const roofDraw = lcg(seed * 3307 + 61);
  const slope = base.roof === 'flat' ? null : { rise: ROOF_SLOPE[base.roof].rise * (0.88 + roofDraw() * 0.22), run: ROOF_SLOPE[base.roof].run * (0.86 + roofDraw() * 0.26) };
  const d = roofDraw();
  const dormer: DormerKind = grand ? (d < 0.6 ? 'pediment' : 'segment') : d < 0.4 ? 'pediment' : d < 0.7 ? 'segment' : 'hood';
  const dormerSkip = roofDraw() < 0.25 ? 0.5 : 0.08;
  const dormerOeil = roofDraw() < 0.22;
  return { ...base, windows, parapet, door, number, downpipe, slope, dormer, dormerSkip, dormerOeil };
}

type BaseStyle = Omit<FacadeStyle, 'windows' | 'parapet' | 'door' | 'number' | 'downpipe' | 'slope' | 'dormer' | 'dormerSkip' | 'dormerOeil'>;

function baseStyle(seed: number, stoneShare: number, random: () => number): BaseStyle {
  const r = random();
  if (r < stoneShare) {
    // Dressed stone: carved window heads, iron balconies, a slate mansard.
    return {
      seed, kind: 'stone', wall: pick(random, STONES), trim: '#ece4d2', frame: '#ece8e0', shutters: null,
      window: random() < 0.6 ? 'pediment' : 'lintel', balconies: 'haussmann', flowers: 0.12,
      rusticated: true, courses: true, quoins: false, roof: 'mansard', roofColor: pick(random, SLATES),
    };
  }
  if (r < stoneShare + (1 - stoneShare) * 0.45) {
    const roof = pick(random, ['flat', 'pitched', 'mansard'] as const);
    return {
      seed, kind: 'brick', wall: pick(random, BRICKS), trim: pick(random, ['#e0d6c2', '#d8cdb5', '#c9bda5']), frame: random() < 0.7 ? '#e6e1d8' : '#2e3a34', shutters: null,
      window: random() < 0.55 ? 'arched' : 'lintel', balconies: random() < 0.5 ? 'few' : 'none', flowers: 0.2,
      rusticated: false, courses: random() < 0.6, quoins: random() < 0.4, roof, roofColor: pick(random, roof === 'mansard' ? SLATES : TILES),
    };
  }
  const wall = pick(random, RENDERS);
  const frame = random() < 0.75 ? WINDOW_FRAME : '#3a3a3c';
  const shutters = random() < 0.55 ? pick(random, SHUTTERS) : null;
  const window = random() < 0.7 ? 'plain' : 'lintel';
  const balconies = random() < 0.5 ? 'few' : 'none';
  const courses = random() < 0.5;
  const quoins = random() < 0.3;
  const roof = pick(random, ['flat', 'flat', 'pitched', 'mansard'] as const);
  return {
    seed, kind: 'render', wall, trim: shade(wall, 1.28), frame, shutters, window, balconies, flowers: 0.3,
    rusticated: false, courses, quoins, roof, roofColor: pick(random, roof === 'mansard' ? SLATES : TILES),
  };
}

/** A row of balconies: on which floor (1 = the first over the ground floor) and across which bays (first and last, included). */
interface BalconyRow {
  floor: number;
  from: number;
  to: number;
}

/**
 * Where a building's balconies are, floor by floor and bay by bay: right across the second and top floors of a grand
 * front (the first and top on a low one), a few bays wide on the odd floor of a plainer one. Drawn from the style's
 * seed, so both renderers hang them on the same windows.
 */
export function balconyRows(style: FacadeStyle, storeys: number, bays: number): BalconyRow[] {
  if (style.balconies === 'none') return [];
  if (style.balconies === 'haussmann') return [...new Set([storeys - 1 >= 4 ? 2 : 1, storeys - 1])].filter((f) => f >= 1).map((floor) => ({ floor, from: 0, to: bays - 1 }));
  const random = lcg(style.seed * 104729 + 3);
  const rows: BalconyRow[] = [];
  for (let floor = 1; floor < storeys; floor++) {
    if (random() >= 0.25) continue;
    const width = Math.max(1, Math.round(bays * (0.3 + random() * 0.4)));
    const from = Math.floor(random() * (bays - width + 1));
    rows.push({ floor, from, to: from + width - 1 });
  }
  return rows;
}

/** Whether bay `bay` of floor `floor` opens onto a balcony. */
export function onBalcony(rows: readonly BalconyRow[], floor: number, bay: number): boolean {
  return rows.some((row) => row.floor === floor && bay >= row.from && bay <= row.to);
}

/**
 * How a front's floors stack (`storeys`, the ground floor included): each floor's foot over the pavement and its
 * height, the ground floor first. The fronts' total stays `GROUND_FLOOR + (storeys - 1) * STOREY` (roofs, party walls
 * and the window view's rows keep their heights), but the floors share it as the building's style has it: a grand
 * front's first floor taller (its noble floor) and the second a little, its top floor lower, a plainer one by less, the
 * odd render front even. `regular`: every floor `STOREY` (our own building: the flat's floor is where the stairs say).
 */
export interface StoreyLayout {
  foot: number[];
  height: number[];
}

export function storeyLayout(style: FacadeStyle, storeys: number, regular = false): StoreyLayout {
  const floors = Math.max(0, storeys - 1);
  const shift = new Array<number>(floors).fill(0);
  if (!regular && floors >= 2) {
    const random = lcg(style.seed * 2903 + 41);
    const noble = style.kind === 'stone' ? 0.32 + random() * 0.08 : style.kind === 'brick' ? 0.12 + random() * 0.1 : random() < 0.5 ? 0 : 0.08 + random() * 0.12;
    shift[0]! += noble;
    shift[floors - 1]! -= noble;
    if (style.kind === 'stone' && floors >= 4) {
      shift[1]! += 0.12;
      shift[floors - 2]! -= 0.12;
    }
  }
  const foot = [0];
  const height = [GROUND_FLOOR];
  let y = GROUND_FLOOR;
  for (let f = 0; f < floors; f++) {
    foot.push(y);
    height.push(STOREY + shift[f]!);
    y += STOREY + shift[f]!;
  }
  return { foot, height };
}

/** How tall a style's windows are on a floor `height` tall: taller on a noble floor, shorter under the roof, always clear of the floor over it. */
export function windowHeightOn(style: FacadeStyle, height: number): number {
  return Math.max(0.9, Math.min(style.windows.height + (height - STOREY) * 0.9, height - style.windows.sill - 0.42));
}

/** Which floor (0 the ground floor) the height `y` over the pavement is on. */
export function floorAt(layout: StoreyLayout, y: number): number {
  let floor = 0;
  for (let f = 1; f < layout.foot.length; f++) if (y >= layout.foot[f]!) floor = f;
  return floor;
}
