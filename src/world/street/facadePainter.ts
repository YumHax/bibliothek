import { seededRandom } from '@/covers/generated/canvasUtils';
import { GROUND_FLOOR, STOREY, type FacadeSpec, type FlatFront, type ShopKind, type ShopSpec } from './streetPlan';
import { SHOP_LOOKS } from '../city/shopLooks';
import { FACADE_WINDOW, balconyRows, facadeBays, facadeStyle, onBalcony, type FacadeStyle } from '../city/facadeStyle';
import type { FlatRoomId } from '../city/flatWindows';

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
 * What the painter leaves for the 3D relief (`relief/`) to build in front of the painted wall, in
 * facade metres (s along from the left end, y up from the pavement): the awnings (no longer
 * painted), the balcony rows (slab and rail, no longer painted), the window sills, the display
 * windows and doors of the shops (glass for the interiors, surrounds), the shopfronts (shutters,
 * glow), the wall's and trim's colours.
 */
export interface FacadeFeatures {
  wall: string;
  trim: string;
  awnings: { s0: number; s1: number; colors: [string, string] }[];
  balconies: { s0: number; s1: number; y: number }[];
  sills: { s0: number; s1: number; y: number }[];
  windows: { s0: number; s1: number; y0: number; y1: number; kind: ShopKind; light: string; palette: readonly string[] }[];
  doors: { s: number; width: number; height: number; color: string; shop: boolean }[];
  shopfronts: { s0: number; s1: number; kind: ShopKind; light: string; awning: boolean }[];
}

/** One painted facade: its night lights, its panes of glass and what stands out of it. */
export interface PaintedFacade {
  lights: NightLight[];
  glass: GlassPane[];
  features: FacadeFeatures;
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
/** Parapet over the top floor's windows, metres. */
export const PARAPET = 1.1;

/** The height of a facade of `storeys` (ground floor included), parapet on top. */
export function facadeHeight(storeys: number): number {
  return GROUND_FLOOR + (storeys - 1) * STOREY + PARAPET;
}

const CURTAINS = ['#d9cfbf', '#c9b9a4', '#e6e0d4', '#b9b3a8', '#c9a58a', '#a8b4b8'];
const FLOWERS = ['#d9383a', '#e0567a', '#f0f0e8', '#b04ac0', '#f09a3a'];
const GLASS = '#2f3d48';
const HOME_LIGHTS = ['#ffcf8a', '#ffd9a0', '#ffc070', '#fff0d0'];
const TV_LIGHT = '#9ab8ff';

/** How each kind of shop looks: joinery, fascia, lettering, awning, what fills the window, its light and when it shuts. */
export interface ShopLook {
  name: string;
  front: string;
  fascia: string;
  letters: string;
  awning: [string, string] | null;
  goods: string[];
  light: string;
  late: boolean;
  /** Its name glows all night (a neon, a lightbox). */
  neon?: string;
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
  electronics: { ...SHOP_LOOKS.electronics, light: '#d8e8ff', neon: '#5fd0ff' },
  pets: { ...SHOP_LOOKS.pets, light: '#ffe8c0' },
  laundry: { ...SHOP_LOOKS.laundry, light: '#e8f4ff' },
  retro: { ...SHOP_LOOKS.retro, name: '', light: '#c8e0ff' },
  arcade: { ...SHOP_LOOKS.arcade, name: '', light: '#c070ff' },
};

const LETTER_FONT = 'Georgia, "Times New Roman", serif';

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}


/**
 * Paints one facade into the colour atlas (`ctx`, at `slot`) and returns the lights it holds for
 * the night map: the wall (brick courses, render or dressed stone), string courses, a parapet and
 * cornice; per storey a row of windows (frames, sills, lintels or arches, shutters, curtains, the
 * odd balcony and flower box), each a home light with its own dusk point and curfew (a few a TV's
 * blue, some dark all night); the ground floor's shops (`SHOPS`: joinery, fascia and lettering,
 * awning, window display with its light until closing, a neon name for the late ones), a roller
 * shutter for a shop that has shut, a residential door. `goods` colours the retro games shop's
 * display (the day's market stock), when known.
 */
