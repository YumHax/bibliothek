import { Polygon, type Rng } from './Sheet';
import { between, integer, pick, shade } from './paint';
import { FacadeFrame } from './FacadeFrame';
import { SHOP_LOOKS } from '@/world/city/shopLooks';
import { GROUND_FLOOR } from '@/world/street/streetPlan';

/** What a shop puts out on the pavement in front of it. */
export type ShopDisplay = 'terrace' | 'crates' | 'buckets' | 'board' | 'none';

/** A shop on Front Street, as `paintStreet` needs it: the azimuth range of its front and what stands outside. */
/** A box of goods on a display shelf, in scenery texture pixels. */
export interface GoodsRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Storefront {
  a0: number;
  a1: number;
  display: ShopDisplay;
  /** The retro games shop: nothing may stand in front of it. */
  landmark: boolean;
  /** The colour of its light and the wakefulness at which it shuts (its curfew), for the light it spills outside. */
  light: 'warm' | 'cool';
  closing: number;
  /** The boxes on its display shelves (the retro games shop's show the day's market stock, see `Outdoors.showShopStock`). */
  goods: GoodsRect[];
}

interface ShopType {
  name: string;
  /** Shopfront joinery, the fascia board and its lettering. */
  front: string;
  fascia: string;
  letters: string;
  /** Awning stripes (colour, then the stripe between), or no awning. */
  awning: [string, string] | null;
  /** Colours of what fills the window display. */
  goods: string[];
  light: 'warm' | 'cool';
  /** Bars and tobacconists keep going until one or two in the morning. */
  late: boolean;
  display: ShopDisplay;
  /** Lettering that glows at night (a neon or a lightbox), all night long. */
  neon?: 'warm' | 'cool';
  /** A lit sign on a bracket: the pharmacy's cross, the tobacconist's diamond; a painted board (the walk-in shops'). */
  bracket?: 'cross' | 'diamond' | 'board';
  /** No roller shutter: its windows stay lit behind their glass after closing (the walk-in shops, `street/shopfronts/`). */
  unshuttered?: boolean;
}

/** A kind's colours (`city/shopLooks`, shared with the walkable street) with how the painted front lights up and dresses the pavement. */
function look(kind: keyof typeof SHOP_LOOKS, painted: Pick<ShopType, 'light' | 'display'> & Partial<Pick<ShopType, 'neon' | 'bracket' | 'unshuttered'>>): ShopType {
  return { ...SHOP_LOOKS[kind], ...painted };
}

/** The shops the facades draw lots from (their order is the draw's: a new kind goes in `PLANNED_SHOPS`, never here). */
const SHOPS: readonly ShopType[] = [
  look('cafe', { light: 'warm', display: 'terrace' }),
  look('bakery', { light: 'warm', display: 'board' }),
  look('pharmacy', { light: 'cool', display: 'none', bracket: 'cross' }),
  look('books', { light: 'warm', display: 'board' }),
  look('grocer', { light: 'warm', display: 'crates' }),
  look('florist', { light: 'warm', display: 'buckets', unshuttered: true }),
  look('tabac', { light: 'warm', display: 'none', neon: 'warm', bracket: 'diamond' }),
  look('bar', { light: 'warm', display: 'terrace', neon: 'warm' }),
  look('butcher', { light: 'cool', display: 'none' }),
  look('laundry', { light: 'cool', display: 'none' }),
];
/** Kinds only the walkable street's plan puts somewhere (`plannedType`), never drawn by lot. */
const PLANNED_SHOPS: readonly ShopType[] = [
  look('furniture', { light: 'warm', display: 'none', bracket: 'board', unshuttered: true }),
  look('pets', { light: 'warm', display: 'none', bracket: 'board', unshuttered: true }),
  look('electronics', { light: 'cool', display: 'none', neon: 'cool', bracket: 'board', unshuttered: true }),
];
/** The shop across the street the collector surely haunts. */
export const RETRO_GAMES: ShopType = look('retro', { light: 'cool', display: 'board', neon: 'cool' });
const LETTER_FONT = 'Georgia, "Times New Roman", serif';
const GLASS = '#26313d';

