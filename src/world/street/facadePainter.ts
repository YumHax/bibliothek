import type { FacadeSpec, FlatFront, ShopKind, ShopSpec } from './streetPlan';
import { GROUND_FLOOR, STOREY } from '@/world/measures/street';
import { LETTERING, SHOP_LOOKS, letteringFont } from '../city/shopLooks';
import { balconyRows, facadeBays, facadeStyle, onBalcony, windowWidth, type FacadeStyle, type WindowHead } from '../city/facadeStyle';
import type { RoofFurniture } from '../city/roofFurniture';
import { shade } from '../city/colour';
import type { FlatRoomId } from '../city/flatWindows';
import { awningOut, frontVariant, pilasterWidth } from './shopfronts/shopfrontPlan';
import { lcg, pick } from '@/random';

/** What a lit window shows of its room at night, drawn on the night map over its light (`Buildings`). Shares of the light's rect. */
export interface LightInside {
  /** Curtains drawn in from the left and right edges (share of the width each), the cloth's colour: the light glows through them, dimmer and warmer. */
  curtains?: { left: number; right: number; color: string };
  /** A blind down from the head (share of the height). */
  blind?: number;
  /** The dark mass of furniture along the bottom: from, to (shares of the width), its height (share of the height). */
  furniture?: [number, number, number];
  /** Someone standing in the room, a dark figure against the light: their middle (share of the width). */
  figure?: number;
  /** An arched head: the top share of the height that is the arch's (its corners stay dark). */
  arch?: number;
}

/** A light painted on the night map: a rect (colour-atlas pixels: `Buildings` scales them to its night map), its colour, when it comes on at dusk and when it goes out. */
export interface NightLight {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** Point of the dusk ramp (0..1) past which it is on. */
  litAt: number;
  /** Wakefulness below which it is off (0 = burns all night), as the painted view's curfews. */
  curfew: number;
  /** One of our flat's windows: lit as that room was left (its lamp, its curtains), not by the curfew. */
  room?: FlatRoomId;
  /** A shop's window: lit while the shop is open (its kind's `SHOP_HOURS`), not by the curfew. */
  shop?: ShopKind;
  /** What the room shows behind the glass. */
  inside?: LightInside;
}

/** A pane of glass on a facade (colour-atlas pixels) and how rough it is (0 clear .. 1 matte): the glass mask. */
export interface GlassPane {
  x: number;
  y: number;
  w: number;
  h: number;
  rough: number;
}

/**
 * What stands proud of the wall or is sunk into it, for the relief the facade's shader lights (`Buildings`, the glass
 * mask's B): a rect (colour-atlas pixels), how high (`RELIEF`), how rough, and whether it is still brick (a joint).
 */
export interface ReliefRect {
  x: number;
  y: number;
  w: number;
  h: number;
  height: number;
  rough: number;
  brick?: boolean;
}

/** The relief's heights (0..1; the wall's face is `wall`): what a sill, a cornice, a sunk door stand at. */
export const RELIEF = { joint: 0.3, door: 0.25, wall: 0.5, shutter: 0.55, joinery: 0.58, plinth: 0.6, fascia: 0.66, trim: 0.7, plate: 0.64, sill: 0.8, cornice: 0.9 } as const;

/**
 * What the painter leaves for the 3D relief (`relief/`) to build in front of the painted wall, in
 * facade metres (s along from the left end, y up from the pavement): the awnings (no longer
 * painted), the balcony rows (slab and rail, no longer painted), the windows of a framed facade
 * (`Casement`: built whole in 3D, `facadeWindows/`), the display windows and doors of the shops
 * (glass for the interiors, surrounds), the shopfronts (shutters, glow), the wall's and trim's
 * colours, the downpipe and the cornice's line.
 */
export interface FacadeFeatures {
  wall: string;
  trim: string;
  /** `out`: fixed that far out of the wall (to a built front's head), else on it. */
  awnings: { s0: number; s1: number; colors: [string, string]; kind: ShopKind; out?: number }[];
  balconies: { s0: number; s1: number; y: number }[];
  casements: Casement[];
  windows: { s0: number; s1: number; y0: number; y1: number; kind: ShopKind; light: string; palette: readonly string[] }[];
  /** `step`: a stone step before a residents' door. */
  doors: { s: number; width: number; height: number; color: string; shop: boolean; step?: boolean }[];
  shopfronts: { s0: number; s1: number; kind: ShopKind; light: string; awning: boolean; name?: string }[];
  /**
   * The names on the fascias of the fronts built in 3D (`shopfronts/fasciaLettering`: sharp, not in the atlas): the
   * middle of the lettering (s, y), its height (metres), the words, ink and font, the neon colour it burns in at night.
   */
  signs?: { s: number; y: number; size: number; text: string; color: string; font: string; neon?: string }[];
  /** Where the downpipe runs down from the gutter (along), if it has one. */
  downpipe: number | null;
  /** The cornice's underside over the street. */
  cornice: number;
}

/**
 * A window of a framed facade, built in 3D in front of its painted glass (`facadeWindows/`): the opening (facade
 * metres; `y1` the head's top, an arch's crown), how it is glazed (`sash`: a mullion and a transom; `tall`: a French
 * window, a mullion and two transoms; `frosted`: no bars), its head (an arch's `rise` over its springing), the sill,
 * the open shutters' paint and the flower box's flowers, if any. Only its glass, curtains and blind are painted.
 */
export interface Casement {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
  glazing: 'sash' | 'tall' | 'frosted';
  head: WindowHead;
  rise: number;
  /** A carved pediment over its lintel (the first floor of a grand front). */
  pediment: boolean;
  sill: boolean;
  frame: string;
  trim: string;
  /** The wall's paint, for a plain opening's surround. */
  wall: string;
  shutters: string | null;
  flowers: string[] | null;
}

/** One painted facade: its night lights, its panes of glass, its relief, what stands out of it, and whether its wall is brick. */
interface PaintedFacade {
  lights: NightLight[];
  glass: GlassPane[];
  relief: ReliefRect[];
  features: FacadeFeatures;
  brick: boolean;
}

/** Where a facade sits in the atlases: its top-left corner (colour-atlas pixels) and its scale. */
export interface AtlasSlot {
  x: number;
  y: number;
  /** Pixels per metre in the colour atlas. */
  k: number;
}

/** How rough the facades' window glass is (clear, frosted), for the glass mask (`Buildings`). */
const CLEAR_GLASS = 0.06;
const FROSTED_GLASS = 0.35;
/** How rough painted joinery, stone trims and an enamel plate are, against the walls' (`Buildings`' `WALL_ROUGHNESS`). */
const ROUGH = { paint: 0.55, stone: 0.86, enamel: 0.3, metal: 0.4 } as const;
/** The band over the top floor's windows, metres: the facade's top (each style's cornice runs `style.parapet` under it). */
const PARAPET = 1.1;
/** The narrowest face that hangs balconies (m): a light well's are too close to the next wall. */
const MIN_BALCONY_FRONT = 3;

/** The height of a facade of `storeys` (ground floor included), parapet on top. */
export function facadeHeight(storeys: number): number {
  return GROUND_FLOOR + (storeys - 1) * STOREY + PARAPET;
}