export function paintFacade(ctx: CanvasRenderingContext2D, spec: FacadeSpec, width: number, slot: AtlasSlot, goods: readonly string[] | null): PaintedFacade {
  const random = seededRandom(spec.seed * 7919);
  // The building's look is the neighbourhood's (`city/facadeStyle`): the window view paints the same front.
  const style = facadeStyle(spec.seed);
  const height = facadeHeight(spec.storeys);
  const p = new Brush(ctx, slot, height);
  p.features.wall = style.wall;
  p.features.trim = style.trim;

  // The wall, and its texture.
  p.rect(0, 0, width, height, style.wall);
  if (style.kind === 'brick' && slot.k > 20) {
    for (let y = 0; y < height; y += 0.075) p.rect(0, y, width, y + Math.max(0.012, 1 / slot.k), 'rgba(60, 40, 30, 0.18)');
  }
  for (let i = 0; i < width * height * 0.8; i++) {
    const s = random() * width;
    const y = random() * height;
    p.rect(s, y, s + 0.2 + random() * 0.6, y + 0.1 + random() * 0.3, random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)');
  }
  // Grime running down from the top.
  const grime = ctx.createLinearGradient(0, p.y(height), 0, p.y(height - 3));
  grime.addColorStop(0, 'rgba(40,35,30,0.22)');
  grime.addColorStop(1, 'rgba(40,35,30,0)');
  ctx.fillStyle = grime;
  ctx.fillRect(p.x(0), p.y(height), width * slot.k, 3 * slot.k);

  // Parapet and cornice (the cornice's band is also what the cornice ledge's geometry samples).
  p.rect(0, height - PARAPET, width, height, shade(style.wall, 0.93));
  p.rect(0, height - PARAPET - 0.1, width, height - PARAPET + 0.25, style.trim);
  p.rect(0, height - PARAPET - 0.16, width, height - PARAPET - 0.1, 'rgba(0,0,0,0.25)');
  p.rect(0, height - 0.12, width, height, style.trim);
  if (style.quoins) paintQuoins(p, style, width, height - PARAPET);

  // Storeys over the ground floor: a row of bays, balconies where the style hangs them.
  const bays = facadeBays(width, spec.bays);
  const bay = width / bays;
  const winW = Math.min(FACADE_WINDOW.maxWidth, bay * FACADE_WINDOW.share);
  const balconies = balconyRows(style, spec.storeys, bays);
  for (let storey = 1; storey < spec.storeys; storey++) {
    const floorY = GROUND_FLOOR + (storey - 1) * STOREY;
    // A string course at the floor, where the front has them.
    if (style.courses) p.rect(0, floorY - 0.06, width, floorY + 0.1, shade(style.trim, 0.96));
    // Our flat's floor: its own windows where they really are (painted after the loop).
    if (spec.flat && storey === spec.storeys - 1) continue;
    const y0 = floorY + FACADE_WINDOW.sill;
    const y1 = y0 + FACADE_WINDOW.height;
    for (const row of balconies) {
      if (row.floor !== storey) continue;
      // A wrought-iron balcony across the row's bays over a stone slab: built in 3D (`relief/FacadeRelief`), a shadow painted under it.
      const s0 = row.from * bay + bay * 0.08;
      const s1 = (row.to + 1) * bay - bay * 0.08;
      p.rect(s0, y0 - 0.3, s1, y0 - 0.12, 'rgba(0,0,0,0.12)');
      p.features.balconies.push({ s0, s1, y: y0 });
    }
    for (let b = 0; b < bays; b++) {
      const cx = (b + 0.5) * bay;
      const s0 = cx - winW / 2;
      const s1 = cx + winW / 2;
      const balcony = onBalcony(balconies, storey, b);
      paintWindow(p, style, random, s0, y0, s1, y1, storey === 1 && !balcony);
      if (style.shutters && !balcony) {
        p.rect(s0 - winW * 0.48, y0, s0 - 0.04, y1, style.shutters);
        p.rect(s1 + 0.04, y0, s1 + winW * 0.48, y1, style.shutters);
        for (let y = y0 + 0.1; y < y1; y += 0.12) {
          p.rect(s0 - winW * 0.46, y, s0 - 0.06, y + 0.02, 'rgba(0,0,0,0.18)');
          p.rect(s1 + 0.06, y, s1 + winW * 0.46, y + 0.02, 'rgba(0,0,0,0.18)');
        }
      }
      if (!balcony && random() < style.flowers) {
        p.rect(s0 - 0.05, y0 - 0.02, s1 + 0.05, y0 + 0.2, '#6a4a32');
        for (let i = 0; i < 6; i++) p.rect(s0 + (i / 6) * winW, y0 + 0.15, s0 + ((i + 0.8) / 6) * winW, y0 + 0.32, pick(random, FLOWERS));
      }
      // Its light at night: a home, now and then a TV, some empty all night.
      if (random() < 0.72) {
        const tv = random() < 0.12;
        p.light(s0 + 0.06, y0 + 0.06, s1 - 0.06, y1 - 0.06, tv ? TV_LIGHT : pick(random, HOME_LIGHTS), random() * 0.9, 0.08 + random() * 0.9);
      }
    }
  }

  if (spec.flat) paintFlat(p, style, spec.flat);

  // The ground floor: a plinth, then shops, a door.
  p.rect(0, 0, width, GROUND_FLOOR, shade(style.wall, 0.86));
  p.rect(0, 0, width, 0.35, shade(style.wall, 0.62));
  if (style.rusticated) for (let y = 0.8; y < GROUND_FLOOR - 0.3; y += 0.45) p.rect(0, y, width, y + 0.05, 'rgba(0,0,0,0.16)');
  p.rect(0, GROUND_FLOOR - 0.12, width, GROUND_FLOOR, style.trim);
  for (const shop of spec.shops) paintShop(p, random, shop, goods);
  if (spec.door !== undefined) paintEntrance(p, spec.door);
  return { lights: p.lights, glass: p.panes, features: p.features };
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
  p.rect(s0 - 0.06, y0 - 0.03, s1 + 0.06, y1 + 0.04, 'rgba(0,0,0,0.3)');
  p.rect(s0, y0, s1, y1, '#b9c2c4');
  p.glass(s0, y0, s1, y1, FROSTED_GLASS);
  p.rect(s0, y0 + (y1 - y0) * 0.55, s1, y1, 'rgba(235,240,242,0.35)');
  const bar = Math.max(0.03, 1.5 / p.slot.k);
  p.rect(s0, y0, s1, y0 + bar, style.frame);
  p.rect(s0, y1 - bar, s1, y1, style.frame);
  p.rect(s0, y0, s0 + bar, y1, style.frame);
  p.rect(s1 - bar, y0, s1, y1, style.frame);
  p.rect(s0 - 0.08, y0 - 0.1, s1 + 0.08, y0 - 0.02, style.trim);
}