/**
 * A shop the walkable street's plan puts on this facade (`street/streetPlan.ts`), so the view from
 * the windows shows the shops the player finds down there: from `s0` to `s1` along the facade
 * (metres from its left end as the eye sees it), the painted kind by the plan's kind, its own name.
 */
export interface PlannedShop {
  s0: number;
  s1: number;
  kind: string;
  name?: string;
}

/** The painted look of a plan's kind of shop ('shut' is a roller shutter, the arcade is not painted). */
function plannedType(kind: string, name?: string): ShopType | null {
  const byKind: Record<string, string> = {
    cafe: 'CAFE', bakery: 'BAKERY', pharmacy: 'PHARMACY', books: 'BOOKSHOP', grocer: 'GREENGROCER', florist: 'FLOWERS', tabac: 'NEWSAGENT', bar: 'BAR', butcher: 'BUTCHER', laundry: 'LAUNDERETTE',
    furniture: 'FURNITURE', pets: 'PET SHOP', electronics: 'TV REPAIR',
  };
  const type = kind === 'retro' ? RETRO_GAMES : [...SHOPS, ...PLANNED_SHOPS].find((shop) => shop.name === byKind[kind]);
  if (!type) return null;
  return name && type !== RETRO_GAMES ? { ...type, name } : type;
}

/**
 * The ground floor of a building given over to shops: one shop across the whole front or two or
 * three side by side, each with its joinery, a fascia with its name, display windows full of
 * goods and a door, often an awning, sometimes a lit sign on a bracket; or a shop that has shut
 * for good behind a tagged roller shutter. At night the windows light until closing time and the
 * neon names burn on. `planned` puts the plan's shops where the plan has them instead of drawing
 * lots. Returns what each shop puts out on the pavement.
 */
export function paintShopfronts(f: FacadeFrame, random: Rng, wall: string, landmark?: ShopType, planned?: readonly PlannedShop[]): Storefront[] {
  const { sheet, w } = f;
  const units = Math.max(1, Math.floor(w / 4.2));
  const out: Storefront[] = [];
  // The shops' band of wall, up to the course under the first floor (`Facades`: GROUND - 0.25 to GROUND).
  sheet.path(f.strip(0, w, -1.5, GROUND_FLOOR - 0.25), shade(wall, 0.9));
  if (planned) {
    for (const shop of planned) {
      const type = plannedType(shop.kind, shop.name);
      if (!type) {
        paintShutter(f, random, shop.s0 + 0.2, shop.s1 - 0.2);
        continue;
      }
      const { closing, goods } = paintShop(f, random, type, shop.s0, shop.s1, Math.max(1, Math.round((shop.s1 - shop.s0) / 4.2)));
      out.push({ a0: f.at(shop.s0), a1: f.at(shop.s1), display: type.display, landmark: type === RETRO_GAMES, light: type.light, closing, goods });
    }
    return out;
  }
  const shopCount = landmark ? 1 : Math.min(units, random() < 0.5 ? 1 : integer(random, 2, 3));
  for (let i = 0; i < shopCount; i++) {
    const s0 = (w * i) / shopCount;
    const s1 = (w * (i + 1)) / shopCount;
    if (!landmark && random() < 0.08) {
      paintShutter(f, random, s0 + 0.2, s1 - 0.2);
      continue;
    }
    const type = landmark ?? pick(random, SHOPS);
    const { closing, goods } = paintShop(f, random, type, s0, s1, Math.max(1, Math.round((units * (s1 - s0)) / w)));
    out.push({ a0: f.at(s0), a1: f.at(s1), display: type.display, landmark: type === landmark, light: type.light, closing, goods });
  }
  return out;
}

