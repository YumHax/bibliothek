import { type LightKind, Polygon, Sheet, type Rng } from './Sheet';
import { between, deg, integer, mixHex, pick, shade } from './paint';
import { CORNER, FRONTAGE, FRONT_END, FRONT_END_FROM, FRONT_END_TO, PARK_END, PARK_END_FROM, PARK_END_TO, PARK_FAR, PARK_FROM, PARK_TO, frontage, parkLine } from './plan';
import { FacadeFrame } from './FacadeFrame';
import { RETRO_GAMES, type PlannedShop, type Storefront, paintShopfronts } from './Shopfront';
import { FACADES, FLAT_IN_STREET, FRONT } from '../../street/streetPlan';
import { holidayBetween, paintPumpkin, wantsPumpkin } from './Holiday';
import { currentHoliday } from './season';

/**
 * The architecture of one building: its wall, the stone of its trims, how its windows are dressed
 * and what hangs off them. Picked per building so that no two neighbours look alike.
 */
interface Architecture {
  wall: string;
  trim: string;
  /** Mortar courses and odd bricks over the wall. */
  brick: boolean;
  window: 'plain' | 'lintel' | 'arched' | 'pediment';
  /** Window frames and bars. */
  frame: string;
  /** Colour of the open shutters either side of the windows, or none. */
  shutters: string | null;
  /** Share of the windows with a flower box on the sill. */
  flowers: number;
  /** Few: the odd balcony across a floor; haussmann: wrought-iron balconies along the second and top floors. */
  balconies: 'none' | 'few' | 'haussmann';
  /** Grooved stone ground floor, a stone band at every floor, stone blocks up the corners. */
  rusticated: boolean;
  courses: boolean;
  quoins: boolean;
  roof: 'mansard' | 'flat' | 'pitched';
}

const BRICKS = ['#b8654b', '#a86a52', '#9c6b55', '#8e4f3c', '#b0735a'];
const RENDERS = ['#c9a583', '#b99b6d', '#cdb79b', '#d8b49a', '#c8c2a8', '#e2cf9e', '#b9c2b0', '#8f8a80', '#d9b8b0'];
const STONES = ['#d9ccb4', '#e0d5c1', '#d4c6a8', '#cfc4b0'];
const SHUTTERS = ['#4f6b5a', '#5a7189', '#8c3b2e', '#e6dfcf', '#6b6f4a', '#3f4f6a'];
const FLOWERS = ['#d9383a', '#e0567a', '#f0f0e8', '#b04ac0', '#f09a3a', '#e8d040'];
const CURTAINS = ['#d9cfbf', '#c9b9a4', '#e6e0d4', '#b9b3a8', '#c9a58a', '#a8b4b8'];
const WINDOW_GLASS = '#34434f';
/** Ground floor height and floor-to-floor height, in metres. */
export const GROUND = 4.2;
const FLOOR = 3.1;

function architecture(random: Rng, stoneShare: number): Architecture {
  const r = random();
  if (r < stoneShare) {
    // Dressed stone: carved window heads, iron balconies, a slate mansard.
    return {
      wall: pick(random, STONES),
      trim: '#ece4d2',
      brick: false,
      window: random() < 0.6 ? 'pediment' : 'lintel',
      frame: '#ece8e0',
      shutters: null,
      flowers: 0.12,
      balconies: 'haussmann',
      rusticated: true,
      courses: true,
      quoins: false,
      roof: 'mansard',
    };
  }
  if (r < stoneShare + (1 - stoneShare) * 0.45) {
    return {
      wall: pick(random, BRICKS),
      trim: pick(random, ['#e0d6c2', '#d8cdb5', '#c9bda5']),
      brick: true,
      window: random() < 0.55 ? 'arched' : 'lintel',
      frame: random() < 0.7 ? '#e6e1d8' : '#2e3a34',
      shutters: null,
      flowers: 0.2,
      balconies: random() < 0.5 ? 'few' : 'none',
      rusticated: false,
      courses: random() < 0.6,
      quoins: random() < 0.4,
      roof: pick(random, ['flat', 'pitched', 'mansard'] as const),
    };
  }
  const wall = pick(random, RENDERS);
  return {
    wall,
    trim: shade(wall, 1.28),
    brick: false,
    window: random() < 0.7 ? 'plain' : 'lintel',
    frame: random() < 0.75 ? '#ebe7de' : '#3a3a3c',
    shutters: random() < 0.55 ? pick(random, SHUTTERS) : null,
    flowers: 0.3,
    balconies: random() < 0.5 ? 'few' : 'none',
    rusticated: false,
    courses: random() < 0.5,
    quoins: random() < 0.3,
    roof: pick(random, ['flat', 'flat', 'pitched', 'mansard'] as const),
  };
}

export interface BuildingSpec {
  /** Azimuth range of the facade. */
  a0: number;
  a1: number;
  /** Distance of the building line along an azimuth. */
  line: (a: number) => number;
  floors: number;
  /** Chance of a dressed stone front (the grander blocks). */
  stoneShare?: number;
  /** Whether its ground floor may hold shops. */
  shops?: boolean;
  /** Its ground floor is the retro games shop. */
  landmark?: boolean;
  /** The walkable street's shops on it, where the plan has them (then no lots are drawn for the ground floor). */
  planned?: readonly PlannedShop[];
}

