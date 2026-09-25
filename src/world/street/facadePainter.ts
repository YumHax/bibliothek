import { seededRandom } from '@/covers/generated/canvasUtils';
import { GROUND_FLOOR, STOREY, type FacadeSpec, type ShopKind, type ShopSpec } from './streetPlan';

/** A light painted on the night map: a rect (night-map pixels), its colour, when it comes on at dusk and when it goes out. */
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
}

/** Where a facade sits in the atlases: its top-left corner (colour-atlas pixels) and its scale. */
export interface AtlasSlot {
  x: number;
  y: number;
  /** Pixels per metre in the colour atlas. */
  k: number;
}

/** The night map is painted at this fraction of the colour atlas's resolution. */
export const NIGHT_SCALE = 0.25;
/** Parapet over the top floor's windows, metres. */
export const PARAPET = 1.1;

/** The height of a facade of `storeys` (ground floor included), parapet on top. */
export function facadeHeight(storeys: number): number {
  return GROUND_FLOOR + (storeys - 1) * STOREY + PARAPET;
}

interface Style {
  wall: string;
  trim: string;
  brick: boolean;
  frame: string;
  shutters: string | null;
  window: 'plain' | 'lintel' | 'arched';
  balconies: boolean;
  flowers: number;
}

const BRICKS = ['#b8654b', '#a86a52', '#9c6b55', '#8e4f3c', '#b0735a'];
const RENDERS = ['#c9a583', '#b99b6d', '#cdb79b', '#d8b49a', '#c8c2a8', '#e2cf9e', '#b9c2b0', '#d9b8b0'];
const STONES = ['#d9ccb4', '#e0d5c1', '#d4c6a8', '#cfc4b0'];
const SHUTTERS = ['#4f6b5a', '#5a7189', '#8c3b2e', '#e6dfcf', '#6b6f4a', '#3f4f6a'];
const CURTAINS = ['#d9cfbf', '#c9b9a4', '#e6e0d4', '#b9b3a8', '#c9a58a', '#a8b4b8'];
const FLOWERS = ['#d9383a', '#e0567a', '#f0f0e8', '#b04ac0', '#f09a3a'];
const GLASS = '#2f3d48';
const HOME_LIGHTS = ['#ffcf8a', '#ffd9a0', '#ffc070', '#fff0d0'];
const TV_LIGHT = '#9ab8ff';

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
  /** Its name glows all night (a neon, a lightbox). */
  neon?: string;
}