/** One shop from `s0` to `s1` along the facade; returns its curfew (when it shuts, see `wakefulnessAt`) and the goods in its windows. */
function paintShop(f: FacadeFrame, random: Rng, type: ShopType, s0: number, s1: number, units: number): { closing: number; goods: GoodsRect[] } {
  const { sheet, d } = f;
  const ctx = sheet.color;
  // Shops shut around eleven (the late ones at one or two): see `wakefulnessAt`.
  const closing = type.late ? between(random, 0.15, 0.3) : between(random, 0.55, 0.85);
  sheet.path(f.quad(s0 + 0.1, s1 - 0.1, 0, 3.6), type.front);
  f.detail(f.quad(s0 + 0.1, s1 - 0.1, 0, 0.55), shade(type.front, 0.7));
  const unit = (s1 - s0) / units;
  const goods: GoodsRect[] = [];
  const doorAt = integer(random, 0, units - 1);
  for (let i = 0; i < units; i++) {
    let g0 = s0 + i * unit + 0.35;
    const g1 = s0 + (i + 1) * unit - 0.35;
    if (i === doorAt) {
      const door = f.quad(g0, g0 + 1.05, 0.08, 2.75);
      sheet.begin(d, 0.25);
      sheet.path(door, GLASS);
      sheet.begin(d, 0.05);
      f.detail(f.quad(g0 + 0.08, g0 + 0.97, 0.9, 1.0), shade(type.front, 1.4));
      sheet.lit(door, type.light, 0.45, closing);
      g0 += 1.3;
    }
    if (g1 - g0 < 0.4) continue;
    const glass = f.quad(g0, g1, 0.6, 2.95);
    sheet.begin(d, 0.28);
    sheet.path(glass, GLASS);
    sheet.begin(d, 0.05);
    goods.push(...paintGoods(f, random, type, g0, g1, closing));
    f.detail(glass, f.vertical(0.6, 2.95, [[0, 'rgba(210,225,240,0.32)'], [0.5, 'rgba(160,180,200,0.1)'], [1, 'rgba(0,0,0,0.12)']]));
    // A diagonal sheen across the pane.
    const [xa, ya] = f.P(g0 + (g1 - g0) * 0.2, 2.95);
    const [xb, yb] = f.P(g0 + (g1 - g0) * 0.45, 2.95);
    const [xc, yc] = f.P(g0 + (g1 - g0) * 0.3, 0.6);
    const [xd, yd] = f.P(g0 + (g1 - g0) * 0.05, 0.6);
    const sheen = new Path2D();
    sheen.moveTo(xa, ya);
    sheen.lineTo(xb, yb);
    sheen.lineTo(xc, yc);
    sheen.lineTo(xd, yd);
    sheen.closePath();
    f.detail(sheen, 'rgba(255,255,255,0.07)');
  }

  // The fascia and the shop's name on it.
  const fascia = f.quad(s0 + 0.15, s1 - 0.15, 3.05, 3.6);
  f.detail(fascia, type.fascia);
  f.detail(f.quad(s0 + 0.15, s1 - 0.15, 3.05, 3.1), 'rgba(0,0,0,0.3)');
  f.detail(f.quad(s0 + 0.15, s1 - 0.15, 3.55, 3.6), 'rgba(255,255,255,0.15)');
  if (f.fine) {
    const [cx, cy] = f.P((s0 + s1) / 2, 3.33);
    const { x: pxX, y: pxY } = f.pxPerMetre;
    const size = 0.34 * pxY;
    ctx.save();
    ctx.font = `bold ${size}px ${LETTER_FONT}`;
    const squeeze = Math.min(pxX / pxY, ((s1 - s0 - 0.6) * pxX) / Math.max(1, ctx.measureText(type.name).width));
    // The fascia runs aslant across the panorama (its far end is lower or higher): the lettering is
    // sheared to run along it, not level with the texture.
    const [xa, ya] = f.P(s0 + 0.3, 3.33);
    const [xb, yb] = f.P(s1 - 0.3, 3.33);
    const slant = Math.abs(xb - xa) > 1 ? (yb - ya) / (xb - xa) : 0;
    ctx.translate(cx, cy);
    ctx.transform(1, slant, 0, 1, 0, 0);
    // Texture x grows with the azimuth, which runs right to left for someone looking out: the
    // lettering is painted mirrored so it reads the right way round from the window.
    ctx.scale(-squeeze, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = type.letters;
    ctx.fillText(type.name, 0, 0);
    ctx.restore();
    if (type.neon) sheet.sign(type.name, cx, cy, size, -squeeze, `bold ${LETTER_FONT}`, type.neon, 0.85, slant);
    else if (random() < 0.5) sheet.lit(fascia, type.light, 0.35, closing);
  }

  // The roller shutter comes down over the front when the shop shuts, and stays down until it opens.
  if (!type.unshuttered) sheet.shutter(f.quad(s0 + 0.1, s1 - 0.1, 0, 3.0), closing);
  if (type.awning && random() < 0.8) paintAwning(f, type.awning, s0 + 0.1, s1 - 0.1);
  if (type.bracket) paintBracketSign(f, type.bracket, random() < 0.5 ? s0 + 0.5 : s1 - 0.5, type);
  return { closing, goods };
}

/** Shelves of goods behind the glass: loaves, books, fruit, bottles, game boxes, all as little blocks of colour. */
function paintGoods(f: FacadeFrame, random: Rng, type: ShopType, g0: number, g1: number, closing: number): GoodsRect[] {
  const goods: GoodsRect[] = [];
  if (!f.fine) return goods;
  const ctx = f.sheet.color;
  const { y: pxY } = f.pxPerMetre;
  for (const shelf of [0.95, 1.55, 2.15]) {
    f.detail(f.quad(g0 + 0.05, g1 - 0.05, shelf - 0.05, shelf), 'rgba(30,26,24,0.7)');
    let s = g0 + 0.1;
    while (s < g1 - 0.2) {
      const gw = between(random, 0.08, 0.3);
      const gh = between(random, 0.12, 0.4);
      const [x, y] = f.P(s, shelf + gh);
      const [x1] = f.P(s + gw, shelf);
      ctx.fillStyle = pick(random, type.goods);
      ctx.globalAlpha = 0.85;
      const rect = { x, y, w: Math.max(1, x1 - x), h: gh * pxY };
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      goods.push(rect);
      s += gw + between(random, 0.02, 0.12);
    }
  }
  ctx.globalAlpha = 1;
  // Lit from inside, softly: the back of the display glows and the goods stand dark against it.
  f.sheet.lit(f.quad(g0, g1, 0.6, 2.95), type.light, type.light === 'cool' ? 0.38 : 0.5, closing);
  for (const shelf of [0.95, 1.55, 2.15]) f.sheet.dim(f.quad(g0 + 0.05, g1 - 0.05, shelf - 0.05, shelf), type.light, 0.1);
  for (const g of goods) {
    const p = new Path2D();
    p.rect(g.x, g.y, g.w, g.h);
    f.sheet.dim(p, type.light, 0.2);
  }
  return goods;
}

/** A striped awning sloping out over the pavement, its scalloped valance at the front. */
function paintAwning(f: FacadeFrame, [color, stripe]: [string, string], s0: number, s1: number): void {
  const { sheet, d } = f;
  const out = 1.3;
  const top = 3.7;
  const front = 2.75;
  // Its shadow over the top of the glass.
  f.detail(f.strip(s0, s1, 2.2, 3.05), f.vertical(2.2, 3.05, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]));
  sheet.begin(d - out / 2, 0.02);
  const step = 0.45;
  let k = 0;
  for (let s = s0; s < s1 - 1e-3; s += step, k++) {
    const e = Math.min(s + step, s1);
    const p = new Path2D();
    p.moveTo(...f.P(s, top, 0));
    p.lineTo(...f.P(e, top, 0));
    p.lineTo(...f.P(e, front, out));
    p.lineTo(...f.P(s, front, out));
    p.closePath();
    const fill = k % 2 === 0 ? color : stripe;
    sheet.path(p, fill);
    // The valance: a short vertical skirt with a scalloped hem.
    const v = new Path2D();
    v.moveTo(...f.P(s, front, out));
    v.lineTo(...f.P(e, front, out));
    v.lineTo(...f.P(e, front - 0.22, out));
    v.quadraticCurveTo(...f.P((s + e) / 2, front - 0.36, out), ...f.P(s, front - 0.22, out));
    v.closePath();
    sheet.path(v, shade(fill, 0.8));
  }
  f.detail(f.strip(s0, s1, front - 0.02, front + 0.06, out), 'rgba(0,0,0,0.2)');
}