const CURTAINS = ['#d9cfbf', '#c9b9a4', '#e6e0d4', '#b9b3a8', '#c9a58a', '#a8b4b8'];
const BLINDS = ['#e8e0cc', '#d8d0bc', '#c9c2b0', '#e6dcc0'];
const FLOWERS = ['#d9383a', '#e0567a', '#f0f0e8', '#b04ac0', '#f09a3a'];
const GLASS = '#2f3d48';
const HOME_LIGHTS = ['#ffcf8a', '#ffd9a0', '#ffc070', '#fff0d0'];
const TV_LIGHT = '#9ab8ff';
const POSTER_PAPERS = ['#f0e8d0', '#f6d23a', '#e8e8e8', '#ff6a3a', '#9ad0e8'];
const TAG_COLORS = ['#e83a8a', '#3ae8c8', '#f0e03a', '#8a4af0'];

/** How each kind of shop looks: joinery, fascia, lettering, awning, what fills the window, its light and when it shuts. */
interface ShopLook {
  name: string;
  front: string;
  fascia: string;
  letters: string;
  awning: [string, string] | null;
  goods: string[];
  light: string;
  late: boolean;
  font: string;
  /** Its name glows all night (a neon, a lightbox). */
  neon?: string;
  /** Its name is a sign of its own over the fascia (`STREET_PLAN.signs`): the board is painted bare. */
  signed?: boolean;
}

/**
 * Each kind's look (`city/shopLooks`, shared with the window view) and how it lights up here. RETRO
 * GAMES and the arcade paint no name: their signs are props of their own.
 */
export const SHOPS: Record<Exclude<ShopKind, 'shut'>, ShopLook> = {
  cafe: { ...SHOP_LOOKS.cafe, light: '#ffd49a' },
  bakery: { ...SHOP_LOOKS.bakery, light: '#ffd49a' },
  pharmacy: { ...SHOP_LOOKS.pharmacy, light: '#e8f4ff', neon: '#4dff8a' },
  books: { ...SHOP_LOOKS.books, light: '#ffd49a' },
  grocer: { ...SHOP_LOOKS.grocer, light: '#ffe0b0' },
  florist: { ...SHOP_LOOKS.florist, light: '#ffe0b0' },
  tabac: { ...SHOP_LOOKS.tabac, light: '#ffd49a', neon: '#ff5a3a' },
  bar: { ...SHOP_LOOKS.bar, light: '#ffb060', neon: '#ffc060' },
  butcher: { ...SHOP_LOOKS.butcher, light: '#f0f4ff' },
  furniture: { ...SHOP_LOOKS.furniture, light: '#ffd49a' },
  electronics: { ...SHOP_LOOKS.electronics, light: '#d8e8ff', neon: '#5fd0ff', signed: true },
  pets: { ...SHOP_LOOKS.pets, light: '#ffe8c0' },
  laundry: { ...SHOP_LOOKS.laundry, light: '#e8f4ff' },
  retro: { ...SHOP_LOOKS.retro, name: '', light: '#c8e0ff' },
  arcade: { ...SHOP_LOOKS.arcade, name: '', light: '#c070ff' },
};

/**
 * Paints one facade into the colour atlas (`ctx`, at `slot`) and returns the lights it holds for
 * the night map: the wall (brick is the shader's, render or dressed stone painted), string courses, a
 * parapet and cornice on its brackets; per storey a row of windows (frames, sills, lintels, arches or
 * pediments, shutters, curtains, the odd balcony and flower box), each a home light with its own dusk
 * point and curfew (a few a TV's blue, some dark all night) and what its room shows at night; the
 * ground floor's shops (`SHOPS`: joinery, fascia and lettering, awning, window display with its light
 * in opening hours, a neon name for the late ones), a roller shutter for a shop that has shut, the
 * residents' door (its colour, number, bell panel and letterbox), ground-floor windows where there is
 * no shop, posters and tags on bare wall, the street's name plate on a corner. Each feature's relief
 * goes with it. `goods` colours the retro games shop's display (the day's market stock), when known.
 * `framed`: the windows are built in 3D (`features.casements`): only their glass, curtains and blinds
 * are painted, the frames, bars, sills, heads, shutters and flower boxes are the geometry's.
 */
export function paintFacade(ctx: CanvasRenderingContext2D, spec: FacadeSpec, width: number, slot: AtlasSlot, goods: readonly string[] | null, framed = false): PaintedFacade {
  const random = lcg(spec.seed * 7919);
  // The building's look is the neighbourhood's (`city/facadeStyle`): the window view paints the same front.
  const style = facadeStyle(spec.seed);
  const height = facadeHeight(spec.storeys);
  const cornice = height - style.parapet;
  const p = new Brush(ctx, slot, height, spec.seed);
  p.framed = framed;
  p.features.wall = style.wall;
  p.features.trim = style.trim;
  p.features.cornice = cornice - 0.16;

  paintWall(p, random, style, width, height);
  paintCrown(p, style, width, height, cornice);
  // Storeys over the ground floor: a row of bays, balconies where the style hangs them.
  const bays = facadeBays(width, spec.bays);
  const bay = width / bays;
  const winW = windowWidth(style, bay);
  // None in a light well (a face a bay or two wide): they would run into the next wall's.
  const balconies = width < MIN_BALCONY_FRONT ? [] : balconyRows(style, spec.storeys, bays);
  for (let storey = 1; storey < spec.storeys; storey++) paintStorey(p, random, style, spec, { width, bays, bay, winW }, balconies, storey);
  if (spec.flat) paintFlat(p, style, spec.flat);
  paintGroundFloor(p, random, style, spec, width, bays, goods);
  return { lights: p.lights, glass: p.panes, relief: p.reliefs, features: p.features, brick: style.kind === 'brick' };
}

/** How a front's bays are laid out: its width, bays per storey, the pitch of a bay and a window's width. */
interface Bays {
  width: number;
  bays: number;
  bay: number;
  winW: number;
}

/** The wall and its texture (brick courses are laid by the facade's shader, at any distance), and the grime running down from the top. */
function paintWall(p: Brush, random: () => number, style: FacadeStyle, width: number, height: number): void {
  p.rect(0, 0, width, height, style.wall);
  for (let i = 0; i < width * height * 0.8; i++) {
    const s = random() * width;
    const y = random() * height;
    p.rect(s, y, s + 0.2 + random() * 0.6, y + 0.1 + random() * 0.3, random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)');
  }
  const { ctx, slot } = p;
  const grime = ctx.createLinearGradient(0, p.y(height), 0, p.y(height - 3));
  grime.addColorStop(0, 'rgba(40,35,30,0.22)');
  grime.addColorStop(1, 'rgba(40,35,30,0)');
  ctx.fillStyle = grime;
  ctx.fillRect(p.x(0), p.y(height), width * slot.k, 3 * slot.k);
}

/**
 * The top of the front: parapet and cornice on its brackets (the cornice's band is also what the cornice ledge's geometry
 * samples), the quoins up the corners, and the damp the 3D downpipe (`relief/FacadeRelief`) leaves on the wall either side.
 */
function paintCrown(p: Brush, style: FacadeStyle, width: number, height: number, cornice: number): void {
  p.rect(0, cornice, width, height, shade(style.wall, 0.93));
  p.rect(0, cornice - 0.1, width, cornice + 0.25, style.trim);
  p.relief(0, cornice - 0.1, width, cornice + 0.25, RELIEF.cornice, ROUGH.stone);
  p.rect(0, cornice - 0.16, width, cornice - 0.1, 'rgba(0,0,0,0.25)');
  if (p.slot.k >= 12) {
    for (let s = 0.3; s < width - 0.2; s += 0.55) {
      p.rect(s, cornice - 0.34, s + 0.14, cornice - 0.1, shade(style.trim, 0.86));
      p.rect(s + 0.1, cornice - 0.34, s + 0.14, cornice - 0.1, 'rgba(0,0,0,0.18)');
      p.relief(s, cornice - 0.34, s + 0.14, cornice - 0.1, RELIEF.trim, ROUGH.stone);
    }
  }
  p.rect(0, height - 0.12, width, height, style.trim);
  p.relief(0, height - 0.12, width, height, RELIEF.trim, ROUGH.stone);
  if (style.quoins) paintQuoins(p, style, width, cornice);
  if (style.downpipe) {
    const s = style.downpipe === 'left' ? 0.35 : width - 0.35;
    p.features.downpipe = s;
    p.rect(s - 0.18, 0.35, s + 0.18, cornice, 'rgba(40,40,36,0.08)');
  }
}

