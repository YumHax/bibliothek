import { type LightKind, Polygon, Sheet, type Rng, type Surface, groundSquash, sizePx, worldPoint } from './Sheet';
import { between, integer, mixHex, pick, shade } from './paint';
import { COURT_BACK, COURT_EAST, COURT_FROM, COURT_TO } from './plan';
import { paintGroundBand } from './Street';
import { TREE_STYLES, paintTree } from './Tree';
import { paintBicycle } from './StreetFurniture';
import { type Footprint, paintBox, paintGroundShadow, paintPost } from './Solid';
import { groundEllipse } from './ParkFeatures';
import { currentSeason, seasonalLawn } from './season';

/**
 * Our own block's inner courtyard, behind the building (azimuths +90°..180°, `COURT_*` in
 * `plan.ts`): the rear facades of the neighbouring buildings closing it at 15-28 m (plain render,
 * drainpipes, stacked steel balconies with laundry, stairwell windows lit on their timers, windows
 * lit at night and going out through it, the odd flickering television), tiled and tarred roofs
 * crowded with chimneys, and 18 m below the eye the courtyard itself: granite setts, a lawn with a
 * chestnut, a sandpit, a row of wheelie bins, bikes against the wall, a shed, a carpet-beating rack.
 * Seen from the kitchen's back window; beyond the roofs, the skyline already painted.
 */

/** A wall of the courtyard: where its first end stands, which way it runs, how long it is. */
interface WallSpec {
  x: number;
  z: number;
  dir: [number, number];
  width: number;
}

/** One rear building: its wall, storeys, roof and how far its roof's back edge runs on into the corner. */
interface CourtBuilding extends WallSpec {
  floors: number;
  roof: 'gable' | 'pent' | 'flat';
  /** Metres the roof's back edge carries on beyond the wall's first / last end (the wings meeting at a corner). */
  extend: [number, number];
}

/** How deep a wing is, wall to wall: the roofs rise to a ridge half-way back (or all the way for a pent roof). */
const WING_DEPTH = 9;
/** The buildings round the courtyard, a side wing down the right, a rear building across the back. */
const BUILDINGS: readonly CourtBuilding[] = [
  { x: COURT_EAST, z: 0, dir: [0, -1], width: 11, floors: 6, roof: 'pent', extend: [0, 0] },
  { x: COURT_EAST, z: -11, dir: [0, -1], width: COURT_BACK - 11, floors: 5, roof: 'gable', extend: [0, WING_DEPTH / 2] },
  { x: COURT_EAST, z: -COURT_BACK, dir: [-1, 0], width: 8, floors: 5, roof: 'gable', extend: [WING_DEPTH / 2, 0] },
  { x: 7, z: -COURT_BACK, dir: [-1, 0], width: 7, floors: 6, roof: 'flat', extend: [0, 0] },
];
/** Ground floor height and floor-to-floor height of the rear buildings, in metres. */
const GROUND_FLOOR = 3.4;
const STOREY = 3.0;
/** The courtyard's renders: greyer and plainer than the street fronts. */
const RENDERS = ['#c9bfae', '#bdb3a0', '#d2c8b4', '#b5ab98', '#c4b8a0', '#a9a397', '#d8cfbd', '#c7b49a', '#b9b4a6'];
/** Yellow and red Berlin brick, for the one front left unrendered. */
const BRICKS = ['#c9a86a', '#b8784e', '#a8674a'];
const GLASS = '#34434f';
const FROSTED = '#b4bcbf';
const TILES = ['#9a5a3d', '#8a4a32', '#a8664a', '#7a4636'];
const TAR = '#4a4a4c';
const ZINC = '#7d848a';
const STEEL = '#3a3e42';
const CURTAINS = ['#d9cfbf', '#c9b9a4', '#e6e0d4', '#b9b3a8', '#c9a58a', '#a8b4b8'];
const PANELS = ['#c9c4b8', '#6f8a9a', '#a85a44', '#d8d2c0', '#5a7a5a'];
const CLOTHES = ['#f0ede4', '#d94f3a', '#3b6fb3', '#2f2f36', '#e8d24a', '#8c4f9e', '#9ac0d8', '#e0a0b0'];
const BINS = ['#4a4d50', '#4a4d50', '#2d5aa0', '#e0b93a', '#6b4a2e', '#3d7a45'];
const SETTS = '#8a867e';
/** How the courtyard takes the weather: the setts puddle, the lawn soaks it up, snow lies on both. */
const SETT_SURFACE: Surface = { wet: 0.7, snow: 1 };
const LAWN_SURFACE: Surface = { wet: 0.15, snow: 1 };
const ROOF_SURFACE: Surface = { wet: 0.3, snow: 0.85 };
/** Nothing is painted at x < MIN_X: past our side wall's plane the view is Park Street's, across the seam. */
const MIN_X = 0.02;

/**
 * A courtyard wall as a drawing frame: positions are `s` metres along it from its first end, `h`
 * above the courtyard and `off` metres out from it towards the eye, placed in true perspective
 * (these walls are too near and too oblique for `FacadeFrame`'s even spread in azimuth).
 */