/** A tall pane (a French window, a glazed door): reveal, glass, sky reflection, frame and bars, a head over it. */
function paintTallGlass(p: Brush, style: FacadeStyle, s0: number, y0: number, s1: number, y1: number): void {
  p.rect(s0 - 0.08, y0 - 0.04, s1 + 0.08, y1 + 0.06, 'rgba(0,0,0,0.32)');
  p.rect(s0, y0, s1, y1, GLASS);
  p.glass(s0, y0, s1, y1, CLEAR_GLASS);
  p.rect(s0, y1 - (y1 - y0) * 0.3, s1, y1, 'rgba(160,185,210,0.22)');
  const bar = Math.max(0.035, 1.5 / p.slot.k);
  p.rect(s0, y0, s1, y0 + bar, style.frame);
  p.rect(s0, y1 - bar, s1, y1, style.frame);
  p.rect(s0, y0, s0 + bar, y1, style.frame);
  p.rect(s1 - bar, y0, s1, y1, style.frame);
  p.rect((s0 + s1) / 2 - bar / 2, y0, (s0 + s1) / 2 + bar / 2, y1, style.frame);
  for (const f of [0.33, 0.66]) p.rect(s0, y0 + (y1 - y0) * f, s1, y0 + (y1 - y0) * f + bar, style.frame);
  p.rect(s0 - 0.12, y1 + 0.02, s1 + 0.12, y1 + 0.18, style.trim);
}