/** Paints buildings shoulder to shoulder along `line` from azimuth `from` to `to`, `widths` metres each; returns their shops. */
export function paintFacadeRow(
  sheet: Sheet,
  random: Rng,
  from: number,
  to: number,
  line: (a: number) => number,
  floors: [number, number],
  widths: [number, number] = [9, 16],
  stoneShare = 0.25,
  /** Azimuth of the retro games shop, if this row has it. */
  landmarkAt?: number,
): Storefront[] {
  const shops: Storefront[] = [];
  let a = from;
  while (a < to) {
    const w = between(random, widths[0], widths[1]);
    const da = w / line(a);
    const landmark = landmarkAt !== undefined && a <= landmarkAt && landmarkAt < a + da;
    shops.push(...paintBuilding(sheet, random, { a0: a, a1: a + da, line, floors: integer(random, floors[0], floors[1]), stoneShare, shops: true, landmark }));
    a += da;
  }
  return shops;
}

/**
 * The far backdrops: the mid-rise blocks lining the far side of the park, and taller blocks a
 * few streets behind Front Street whose upper floors peek over its roofs. Painted before the park
 * and the street.
 */
export function paintBackdrops(sheet: Sheet, random: Rng): void {
  paintFacadeRow(sheet, random, PARK_FROM, PARK_TO, (a) => parkLine(a, PARK_FAR), [7, 11], [14, 26], 0.45);
  for (let i = 0; i < 26; i++) {
    const z = between(random, 110, 260);
    const x0 = between(random, -180, 420);
    const w = between(random, 18, 40);
    paintBuilding(sheet, random, { a0: Math.atan2(x0, z), a1: Math.atan2(x0 + w, z), line: (a) => z / Math.max(Math.cos(a), 0.06), floors: integer(random, 9, 18), stoneShare: 0.1 });
  }
}

/**
 * Front Street's block, from the corner all the way round behind the room. Returns what its
 * shops put out on the pavement (terraces, crates, flower buckets) for `paintStreet` to stand
 * in front of them once the pavement is down.
 */
export function paintFrontBlock(sheet: Sheet, random: Rng): Storefront[] {
  // The row across Front Street as the walkable street has it (`FACADES`, street-local x shifted to the eye's),
  // from the park corner along, its storeys and shops (RÉTRO JEUX among them); then the rest of the block by lots.
  const eyeX = -FLAT_IN_STREET.x;
  const row = FACADES.filter((spec) => spec.from[1] === FRONT.farLine && spec.to[1] === FRONT.farLine)
    .map((spec) => ({ spec, x0: Math.min(spec.from[0], spec.to[0]) + eyeX, x1: Math.max(spec.from[0], spec.to[0]) + eyeX }))
    .sort((a, b) => a.x0 - b.x0);
  const at = (x: number): number => Math.atan2(x, FRONTAGE);
  const line = (a: number): number => frontage(a);
  const shops: Storefront[] = [];
  for (const { spec, x0, x1 } of row) {
    const width = x1 - x0;
    // The plan measures along from the facade's +x end (its left seen from the street); the eye's frame starts at -x.
    const planned = spec.shops.map((shop) => ({ s0: width - shop.to, s1: width - shop.from, kind: shop.kind, name: shop.name }));
    shops.push(...paintBuilding(sheet, random, { a0: at(x0), a1: at(x1), line, floors: spec.storeys, shops: true, landmark: spec.shops.some((shop) => shop.kind === 'retro'), planned }));
  }
  const end = row.length ? at(row[row.length - 1]!.x1) : CORNER;
  shops.push(...paintFacadeRow(sheet, random, end, deg(180), line, [5, 6]));
  return shops.filter((shop) => shop.a1 < deg(80) && frontage(shop.a0) <= FRONTAGE * 4);
}

/**
 * The buildings standing across the far ends of both streets, facing down them: the view along
 * Front Street and along Park Street closes on a facade instead of running on to the horizon.
 * Painted after Front Street's block (they stand in front of its far end) and before the street,
 * whose ground stops at their foot (`ground()`).
 */
export function paintStreetEnds(sheet: Sheet, random: Rng): void {
  const ends: [number, number, (a: number) => number][] = [
    [FRONT_END_FROM, FRONT_END_TO, (a) => FRONT_END / Math.max(Math.sin(a), 0.06)],
    [PARK_END_FROM, PARK_END_TO, (a) => PARK_END / Math.max(-Math.cos(a), 0.06)],
  ];
  // Two buildings across each end, exactly filling it: one more would stand in the park or the block beside.
  for (const [from, to, line] of ends) {
    const mid = from + (to - from) * between(random, 0.4, 0.6);
    for (const [a0, a1] of [[from, mid], [mid, to]] as const) paintBuilding(sheet, random, { a0, a1, line, floors: integer(random, 6, 8), stoneShare: 0.4 });
  }
}