const SHOPS: Record<Exclude<ShopKind, 'shut'>, ShopLook> = {
  cafe: { name: 'CAFÉ', front: '#2f4a3a', fascia: '#2f4a3a', letters: '#e9dcb5', awning: ['#2f5a44', '#efe6d2'], goods: ['#6a4a32', '#d9c9a8', '#3a2a22'], light: '#ffd49a', late: false },
  bakery: { name: 'BOULANGERIE', front: '#6b4a2a', fascia: '#5a3a22', letters: '#f1d890', awning: ['#b8862f', '#f3ead6'], goods: ['#d9a05a', '#b8763a', '#e8c890', '#8a5a2a'], light: '#ffd49a', late: false },
  pharmacy: { name: 'PHARMACIE', front: '#d8d8d2', fascia: '#2f7a4a', letters: '#f4f4ee', awning: null, goods: ['#f0f0f0', '#6fb0d0', '#e0e8e0', '#8fc0a0'], light: '#e8f4ff', late: false, neon: '#4dff8a' },
  books: { name: 'LIBRAIRIE', front: '#2a3550', fascia: '#2a3550', letters: '#e0c878', awning: ['#2f4f6a', '#e8e0cc'], goods: ['#8a2a2a', '#2f4f6a', '#d9c9a0', '#3f6b4f', '#b8862f', '#e8e2d2'], light: '#ffd49a', late: false },
  grocer: { name: 'PRIMEUR', front: '#3f5a2a', fascia: '#3f5a2a', letters: '#f0e8c8', awning: ['#3f6b4f', '#f0ead8'], goods: ['#d9383a', '#f09a3a', '#6fa35e', '#e8d040'], light: '#ffe0b0', late: false },
  florist: { name: 'FLEURS', front: '#4a3a5a', fascia: '#e8e0d4', letters: '#5a3f6a', awning: ['#5a3f6a', '#e8e0d4'], goods: ['#e0567a', '#f0f0e8', '#b04ac0', '#4d7a3a', '#f09a3a'], light: '#ffe0b0', late: false },
  tabac: { name: 'TABAC', front: '#3a3634', fascia: '#8a2a2a', letters: '#f0e8d8', awning: null, goods: ['#c9c9c9', '#d94f3a', '#3b6fb3'], light: '#ffd49a', late: true, neon: '#ff5a3a' },
  bar: { name: 'BAR', front: '#241c1a', fascia: '#241c1a', letters: '#f0c060', awning: ['#7a2f2f', '#2a2020'], goods: ['#c9a050', '#6a8a5a', '#a03a2a', '#3a2a22'], light: '#ffb060', late: true, neon: '#ffc060' },
  butcher: { name: 'BOUCHERIE', front: '#7a2a2a', fascia: '#7a2a2a', letters: '#f0e8d8', awning: ['#8a2a2a', '#f0ead8'], goods: ['#c9544a', '#e8d8c8', '#a83a30'], light: '#f0f4ff', late: false },
  laundry: { name: 'LAVERIE', front: '#3a6a8a', fascia: '#f0f0ea', letters: '#3a6a8a', awning: null, goods: ['#e8e8e8', '#c9c9c9', '#3a6a8a'], light: '#e8f4ff', late: true },
  // The neon signs over these two are separate meshes (`NeonSign`); the fascia stays dark under them.
  retro: { name: '', front: '#1c1a2a', fascia: '#2a1f4a', letters: '#8fe6ff', awning: null, goods: ['#d94f3a', '#3b6fb3', '#f0c94a', '#e8e8e8', '#6fa35e', '#8c4f9e'], light: '#c8e0ff', late: false },
  arcade: { name: '', front: '#120c18', fascia: '#1a1024', letters: '#ff2fa0', awning: null, goods: ['#ff2fa0', '#5fe6ff', '#ffd23a', '#7a5cff', '#3aff8a'], light: '#c070ff', late: true },
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

function styleFor(random: () => number): Style {
  const r = random();
  if (r < 0.3) return { wall: pick(random, STONES), trim: '#ece4d2', brick: false, frame: '#ece8e0', shutters: null, window: random() < 0.6 ? 'lintel' : 'arched', balconies: true, flowers: 0.12 };
  if (r < 0.62) return { wall: pick(random, BRICKS), trim: '#e0d6c4', brick: true, frame: random() < 0.5 ? '#f2eee6' : '#3a3f44', shutters: null, window: random() < 0.5 ? 'plain' : 'lintel', balconies: random() < 0.3, flowers: 0.2 };
  return { wall: pick(random, RENDERS), trim: '#efe8da', brick: false, frame: '#f2eee6', shutters: random() < 0.6 ? pick(random, SHUTTERS) : null, window: 'plain', balconies: random() < 0.35, flowers: 0.3 };
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
export function paintFacade(ctx: CanvasRenderingContext2D, spec: FacadeSpec, width: number, slot: AtlasSlot, goods: readonly string[] | null): NightLight[] {
  const random = seededRandom(spec.seed * 7919);
  const style = styleFor(random);
  const height = facadeHeight(spec.storeys);
  const p = new Brush(ctx, slot, height);

  // The wall, and its texture.
  p.rect(0, 0, width, height, style.wall);
  if (style.brick && slot.k > 20) {
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

  // Storeys over the ground floor: a row of bays.
  const bays = Math.max(1, Math.round(width / 2.7));
  const bay = width / bays;
  const winW = Math.min(1.15, bay * 0.5);
  const winH = 1.65;
  for (let storey = 1; storey < spec.storeys; storey++) {
    const floorY = GROUND_FLOOR + (storey - 1) * STOREY;
    // A string course at each floor.
    p.rect(0, floorY - 0.06, width, floorY + 0.1, shade(style.trim, 0.96));
    const balconyRow = style.balconies && (storey === 1 || storey === spec.storeys - 1);
    for (let b = 0; b < bays; b++) {
      const cx = (b + 0.5) * bay;
      const s0 = cx - winW / 2;
      const s1 = cx + winW / 2;
      const y0 = floorY + 0.9;
      const y1 = y0 + winH;
      paintWindow(p, style, random, s0, y0, s1, y1);
      if (style.shutters && !balconyRow) {
        p.rect(s0 - winW * 0.48, y0, s0 - 0.04, y1, style.shutters);
        p.rect(s1 + 0.04, y0, s1 + winW * 0.48, y1, style.shutters);
        for (let y = y0 + 0.1; y < y1; y += 0.12) {
          p.rect(s0 - winW * 0.46, y, s0 - 0.06, y + 0.02, 'rgba(0,0,0,0.18)');
          p.rect(s1 + 0.06, y, s1 + winW * 0.46, y + 0.02, 'rgba(0,0,0,0.18)');
        }
      }
      if (balconyRow) {
        // A wrought-iron rail across the bay over a stone slab.
        p.rect(cx - bay * 0.42, y0 - 0.12, cx + bay * 0.42, y0, shade(style.trim, 0.85));
        p.rect(cx - bay * 0.42, y0 + 0.91, cx + bay * 0.42, y0 + 0.95, '#23262a');
        for (let s = cx - bay * 0.42; s <= cx + bay * 0.42; s += 0.12) p.rect(s, y0, s + 0.02, y0 + 0.95, '#23262a');
      } else if (random() < style.flowers) {
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

  // The ground floor: a plinth, then shops, a door.
  p.rect(0, 0, width, GROUND_FLOOR, shade(style.wall, 0.86));
  p.rect(0, 0, width, 0.35, shade(style.wall, 0.62));
  p.rect(0, GROUND_FLOOR - 0.12, width, GROUND_FLOOR, style.trim);
  for (const shop of spec.shops) paintShop(p, random, shop, goods);
  if (spec.door !== undefined) paintEntrance(p, spec.door);
  return p.lights;
}

/** Paints in facade metres (s along from the left, y up from the street) into the atlas, and collects the night lights. */
class Brush {
  readonly lights: NightLight[] = [];

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

  light(s0: number, y0: number, s1: number, y1: number, color: string, litAt: number, curfew: number): void {
    const { k } = this.slot;
    this.lights.push({ x: this.x(s0) * NIGHT_SCALE, y: this.y(y1) * NIGHT_SCALE, w: (s1 - s0) * k * NIGHT_SCALE, h: (y1 - y0) * k * NIGHT_SCALE, color, litAt, curfew });
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

function paintWindow(p: Brush, style: Style, random: () => number, s0: number, y0: number, s1: number, y1: number): void {
  const w = s1 - s0;
  // Reveal, glass with the sky's reflection fading down, then the frame and glazing bars.
  p.rect(s0 - 0.08, y0 - 0.06, s1 + 0.08, y1 + 0.06, 'rgba(0,0,0,0.3)');
  p.rect(s0, y0, s1, y1, GLASS);
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
  // Sill and head.
  p.rect(s0 - 0.1, y0 - 0.08, s1 + 0.1, y0, style.trim);
  if (style.window === 'lintel') p.rect(s0 - 0.12, y1 + 0.02, s1 + 0.12, y1 + 0.2, style.trim);
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
    return;
  }
  const look = SHOPS[shop.kind];
  const width = s1 - s0;
  // Joinery, fascia board and its lettering.
  p.rect(s0, 0, s1, 3.6, look.front);
  p.rect(s0, 3.05, s1, 3.75, look.fascia);
  if (look.name) {
    const size = Math.min(0.5, (width * 0.9) / (look.name.length * 0.62));
    p.text(look.name, (s0 + s1) / 2, 3.4, size, look.letters);
    if (look.neon) p.light(s0 + width * 0.15, 3.15, s1 - width * 0.15, 3.65, look.neon, 0.02, 0);
  }
  // The door (where the plan says, else somewhere along), display windows either side of it.
  const door = shop.door ?? s0 + 0.9 + random() * Math.max(0, width - 1.8);
  const closing = look.late ? 0.15 + random() * 0.15 : 0.55 + random() * 0.3;
  const palette = shop.kind === 'retro' && goods && goods.length ? goods : look.goods;
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
  // An awning over the windows (painted: a striped band).
  if (look.awning) {
    const [a, b] = look.awning;
    for (let s = s0 + 0.1, i = 0; s < s1 - 0.1; s += 0.35, i++) p.rect(s, 2.75, Math.min(s + 0.35, s1 - 0.1), 3.0, i % 2 ? b : a);
    p.rect(s0 + 0.1, 2.7, s1 - 0.1, 2.75, 'rgba(0,0,0,0.3)');
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
function paintEntrance(p: Brush, at: number): void {
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