/**
 * One storey over the ground floor: a string course at the floor where the front has them, the balconies' shadows (the
 * balconies themselves are built in 3D, `relief/FacadeRelief`), then a window per bay. Our flat's floor paints its own
 * windows where they really are (`paintFlat`), nothing here.
 */
function paintStorey(p: Brush, random: () => number, style: FacadeStyle, spec: FacadeSpec, { width, bays, bay, winW }: Bays, balconies: ReturnType<typeof balconyRows>, storey: number): void {
  const floorY = GROUND_FLOOR + (storey - 1) * STOREY;
  if (style.courses) {
    p.rect(0, floorY - 0.06, width, floorY + 0.1, shade(style.trim, 0.96));
    p.relief(0, floorY - 0.06, width, floorY + 0.1, RELIEF.trim, ROUGH.stone);
  }
  if (spec.flat && storey === spec.storeys - 1) return;
  const y0 = floorY + style.windows.sill;
  const y1 = y0 + style.windows.height;
  for (const row of balconies) {
    if (row.floor !== storey) continue;
    const s0 = row.from * bay + bay * 0.08;
    const s1 = (row.to + 1) * bay - bay * 0.08;
    p.rect(s0, y0 - 0.3, s1, y0 - 0.12, 'rgba(0,0,0,0.12)');
    p.features.balconies.push({ s0, s1, y: y0 });
  }
  for (let b = 0; b < bays; b++) {
    const cx = (b + 0.5) * bay;
    const balcony = onBalcony(balconies, storey, b);
    paintBay(p, random, style, cx - winW / 2, y0, cx + winW / 2, y1, storey === 1 && !balcony, balcony);
  }
}

/**
 * One bay's window with its dressing: shutters and a flower box (built with the window on a framed facade, painted
 * otherwise) and its light at night: a home, now and then a TV, some empty all night.
 */
function paintBay(p: Brush, random: () => number, style: FacadeStyle, s0: number, y0: number, s1: number, y1: number, nobile: boolean, balcony: boolean): void {
  const winW = s1 - s0;
  const inside = paintWindow(p, style, random, s0, y0, s1, y1, nobile, balcony);
  // A framed facade's window was just recorded: its shutters and flower box are built with it.
  const built = p.framed ? p.features.casements[p.features.casements.length - 1] : undefined;
  if (style.shutters && !balcony) {
    if (built) built.shutters = style.shutters;
    else paintShutters(p, style, s0, y0, s1, y1, winW);
  }
  if (!balcony && random() < style.flowers) {
    const flowers = Array.from({ length: 6 }, () => pick(random, FLOWERS));
    if (built) built.flowers = flowers;
    else {
      p.rect(s0 - 0.05, y0 - 0.02, s1 + 0.05, y0 + 0.2, '#6a4a32');
      flowers.forEach((flower, i) => p.rect(s0 + (i / 6) * winW, y0 + 0.15, s0 + ((i + 0.8) / 6) * winW, y0 + 0.32, flower));
      p.relief(s0 - 0.05, y0 - 0.02, s1 + 0.05, y0 + 0.32, RELIEF.sill, ROUGH.paint);
    }
  }
  if (random() < 0.72) {
    const tv = random() < 0.12;
    p.light(s0 + 0.06, y0 + 0.06, s1 - 0.06, y1 - 0.06, tv ? TV_LIGHT : pick(random, HOME_LIGHTS), random() * 0.9, 0.08 + random() * 0.9, undefined, inside);
  }
}

/** The ground floor: a plinth (rusticated where the style is), then shops, a door, or the ground floor's own windows; posters and tags on bare wall; the name plates. */
function paintGroundFloor(p: Brush, random: () => number, style: FacadeStyle, spec: FacadeSpec, width: number, bays: number, goods: readonly string[] | null): void {
  p.rect(0, 0, width, GROUND_FLOOR, shade(style.wall, 0.86));
  p.rect(0, 0, width, 0.35, shade(style.wall, 0.62));
  p.relief(0, 0, width, 0.35, RELIEF.plinth, ROUGH.stone);
  if (style.rusticated) {
    for (let y = 0.8; y < GROUND_FLOOR - 0.3; y += 0.45) {
      p.rect(0, y, width, y + 0.05, 'rgba(0,0,0,0.16)');
      p.relief(0, y, width, y + 0.05, RELIEF.joint, ROUGH.stone);
    }
  }
  p.rect(0, GROUND_FLOOR - 0.12, width, GROUND_FLOOR, style.trim);
  p.relief(0, GROUND_FLOOR - 0.12, width, GROUND_FLOOR, RELIEF.trim, ROUGH.stone);
  for (const shop of spec.shops) paintShop(p, random, shop, goods, spec.detail);
  if (spec.door !== undefined) paintEntrance(p, style, spec.door);
  if (spec.shops.length === 0 && !spec.flat) paintGroundWindows(p, style, random, width, bays, spec.door);
  paintBareWall(p, random, spec, width);
  for (const plate of spec.nameplates ?? []) paintNamePlate(p, plate.at, plate.name);
}

/**
 * Our flat's floor on this face: the collection room's windows and the balcony's glazed door, the
 * kitchen's window, the frosted panes of the bathroom and the bedroom, at their real places and
 * heights (the balcony itself is built in 3D); nothing else on that floor. Their light is home's:
 * warm, on from early dusk until very late (the frosted ones dimmer, and out earlier).
 */
function paintFlat(p: Brush, style: FacadeStyle, flat: FlatFront): void {
  const y = flat.floorY;
  for (const w of flat.windows) {
    const s0 = w.at - w.width / 2;
    const s1 = w.at + w.width / 2;
    if (w.frosted) {
      paintFrostedGlass(p, style, s0, y + w.bottom, s1, y + w.top);
      p.light(s0 + 0.04, y + w.bottom + 0.04, s1 - 0.04, y + w.top - 0.04, '#d9c9a8', 0.1, 0.2, w.room);
      continue;
    }
    paintTallGlass(p, style, s0, y + w.bottom, s1, y + w.top);
    p.light(s0 + 0.05, y + w.bottom + 0.05, s1 - 0.05, y + w.top - 0.05, '#ffcf8a', 0.05, 0.03, w.room);
  }
  if (!flat.balcony) return;
  const { at, door } = flat.balcony;
  const s0 = at - door.width / 2;
  const s1 = at + door.width / 2;
  paintTallGlass(p, style, s0, y, s1, y + door.height);
  p.light(s0 + 0.05, y + 0.05, s1 - 0.05, y + door.height - 0.05, '#ffd9a0', 0.05, 0.03, 'living');
}