class CourtWall {
  /** Distance of the wall's middle, and its unit normal turned to the eye. */
  readonly d: number;
  private readonly normal: [number, number];

  constructor(
    readonly sheet: Sheet,
    readonly spec: WallSpec,
  ) {
    const [dx, dz] = spec.dir;
    const mx = spec.x + (dx * spec.width) / 2;
    const mz = spec.z + (dz * spec.width) / 2;
    this.normal = -dz * -mx + dx * -mz > 0 ? [-dz, dx] : [dz, -dx];
    this.d = Math.hypot(mx, mz);
  }

  get w(): number {
    return this.spec.width;
  }

  /** The world point `s` along and `off` out. */
  at(s: number, off = 0): [number, number] {
    const { x, z, dir } = this.spec;
    return [Math.max(MIN_X, x + dir[0] * s + this.normal[0] * off), z + dir[1] * s + this.normal[1] * off];
  }

  /** Texture point `s` along, `h` up, `off` out. */
  P(s: number, h: number, off = 0): [number, number] {
    const [x, z] = this.at(s, off);
    return worldPoint(x, z, h);
  }

  /** Texture pixels per metre around `s`. */
  px(s: number): number {
    return sizePx(1, Math.hypot(...this.at(s)));
  }

  /** A small upright rectangle on the wall (or `off` in front of it): convex, fit for `Sheet.lit`. */
  quad(s0: number, s1: number, hB: number, hT: number, off = 0): Polygon {
    return new Polygon([this.P(s0, hB, off), this.P(s1, hB, off), this.P(s1, hT, off), this.P(s0, hT, off)]);
  }

  /**
   * A wide shape whose bottom edge runs from `s0` to `s1` at (`hB`, `offB`) and whose top edge runs
   * back from `t1` to `t0` at (`hT`, `offT`), both edges following their true curve in the panorama:
   * a strip of wall, a roof slope rising to its ridge, a balcony slab.
   */
  band(s0: number, s1: number, hB: number, offB: number, hT: number, offT: number, t0 = s0, t1 = s1): Path2D {
    const n = Math.max(1, Math.ceil(Math.abs(this.P(s1, hB, offB)[0] - this.P(s0, hB, offB)[0]) / 12));
    const p = new Path2D();
    for (let i = 0; i <= n; i++) {
      const [x, y] = this.P(s0 + ((s1 - s0) * i) / n, hB, offB);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    for (let i = n; i >= 0; i--) p.lineTo(...this.P(t0 + ((t1 - t0) * i) / n, hT, offT));
    p.closePath();
    return p;
  }

  /** `band` for an upright strip of the wall `off` out. */
  strip(s0: number, s1: number, hB: number, hT: number, off = 0): Path2D {
    return this.band(s0, s1, hB, off, hT, off);
  }

  /** Paints on the colour canvas only: detail inside a silhouette already stamped. */
  detail(p: Path2D, fill: string | CanvasGradient): void {
    this.sheet.color.fillStyle = fill;
    this.sheet.color.fill(p);
  }

  /** A vertical gradient between heights `hB` and `hT` around `s`, `top` colour first. */
  vertical(s: number, hB: number, hT: number, stops: [number, string][]): CanvasGradient {
    const g = this.sheet.color.createLinearGradient(0, this.P(s, hT)[1], 0, this.P(s, hB)[1]);
    for (const [t, c] of stops) g.addColorStop(t, c);
    return g;
  }
}

/** Distance along azimuth `a` (+90°..180°) to the foot of the courtyard's walls. */
function courtEdge(a: number): number {
  return Math.min(COURT_EAST / Math.max(Math.sin(a), 1e-3), COURT_BACK / Math.max(-Math.cos(a), 1e-3));
}

/**
 * Paints the courtyard over the quarter behind the room: the floor from the foot of the walls down
 * to under the window, the rear buildings far to near, then what lies and stands in the courtyard.
 * After `paintStreet`, whose ground bands it covers there.
 */
export function paintCourtyard(sheet: Sheet, random: Rng): void {
  paintGroundBand(sheet, courtEdge, null, () => SETTS, COURT_FROM, COURT_TO, 0, SETT_SURFACE);
  paintSetts(sheet, random);
  const walls = BUILDINGS.map((spec) => ({ spec, wall: new CourtWall(sheet, spec) })).sort((p, q) => q.wall.d - p.wall.d);
  for (const { spec, wall } of walls) paintRearBuilding(sheet, random, wall, spec);
  paintCourtFloor(sheet, random);
}

/** The granite setts: joints in rows, a shade off here and there, a gutter strip of flags along the walls. */
function paintSetts(sheet: Sheet, random: Rng): void {
  const ctx = sheet.color;
  const quad = (x0: number, z0: number, x1: number, z1: number): Path2D => {
    const p = new Path2D();
    const pts: [number, number][] = [worldPoint(Math.max(MIN_X, x0), z0, 0), worldPoint(Math.max(MIN_X, x1), z0, 0), worldPoint(Math.max(MIN_X, x1), z1, 0), worldPoint(Math.max(MIN_X, x0), z1, 0)];
    pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
    p.closePath();
    return p;
  };
  for (let i = 0; i < 5000; i++) {
    const x = between(random, 0, COURT_EAST - 0.2);
    const z = -between(random, 0, COURT_BACK - 0.2);
    ctx.fillStyle = random() < 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,250,240,0.08)';
    ctx.fill(quad(x, z, x + 0.14, z - 0.11));
  }
  // Joints between the rows of setts, running across the courtyard.
  ctx.strokeStyle = 'rgba(40,36,32,0.22)';
  for (let z = -0.4; z > -COURT_BACK; z -= 0.14) {
    // Rows too close together from up here to be told apart would only make a moiré.
    const d = Math.hypot(COURT_EAST / 2, z);
    if (sizePx(0.14, d) * groundSquash(d) < 3) continue;
    ctx.lineWidth = Math.max(0.5, sizePx(0.02, d) * 2);
    ctx.beginPath();
    for (let x = MIN_X; x <= COURT_EAST; x += 1) ctx.lineTo(...worldPoint(x, z, 0));
    ctx.stroke();
  }
  // Flags along the foot of the walls, where the rain comes off the roofs: the neighbours' and our
  // own (the back of our front wing and our side wing, whose walls the panorama cannot show).
  const strips: [number, number, number, number][] = [
    [COURT_EAST - 0.8, 0, COURT_EAST, -COURT_BACK],
    [MIN_X, -COURT_BACK + 0.8, COURT_EAST, -COURT_BACK],
    [MIN_X, 0, 0.8, -COURT_BACK],
    [MIN_X, 0, COURT_EAST, -0.8],
  ];
  ctx.fillStyle = '#a19c92';
  for (const [x0, z0, x1, z1] of strips) ctx.fill(quad(x0, z0, x1, z1));
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  for (let s = 0; s < COURT_BACK; s += 0.8) {
    ctx.stroke(quad(COURT_EAST - 0.8, -s, COURT_EAST, -s - 0.8));
    ctx.stroke(quad(MIN_X, -s, 0.8, -s - 0.8));
  }
  for (let s = 0; s < COURT_EAST; s += 0.8) {
    ctx.stroke(quad(s, -COURT_BACK + 0.8, s + 0.8, -COURT_BACK));
    ctx.stroke(quad(s, 0, s + 0.8, -0.8));
  }
  // The shade at the foot of our own walls.
  sheet.shadow(quad(MIN_X, 0, 0.6, -COURT_BACK), 0.3);
  sheet.shadow(quad(MIN_X, 0, COURT_EAST, -0.6), 0.3);
}

