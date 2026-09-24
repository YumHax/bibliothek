import { Polygon, type Rng } from './Sheet';
import { between, integer, pick, shade } from './paint';
import { FacadeFrame } from './FacadeFrame';

/** What a shop puts out on the pavement in front of it. */
export type ShopDisplay = 'terrace' | 'crates' | 'buckets' | 'board' | 'none';

/** A shop on Front Street, as `paintStreet` needs it: the azimuth range of its front and what stands outside. */
export interface Storefront {
  a0: number;
  a1: number;
  display: ShopDisplay;
  /** The retro games shop: nothing may stand in front of it. */
  landmark: boolean;
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
  /** A lit sign on a bracket: the pharmacy's cross, the tobacconist's diamond. */
  bracket?: 'cross' | 'diamond';
}

const SHOPS: readonly ShopType[] = [
  { name: 'CAFÉ', front: '#2f4a3a', fascia: '#2f4a3a', letters: '#e9dcb5', awning: ['#2f5a44', '#efe6d2'], goods: ['#6a4a32', '#d9c9a8', '#3a2a22'], light: 'warm', late: false, display: 'terrace' },
  { name: 'BOULANGERIE', front: '#6b4a2a', fascia: '#5a3a22', letters: '#f1d890', awning: ['#b8862f', '#f3ead6'], goods: ['#d9a05a', '#b8763a', '#e8c890', '#8a5a2a'], light: 'warm', late: false, display: 'board' },
  { name: 'PHARMACIE', front: '#d8d8d2', fascia: '#2f7a4a', letters: '#f4f4ee', awning: null, goods: ['#f0f0f0', '#6fb0d0', '#e0e8e0', '#8fc0a0'], light: 'cool', late: false, display: 'none', bracket: 'cross' },
  { name: 'LIBRAIRIE', front: '#2a3550', fascia: '#2a3550', letters: '#e0c878', awning: ['#2f4f6a', '#e8e0cc'], goods: ['#8a2a2a', '#2f4f6a', '#d9c9a0', '#3f6b4f', '#b8862f', '#e8e2d2'], light: 'warm', late: false, display: 'board' },
  { name: 'PRIMEUR', front: '#3f5a2a', fascia: '#3f5a2a', letters: '#f0e8c8', awning: ['#3f6b4f', '#f0ead8'], goods: ['#d9383a', '#f09a3a', '#6fa35e', '#e8d040'], light: 'warm', late: false, display: 'crates' },
  { name: 'FLEURS', front: '#4a3a5a', fascia: '#e8e0d4', letters: '#5a3f6a', awning: ['#5a3f6a', '#e8e0d4'], goods: ['#e0567a', '#f0f0e8', '#b04ac0', '#4d7a3a', '#f09a3a'], light: 'warm', late: false, display: 'buckets' },
  { name: 'TABAC', front: '#3a3634', fascia: '#8a2a2a', letters: '#f0e8d8', awning: null, goods: ['#c9c9c9', '#d94f3a', '#3b6fb3'], light: 'warm', late: true, display: 'none', neon: 'warm', bracket: 'diamond' },
  { name: 'BAR', front: '#241c1a', fascia: '#241c1a', letters: '#f0c060', awning: ['#7a2f2f', '#2a2020'], goods: ['#c9a050', '#6a8a5a', '#a03a2a', '#3a2a22'], light: 'warm', late: true, display: 'terrace', neon: 'warm' },
  { name: 'BOUCHERIE', front: '#7a2a2a', fascia: '#7a2a2a', letters: '#f0e8d8', awning: ['#8a2a2a', '#f0ead8'], goods: ['#c9544a', '#e8d8c8', '#a83a30'], light: 'cool', late: false, display: 'none' },
  { name: 'LAVERIE', front: '#3a6a8a', fascia: '#f0f0ea', letters: '#3a6a8a', awning: null, goods: ['#e8e8e8', '#c9c9c9', '#3a6a8a'], light: 'cool', late: true, display: 'none' },
];
/** The shop across the street the collector surely haunts. */
export const RETRO_GAMES: ShopType = {
  name: 'RÉTRO JEUX',
  front: '#1c1a2a',
  fascia: '#2a1f4a',
  letters: '#8fe6ff',
  awning: null,
  goods: ['#d94f3a', '#3b6fb3', '#f0c94a', '#e8e8e8', '#6fa35e', '#8c4f9e'],
  light: 'cool',
  late: false,
  display: 'board',
  neon: 'cool',
};
const LETTER_FONT = 'Georgia, "Times New Roman", serif';
const GLASS = '#26313d';