/** A small obscured pane (a bathroom's, a bedroom's on the courtyard): reveal, milky glass, frame, a sill under it. */
function paintFrostedGlass(p: Brush, style: FacadeStyle, s0: number, y0: number, s1: number, y1: number): void {
  if (!p.framed) p.rect(s0 - 0.06, y0 - 0.03, s1 + 0.06, y1 + 0.04, 'rgba(0,0,0,0.3)');
  p.rect(s0, y0, s1, y1, '#b9c2c4');
  p.glass(s0, y0, s1, y1, FROSTED_GLASS);
  p.rect(s0, y0 + (y1 - y0) * 0.55, s1, y1, 'rgba(235,240,242,0.35)');
  if (p.framed) {
    casement(p, style, { s0, s1, y0, y1, glazing: 'frosted', head: 'plain', rise: 0, pediment: false, sill: true });
    return;
  }
  const bar = Math.max(0.03, 1.5 / p.slot.k);
  p.rect(s0, y0, s1, y0 + bar, style.frame);
  p.rect(s0, y1 - bar, s1, y1, style.frame);
  p.rect(s0, y0, s0 + bar, y1, style.frame);
  p.rect(s1 - bar, y0, s1, y1, style.frame);
  p.rect(s0 - 0.08, y0 - 0.1, s1 + 0.08, y0 - 0.02, style.trim);
  p.relief(s0 - 0.08, y0 - 0.1, s1 + 0.08, y0 - 0.02, RELIEF.sill, ROUGH.stone);
}

/** A tall pane (a French window, a glazed door): reveal, glass, sky reflection, frame and bars, a head over it. */
function paintTallGlass(p: Brush, style: FacadeStyle, s0: number, y0: number, s1: number, y1: number): void {
  if (!p.framed) p.rect(s0 - 0.08, y0 - 0.04, s1 + 0.08, y1 + 0.06, 'rgba(0,0,0,0.32)');
  p.rect(s0, y0, s1, y1, GLASS);
  p.glass(s0, y0, s1, y1, CLEAR_GLASS);
  p.rect(s0, y1 - (y1 - y0) * 0.3, s1, y1, 'rgba(160,185,210,0.22)');
  if (p.framed) {
    casement(p, style, { s0, s1, y0, y1, glazing: 'tall', head: 'lintel', rise: 0, pediment: false, sill: false });
    return;
  }
  const bar = Math.max(0.035, 1.5 / p.slot.k);
  p.rect(s0, y0, s1, y0 + bar, style.frame);
  p.rect(s0, y1 - bar, s1, y1, style.frame);
  p.rect(s0, y0, s0 + bar, y1, style.frame);
  p.rect(s1 - bar, y0, s1, y1, style.frame);
  p.rect((s0 + s1) / 2 - bar / 2, y0, (s0 + s1) / 2 + bar / 2, y1, style.frame);
  for (const f of [0.33, 0.66]) p.rect(s0, y0 + (y1 - y0) * f, s1, y0 + (y1 - y0) * f + bar, style.frame);
  p.rect(s0 - 0.12, y1 + 0.02, s1 + 0.12, y1 + 0.18, style.trim);
  p.relief(s0 - 0.12, y1 + 0.02, s1 + 0.12, y1 + 0.18, RELIEF.trim, ROUGH.stone);
}

/** Paints in facade metres (s along from the left, y up from the street) into the atlas, and collects the night lights, the glass and the relief. */
class Brush {
  readonly lights: NightLight[] = [];
  readonly panes: GlassPane[] = [];
  readonly reliefs: ReliefRect[] = [];
  readonly features: FacadeFeatures = { wall: '#888888', trim: '#dddddd', awnings: [], balconies: [], casements: [], windows: [], doors: [], shopfronts: [], downpipe: null, cornice: 0 };
  /** The weather's marks (rain run off the sills): a draw of their own, so the facade's other details stay where they were. */
  readonly weather: () => number;
  /** The windows are built in 3D (`Casement`): only their glass and what hangs behind it is painted. */
  framed = false;

  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly slot: AtlasSlot,
    private readonly height: number,
    seed = 1,
  ) {
    this.weather = lcg(seed * 104729 + 17);
  }

  x(s: number): number {
    return this.slot.x + s * this.slot.k;
  }

  y(y: number): number {
    return this.slot.y + (this.height - y) * this.slot.k;
  }

  rect(s0: number, y0: number, s1: number, y1: number, color: string): void {
    const { k } = this.slot;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.x(s0), this.y(y1), (s1 - s0) * k, (y1 - y0) * k);
  }

  /** A filled polygon, its corners in facade metres. */
  poly(points: readonly (readonly [number, number])[], color: string): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([s, y], i) => (i ? ctx.lineTo(this.x(s), this.y(y)) : ctx.moveTo(this.x(s), this.y(y))));
    ctx.closePath();
    ctx.fill();
  }

  light(s0: number, y0: number, s1: number, y1: number, color: string, litAt: number, curfew: number, room?: FlatRoomId, inside?: LightInside, shop?: ShopKind): void {
    const { k } = this.slot;
    this.lights.push({ x: this.x(s0), y: this.y(y1), w: (s1 - s0) * k, h: (y1 - y0) * k, color, litAt, curfew, room, inside, shop });
  }

  /** A pane of glass (for the glass mask: glossy, reflecting, set back behind its reveal). */
  glass(s0: number, y0: number, s1: number, y1: number, rough: number): void {
    const { k } = this.slot;
    this.panes.push({ x: this.x(s0), y: this.y(y1), w: (s1 - s0) * k, h: (y1 - y0) * k, rough });
  }

  /** Something standing proud of the wall or sunk into it (`RELIEF`), `rough` as rough. */
  relief(s0: number, y0: number, s1: number, y1: number, height: number, rough: number, brick = false): void {
    const { k } = this.slot;
    this.reliefs.push({ x: this.x(s0), y: this.y(y1), w: (s1 - s0) * k, h: (y1 - y0) * k, height, rough, brick });
  }

  /** Centred lettering, `size` metres tall, its middle at (s, y), in `font` (a CSS font without its size). */
  text(text: string, s: number, y: number, size: number, color: string, font: string = LETTERING.serif): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.font = letteringFont(font, Math.max(6, Math.round(size * this.slot.k)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.x(s), this.y(y));
  }
}

/**
 * One window and its dressing: reveal, glass with the sky's reflection, curtains or a blind, frame and glazing bars,
 * sill and head (a lintel, a true segmental arch on its keystone, a triangular pediment over the main floor). Returns
 * what its room shows at night (`LightInside`). On a framed facade only the glass and what hangs behind it are
 * painted; the rest is recorded (`Casement`) for the 3D window. `balcony`: it opens onto one (no sill, the slab's there).
 */