/** Paints in facade metres (s along from the left, y up from the street) into the atlas, and collects the night lights. */
class Brush {
  readonly lights: NightLight[] = [];
  readonly panes: GlassPane[] = [];
  readonly features: FacadeFeatures = { wall: '#888888', trim: '#dddddd', awnings: [], balconies: [], sills: [], windows: [], doors: [], shopfronts: [] };

  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly slot: AtlasSlot,
    private readonly height: number,
  ) {}

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

  light(s0: number, y0: number, s1: number, y1: number, color: string, litAt: number, curfew: number, room?: FlatRoomId): void {
    const { k } = this.slot;
    this.lights.push({ x: this.x(s0), y: this.y(y1), w: (s1 - s0) * k, h: (y1 - y0) * k, color, litAt, curfew, room });
  }

  /** A pane of glass (for the glass mask: glossy, reflecting, set back behind its reveal). */
  glass(s0: number, y0: number, s1: number, y1: number, rough: number): void {
    const { k } = this.slot;
    this.panes.push({ x: this.x(s0), y: this.y(y1), w: (s1 - s0) * k, h: (y1 - y0) * k, rough });
  }

  /** Centred lettering, `size` metres tall, its middle at (s, y). */
  text(text: string, s: number, y: number, size: number, color: string): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.max(6, Math.round(size * this.slot.k))}px ${LETTER_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.x(s), this.y(y));
  }
}

function paintWindow(p: Brush, style: FacadeStyle, random: () => number, s0: number, y0: number, s1: number, y1: number, nobile: boolean): void {
  const w = s1 - s0;
  // Reveal, glass with the sky's reflection fading down, then the frame and glazing bars.
  p.rect(s0 - 0.08, y0 - 0.06, s1 + 0.08, y1 + 0.06, 'rgba(0,0,0,0.3)');
  p.rect(s0, y0, s1, y1, GLASS);
  p.glass(s0, y0, s1, y1, CLEAR_GLASS);
  p.rect(s0, y1 - (y1 - y0) * 0.35, s1, y1, 'rgba(160,185,210,0.22)');
  if (random() < 0.6) {
    const curtain = pick(random, CURTAINS);
    const open = 0.15 + random() * 0.3;
    p.rect(s0, y0, s0 + w * open, y1, curtain);
    p.rect(s1 - w * open, y0, s1, y1, curtain);
  }
  const bar = Math.max(0.035, 1.5 / p.slot.k);
  const mid = (s0 + s1) / 2;
  p.rect(s0, y0, s1, y0 + bar, style.frame);
  p.rect(s0, y1 - bar, s1, y1, style.frame);
  p.rect(s0, y0, s0 + bar, y1, style.frame);
  p.rect(s1 - bar, y0, s1, y1, style.frame);
  p.rect(mid - bar / 2, y0, mid + bar / 2, y1, style.frame);
  p.rect(s0, y0 + (y1 - y0) * 0.62, s1, y0 + (y1 - y0) * 0.62 + bar, style.frame);
  // Sill and head (the sill also stands out in 3D on the near facades).
  p.rect(s0 - 0.1, y0 - 0.08, s1 + 0.1, y0, style.trim);
  p.features.sills.push({ s0: s0 - 0.1, s1: s1 + 0.1, y: y0 });
  if (style.window === 'lintel' || style.window === 'pediment') p.rect(s0 - 0.12, y1 + 0.02, s1 + 0.12, y1 + 0.2, style.trim);
  if (style.window === 'pediment' && nobile) {
    // A carved head over the first floor's windows: a pediment stepped up to its point.
    for (let k = 0; k < 4; k++) p.rect(s0 - 0.15 + k * w * 0.14, y1 + 0.2 + k * 0.11, s1 + 0.15 - k * w * 0.14, y1 + 0.31 + k * 0.11, style.trim);
  }
  if (style.window === 'arched') {
    // A keystoned head: a band and a stepped key over it.
    p.rect(s0 - 0.1, y1, s1 + 0.1, y1 + 0.12, style.trim);
    p.rect(s0 + w * 0.3, y1 + 0.12, s1 - w * 0.3, y1 + 0.24, style.trim);
    p.rect(mid - 0.08, y1 + 0.24, mid + 0.08, y1 + 0.34, style.trim);
  }
}