/**
 * One building: wall (brick, render or dressed stone), the ground floor (shops, or a door between
 * windows), floors of dressed windows (surrounds, bars, curtains, shutters, flower boxes, the odd
 * balcony), a cornice and a roof with its chimneys. Far buildings drop the fine details and keep
 * the windows as dots. Returns the shops on its ground floor.
 */
export function paintBuilding(sheet: Sheet, random: Rng, spec: BuildingSpec): Storefront[] {
  const { floors } = spec;
  const f = new FacadeFrame(sheet, spec.a0, spec.a1, spec.line);
  const { d, w, fine } = f;
  const arch = architecture(random, spec.stoneShare ?? 0.25);
  const h = GROUND + (floors - 1) * FLOOR + 0.5;
  const cols = Math.max(1, Math.floor(w / 2.7));
  const pitch = w / cols;
  const winW = Math.min(1.35, pitch * 0.55);
  let shops: Storefront[] = [];

  sheet.begin(d, 0.05);
  sheet.wrapped(f.P(0, 0)[0], f.P(w, 0)[0], () => {
    // The wall, down below the pavement line so no sky shows under it, in the street's shade towards the bottom.
    const body = f.strip(0, w, -1.5, h);
    sheet.path(body, arch.wall);
    if (fine) paintWallTexture(f, random, arch, h);
    f.detail(body, f.vertical(0, h, [[0, 'rgba(255,255,255,0.05)'], [0.55, 'rgba(0,0,0,0.04)'], [1, 'rgba(0,0,0,0.3)']]));

    // Street level: shops, or a residential entrance between windows.
    if (spec.planned ? spec.planned.length > 0 : spec.landmark || (spec.shops && fine && random() < 0.72)) {
      shops = paintShopfronts(f, random, arch.wall, spec.landmark ? RETRO_GAMES : undefined, spec.planned);
    } else {
      sheet.path(f.strip(0, w, -1.5, GROUND - 0.5), arch.rusticated ? shade(arch.wall, 0.95) : shade(arch.wall, 0.82));
      if (fine) {
        if (arch.rusticated) paintGrooves(f, 0, GROUND - 0.5);
        paintEntrance(f, random, arch, w / 2);
      }
      for (let c = 0; c < cols; c++) {
        const s0 = c * pitch + (pitch - winW) / 2;
        if (Math.abs(s0 + winW / 2 - w / 2) < 1.4) continue; // the door is there
        paintWindow(f, random, arch, s0, s0 + winW, 1.1, 3.0, 0.3, false);
      }
    }
    if (fine && arch.courses) f.detail(f.strip(0, w, GROUND - 0.5, GROUND - 0.25), shade(arch.trim, 0.95));

    // Upper floors.
    for (let fl = 1; fl < floors; fl++) {
      const hb = GROUND + (fl - 1) * FLOOR + 0.55;
      const ht = hb + 1.95;
      const haussmann = arch.balconies === 'haussmann' && (fl === 1 || fl === floors - 1);
      const balcony = fine && (haussmann || (arch.balconies === 'few' && random() < 0.25));
      if (fine && arch.courses && fl > 1) f.detail(f.strip(0, w, hb - 0.6, hb - 0.45), shade(arch.trim, 0.9));
      for (let c = 0; c < cols; c++) {
        const s0 = c * pitch + (pitch - winW) / 2;
        // Tall French windows onto the balconies.
        paintWindow(f, random, arch, s0, s0 + winW, balcony ? hb - 0.4 : hb, ht, 0.34, fl === 1 && !balcony);
      }
      if (balcony) paintBalcony(f, random, arch, haussmann ? 0.1 : between(random, 0.2, w * 0.3), haussmann ? w - 0.1 : between(random, w * 0.7, w - 0.2), hb - 0.45, haussmann);
    }
    if (fine && arch.quoins) paintQuoins(f, arch, h);
    if (fine && random() < 0.6) {
      // A downpipe from the gutter, darker than the wall.
      const s = random() < 0.5 ? 0.3 : w - 0.4;
      f.detail(f.quad(s, s + 0.12, 0, h), shade(arch.wall, 0.5));
    }
    // Party wall: a shadow line along the left edge.
    f.detail(f.quad(0, Math.min(0.15, w * 0.02), -1.5, h + 0.6), 'rgba(0,0,0,0.35)');

    paintRoof(f, random, arch, h, cols, pitch, winW);
  });
  return shops;
}