function paintWindow(p: Brush, style: FacadeStyle, random: () => number, s0: number, y0: number, s1: number, y1: number, nobile: boolean, balcony = false): LightInside {
  const w = s1 - s0;
  const mid = (s0 + s1) / 2;
  const arched = style.window === 'arched';
  // The arch's rise over its springing (a flat segment, as the window view paints it).
  const rise = arched ? w * 0.22 : 0;
  const spring = y1 - rise;
  const arc = (r0: number, r1: number, ys: number, up: number, n = 8): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i): [number, number] => [r1 - ((r1 - r0) * i) / n, ys + up * Math.sin((Math.PI * i) / n)]);
  // Reveal (the 3D surround's, on a framed facade), glass with the sky's reflection fading down.
  if (arched) {
    if (!p.framed) p.poly([[s0 - 0.08, y0 - 0.06], [s1 + 0.08, y0 - 0.06], ...arc(s0 - 0.08, s1 + 0.08, spring, rise + 0.06)], 'rgba(0,0,0,0.3)');
    p.poly([[s0, y0], [s1, y0], ...arc(s0, s1, spring, rise)], GLASS);
  } else {
    if (!p.framed) p.rect(s0 - 0.08, y0 - 0.06, s1 + 0.08, y1 + 0.06, 'rgba(0,0,0,0.3)');
    p.rect(s0, y0, s1, y1, GLASS);
  }
  p.glass(s0, y0, s1, spring + rise * 0.5, CLEAR_GLASS);
  p.rect(s0, spring - (spring - y0) * 0.35, s1, spring, 'rgba(160,185,210,0.22)');
  const inside: LightInside = arched ? { arch: rise / (y1 - y0) } : {};
  const dressing = random();
  if (dressing < 0.6) {
    // Curtains either side, as far in as they are drawn; now and then right across.
    const curtain = pick(random, CURTAINS);
    const across = random() < 0.12;
    const open = across ? 0.5 : 0.15 + random() * 0.3;
    p.rect(s0, y0, s0 + w * open, spring, curtain);
    p.rect(s1 - w * open, y0, s1, spring, curtain);
    inside.curtains = { left: open, right: open, color: curtain };
  } else if (dressing < 0.75) {
    // A blind, part way down.
    const down = 0.25 + random() * 0.35;
    p.rect(s0 + 0.03, spring - (spring - y0) * down, s1 - 0.03, spring - 0.03, pick(random, BLINDS));
    inside.blind = down;
  }
  if (random() < 0.6) inside.furniture = [random() * 0.4, 1 - random() * 0.3, 0.2 + random() * 0.15];
  if (random() < 0.14) inside.figure = 0.3 + random() * 0.4;
  if (p.framed) {
    casement(p, style, { s0, s1, y0, y1, glazing: 'sash', head: style.window, rise, pediment: style.window === 'pediment' && nobile, sill: !balcony });
    if (!balcony) paintStreaks(p, s0, s1, y0 - 0.08);
    return inside;
  }
  const bar = Math.max(0.035, 1.5 / p.slot.k);
  p.rect(s0, y0, s1, y0 + bar, style.frame);
  p.rect(s0, spring - bar, s1, spring, style.frame);
  p.rect(s0, y0, s0 + bar, spring, style.frame);
  p.rect(s1 - bar, y0, s1, spring, style.frame);
  p.rect(mid - bar / 2, y0, mid + bar / 2, spring, style.frame);
  p.rect(s0, y0 + (spring - y0) * 0.62, s1, y0 + (spring - y0) * 0.62 + bar, style.frame);
  // Sill and head (the sill also stands out in 3D on the near facades).
  p.rect(s0 - 0.1, y0 - 0.08, s1 + 0.1, y0, style.trim);
  p.relief(s0 - 0.1, y0 - 0.08, s1 + 0.1, y0, RELIEF.sill, ROUGH.stone);
  paintStreaks(p, s0, s1, y0 - 0.08);
  if (style.window === 'lintel' || style.window === 'pediment') {
    p.rect(s0 - 0.12, y1 + 0.02, s1 + 0.12, y1 + 0.2, style.trim);
    p.rect(s0 - 0.12, y1 + 0.02, s1 + 0.12, y1 + 0.05, 'rgba(0,0,0,0.22)');
    p.relief(s0 - 0.12, y1 + 0.02, s1 + 0.12, y1 + 0.2, RELIEF.trim, ROUGH.stone);
  }
  if (style.window === 'pediment' && nobile) {
    // A carved head over the first floor's windows: a triangular pediment on its cornice.
    const base = y1 + 0.22;
    p.poly([[s0 - 0.2, base], [s1 + 0.2, base], [mid, base + 0.42 + w * 0.1]], style.trim);
    p.poly([[s0 - 0.2, base], [s1 + 0.2, base], [s1 + 0.2, base + 0.04], [s0 - 0.2, base + 0.04]], 'rgba(0,0,0,0.18)');
    p.relief(s0 - 0.12, base, s1 + 0.12, base + 0.3, RELIEF.trim, ROUGH.stone);
    p.relief(mid - w * 0.25, base + 0.3, mid + w * 0.25, base + 0.42, RELIEF.trim, ROUGH.stone);
  }
  if (arched) {
    // The arch's ring of voussoirs, a keystone at its crown.
    p.poly([...arc(s0 - 0.14, s1 + 0.14, spring, rise + 0.2).reverse(), ...arc(s0 - 0.02, s1 + 0.02, spring, rise + 0.04)], style.trim);
    p.relief(s0 - 0.1, spring + rise * 0.6, s1 + 0.1, y1 + 0.18, RELIEF.trim, ROUGH.stone);
    p.rect(mid - 0.08, y1 - 0.02, mid + 0.08, y1 + 0.26, shade(style.trim, 0.94));
    p.relief(mid - 0.08, y1 - 0.02, mid + 0.08, y1 + 0.26, RELIEF.sill, ROUGH.stone);
  }
  return inside;
}

/** Records a framed facade's window (`Casement`) in its style's paints; its shutters and flowers are the caller's. */
function casement(p: Brush, style: FacadeStyle, opening: Pick<Casement, 's0' | 's1' | 'y0' | 'y1' | 'glazing' | 'head' | 'rise' | 'pediment' | 'sill'>): void {
  p.features.casements.push({ ...opening, frame: style.frame, trim: style.trim, wall: style.wall, shutters: null, flowers: null });
}

/** Open louvred shutters either side of a window. */
function paintShutters(p: Brush, style: FacadeStyle, s0: number, y0: number, s1: number, y1: number, winW: number): void {
  if (!style.shutters) return;
  p.rect(s0 - winW * 0.48, y0, s0 - 0.04, y1, style.shutters);
  p.rect(s1 + 0.04, y0, s1 + winW * 0.48, y1, style.shutters);
  p.relief(s0 - winW * 0.48, y0, s0 - 0.04, y1, RELIEF.shutter, ROUGH.paint);
  p.relief(s1 + 0.04, y0, s1 + winW * 0.48, y1, RELIEF.shutter, ROUGH.paint);
  for (let y = y0 + 0.1; y < y1; y += 0.12) {
    p.rect(s0 - winW * 0.46, y, s0 - 0.06, y + 0.02, 'rgba(0,0,0,0.18)');
    p.rect(s1 + 0.06, y, s1 + winW * 0.46, y + 0.02, 'rgba(0,0,0,0.18)');
  }
}

/** The ground floor of a building with no shop: a window per bay (the door's bay left to it), barred low, lit at night. */
function paintGroundWindows(p: Brush, style: FacadeStyle, random: () => number, width: number, bays: number, door: number | undefined): void {
  const bay = width / bays;
  const winW = windowWidth(style, bay);
  const y0 = 1.15;
  const y1 = Math.min(GROUND_FLOOR - 0.45, y0 + style.windows.height + 0.15);
  for (let b = 0; b < bays; b++) {
    const cx = (b + 0.5) * bay;
    if (door !== undefined && Math.abs(cx - door) < 1.4) continue;
    const inside = paintWindow(p, { ...style, window: style.window === 'pediment' ? 'lintel' : style.window }, random, cx - winW / 2, y0, cx + winW / 2, y1, false);
    if (random() < 0.6) p.light(cx - winW / 2 + 0.06, y0 + 0.06, cx + winW / 2 - 0.06, y1 - 0.06, pick(random, HOME_LIGHTS), random() * 0.9, 0.08 + random() * 0.85, undefined, inside);
  }
}