function paintShop(p: Brush, random: () => number, shop: ShopSpec, goods: readonly string[] | null): void {
  const { from: s0, to: s1 } = shop;
  if (shop.kind === 'shut') {
    // A shop that has shut for good: a roller shutter, tagged.
    p.rect(s0, 0.2, s1, 3.4, '#8a8c8e');
    for (let y = 0.3; y < 3.4; y += 0.08) p.rect(s0, y, s1, y + 0.015, 'rgba(0,0,0,0.2)');
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
  p.rect(s0, 3.05, s1, 3.75, look.fascia);
  // Its own name when the plan gives one ('SUNNY SIDE CAFE'), else its trade's.
  const name = shop.name ?? look.name;
  if (name) {
    const size = Math.min(0.5, (width * 0.9) / (name.length * 0.62));
    p.text(name, (s0 + s1) / 2, 3.4, size, look.letters);
    if (look.neon) p.light(s0 + width * 0.15, 3.15, s1 - width * 0.15, 3.65, look.neon, 0.02, 0);
  }
  // The door (where the plan says, else somewhere along), display windows either side of it.
  const door = shop.door ?? s0 + 0.9 + random() * Math.max(0, width - 1.8);
  const closing = look.late ? 0.15 + random() * 0.15 : 0.55 + random() * 0.3;
  const palette = shop.kind === 'retro' && goods && goods.length ? goods : look.goods;
  p.features.shopfronts.push({ s0, s1, kind: shop.kind, light: look.light, awning: !!look.awning });
  p.features.doors.push({ s: door, width: 1.2, height: 2.7, color: shade(look.front, 0.7), shop: true });
  p.features.windows.push({ s0: door - 0.5, s1: door + 0.5, y0: 0.15, y1: 2.55, kind: shop.kind, light: look.light, palette });
  p.rect(door - 0.6, 0.05, door + 0.6, 2.7, shade(look.front, 0.7));
  p.rect(door - 0.5, 0.15, door + 0.5, 2.55, GLASS);
  p.rect(door - 0.5, 1.9, door + 0.5, 2.55, 'rgba(170,190,210,0.2)');
  p.light(door - 0.5, 0.15, door + 0.5, 2.55, look.light, 0.05, closing);
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
      p.light(g0, 0.55, g1, 2.95, look.light, 0.03 + random() * 0.1, closing);
      p.rect(g1 - 0.03, 0.55, g1 + 0.08, 2.95, shade(look.front, 0.8));
    }
  }
  // An awning over the windows: built in 3D (`relief/FacadeRelief`); its shade on the wall is painted.
  if (look.awning) {
    p.features.awnings.push({ s0: s0 + 0.1, s1: s1 - 0.1, colors: look.awning });
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

/** A tall wooden double door under a fanlight, in a stone surround, a brass plate over it. */
/** Stone blocks up both corners to the cornice, long and short in turn. */
function paintQuoins(p: Brush, style: FacadeStyle, width: number, top: number): void {
  let long = true;
  for (let y = 0.3; y < top - 0.6; y += 0.62) {
    const w = long ? 0.7 : 0.45;
    p.rect(0.15, y, 0.15 + w, y + 0.55, style.trim);
    p.rect(width - 0.15 - w, y, width - 0.15, y + 0.55, style.trim);
    long = !long;
  }
}

/**
 * The roof over a facade, for the sloping face `Buildings` builds behind its parapet (`ROOF_SLOPE`):
 * a band `depth` metres of slope long, from its foot (y 0) to its ridge, whose top edge is at
 * `slot.y` in the atlas: slate with zinc seams and dormers under a mansard, tile courses on a
 * pitched roof, rain streaks down both.
 */
export function paintRoof(ctx: CanvasRenderingContext2D, style: FacadeStyle, width: number, depth: number, slot: AtlasSlot): void {
  const p = new Brush(ctx, slot, depth);
  const random = seededRandom(style.seed * 31 + 5);
  p.rect(0, 0, width, depth, style.roofColor);
  const mansard = style.roof === 'mansard';
  if (mansard) for (let s = 0.4; s < width; s += 0.5) p.rect(s, 0, s + 0.04, depth, 'rgba(255,255,255,0.08)');
  else for (let y = 0.25; y < depth; y += 0.3) p.rect(0, y, width, y + 0.06, 'rgba(0,0,0,0.14)');
  for (let i = 3 + Math.floor(random() * 6); i > 0; i--) {
    const s = random() * (width - 0.6);
    p.rect(s, depth * (0.1 + random() * 0.5), s + 0.15 + random() * 0.35, depth, mansard ? 'rgba(20,24,30,0.12)' : 'rgba(60,70,30,0.12)');
  }
  // Lighter towards the ridge, the ridge itself capped.
  p.rect(0, depth - 0.18, width, depth, mansard ? '#6b717c' : '#b9755a');
}

function paintEntrance(p: Brush, at: number): void {
  p.features.doors.push({ s: at, width: 1.4, height: 2.7, color: '#d8ccb8', shop: false });
  p.rect(at - 0.95, 0, at + 0.95, 3.5, '#e6dccb');
  p.rect(at - 0.7, 0.05, at + 0.7, 2.7, '#4a2e22');
  p.rect(at - 0.02, 0.05, at + 0.02, 2.7, '#2e1c14');
  for (const side of [-1, 1]) {
    const a = at + side * 0.12;
    const b = at + side * 0.6;
    p.rect(Math.min(a, b), 0.3, Math.max(a, b), 1.2, '#3e271c');
    p.rect(Math.min(a, b), 1.4, Math.max(a, b), 2.5, '#3e271c');
  }
  p.rect(at - 0.7, 2.75, at + 0.7, 3.3, GLASS);
  p.light(at - 0.66, 2.78, at + 0.66, 3.26, '#ffd9a0', 0.1, 0);
  p.rect(at - 0.1, 3.35, at + 0.1, 3.45, '#c9a75b');
  p.text('12', at, 3.1, 0.3, '#f0e6c8');
}

/** Fly-posters pasted over a shut shop's shutter: gig bills and a games fair, torn at the corners. */
function paintFlyPosters(p: Brush, random: () => number, s0: number, s1: number): void {
  const papers = ['#f0e8d0', '#f6d23a', '#e8e8e8', '#ff6a3a', '#9ad0e8'];
  const count = 2 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const w = 0.5 + random() * 0.3;
    const h = w * 1.4;
    const a = s0 + 0.2 + random() * Math.max(0, s1 - s0 - w - 0.4);
    const y = 1.0 + random() * 1.2;
    p.rect(a, y, a + w, y + h, pick(random, papers));
    p.rect(a + 0.05, y + h * 0.72, a + w - 0.05, y + h * 0.9, pick(random, ['#1a1a22', '#8a2a2a', '#2a3f8a']));
    for (let l = 0; l < 4; l++) p.rect(a + 0.07, y + h * (0.2 + l * 0.11), a + w * (0.5 + random() * 0.4), y + h * (0.2 + l * 0.11) + 0.025, 'rgba(0,0,0,0.5)');
    // A torn corner.
    p.rect(a + w - 0.12, y, a + w, y + 0.1, '#8a8c8e');
  }
}

/** A spray-painted tag: a few fat looping strokes with a dark outline. */
function paintGraffiti(p: Brush, random: () => number, s0: number, s1: number): void {
  const { ctx, slot } = p;
  const colors = ['#e83a8a', '#3ae8c8', '#f0e03a', '#8a4af0'];
  const x0 = s0 + 0.3 + random() * Math.max(0.1, (s1 - s0) * 0.4);
  const y0 = 0.5 + random() * 0.4;
  const len = Math.min(2.4, (s1 - s0) * 0.6);
  const points: [number, number][] = [];
  for (let i = 0; i <= 8; i++) points.push([x0 + (i / 8) * len, y0 + 0.2 + Math.sin(i * 1.7 + random() * 2) * 0.22]);
  for (const [width, color] of [[0.12, '#141418'], [0.07, pick(random, colors)]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * slot.k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach(([s, y], i) => (i ? ctx.lineTo(p.x(s), p.y(y)) : ctx.moveTo(p.x(s), p.y(y))));
    ctx.stroke();
  }
}