/** Brick courses or weathered render over the wall. */
function paintWallTexture(f: FacadeFrame, random: Rng, arch: Architecture, h: number): void {
  const ctx = f.sheet.color;
  const { y: pxY } = f.pxPerMetre;
  if (arch.brick) {
    // Mortar every few courses, and bricks a shade off here and there.
    const step = Math.max(0.3, 2.2 / pxY);
    for (let y = 0.2; y < h; y += step) f.detail(f.strip(0, f.w, y, y + Math.min(0.05, step * 0.3)), 'rgba(235,225,210,0.08)');
    const n = Math.min(700, Math.floor(f.w * h * 1.4));
    for (let i = 0; i < n; i++) {
      const s = random() * f.w;
      const y = random() * h;
      ctx.fillStyle = random() < 0.5 ? 'rgba(60,20,10,0.12)' : 'rgba(255,220,190,0.09)';
      const [x0, y0] = f.P(s, y + 0.075);
      const [x1] = f.P(s + 0.25, y);
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, 0.075 * pxY));
    }
  } else {
    // Soft blotches of weathering, darker streaks under the cornice.
    for (let i = 0; i < 14; i++) {
      const s = random() * f.w;
      const y = random() * h;
      const [cx, cy] = f.P(s, y);
      const r = between(random, 1.5, 4) * pxY;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    for (let i = 0; i < 6; i++) {
      const s = random() * f.w;
      f.detail(f.quad(s, s + between(random, 0.2, 0.6), h - between(random, 2, 6), h - 0.3), f.vertical(h - 6, h - 0.3, [[0, 'rgba(40,35,30,0.12)'], [1, 'rgba(40,35,30,0)']]));
    }
  }
}

/** Horizontal grooves of a rusticated stone base. */
function paintGrooves(f: FacadeFrame, hB: number, hT: number): void {
  for (let y = hB + 0.45; y < hT; y += 0.45) f.detail(f.strip(0, f.w, y, y + 0.05), 'rgba(0,0,0,0.16)');
}

/** Stone blocks up both corners, long and short in turn. */
function paintQuoins(f: FacadeFrame, arch: Architecture, h: number): void {
  let long = true;
  const stone = mixHex(arch.wall, arch.trim, 0.6);
  for (let y = 0.3; y < h - 0.6; y += 0.62) {
    const width = long ? 0.7 : 0.45;
    f.detail(f.quad(0.15, 0.15 + width, y, y + 0.55), stone);
    f.detail(f.quad(f.w - 0.15 - width, f.w - 0.15, y, y + 0.55), stone);
    long = !long;
  }
}

/** A residential entrance at `s`: steps, a panelled door under a fanlight, a house number lamp. */
function paintEntrance(f: FacadeFrame, random: Rng, arch: Architecture, s: number): void {
  const door = pick(random, ['#2c2622', '#3a2418', '#1f3a34', '#2a3450', '#5a1f1f']);
  f.detail(f.quad(s - 0.95, s + 0.95, 0, 3.35), arch.trim);
  f.detail(f.quad(s - 0.75, s + 0.75, 0.15, 2.55), door);
  f.detail(f.quad(s - 0.02, s + 0.02, 0.15, 2.55), 'rgba(0,0,0,0.4)');
  for (const [a, b] of [[0.4, 1.2], [1.45, 2.35]] as const) {
    f.detail(f.quad(s - 0.62, s - 0.12, a, b), 'rgba(255,255,255,0.08)');
    f.detail(f.quad(s + 0.12, s + 0.62, a, b), 'rgba(255,255,255,0.08)');
  }
  const fan = f.quad(s - 0.7, s + 0.7, 2.62, 3.2);
  f.detail(fan, WINDOW_GLASS);
  // The hall light behind the fanlight: on in the evening, off once the building sleeps.
  f.sheet.lit(fan, 'warm', 0.7, between(random, 0.3, 0.7));
  f.detail(f.quad(s - 1.05, s + 1.05, -0.2, 0.15), shade(arch.trim, 0.8));
}

/**
 * One window from `s0` to `s1`, `hb` to `ht` up: its surround, the glass mirroring the sky with
 * curtains or a blind behind it, glazing bars, the sill, shutters and a flower box when the
 * architecture has them; at night it may light up, with the furniture and curtains in it dimmer
 * than the bare glass.
 */