/**
 * One rear building: its roof first (it stands further back), chimneys on the ridge, then the wall
 * with its weathering, windows, stairwell, balconies, drainpipe and the door into the stairs.
 */
function paintRearBuilding(sheet: Sheet, random: Rng, wall: CourtWall, spec: CourtBuilding): void {
  const { w, d } = wall;
  const brick = random() < 0.2;
  const color = brick ? pick(random, BRICKS) : pick(random, RENDERS);
  const eave = GROUND_FLOOR + (spec.floors - 1) * STOREY + 0.4;
  const cols = Math.max(2, Math.floor(w / 2.4));
  const pitch = w / cols;
  const stair = integer(random, 0, cols - 1);
  // A stack of bolt-on balconies up one or two columns, never the stairwell's.
  const balconyCols = new Set<number>();
  for (let i = integer(random, 1, 2); i > 0; i--) {
    const c = integer(random, 0, cols - 1);
    if (c !== stair) balconyCols.add(c);
  }
  const frame = random() < 0.8 ? '#ebe7de' : '#6a5a48';

  paintCourtRoof(sheet, random, wall, spec, eave, color);

  sheet.begin(d, 0.04);
  const body = wall.strip(0, w, -0.05, eave);
  sheet.path(body, color);
  paintWeathering(wall, random, color, brick, eave);
  // Damp plinth, and the shade of the courtyard deepening towards the ground.
  wall.detail(wall.strip(0, w, -0.05, 0.8), 'rgba(40,36,30,0.18)');
  wall.detail(body, wall.vertical(w / 2, 0, eave, [[0, 'rgba(255,255,255,0.03)'], [0.6, 'rgba(0,0,0,0.05)'], [1, 'rgba(0,0,0,0.28)']]));
  // Party wall line at the first end.
  wall.detail(wall.quad(0, 0.12, -0.05, eave), 'rgba(0,0,0,0.3)');

  for (let fl = 0; fl < spec.floors; fl++) {
    const floorH = fl === 0 ? 0 : GROUND_FLOOR + (fl - 1) * STOREY;
    const hb = floorH + (fl === 0 ? 1.0 : 0.9);
    const ht = hb + (fl === 0 ? 1.5 : 1.45);
    for (let c = 0; c < cols; c++) {
      const mid = (c + 0.5) * pitch;
      if (c === stair) {
        if (fl === 0) paintStairDoor(sheet, random, wall, mid, frame);
        else paintWindow(sheet, random, wall, mid - 0.45, mid + 0.45, floorH - 0.3, floorH + 0.9, frame, 'stair');
        continue;
      }
      const balcony = fl > 0 && balconyCols.has(c);
      const half = balcony ? 0.45 : pitch > 2.6 && random() < 0.3 ? 0.35 : 0.6;
      // A small frosted bathroom window now and then, next to the stairs.
      const bathroom = !balcony && Math.abs(c - stair) === 1 && random() < 0.5;
      if (bathroom) paintWindow(sheet, random, wall, mid - 0.3, mid + 0.3, hb + 0.6, ht, frame, 'bathroom');
      else paintWindow(sheet, random, wall, mid - half, mid + half, balcony ? floorH + 0.1 : hb, ht, frame, 'home');
    }
    if (fl > 0) for (const c of balconyCols) paintCourtBalcony(sheet, random, wall, (c + 0.5) * pitch, floorH);
  }
  // A drainpipe from the gutter down to the setts, with its hopper head.
  const pipe = random() < 0.5 ? 0.35 : w - 0.5;
  wall.detail(wall.quad(pipe, pipe + 0.12, 0, eave), shade(color, 0.55));
  wall.detail(wall.quad(pipe - 0.08, pipe + 0.2, eave - 0.5, eave - 0.15), shade(color, 0.45));
  // Balcony posts down to the courtyard, in front of the wall.
  for (const c of balconyCols) {
    const mid = (c + 0.5) * pitch;
    for (const s of [mid - 1.05, mid + 1.05]) sheet.path(wall.quad(s, s + 0.1, 0, GROUND_FLOOR + (spec.floors - 2) * STOREY + 1.1, 1.3), STEEL);
  }
  // The ground's shadow line at the foot of the wall.
  sheet.shadow(wall.band(0, w, 0, 0, 0, 0.7), 0.25);
}