/** A sign on a bracket out from the wall: the pharmacy's green cross or the tobacconist's red diamond, lit; a walk-in shop's board in its colours. */
function paintBracketSign(f: FacadeFrame, kind: NonNullable<ShopType['bracket']>, s: number, type: ShopType): void {
  const { sheet, d } = f;
  const out = 0.7;
  const h = 4.6;
  sheet.begin(d - out, 0.05);
  sheet.path(f.quad(s - 0.03, s + 0.03, h - 0.1, h + 0.1, out / 2), '#2a2a2c');
  if (kind === 'cross') {
    const arm = 0.18;
    const len = 0.5;
    for (const shape of [f.quad(s - arm, s + arm, h - len, h + len, out), f.quad(s - len, s + len, h - arm, h + arm, out)]) {
      sheet.path(shape, '#2fa84a');
      sheet.lit(shape, 'cool', 1);
    }
  } else if (kind === 'board') {
    // An octagonal board in the shop's joinery colour, its lettering's colour inside (the street's own is painted with a picture).
    const ring = (r: number): Polygon => new Polygon(Array.from({ length: 8 }, (_, i): [number, number] => f.P(s + Math.cos((i + 0.5) * (Math.PI / 4)) * r * 0.6, h - 0.35 + Math.sin((i + 0.5) * (Math.PI / 4)) * r, out)));
    sheet.path(ring(0.36), type.front);
    sheet.path(ring(0.24), type.letters);
  } else {
    const p: [number, number][] = [f.P(s, h - 0.55, out), f.P(s + 0.28, h, out), f.P(s, h + 0.55, out), f.P(s - 0.28, h, out)];
    const diamond = new Polygon(p);
    sheet.path(diamond, '#c9302a');
    sheet.lit(diamond, 'warm', 0.9);
  }
}