function paintShop(p: Brush, random: () => number, shop: ShopSpec, goods: readonly string[] | null, detail: number): void {
  const { from: s0, to: s1 } = shop;
  if (shop.kind === 'shut') {
    // A shop that has shut for good: a roller shutter, tagged.
    p.rect(s0, 0.2, s1, 3.4, '#8a8c8e');
    for (let y = 0.3; y < 3.4; y += 0.08) p.rect(s0, y, s1, y + 0.015, 'rgba(0,0,0,0.2)');
    p.relief(s0, 0.2, s1, 3.4, RELIEF.shutter, ROUGH.metal);
    for (let i = 0; i < 4; i++) {
      const a = s0 + random() * (s1 - s0 - 1);
      const y = 0.8 + random() * 1.5;
      p.rect(a, y, a + 0.5 + random() * 1.2, y + 0.3 + random() * 0.5, pick(random, ['#d9383a', '#3b6fb3', '#f0c94a', '#222222']));
    }
    paintFlyPosters(p, random, s0, s1);
    paintGraffiti(p, random, s0, s1);
    return;
  }
  const look = SHOPS[shop.kind];
  const width = s1 - s0;
  // Joinery, fascia board and its lettering.
  p.rect(s0, 0, s1, 3.6, look.front);
  p.relief(s0, 0, s1, 3.6, RELIEF.joinery, ROUGH.paint);
  p.rect(s0, 3.05, s1, 3.75, look.fascia);
  p.relief(s0, 3.05, s1, 3.75, RELIEF.fascia, ROUGH.paint);
  p.rect(s0, 3.7, s1, 3.75, 'rgba(255,255,255,0.12)');
  // Its own name when the plan gives one ('SUNNY SIDE CAFE'), else its trade's, in its own lettering.
  const name = shop.name ?? look.name;
  // A front built in 3D (`shopfronts/`) letters its board itself, sharp; a far one keeps its name in the paint.
  const variant = frontVariant(detail, shop.kind);
  if (name && !look.signed) {
    const size = Math.min(0.5, (width * 0.9) / (name.length * 0.62));
    if (variant) (p.features.signs ??= []).push({ s: (s0 + s1) / 2, y: 3.4, size, text: name, color: look.letters, font: look.font, ...(look.neon ? { neon: look.neon } : {}) });
    else {
      p.text(name, (s0 + s1) / 2, 3.4, size, look.letters, look.font);
      if (look.neon) p.light(s0 + width * 0.15, 3.15, s1 - width * 0.15, 3.65, look.neon, 0.02, 0);
    }
  }
  // The door (where the plan says, else somewhere along), display windows either side of it.
  const door = shop.door ?? s0 + 0.9 + random() * Math.max(0, width - 1.8);
  const palette = shop.kind === 'retro' && goods && goods.length ? goods : look.goods;
  p.features.shopfronts.push({ s0, s1, kind: shop.kind, light: look.light, awning: !!look.awning, name: shop.name });
  p.features.doors.push({ s: door, width: 1.2, height: 2.7, color: shade(look.front, 0.7), shop: true });
  p.features.windows.push({ s0: door - 0.5, s1: door + 0.5, y0: 0.15, y1: 2.55, kind: shop.kind, light: look.light, palette });
  p.rect(door - 0.6, 0.05, door + 0.6, 2.7, shade(look.front, 0.7));
  p.rect(door - 0.5, 0.15, door + 0.5, 2.55, GLASS);
  p.relief(door - 0.6, 0.05, door + 0.6, 2.7, RELIEF.door, ROUGH.paint);
  p.rect(door - 0.5, 1.9, door + 0.5, 2.55, 'rgba(170,190,210,0.2)');
  p.light(door - 0.5, 0.15, door + 0.5, 2.55, look.light, 0.05, 0, undefined, undefined, shop.kind);
  for (const [a, b] of [[s0 + 0.25, door - 0.75], [door + 0.75, s1 - 0.25]] as const) {
    if (b - a < 0.5) continue;
    const units = Math.max(1, Math.round((b - a) / 2.6));
    const unit = (b - a) / units;
    for (let i = 0; i < units; i++) {
      const g0 = a + i * unit + 0.05;
      const g1 = a + (i + 1) * unit - 0.05;
      p.rect(g0, 0.55, g1, 2.95, GLASS);
      p.features.windows.push({ s0: g0, s1: g1, y0: 0.55, y1: 2.95, kind: shop.kind, light: look.light, palette });
      // The display: shelves of goods.
      for (let shelf = 0; shelf < 3; shelf++) {
        const y = 0.7 + shelf * 0.62;
        p.rect(g0 + 0.05, y - 0.04, g1 - 0.05, y, shade(look.front, 0.8));
        for (let s = g0 + 0.1; s < g1 - 0.2; s += 0.16 + random() * 0.08) {
          const h = shop.kind === 'retro' ? 0.28 : 0.12 + random() * 0.3;
          p.rect(s, y, s + (shop.kind === 'retro' ? 0.14 : 0.12 + random() * 0.1), y + h, pick(random, palette));
        }
      }
      p.rect(g0, 2.3, g1, 2.95, 'rgba(170,190,210,0.18)');
      p.light(g0, 0.55, g1, 2.95, look.light, 0.03 + random() * 0.1, 0, undefined, undefined, shop.kind);
      p.rect(g1 - 0.03, 0.55, g1 + 0.08, 2.95, shade(look.front, 0.8));
    }
  }
  // An awning over the windows: built in 3D (`relief/FacadeRelief`); its shade on the wall is painted.
  if (look.awning) {
    // Between a built front's pilasters, hung from its head.
    const inset = Math.max(0.1, pilasterWidth(variant) + 0.01);
    p.features.awnings.push({ s0: s0 + inset, s1: s1 - inset, colors: look.awning, kind: shop.kind, out: awningOut(variant) });
    p.rect(s0 + 0.1, 2.55, s1 - 0.1, 3.0, 'rgba(0,0,0,0.14)');
  }
  // The arcade: its windows glow with the cabinets' screens, day and night.
  if (shop.kind === 'arcade') {
    for (let i = 0; i < 7; i++) {
      const s = s0 + 0.8 + i * ((width - 1.6) / 7);
      const color = pick(random, look.goods);
      p.rect(s, 1.2, s + 0.5, 1.6, color);
      p.light(s, 1.2, s + 0.5, 1.6, color, 0, 0);
    }
  }
}

/** Rain run off a sill: a few faint streaks down the wall from `y`, fading as they go (`Brush.weather`'s draw). */
function paintStreaks(p: Brush, s0: number, s1: number, y: number): void {
  if (p.slot.k < 12) return;
  const random = p.weather;
  const { ctx } = p;
  for (let i = 1 + Math.floor(random() * 3); i > 0; i--) {
    const s = s0 + random() * (s1 - s0);
    const w = 0.04 + random() * 0.1;
    const length = 0.25 + random() * 0.9;
    const top = p.y(y);
    const streak = ctx.createLinearGradient(0, top, 0, p.y(y - length));
    streak.addColorStop(0, `rgba(40, 36, 30, ${0.05 + random() * 0.07})`);
    streak.addColorStop(1, 'rgba(40, 36, 30, 0)');
    ctx.fillStyle = streak;
    ctx.fillRect(p.x(s - w / 2), top, w * p.slot.k, length * p.slot.k);
  }
}