/** Render weathering (blotches, patches fallen off to the brick, streaks under the eaves), or mortar courses on brick. */
function paintWeathering(wall: CourtWall, random: Rng, color: string, brick: boolean, eave: number): void {
  const ctx = wall.sheet.color;
  if (brick) {
    for (let h = 0.3; h < eave; h += 0.3) wall.detail(wall.strip(0, wall.w, h, h + 0.035), 'rgba(235,225,210,0.12)');
    return;
  }
  for (let i = 0; i < 18; i++) {
    const s = random() * wall.w;
    const h = random() * eave;
    const [cx, cy] = wall.P(s, h);
    const r = between(random, 1.2, 3.5) * wall.px(s);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, random() < 0.6 ? 'rgba(30,25,20,0.08)' : 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  // Where the render has come away: the brick beneath, courses showing.
  for (let i = integer(random, 1, 3); i > 0; i--) {
    const s = between(random, 0.5, wall.w - 1.8);
    const h = between(random, 0.3, eave - 2);
    const sw = between(random, 0.5, 1.4);
    const sh = between(random, 0.4, 1.0);
    wall.detail(wall.quad(s, s + sw, h, h + sh), mixHex(color, '#a8674a', 0.6));
    for (let y = h + 0.12; y < h + sh; y += 0.15) wall.detail(wall.quad(s, s + sw, y, y + 0.025), 'rgba(230,220,200,0.35)');
  }
  for (let i = 0; i < 5; i++) {
    const s = random() * wall.w;
    wall.detail(wall.quad(s, s + between(random, 0.2, 0.5), eave - between(random, 2, 5), eave), wall.vertical(s, eave - 5, eave, [[0, 'rgba(40,35,30,0.14)'], [1, 'rgba(40,35,30,0)']]));
  }
}

/**
 * A window from `s0` to `s1`, `hb` to `ht` up: a home's (glass, curtains or a blind, bars, sill;
 * lit at night, a television flickering in some), a frosted bathroom one, or a stairwell's, whose
 * light is on its timer until the building sleeps.
 */
function paintWindow(sheet: Sheet, random: Rng, wall: CourtWall, s0: number, s1: number, hb: number, ht: number, frame: string, kind: 'home' | 'bathroom' | 'stair'): void {
  const { d } = wall;
  const mid = (s0 + s1) / 2;
  wall.detail(wall.quad(s0 - 0.07, s1 + 0.07, hb - 0.07, ht + 0.07), frame);
  const glass = wall.quad(s0, s1, hb, ht);
  sheet.begin(d, kind === 'bathroom' ? 0.05 : 0.22);
  sheet.path(glass, kind === 'bathroom' ? FROSTED : GLASS);
  sheet.begin(d, 0.04);
  if (kind === 'stair') {
    // Stairwell lights: neutral, on while people still come home.
    if (random() < 0.45) sheet.lit(glass, 'neutral', between(random, 0.6, 0.85), between(random, 0.35, 0.8));
    wall.detail(wall.quad(mid - 0.03, mid + 0.03, hb, ht), frame);
    return;
  }
  if (kind === 'bathroom') {
    if (random() < 0.25) sheet.lit(glass, 'neutral', 0.7, random());
    wall.detail(wall.quad(s0 - 0.1, s1 + 0.1, hb - 0.12, hb - 0.03), '#d8d2c4');
    return;
  }
  const strength = between(random, 0.65, 1);
  const lit = random() < 0.4;
  const curfew = random();
  const k = random();
  const light: LightKind = k < 0.16 ? 'cool' : k < 0.3 ? 'neutral' : 'warm';
  const tv = light === 'cool';
  if (lit) sheet.lit(glass, light, strength, curfew, tv);
  wall.detail(glass, wall.vertical(mid, hb, ht, [[0, 'rgba(190,210,230,0.3)'], [0.6, 'rgba(120,140,160,0.06)'], [1, 'rgba(0,0,0,0.18)']]));
  const inside = random();
  if (inside < 0.12) {
    const both = wall.quad(s0 + 0.02, s1 - 0.02, hb + 0.03, ht - 0.03);
    wall.detail(both, pick(random, CURTAINS));
    if (lit) sheet.lit(both, 'warm', strength * 0.45, curfew);
  } else if (inside < 0.45) {
    const cw = (s1 - s0) * between(random, 0.22, 0.4);
    const panel = random() < 0.5 ? wall.quad(s0, s0 + cw, hb + 0.05, ht - 0.05) : wall.quad(s1 - cw, s1, hb + 0.05, ht - 0.05);
    wall.detail(panel, pick(random, CURTAINS));
    if (lit) sheet.lit(panel, 'warm', strength * 0.7, curfew);
  } else if (inside < 0.62) {
    const blind = wall.quad(s0 + 0.03, s1 - 0.03, ht - (ht - hb) * between(random, 0.2, 0.6), ht - 0.03);
    wall.detail(blind, pick(random, ['#e8e0cc', '#d8cfb8', '#c9d0d4']));
    if (lit) sheet.lit(blind, 'warm', strength * 0.8, curfew);
  }
  // Casement bars, then the sill; a pot of geraniums on a few.
  for (const bar of [wall.quad(mid - 0.035, mid + 0.035, hb, ht), wall.quad(s0, s1, ht - (ht - hb) * 0.3, ht - (ht - hb) * 0.3 + 0.06)]) {
    wall.detail(bar, frame);
    if (lit) sheet.lit(bar, light, strength * 0.2, curfew, tv);
  }
  wall.detail(wall.quad(s0 - 0.1, s1 + 0.1, hb - 0.12, hb - 0.03), '#d8d2c4');
  if (currentSeason().name !== 'winter' && random() < 0.12) {
    const s = between(random, s0 + 0.1, s1 - 0.3);
    wall.detail(wall.quad(s, s + 0.22, hb - 0.03, hb + 0.14, 0.1), '#9a5a3a');
    wall.detail(wall.quad(s - 0.06, s + 0.28, hb + 0.14, hb + 0.38, 0.1), pick(random, ['#3f6b33', '#4d7a3a']));
    wall.detail(wall.quad(s + 0.02, s + 0.1, hb + 0.26, hb + 0.34, 0.12), pick(random, ['#d9383a', '#e0567a', '#f0f0e8']));
  }
}

/** The door into the stairwell at `s`: a plain panelled door under a wired-glass fanlight, a bulkhead lamp over it lighting the setts. */
function paintStairDoor(sheet: Sheet, random: Rng, wall: CourtWall, s: number, frame: string): void {
  wall.detail(wall.quad(s - 0.65, s + 0.65, 0, 2.9), shade(frame, 0.85));
  wall.detail(wall.quad(s - 0.55, s + 0.55, 0.05, 2.2), pick(random, ['#5a4632', '#3f4a3a', '#6a5a48', '#4a3a2e']));
  const fan = wall.quad(s - 0.5, s + 0.5, 2.3, 2.8);
  wall.detail(fan, GLASS);
  sheet.lit(fan, 'neutral', 0.6, between(random, 0.3, 0.7));
  // The lamp over the door: burns all night, a pool on the ground and a wash up the wall.
  const lamp = wall.quad(s + 0.75, s + 0.95, 2.3, 2.5, 0.1);
  wall.detail(lamp, '#e8e4d8');
  sheet.lit(lamp, 'warm', 1, 0);
  const [gx, gy] = wall.P(s, 0, 1.5);
  const px = wall.px(s);
  sheet.glow(gx, gy, 2.6 * px, 1.1 * px, 0.22);
  const [wx, wy] = wall.P(s + 0.85, 2.2);
  sheet.glow(wx, wy, 1.4 * px, 1.6 * px, 0.14);
  wall.detail(wall.quad(s - 0.8, s + 0.8, -0.05, 0.12, 0.3), '#a39e93');
}

/**
 * A bolt-on steel balcony at `s` whose floor is `floorH` up: the slab, its shadow on the wall, a
 * panel or barred railing, and on some a line of washing (not in winter), a chair, a pot or a dish.
 */
function paintCourtBalcony(sheet: Sheet, random: Rng, wall: CourtWall, s: number, floorH: number): void {
  const { d } = wall;
  const s0 = s - 1.1;
  const s1 = s + 1.1;
  const depth = 1.3;
  const top = floorH + 1.05;
  wall.detail(wall.strip(s0, s1, floorH - 0.8, floorH - 0.15), wall.vertical(s, floorH - 0.8, floorH - 0.15, [[0, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]));
  sheet.begin(d - depth / 2, 0.04, { snow: 0.7, wet: 0.2 });
  sheet.path(wall.band(s0, s1, floorH, 0, floorH, depth), '#9a9890');
  sheet.begin(d - depth / 2, 0.04);
  sheet.path(wall.strip(s0, s1, floorH - 0.2, floorH, depth), STEEL);
  // Washing on a line strung across, a pot and a folding chair, a dish on the rail.
  const { name } = currentSeason();
  if (name !== 'winter' && random() < (name === 'summer' ? 0.5 : 0.3)) {
    const line = floorH + 1.85;
    sheet.path(wall.strip(s0 + 0.1, s1 - 0.1, line - 0.02, line + 0.02, depth - 0.35), '#d8d8d8');
    for (let x = s0 + 0.2; x < s1 - 0.4; x += between(random, 0.35, 0.6)) {
      const cw = between(random, 0.25, 0.5);
      sheet.path(wall.quad(x, x + cw, line - between(random, 0.4, 0.8), line, depth - 0.35), pick(random, CLOTHES));
    }
  }
  if (random() < 0.5) {
    const x = between(random, s0 + 0.2, s1 - 0.5);
    sheet.path(wall.quad(x, x + 0.3, floorH, floorH + 0.35, depth * 0.5), '#9a5a3a');
    sheet.path(wall.quad(x - 0.1, x + 0.4, floorH + 0.35, floorH + 0.8, depth * 0.5), pick(random, ['#3f6b33', '#4d7a3a', '#5a8a44']));
  }
  const panel = random() < 0.6;
  if (panel) {
    sheet.path(wall.strip(s0, s1, floorH + 0.1, top, depth), pick(random, PANELS));
    wall.detail(wall.strip(s0, s1, floorH + 0.1, top, depth), wall.vertical(s, floorH, top, [[0, 'rgba(255,255,255,0.12)'], [1, 'rgba(0,0,0,0.12)']]));
  } else {
    for (let x = s0 + 0.05; x < s1; x += 0.13) sheet.path(wall.quad(x, x + 0.025, floorH, top, depth), STEEL);
  }
  sheet.path(wall.strip(s0, s1, top - 0.05, top + 0.02, depth), STEEL);
  for (const x of [s0, s1 - 0.05]) sheet.path(wall.quad(x, x + 0.05, floorH, top, depth), STEEL);
  if (random() < 0.2) {
    const x = random() < 0.5 ? s0 + 0.25 : s1 - 0.25;
    const [cx, cy] = wall.P(x, top + 0.25, depth);
    const px = wall.px(x);
    const dish = new Path2D();
    dish.ellipse(cx, cy, Math.max(1, 0.3 * px), Math.max(1, 0.34 * px), -0.3, 0, Math.PI * 2);
    sheet.path(dish, '#d8d8d4');
  }
}

/**
 * The roof: a gabled or pent tiled / tarred slope rising back from the gutter, or a flat roof behind
 * a parapet with its tarred surface and vents; then the chimney stacks with their pots, a few
 * skylights, an aerial.
 */
function paintCourtRoof(sheet: Sheet, random: Rng, wall: CourtWall, spec: CourtBuilding, eave: number, color: string): void {
  const { w, d } = wall;
  const [e0, e1] = spec.extend;
  const back = spec.roof === 'pent' ? -WING_DEPTH : -WING_DEPTH / 2;
  let ridgeH: number;
  if (spec.roof === 'flat') {
    ridgeH = eave + 0.7;
    sheet.begin(d + WING_DEPTH / 2, 0.08, ROOF_SURFACE);
    sheet.path(wall.band(0, w, eave + 0.55, 0, eave + 0.55, -WING_DEPTH, -e0, w + e1), TAR);
    sheet.begin(d + 2, 0.04);
    for (let i = integer(random, 1, 3); i > 0; i--) {
      const s = between(random, 0.5, w - 1.5);
      const off = -between(random, 1.5, WING_DEPTH - 2);
      sheet.path(wall.quad(s, s + between(random, 0.8, 1.6), eave + 0.55, eave + between(random, 1.2, 2.2), off), shade(color, 0.72));
    }
    sheet.begin(d, 0.04);
    sheet.path(wall.strip(-0.05, w, eave, eave + 0.8), shade(color, 0.92));
    wall.detail(wall.strip(-0.05, w, eave + 0.7, eave + 0.8), '#8a8680');
  } else {
    const rise = spec.roof === 'pent' ? 2.8 : 3.8;
    ridgeH = eave + rise;
    const covering = spec.roof === 'pent' && random() < 0.6 ? pick(random, [TAR, ZINC]) : pick(random, TILES);
    const slope = wall.band(-0.1, w, eave, 0.35, ridgeH, back, -e0, w + e1);
    sheet.begin(d - back / 2, covering === ZINC ? 0.15 : 0.05, ROOF_SURFACE);
    sheet.path(slope, covering);
    // Courses of tiles or seams of zinc, moss, a gradient to the ridge.
    if (covering === ZINC) for (let s = 0.3; s < w; s += 0.55) wall.detail(wall.band(s, s + 0.04, eave, 0.35, ridgeH, back), 'rgba(255,255,255,0.1)');
    else for (let t = 0.1; t < 1; t += 0.07) wall.detail(wall.band(-0.1 - e0 * t, w + e1 * t, eave + rise * t, 0.35 + (back - 0.35) * t, eave + rise * t + 0.05, 0.35 + (back - 0.35) * t), 'rgba(0,0,0,0.13)');
    wall.detail(slope, wall.vertical(w / 2, eave, ridgeH, [[0, 'rgba(0,0,0,0.12)'], [1, 'rgba(255,255,255,0.08)']]));
    for (let i = integer(random, 2, 6); i > 0; i--) {
      const s = between(random, 0.3, w - 0.8);
      wall.detail(wall.band(s, s + between(random, 0.2, 0.6), eave, 0.35, eave + rise * between(random, 0.3, 0.8), 0.35 + back * 0.5), covering === TAR ? 'rgba(255,255,255,0.05)' : 'rgba(60,70,30,0.14)');
    }
    // Skylights set in the slope, one lit now and then.
    for (let i = random() < 0.6 ? integer(random, 1, 2) : 0; i > 0; i--) {
      const s = between(random, 0.8, w - 1.8);
      const t0 = 0.3;
      const t1 = 0.6;
      const pane = new Polygon([wall.P(s, eave + rise * t0, 0.35 + (back - 0.35) * t0), wall.P(s + 0.8, eave + rise * t0, 0.35 + (back - 0.35) * t0), wall.P(s + 0.8, eave + rise * t1, 0.35 + (back - 0.35) * t1), wall.P(s, eave + rise * t1, 0.35 + (back - 0.35) * t1)]);
      sheet.begin(d - back / 2, 0.35);
      sheet.path(pane, GLASS);
      sheet.begin(d - back / 2, 0.05, ROOF_SURFACE);
      if (random() < 0.4) sheet.lit(pane, 'warm', 0.8, random());
    }
    // The gutter along the eave.
    sheet.begin(d, 0.1);
    sheet.path(wall.strip(-0.1, w, eave - 0.05, eave + 0.12, 0.4), '#6a6e72');
  }
  // Chimney stacks along the ridge (the old coal stoves: several per building), pots on top.
  sheet.begin(d - back, 0.04);
  for (let i = integer(random, 2, 4); i > 0; i--) {
    const s = between(random, 0.6, w - 1.6);
    const cw = between(random, 0.6, 1.3);
    const top = ridgeH + between(random, 0.9, 1.8);
    const stack = mixHex(pick(random, ['#a8674a', '#8e4f3c', '#9a8a78']), '#000000', 0.1);
    const off = spec.roof === 'flat' ? -between(random, 0.5, WING_DEPTH - 1) : back;
    sheet.path(wall.quad(s, s + cw, ridgeH - 0.4, top, off), stack);
    wall.detail(wall.quad(s + cw * 0.6, s + cw, ridgeH - 0.4, top, off), 'rgba(0,0,0,0.22)');
    sheet.path(wall.quad(s - 0.06, s + cw + 0.06, top, top + 0.14, off), shade(stack, 1.2));
    for (let k = 0; k < Math.floor(cw / 0.3); k++) sheet.path(wall.quad(s + 0.08 + k * 0.3, s + 0.24 + k * 0.3, top + 0.14, top + 0.45, off), '#b86a44');
  }
  if (random() < 0.4) {
    const s = between(random, 1, w - 1);
    sheet.path(wall.quad(s, s + 0.05, ridgeH, ridgeH + 2.4, back), '#2a2a2c');
    for (const [y, span] of [[2.2, 0.9], [1.8, 0.7], [1.4, 0.5]] as const) sheet.path(wall.quad(s - span / 2, s + span / 2, ridgeH + y, ridgeH + y + 0.05, back), '#2a2a2c');
  }
}

/** A footprint in the courtyard, lined up with its walls. */
function courtFootprint(x: number, z: number, alongX: boolean): Footprint {
  return { x, z, along: alongX ? [1, 0] : [0, 1] };
}

/**
 * What is in the courtyard: first what lies flat (the lawn with its kerb, the sandpit, a drain),
 * then what stands, far to near: the trees, the shed, the bins by the side wing, bikes against the
 * rear building, a bench, the carpet-beating rack.
 */
function paintCourtFloor(sheet: Sheet, random: Rng): void {
  const lawnD = Math.hypot(8, -13);
  // The lawn: a kerbed rectangle, trodden bare along one edge.
  const lawn = (x0: number, z0: number, x1: number, z1: number): Path2D => {
    const p = new Path2D();
    const pts: [number, number][] = [];
    for (let t = 0; t <= 8; t++) pts.push(worldPoint(x0 + ((x1 - x0) * t) / 8, z0, 0));
    for (let t = 0; t <= 8; t++) pts.push(worldPoint(x1, z0 + ((z1 - z0) * t) / 8, 0));
    for (let t = 0; t <= 8; t++) pts.push(worldPoint(x1 - ((x1 - x0) * t) / 8, z1, 0));
    for (let t = 0; t <= 8; t++) pts.push(worldPoint(x0, z1 - ((z1 - z0) * t) / 8, 0));
    pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
    p.closePath();
    return p;
  };
  sheet.begin(lawnD, 0, SETT_SURFACE);
  sheet.path(lawn(4.2, -7.7, 11.8, -18.3), '#b8b2a4');
  sheet.begin(lawnD, 0, LAWN_SURFACE);
  const grass = seasonalLawn('#6f9a48');
  sheet.path(lawn(4.4, -7.9, 11.6, -18.1), grass);
  const ctx = sheet.color;
  for (let i = 0; i < 900; i++) {
    const [x, y] = worldPoint(between(random, 4.5, 11.5), -between(random, 8, 18), 0);
    ctx.fillStyle = random() < 0.5 ? shade(grass, 0.82) : shade(grass, 1.15);
    ctx.fillRect(x, y, 2, 1);
  }
  ctx.fillStyle = 'rgba(150,130,100,0.35)';
  ctx.fill(lawn(4.4, -7.9, 11.6, -8.6));
  // The sandpit with its wooden border.
  sheet.begin(Math.hypot(2.6, -16), 0, SETT_SURFACE);
  sheet.path(lawn(1.2, -14.5, 3.8, -17.5), '#8a6a44');
  sheet.path(lawn(1.4, -14.7, 3.6, -17.3), '#d8c8a0');
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fill(groundEllipse(2.4, -16.2, 0.5, 0.4, 12));
  // A drain in the setts.
  ctx.fillStyle = '#3a3a3a';
  ctx.fill(groundEllipse(6, -4, 0.25, 0.25, 12));

  const items: { d: number; draw: () => void }[] = [];
  const add = (x: number, z: number, draw: () => void): void => {
    items.push({ d: Math.hypot(x, z), draw });
  };
  add(8, -13.2, () => paintTree(sheet, random, { x: 8, z: -13.2, height: 15, radius: 4.6, style: TREE_STYLES[0], form: 'round' }));
  add(12.6, -3.5, () => paintTree(sheet, random, { x: 12.6, z: -3.5, height: 8, radius: 2, style: TREE_STYLES[2], form: 'oval' }));
  // The shed in the back corner: planks, a tarred pent roof, its door.
  const shed = courtFootprint(12.9, -21.4, false);
  add(shed.x, shed.z, () => {
    paintGroundShadow(sheet, shed.x, shed.z, 2, 2.6, 0.25);
    paintBox(sheet, shed, 3.8, 2.8, 0, 2.2, '#7a5a3c');
    paintBox(sheet, shed, 4.1, 3.1, 2.2, 2.35, TAR);
    const d = Math.hypot(shed.x - 1.4, shed.z);
    const [x0, y0] = worldPoint(shed.x - 1.41, shed.z + 0.2, 1.9);
    const [x1, y1] = worldPoint(shed.x - 1.41, shed.z + 1.1, 0);
    sheet.begin(d);
    sheet.color.fillStyle = '#5a4230';
    sheet.color.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0);
  });
  // Wheelie bins lined up along the side wing, lids down.
  for (let i = 0; i < 6; i++) {
    const z = -1.8 - i * 0.72;
    const color = pick(random, BINS);
    add(COURT_EAST - 0.55, z, () => {
      const f = courtFootprint(COURT_EAST - 0.55, z, false);
      paintGroundShadow(sheet, f.x, f.z, 0.4, 0.35, 0.2);
      paintBox(sheet, f, 0.6, 0.72, 0, 1.0, color);
      paintBox(sheet, f, 0.64, 0.78, 1.0, 1.06, shade(color, 0.8));
    });
  }
  // Bikes against the rear building, a hoop or two.
  for (let x = 1.4; x < 6.2; x += between(random, 0.6, 0.9)) {
    if (random() < 0.25) continue;
    add(x, -COURT_BACK + 0.9, () => paintBicycle(sheet, random, { x, z: -COURT_BACK + 0.9, along: [0, 1] }));
  }
  // A bench at the lawn's edge, a carpet-beating rack, a pot by the side wing's door.
  add(7.5, -7.3, () => {
    const f = courtFootprint(7.5, -7.3, true);
    paintGroundShadow(sheet, f.x, f.z, 0.9, 0.4, 0.2);
    paintBox(sheet, f, 1.8, 0.45, 0.42, 0.47, '#8a5a36');
    paintBox(sheet, f, 1.8, 0.06, 0.5, 0.9, '#8a5a36', 0, 0, -0.22);
    for (const u of [-0.75, 0.75]) paintPost(sheet, f.x + u, f.z, 0, 0.42, 0.06, STEEL);
  });
  add(2.2, -9.5, () => {
    for (const z of [-8.5, -10.5]) paintPost(sheet, 2.2, z, 0, 1.8, 0.07, STEEL);
    const d = Math.hypot(2.2, -9.5);
    sheet.begin(d);
    const p = new Path2D();
    const a = worldPoint(2.2, -8.5, 1.8);
    const b = worldPoint(2.2, -10.5, 1.8);
    sheet.color.strokeStyle = STEEL;
    sheet.color.lineWidth = Math.max(1, sizePx(0.06, d));
    p.moveTo(...a);
    p.lineTo(...b);
    sheet.color.stroke(p);
  });
  items.sort((p, q) => q.d - p.d);
  for (const item of items) item.draw();
}