/** A shop shut behind its roller shutter, ribbed and tagged. */
function paintShutter(f: FacadeFrame, random: Rng, s0: number, s1: number): void {
  const { sheet, d } = f;
  const ctx = sheet.color;
  sheet.begin(d, 0.05);
  sheet.path(f.quad(s0, s1, 0, 3.0), '#8a8c8e');
  for (let y = 0.1; y < 3; y += 0.12) f.detail(f.strip(s0, s1, y, y + 0.03), 'rgba(0,0,0,0.18)');
  f.detail(f.quad(s0, s1, 3.0, 3.6), '#5a5c5e');
  if (!f.fine) return;
  // A tag sprayed across it.
  const { y: pxY } = f.pxPerMetre;
  ctx.strokeStyle = pick(random, ['#d94f3a', '#3b6fb3', '#1c1c1e', '#e8d040', '#8c4f9e']);
  ctx.lineWidth = Math.max(1, 0.08 * pxY);
  ctx.beginPath();
  let [x, y] = f.P(between(random, s0 + 0.3, s0 + 1), between(random, 1, 1.8));
  ctx.moveTo(x, y);
  for (let i = 0; i < 7; i++) {
    const [nx, ny] = [x + between(random, 0.1, 0.5) * pxY, y + between(random, -0.5, 0.5) * pxY];
    ctx.quadraticCurveTo(x + between(random, -0.3, 0.3) * pxY, y - between(random, 0.2, 0.6) * pxY, nx, ny);
    [x, y] = [nx, ny];
  }
  ctx.stroke();
}