function paintWindow(f: FacadeFrame, random: Rng, arch: Architecture, s0: number, s1: number, hb: number, ht: number, litShare: number, nobile: boolean): void {
  const { sheet, d, fine } = f;
  const winW = s1 - s0;
  const arched = arch.window === 'arched';
  const rise = arched ? winW * 0.22 : 0;
  // The glass: a rectangle, its top a flat segmental arch on arched fronts.
  const corners: [number, number][] = [f.P(s0, hb), f.P(s1, hb)];
  if (arched) for (let i = 0; i <= 6; i++) corners.push(f.P(s1 - (winW * i) / 6, ht - rise + rise * Math.sin((Math.PI * i) / 6)));
  else corners.push(f.P(s1, ht), f.P(s0, ht));
  const glass = new Polygon(corners);

  if (fine) {
    // Surround: a painted frame, a stone lintel or arch, or a carved head with a pediment on the main floor.
    if (arch.shutters) {
      const sw = winW * 0.5;
      for (const [a, b] of [[s0 - sw - 0.05, s0 - 0.05], [s1 + 0.05, s1 + sw + 0.05]] as const) {
        f.detail(f.quad(a, b, hb, ht), arch.shutters);
        for (let y = hb + 0.15; y < ht - 0.1; y += 0.16) f.detail(f.quad(a + 0.04, b - 0.04, y, y + 0.05), shade(arch.shutters, 0.72));
      }
    }
    if (arch.window === 'lintel' || arch.window === 'pediment') {
      f.detail(f.quad(s0 - 0.18, s1 + 0.18, ht + 0.02, ht + 0.3), arch.trim);
      f.detail(f.quad(s0 - 0.18, s1 + 0.18, ht + 0.02, ht + 0.07), 'rgba(0,0,0,0.25)');
      if (arch.window === 'pediment' && nobile) {
        const p = new Path2D();
        const [xa, ya] = f.P(s0 - 0.25, ht + 0.32);
        const [xb, yb] = f.P(s1 + 0.25, ht + 0.32);
        const [xc, yc] = f.P((s0 + s1) / 2, ht + 0.85);
        p.moveTo(xa, ya);
        p.lineTo(xb, yb);
        p.lineTo(xc, yc);
        p.closePath();
        f.detail(p, arch.trim);
      }
      f.detail(f.quad(s0 - 0.08, s1 + 0.08, hb - 0.06, ht + 0.02), shade(arch.trim, 0.92));
    } else if (arched) {
      const ring: [number, number][] = [f.P(s0 - 0.14, ht - rise), f.P(s1 + 0.14, ht - rise)];
      for (let i = 0; i <= 6; i++) ring.push(f.P(s1 + 0.14 - ((winW + 0.28) * i) / 6, ht - rise + (rise + 0.26) * Math.sin((Math.PI * i) / 6)));
      const p = new Path2D();
      ring.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
      p.closePath();
      f.detail(p, arch.trim);
      f.detail(f.quad(s0 - 0.08, s1 + 0.08, hb - 0.06, ht - rise), shade(arch.wall, 0.7));
    } else {
      f.detail(f.quad(s0 - 0.1, s1 + 0.1, hb - 0.08, ht + 0.1), arch.frame);
    }
  }

  sheet.begin(d, 0.22);
  sheet.path(glass, WINDOW_GLASS);
  sheet.begin(d, 0.05);
  const strength = between(random, 0.7, 1);
  const lit = random() < litShare;
  // Homes: bedtimes spread evenly through the night, so about as many stay up as the city is awake.
  const curfew = random();
  // Most rooms are lamplit; some have a whiter ceiling light; the blue ones are televisions, which flicker.
  const k = random();
  const kind: LightKind = k < 0.16 ? 'cool' : k < 0.3 ? 'neutral' : 'warm';
  const tv = kind === 'cool';
  if (lit) sheet.lit(glass, kind, strength, curfew, tv);
  if (fine) {
    f.detail(glass, f.vertical(hb, ht, [[0, 'rgba(190,210,230,0.35)'], [0.6, 'rgba(120,140,160,0.08)'], [1, 'rgba(0,0,0,0.18)']]));
    const inside = random();
    if (inside < 0.1) {
      // Curtains drawn right across: the room's light glows through the cloth, dimmer and warmer.
      const both = f.quad(s0 + 0.02, s1 - 0.02, hb + 0.03, ht - 0.03 - rise);
      f.detail(both, pick(random, CURTAINS));
      f.detail(f.quad((s0 + s1) / 2 - 0.02, (s0 + s1) / 2 + 0.02, hb + 0.03, ht - 0.03 - rise), 'rgba(0,0,0,0.2)');
      if (lit) sheet.lit(both, 'warm', strength * 0.45, curfew);
    } else if (inside < 0.45) {
      // Curtains drawn to one side, or both.
      const both = random() < 0.4;
      const cw = winW * between(random, both ? 0.18 : 0.25, both ? 0.28 : 0.45);
      const color = pick(random, CURTAINS);
      const left = random() < 0.5;
      const panels: [number, number][] = both ? [[s0, s0 + cw], [s1 - cw, s1]] : [left ? [s0, s0 + cw] : [s1 - cw, s1]];
      for (const [a, b] of panels) {
        const panel = f.quad(a, b, hb + 0.05, ht - 0.05 - rise);
        f.detail(panel, color);
        if (lit) sheet.lit(panel, 'warm', strength * 0.7, curfew);
      }
    } else if (inside < 0.6) {
      // A blind half down.
      const blind = f.quad(s0 + 0.03, s1 - 0.03, ht - rise - (ht - hb) * between(random, 0.25, 0.55), ht - rise - 0.03);
      f.detail(blind, pick(random, ['#e8e0cc', '#d8cfb8', '#c9d0d4']));
      if (lit) sheet.lit(blind, 'warm', strength * 0.8, curfew);
    }
    if (lit && inside >= 0.1 && random() < 0.6) {
      // The dark shapes of furniture in the lower part of the room.
      sheet.lit(f.quad(s0 + winW * between(random, 0, 0.4), s1 - winW * between(random, 0, 0.3), hb, hb + (ht - hb) * between(random, 0.2, 0.35)), kind, strength * 0.45, curfew, tv);
    }
    if (lit && inside >= 0.1 && random() < 0.14) {
      // Someone standing in the room, a dark figure against the light: shoulders, then the head.
      const at = between(random, s0 + winW * 0.3, s1 - winW * 0.3);
      const foot = hb + (ht - hb) * 0.05;
      const shoulders = hb + (ht - hb) * 0.62;
      sheet.dim(f.quad(at - 0.22, at + 0.22, foot, shoulders), kind, strength * 0.2);
      const head = new Path2D();
      const [hx, hy] = f.P(at, shoulders + 0.17);
      head.ellipse(hx, hy, Math.max(0.6, f.pxPerMetre.x * 0.11), Math.max(0.6, f.pxPerMetre.y * 0.13), 0, 0, Math.PI * 2);
      sheet.dim(head, kind, strength * 0.2);
    }
    // Glazing bars: a centre bar, and a transom near the top of tall windows.
    const bar = 0.05;
    const mid = (s0 + s1) / 2;
    const bars = [f.quad(mid - bar, mid + bar, hb, ht - rise), f.quad(s0, s1, ht - rise - (ht - hb) * 0.26, ht - rise - (ht - hb) * 0.26 + bar * 1.6)];
    for (const b of bars) {
      f.detail(b, arch.frame);
      if (lit) sheet.lit(b, kind, strength * 0.2, curfew, tv);
    }
    // The sill, and sometimes a flower box on it.
    f.detail(f.quad(s0 - 0.15, s1 + 0.15, hb - 0.16, hb - 0.04), shade(arch.trim, 1.05));
    if (random() < arch.flowers) paintFlowerBox(f, random, s0, s1, hb);
    if (lit && currentHoliday() === 'halloween' && wantsPumpkin()) {
      const [px, py] = f.P(holidayBetween(s0 + 0.2, s1 - 0.2), hb - 0.04);
      paintPumpkin(sheet, px, py, f.pxPerMetre.y * 0.45);
    }
  }
}