/**
 * The ground floor of a building given over to shops: one shop across the whole front or two or
 * three side by side, each with its joinery, a fascia with its name, display windows full of
 * goods and a door, often an awning, sometimes a lit sign on a bracket; or a shop that has shut
 * for good behind a tagged roller shutter. At night the windows light until closing time and the
 * neon names burn on. Returns what each shop puts out on the pavement.
 */
export function paintShopfronts(f: FacadeFrame, random: Rng, wall: string, landmark?: ShopType): Storefront[] {
  const { sheet, w } = f;
  const units = Math.max(1, Math.floor(w / 4.2));
  const shopCount = landmark ? 1 : Math.min(units, random() < 0.5 ? 1 : integer(random, 2, 3));
  const out: Storefront[] = [];
  sheet.path(f.strip(0, w, -1.5, 4.2 - 0.55), shade(wall, 0.9));
  for (let i = 0; i < shopCount; i++) {
    const s0 = (w * i) / shopCount;
    const s1 = (w * (i + 1)) / shopCount;
    if (!landmark && random() < 0.08) {
      paintShutter(f, random, s0 + 0.2, s1 - 0.2);
      continue;
    }
    const type = landmark ?? pick(random, SHOPS);
    paintShop(f, random, type, s0, s1, Math.max(1, Math.round((units * (s1 - s0)) / w)));
    out.push({ a0: f.at(s0), a1: f.at(s1), display: type.display, landmark: type === landmark });
  }
  return out;
}

function paintShop(f: FacadeFrame, random: Rng, type: ShopType, s0: number, s1: number, units: number): void {
  const { sheet, d } = f;
  const ctx = sheet.color;
  // Shops shut around eleven (the late ones at one or two): see `wakefulnessAt`.
  const closing = type.late ? between(random, 0.15, 0.3) : between(random, 0.55, 0.85);
  sheet.path(f.quad(s0 + 0.1, s1 - 0.1, 0, 3.6), type.front);
  f.detail(f.quad(s0 + 0.1, s1 - 0.1, 0, 0.55), shade(type.front, 0.7));
  const unit = (s1 - s0) / units;
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
      sheet.lit(door, type.light, 0.8, closing);
      g0 += 1.3;
    }
    if (g1 - g0 < 0.4) continue;
    const glass = f.quad(g0, g1, 0.6, 2.95);
    sheet.begin(d, 0.28);
    sheet.path(glass, GLASS);
    sheet.begin(d, 0.05);
    paintGoods(f, random, type, g0, g1, closing);
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
    ctx.translate(cx, cy);
    // Texture x grows with the azimuth, which runs right to left for someone looking out: the
    // lettering is painted mirrored so it reads the right way round from the window.
    ctx.scale(-squeeze, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = type.letters;
    ctx.fillText(type.name, 0, 0);
    ctx.restore();
    if (type.neon) sheet.sign(type.name, cx, cy, size, -squeeze, `bold ${LETTER_FONT}`, type.neon, 0.85);
    else if (random() < 0.5) sheet.lit(fascia, type.light, 0.35, closing);
  }

  if (type.awning && random() < 0.8) paintAwning(f, type.awning, s0 + 0.1, s1 - 0.1);
  if (type.bracket) paintBracketSign(f, type.bracket, random() < 0.5 ? s0 + 0.5 : s1 - 0.5);
}

/** Shelves of goods behind the glass: loaves, books, fruit, bottles, game boxes, all as little blocks of colour. */
function paintGoods(f: FacadeFrame, random: Rng, type: ShopType, g0: number, g1: number, closing: number): void {
  if (!f.fine) return;
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
      ctx.fillRect(x, y, Math.max(1, x1 - x), gh * pxY);
      s += gw + between(random, 0.02, 0.12);
    }
  }
  ctx.globalAlpha = 1;
  // Lit from inside: the glass bright, the goods in front of the light dimmer.
  f.sheet.lit(f.quad(g0, g1, 0.6, 2.95), type.light, 1, closing);
  for (const shelf of [0.95, 1.55, 2.15]) f.sheet.lit(f.quad(g0 + 0.1, g1 - 0.1, shelf - 0.05, shelf + 0.3), type.light, 0.5, closing);
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

/** A lit sign on a bracket out from the wall: the pharmacy's green cross or the tobacconist's red diamond. */
function paintBracketSign(f: FacadeFrame, kind: 'cross' | 'diamond', s: number): void {
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