/** Stone blocks up both corners to the cornice, long and short in turn. */
function paintQuoins(p: Brush, style: FacadeStyle, width: number, top: number): void {
  let long = true;
  for (let y = 0.3; y < top - 0.6; y += 0.62) {
    const w = long ? 0.7 : 0.45;
    p.rect(0.15, y, 0.15 + w, y + 0.55, style.trim);
    p.rect(width - 0.15 - w, y, width - 0.15, y + 0.55, style.trim);
    p.relief(0.15, y, 0.15 + w, y + 0.55, RELIEF.trim, ROUGH.stone);
    p.relief(width - 0.15 - w, y, width - 0.15, y + 0.55, RELIEF.trim, ROUGH.stone);
    long = !long;
  }
}

/**
 * The roof over a facade, for the sloping face `Buildings` builds behind its parapet (`ROOF_SLOPE`):
 * a band `depth` metres of slope long, from its foot (y 0) to its ridge, whose top edge is at
 * `slot.y` in the atlas: slate with zinc seams under a mansard (its dormers are built, `RoofClutter`),
 * tile courses on a pitched roof with its roof windows set in them (`city/roofFurniture`), rain
 * streaks and lichen down both. The roof windows' lights go to `lights` (their dusk point and curfew).
 */
export function paintRoof(ctx: CanvasRenderingContext2D, style: FacadeStyle, width: number, depth: number, slot: AtlasSlot, things?: RoofFurniture, lights?: NightLight[]): void {
  const p = new Brush(ctx, slot, depth);
  const random = lcg(style.seed * 31 + 5);
  p.rect(0, 0, width, depth, style.roofColor);
  const mansard = style.roof === 'mansard';
  if (mansard) for (let s = 0.4; s < width; s += 0.5) p.rect(s, 0, s + 0.04, depth, 'rgba(255,255,255,0.08)');
  else for (let y = 0.25; y < depth; y += 0.3) p.rect(0, y, width, y + 0.06, 'rgba(0,0,0,0.14)');
  for (let i = 3 + Math.floor(random() * 6); i > 0; i--) {
    const s = random() * (width - 0.6);
    p.rect(s, depth * (0.1 + random() * 0.5), s + 0.15 + random() * 0.35, depth, mansard ? 'rgba(20,24,30,0.12)' : 'rgba(60,70,30,0.12)');
  }
  // Lichen patches on old tiles, darker slates here and there.
  for (let i = 4 + Math.floor(random() * 6); i > 0; i--) {
    const s = random() * (width - 0.4);
    const y = random() * depth * 0.8;
    p.rect(s, y, s + 0.2 + random() * 0.4, y + 0.1 + random() * 0.2, mansard ? 'rgba(10,12,16,0.18)' : 'rgba(150,160,90,0.2)');
  }
  for (const window of things?.roofWindows ?? []) {
    // A roof window in the slope: its frame, the glass, lit some nights.
    const y0 = 0.8;
    const y1 = 1.9;
    p.rect(window.s - 0.08, y0 - 0.08, window.s + 0.88, y1 + 0.08, '#6a6e72');
    p.rect(window.s, y0, window.s + 0.8, y1, GLASS);
    p.rect(window.s, y1 - 0.3, window.s + 0.8, y1, 'rgba(160,185,210,0.25)');
    p.glass(window.s, y0, window.s + 0.8, y1, CLEAR_GLASS);
    if (window.lit) p.light(window.s + 0.05, y0 + 0.05, window.s + 0.75, y1 - 0.05, pick(random, HOME_LIGHTS), random() * 0.8, window.lit);
  }
  lights?.push(...p.lights);
  // Lighter towards the ridge, the ridge itself capped.
  p.rect(0, depth - 0.18, width, depth, mansard ? '#6b717c' : '#b9755a');
}

/**
 * The residents' door at `at`: a stone surround and a step (built, `relief/FacadeRelief`), the panelled door in the
 * building's colour with its brass letterbox and knob, the fanlight lit by the hall's light, the house number over it,
 * the bell panel beside it.
 */
function paintEntrance(p: Brush, style: FacadeStyle, at: number): void {
  p.features.doors.push({ s: at, width: 1.4, height: 2.7, color: '#d8ccb8', shop: false, step: true });
  p.rect(at - 0.95, 0, at + 0.95, 3.5, '#e6dccb');
  p.relief(at - 0.95, 0, at + 0.95, 3.5, RELIEF.trim, ROUGH.stone);
  p.rect(at - 0.7, 0.05, at + 0.7, 2.7, style.door);
  p.relief(at - 0.7, 0.05, at + 0.7, 2.7, RELIEF.door, ROUGH.paint);
  p.rect(at - 0.02, 0.05, at + 0.02, 2.7, 'rgba(0,0,0,0.45)');
  for (const side of [-1, 1]) {
    const a = at + side * 0.12;
    const b = at + side * 0.6;
    p.rect(Math.min(a, b), 0.3, Math.max(a, b), 1.2, 'rgba(0,0,0,0.18)');
    p.rect(Math.min(a, b), 1.4, Math.max(a, b), 2.5, 'rgba(0,0,0,0.18)');
    p.rect(Math.min(a, b) + 0.03, 0.33, Math.max(a, b) - 0.03, 1.17, 'rgba(255,255,255,0.06)');
    p.rect(Math.min(a, b) + 0.03, 1.43, Math.max(a, b) - 0.03, 2.47, 'rgba(255,255,255,0.06)');
  }
  // The letterbox and the knob in brass.
  p.rect(at - 0.5, 1.02, at - 0.2, 1.08, '#c9a75b');
  p.rect(at - 0.48, 1.04, at - 0.22, 1.06, '#3a2a14');
  p.rect(at + 0.14, 1.2, at + 0.2, 1.26, '#c9a75b');
  p.rect(at - 0.7, 2.75, at + 0.7, 3.3, GLASS);
  p.glass(at - 0.7, 2.75, at + 0.7, 3.3, CLEAR_GLASS);
  p.light(at - 0.66, 2.78, at + 0.66, 3.26, '#ffd9a0', 0.1, 0);
  // The house number, painted on the fanlight's glass in gold.
  p.text(String(style.number), at, 3.02, 0.26, '#e8c96a');
  // The bell panel: brushed steel, a speaker grille and a column of buttons with name cards.
  const bx = at + 1.05;
  p.rect(bx, 1.25, bx + 0.16, 1.75, '#a8aaac');
  p.relief(bx, 1.25, bx + 0.16, 1.75, RELIEF.plate, ROUGH.metal);
  p.rect(bx + 0.03, 1.62, bx + 0.13, 1.71, '#4a4c4e');
  for (let y = 1.3; y < 1.58; y += 0.055) {
    p.rect(bx + 0.025, y, bx + 0.09, y + 0.035, '#f0ece0');
    p.rect(bx + 0.105, y + 0.005, bx + 0.135, y + 0.03, '#2a2c2e');
  }
}

/**
 * What gets onto the bare ground-floor wall between shops, doors and windows: fly-posters (gig bills, a games fair)
 * and the odd tag, where at least 1.6 m of wall is clear.
 */
function paintBareWall(p: Brush, random: () => number, spec: FacadeSpec, width: number): void {
  const taken: [number, number][] = spec.shops.map((s) => [s.from, s.to]);
  if (spec.door !== undefined) taken.push([spec.door - 1.4, spec.door + 1.4]);
  for (const o of spec.openings ?? []) taken.push([o.at - o.width / 2 - 0.4, o.at + o.width / 2 + 0.4]);
  if (spec.shops.length === 0 && !spec.flat) return;
  taken.sort((a, b) => a[0] - b[0]);
  let s = 0.6;
  const gaps: [number, number][] = [];
  for (const [a, b] of taken) {
    if (a - s >= 1.6) gaps.push([s, a]);
    s = Math.max(s, b);
  }
  if (width - 0.6 - s >= 1.6) gaps.push([s, width - 0.6]);
  for (const [a, b] of gaps) {
    if (random() < 0.45) paintFlyPosters(p, random, a, b);
    if (random() < 0.3) paintGraffiti(p, random, a, b);
  }
}