/** A trough on the sill, spilling geraniums and trailing leaves. */
function paintFlowerBox(f: FacadeFrame, random: Rng, s0: number, s1: number, hb: number): void {
  const ctx = f.sheet.color;
  const { y: pxY } = f.pxPerMetre;
  f.detail(f.quad(s0 - 0.05, s1 + 0.05, hb - 0.02, hb + 0.2, 0.15), pick(random, ['#9a5a3a', '#6a5a4a', '#e8e4dc', '#3a4a3a']));
  const leaves = '#3f6b33';
  const flower = pick(random, FLOWERS);
  const n = Math.floor((s1 - s0) * 14);
  const dot = Math.max(1, 0.1 * pxY);
  for (let i = 0; i < n; i++) {
    const [x, y] = f.P(between(random, s0, s1), hb + between(random, 0.15, 0.42), 0.15);
    ctx.fillStyle = random() < 0.55 ? leaves : flower;
    ctx.fillRect(x, y, dot * 1.2, dot);
  }
  // Trailing strands over the front of the box.
  for (let i = 0; i < n / 3; i++) {
    const [x, y] = f.P(between(random, s0, s1), hb + 0.18, 0.2);
    ctx.fillStyle = leaves;
    ctx.fillRect(x, y, Math.max(1, dot * 0.6), dot * between(random, 1.5, 4));
  }
}

/**
 * A balcony from `s0` to `s1` whose floor is at `hb`: the slab sticking out from the wall (its top
 * seen from above, its edge from the front), a wrought-iron railing and, now and then, pots and a
 * little table behind it. Haussmann balconies are shallower, with a denser, patterned railing.
 */