/** The street's name on an enamel plate at a corner: white letters on blue, a white rim, `at` its middle along the front. */
function paintNamePlate(p: Brush, at: number, name: string): void {
  const w = Math.max(1.1, name.length * 0.11 + 0.3);
  const y0 = GROUND_FLOOR + 0.35;
  const y1 = y0 + 0.36;
  p.rect(at - w / 2, y0, at + w / 2, y1, '#f2f2ee');
  p.rect(at - w / 2 + 0.03, y0 + 0.03, at + w / 2 - 0.03, y1 - 0.03, '#1f3f7a');
  p.rect(at - w / 2 + 0.05, y0 + 0.05, at + w / 2 - 0.05, y1 - 0.05, '#f2f2ee');
  p.rect(at - w / 2 + 0.065, y0 + 0.065, at + w / 2 - 0.065, y1 - 0.065, '#1f3f7a');
  p.text(name, at, (y0 + y1) / 2, 0.17, '#f2f2ee', LETTERING.sans);
  p.relief(at - w / 2, y0, at + w / 2, y1, RELIEF.plate, ROUGH.enamel);
}

/** Fly-posters pasted on a wall or over a shut shop's shutter: gig bills and a games fair, torn at the corners. */
function paintFlyPosters(p: Brush, random: () => number, s0: number, s1: number): void {
  const count = 2 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const w = 0.5 + random() * 0.3;
    const h = w * 1.4;
    const a = s0 + 0.2 + random() * Math.max(0, s1 - s0 - w - 0.4);
    const y = 1.0 + random() * 1.2;
    p.rect(a, y, a + w, y + h, pick(random, POSTER_PAPERS));
    p.rect(a + 0.05, y + h * 0.72, a + w - 0.05, y + h * 0.9, pick(random, ['#1a1a22', '#8a2a2a', '#2a3f8a']));
    for (let l = 0; l < 4; l++) p.rect(a + 0.07, y + h * (0.2 + l * 0.11), a + w * (0.5 + random() * 0.4), y + h * (0.2 + l * 0.11) + 0.025, 'rgba(0,0,0,0.5)');
    // A torn corner.
    p.rect(a + w - 0.12, y, a + w, y + 0.1, 'rgba(120,120,116,0.9)');
  }
}

/** A spray-painted tag: a few fat looping strokes with a dark outline. */
function paintGraffiti(p: Brush, random: () => number, s0: number, s1: number): void {
  const { ctx, slot } = p;
  const x0 = s0 + 0.3 + random() * Math.max(0.1, (s1 - s0) * 0.4);
  const y0 = 0.5 + random() * 0.4;
  const len = Math.min(2.4, (s1 - s0) * 0.6);
  const points: [number, number][] = [];
  for (let i = 0; i <= 8; i++) points.push([x0 + (i / 8) * len, y0 + 0.2 + Math.sin(i * 1.7 + random() * 2) * 0.22]);
  for (const [width, color] of [[0.12, '#141418'], [0.07, pick(random, TAG_COLORS)]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * slot.k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach(([s, y], i) => (i ? ctx.lineTo(p.x(s), p.y(y)) : ctx.moveTo(p.x(s), p.y(y))));
    ctx.stroke();
  }
}

/** The faded adverts painted long ago on blind walls. */
const GHOST_SIGNS = ['PIANOS & ORGANS', 'COAL · COKE · LOGS', 'TEA ROOMS', 'DRAPERY', 'CYCLES REPAIRED', 'GRAND HOTEL', 'FINE TOBACCO', 'DAIRY · EGGS'];

/**
 * A blind party wall, `width` metres back into the block and `height` up from where it shows (over the lower
 * neighbour's parapet): render or brick (`brick`: the shader lays the courses), the stain of a chimney breast, rain
 * streaks, the old roofline of a house pulled down long ago, now and then a ghost sign or a tag high up.
 */
export function paintPartyWall(ctx: CanvasRenderingContext2D, style: FacadeStyle, width: number, height: number, slot: AtlasSlot, seed: number): { relief: ReliefRect[] } {
  const p = new Brush(ctx, slot, height, seed);
  const random = lcg(seed * 3571 + 13);
  p.rect(0, 0, width, height, shade(style.wall, style.kind === 'brick' ? 0.95 : 0.9));
  for (let i = 0; i < width * height * 0.5; i++) {
    const s = random() * width;
    const y = random() * height;
    p.rect(s, y, s + 0.3 + random() * 0.9, y + 0.2 + random() * 0.5, random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)');
  }
  // Patches where the render fell off, the brick under it showing.
  if (style.kind !== 'brick') {
    for (let i = Math.floor(random() * 4); i > 0; i--) {
      const s = random() * (width - 2);
      const y = random() * (height - 2);
      const w = 0.8 + random() * 1.6;
      const h = 0.5 + random() * 1.2;
      p.rect(s, y, s + w, y + h, '#9a6a52');
      p.relief(s, y, s + w, y + h, RELIEF.joint + 0.1, 0.95, true);
    }
  }
  // A chimney breast running up the wall, sooty at the top.
  if (random() < 0.5) {
    const s = 1.5 + random() * (width - 4);
    p.rect(s, 0, s + 1.4, height, shade(style.wall, 0.88));
    p.relief(s, 0, s + 1.4, height, RELIEF.plinth, 0.92, style.kind === 'brick');
    const soot = ctx.createLinearGradient(0, p.y(height), 0, p.y(height - 4));
    soot.addColorStop(0, 'rgba(20,18,16,0.3)');
    soot.addColorStop(1, 'rgba(20,18,16,0)');
    ctx.fillStyle = soot;
    ctx.fillRect(p.x(s), p.y(height), 1.4 * slot.k, 4 * slot.k);
  }
  // The roofline of the house that stood against it once: a pale gable's ghost.
  if (random() < 0.35) {
    const at = random() * width;
    const top = Math.min(height - 1, 3 + random() * 4);
    p.poly([[at - 4, 0], [at + 4, 0], [at, top]], 'rgba(255,255,255,0.07)');
  }
  // Rain streaks from the top.
  for (let i = Math.floor(width * 1.2); i > 0; i--) {
    const s = random() * width;
    const length = 1 + random() * 4;
    const streak = ctx.createLinearGradient(0, p.y(height), 0, p.y(height - length));
    streak.addColorStop(0, `rgba(40,36,30,${0.08 + random() * 0.1})`);
    streak.addColorStop(1, 'rgba(40,36,30,0)');
    ctx.fillStyle = streak;
    ctx.fillRect(p.x(s), p.y(height), (0.05 + random() * 0.2) * slot.k, length * slot.k);
  }
  if (height > 4 && random() < 0.45) {
    // A ghost sign: an advert painted on the brick a century ago, faded to a whisper.
    const text = pick(random, GHOST_SIGNS);
    const y = Math.min(height - 1.2, 1.5 + random() * Math.max(0.1, height - 3));
    const size = Math.min(0.9, (width * 0.8) / (text.length * 0.62));
    p.rect(0.6, y - size * 0.9, width - 0.6, y + size * 0.9, 'rgba(232,222,196,0.16)');
    p.text(text, width / 2, y, size, 'rgba(240,232,210,0.32)', LETTERING.condensed);
  }
  return { relief: p.reliefs };
}