function paintBalcony(f: FacadeFrame, random: Rng, arch: Architecture, s0: number, s1: number, hb: number, haussmann: boolean): void {
  const { sheet, d } = f;
  const depth = haussmann ? 0.6 : 1.1;
  const iron = '#1f2224';
  // The shadow the slab throws on the wall below it.
  f.detail(f.strip(s0, s1, hb - 0.9, hb - 0.2), f.vertical(hb - 0.9, hb - 0.2, [[0, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0)']]));
  sheet.begin(d - depth / 2, 0.05);
  sheet.path(f.slab(s0, s1, hb, 0, depth), shade(arch.trim, 0.9));
  sheet.path(f.strip(s0, s1, hb - 0.18, hb, depth), shade(arch.trim, 0.78));
  // Pots and greenery standing on the slab.
  if (random() < 0.6) {
    const ctx = sheet.color;
    const { y: pxY } = f.pxPerMetre;
    for (let i = integer(random, 1, 4); i > 0; i--) {
      const s = between(random, s0 + 0.3, s1 - 0.5);
      const [x, y] = f.P(s, hb, depth * 0.5);
      const r = between(random, 0.25, 0.5) * pxY;
      ctx.fillStyle = '#9a5a3a';
      ctx.fillRect(x - r * 0.5, y - r * 0.6, r, r * 0.6);
      ctx.fillStyle = pick(random, ['#3f6b33', '#4d7a3a', '#5a8a44']);
      ctx.beginPath();
      ctx.arc(x, y - r * 1.1, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Railing: top and bottom rails, balusters, a band of scrollwork on the grander ones.
  const top = hb + 1.0;
  sheet.path(f.strip(s0, s1, top - 0.06, top, depth), iron);
  sheet.path(f.strip(s0, s1, hb + 0.05, hb + 0.1, depth), iron);
  const step = haussmann ? 0.16 : 0.22;
  for (let s = s0 + 0.05; s < s1; s += step) sheet.path(f.quad(s, s + 0.035, hb + 0.05, top, depth), iron);
  if (haussmann) sheet.path(f.strip(s0, s1, hb + 0.62, hb + 0.7, depth), iron);
}

/** Cornice, then a slate mansard with dormers, a tiled pitched roof or a flat roof with its clutter; chimney stacks with pots on top. */
function paintRoof(f: FacadeFrame, random: Rng, arch: Architecture, h: number, cols: number, pitch: number, winW: number): void {
  const { sheet, d, w, fine } = f;
  sheet.begin(d, 0.05);
  sheet.path(f.strip(-0.15, w + 0.15, h, h + 0.55), shade(arch.trim, arch.brick ? 1 : 1.02));
  f.detail(f.strip(-0.15, w + 0.15, h + 0.4, h + 0.55), 'rgba(255,255,255,0.12)');
  if (fine) {
    // Brackets (modillions) under the cornice.
    for (let s = 0.3; s < w - 0.2; s += 0.55) f.detail(f.quad(s, s + 0.14, h - 0.2, h), shade(arch.trim, 0.8));
  }
  f.detail(f.strip(0, w, h - 0.35, h), 'rgba(0,0,0,0.3)');
  const base = h + 0.55;
  if (arch.roof === 'mansard' || arch.roof === 'pitched') {
    const mansard = arch.roof === 'mansard';
    const top = base + (mansard ? 3.2 : 2.6);
    const inset = Math.min(mansard ? 1.4 : 1.0, w * 0.12);
    const p = new Path2D();
    const [x0, y0] = f.P(0, base);
    const [x1, y1] = f.P(w, base);
    const [x2, y2] = f.P(w - inset, top);
    const [x3, y3] = f.P(inset, top);
    p.moveTo(x0, y0);
    p.lineTo(x1, y1);
    p.lineTo(x2, y2);
    p.lineTo(x3, y3);
    p.closePath();
    const slate = mansard ? pick(random, ['#4a4f58', '#545a63', '#3f454e']) : pick(random, ['#9a5a3d', '#8a4a32', '#a8664a']);
    sheet.begin(d, mansard ? 0.15 : 0.05, { wet: 0.3, snow: 0.8 });
    sheet.path(p, slate);
    if (fine) {
      // Zinc seams or tile courses.
      if (mansard) for (let s = 0.4; s < w; s += 0.5) f.detail(f.quad(s, s + 0.04, base, top), 'rgba(255,255,255,0.08)');
      else for (let y = base + 0.25; y < top; y += 0.3) f.detail(f.strip(inset * ((y - base) / (top - base)), w - inset * ((y - base) / (top - base)), y, y + 0.06), 'rgba(0,0,0,0.14)');
      f.detail(p, f.vertical(base, top, [[0, 'rgba(255,255,255,0.1)'], [1, 'rgba(0,0,0,0.12)']]));
      // Weathering: rain streaks down the slope, moss and lichen on old tiles.
      for (let i = integer(random, 3, 8); i > 0; i--) {
        const s = between(random, inset + 0.3, w - inset - 0.6);
        f.detail(f.quad(s, s + between(random, 0.15, 0.5), base, base + (top - base) * between(random, 0.4, 0.9)), mansard ? 'rgba(20,24,30,0.12)' : 'rgba(60,70,30,0.12)');
      }
      if (!mansard) {
        // Roof windows set in the slope, and the ridge tiles along the top.
        for (let i = random() < 0.5 ? integer(random, 1, 2) : 0; i > 0; i--) {
          const s = between(random, inset + 0.8, w - inset - 1.8);
          const pane = f.quad(s, s + 0.8, base + 0.8, base + 1.9);
          sheet.begin(d, 0.35);
          sheet.path(f.quad(s - 0.08, s + 0.88, base + 0.72, base + 1.98), '#6a6e72');
          sheet.path(pane, WINDOW_GLASS);
          sheet.begin(d, 0.05, { wet: 0.3, snow: 0.8 });
          if (random() < 0.4) sheet.lit(pane, 'warm', 0.8, random());
        }
        f.detail(f.quad(inset, w - inset, top - 0.08, top + 0.1), shade(slate, 0.75));
      }
    }
    f.detail(f.quad(inset, w - inset, top - 0.18, top), mansard ? '#6b717c' : '#b9755a');
    if (fine && mansard) {
      for (let c = 0; c < cols; c++) {
        const s0 = c * pitch + (pitch - winW * 0.7) / 2;
        const s1 = s0 + winW * 0.7;
        // Dormer: cheeks, a little pediment, the pane.
        f.detail(f.quad(s0 - 0.15, s1 + 0.15, base + 0.5, base + 2.1), arch.trim);
        const cap = new Path2D();
        const [ca, cb] = [f.P(s0 - 0.25, base + 2.05), f.P(s1 + 0.25, base + 2.05)];
        const cc = f.P((s0 + s1) / 2, base + 2.55);
        cap.moveTo(...ca);
        cap.lineTo(...cb);
        cap.lineTo(...cc);
        cap.closePath();
        f.detail(cap, shade(arch.trim, 0.9));
        const pane = f.quad(s0, s1, base + 0.7, base + 1.9);
        f.detail(pane, WINDOW_GLASS);
        f.detail(f.quad((s0 + s1) / 2 - 0.03, (s0 + s1) / 2 + 0.03, base + 0.7, base + 1.9), arch.frame);
        if (random() < 0.3) sheet.lit(pane, 'warm', between(random, 0.7, 1), random());
      }
    }
  } else {
    // Parapet, then the clutter of a flat roof: lift housing, a water tank, an aerial.
    sheet.path(f.strip(0, w, base, base + 0.7), shade(arch.wall, 0.9));
    f.detail(f.strip(0, w, base + 0.6, base + 0.7), shade(arch.trim, 0.95));
    for (let i = integer(random, 0, 2); i > 0; i--) {
      const s = between(random, 1, Math.max(1.5, w - 3));
      sheet.path(f.quad(s, s + between(random, 1.2, 2.4), base, base + between(random, 1.2, 2.2)), shade(arch.wall, 0.7));
    }
    if (fine) {
      // Air-conditioning units and vent stacks along the parapet, a satellite dish on a bracket.
      for (let i = integer(random, 0, 3); i > 0; i--) {
        const s = between(random, 0.6, Math.max(1, w - 1.6));
        const unit = f.quad(s, s + 0.9, base + 0.7, base + 1.35, -0.4);
        sheet.path(unit, '#b8bcbe');
        f.detail(f.quad(s + 0.1, s + 0.55, base + 0.8, base + 1.25, -0.4), 'rgba(0,0,0,0.25)');
      }
      for (let i = integer(random, 0, 3); i > 0; i--) {
        const s = between(random, 0.5, Math.max(1, w - 0.5));
        sheet.path(f.quad(s, s + 0.14, base + 0.7, base + between(random, 1.1, 1.8), -0.8), '#6a6c6e');
      }
      if (random() < 0.4) {
        const s = between(random, 0.8, Math.max(1, w - 1.2));
        const [cx, cy] = f.P(s, base + 1.4, -0.5);
        const { x: px, y: py } = f.pxPerMetre;
        const dish = new Path2D();
        dish.ellipse(cx, cy, Math.max(1, px * 0.35), Math.max(1, py * 0.4), -0.4, 0, Math.PI * 2);
        sheet.path(f.quad(s - 0.03, s + 0.03, base + 0.7, base + 1.3, -0.5), '#8a8c8e');
        sheet.path(dish, '#d8d8d4');
      }
    }
    if (fine && random() < 0.18) {
      const s = between(random, 1, Math.max(2, w - 3.5));
      sheet.path(f.quad(s + 0.3, s + 0.5, base, base + 1.6), '#2a2724');
      sheet.path(f.quad(s + 1.9, s + 2.1, base, base + 1.6), '#2a2724');
      sheet.path(f.quad(s, s + 2.4, base + 1.6, base + 4.0), '#5a4a3c');
      for (let y = base + 1.9; y < base + 4; y += 0.45) f.detail(f.quad(s, s + 2.4, y, y + 0.05), 'rgba(0,0,0,0.25)');
      const cone = new Path2D();
      cone.moveTo(...f.P(s, base + 4.0));
      cone.lineTo(...f.P(s + 2.4, base + 4.0));
      cone.lineTo(...f.P(s + 1.2, base + 5.0));
      cone.closePath();
      sheet.path(cone, '#4a3c30');
    }
  }
  // Chimney stacks, with their pots, standing up from the roof ridge.
  const roofTop = base + (arch.roof === 'mansard' ? 3.2 : arch.roof === 'pitched' ? 2.6 : 0.7);
  sheet.begin(d, 0.05);
  for (let i = integer(random, 1, 3); i > 0; i--) {
    const s = between(random, 0.8, Math.max(1, w - 1.8));
    const cw = between(random, 0.8, 1.6);
    const ch = roofTop + between(random, 0.8, 1.6);
    const stack = arch.brick || random() < 0.5 ? mixHex(pick(random, BRICKS), '#000000', 0.1) : shade(arch.wall, 0.85);
    sheet.path(f.quad(s, s + cw, roofTop - 1, ch), stack);
    sheet.path(f.quad(s - 0.06, s + cw + 0.06, ch, ch + 0.15), shade(stack, 1.2));
    if (fine) {
      f.detail(f.quad(s + cw * 0.6, s + cw, roofTop - 1, ch), 'rgba(0,0,0,0.2)');
      for (let k = 0; k < Math.floor(cw / 0.35); k++) sheet.path(f.quad(s + 0.1 + k * 0.35, s + 0.3 + k * 0.35, ch + 0.15, ch + 0.5), '#b86a44');
    }
  }
  if (fine && random() < 0.35) {
    // A television aerial on a mast.
    const s = between(random, 1, Math.max(1.5, w - 1));
    sheet.path(f.quad(s, s + 0.05, roofTop, roofTop + 2.4), '#2a2a2c');
    for (const [y, span] of [[2.2, 0.9], [1.8, 0.7], [1.4, 0.5]] as const) sheet.path(f.quad(s - span / 2, s + span / 2, roofTop + y, roofTop + y + 0.04), '#2a2a2c');
  }
}
