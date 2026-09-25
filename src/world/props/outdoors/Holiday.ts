import { seededRandom } from '@/covers/generated/canvasUtils';
import { Polygon, Sheet, type Rng, sizePx, worldPoint } from './Sheet';
import { between, pick } from './paint';
import { FRONTAGE, NEAR_KERB } from './plan';
import { CONIFER_STYLE, paintTree } from './Tree';
import { currentHoliday } from './season';

/**
 * What the neighbourhood puts up for the holidays (`currentHoliday()`): strings of lights slung
 * across both streets from our own front to the facades opposite, bulbs wound round the street
 * trees, a tall lit fir in the park at Christmas; orange and violet strings and carved pumpkins on
 * the sills at Halloween. Everything here is painted in its place in the far-to-near order of the
 * street or the park it belongs to (see `holidayStreetItems`, `holidayParkItems`); the bulbs are
 * fairy lights (`Sheet.fairy`), twinkling at night in their own colours.
 */

/** Bulb colours of the strings, per holiday. */
const BULBS = {
  christmas: ['#ff3a2a', '#ffd23a', '#3aff6a', '#4a8aff', '#fff4e0'],
  halloween: ['#ff8a1a', '#b04aff', '#ff8a1a', '#ffb03a'],
} as const;
/** Our own front on Front Street and on Park Street, where the strings are made fast (metres from the eye). */
const OUR_FRONT = NEAR_KERB - 0.8;
/** Height of the strings where they are fixed, how far they sag mid-street, and the spacing of their bulbs. */
const STRING_HEIGHT = 6.5;
const STRING_SAG = 1.1;
const BULB_SPACING = 0.45;
/** Where the strings cross each street: x along Front Street, z along Park Street. */
const FRONT_STRINGS = [9, 20, 31, 42, 53];
const PARK_STRINGS = [-9, -20, -31, -42];
/** Length of the pieces a string is cut into for the far-to-near order. */
const PIECE = 3;
/** The park's lit fir, near the gate, and its size. */
const PARK_FIR = { x: -46, z: -2, height: 13, radius: 4.2 };
/** Share of the lit windows' sills that carry a pumpkin at Halloween. */
const PUMPKIN_SHARE = 0.2;

type Item = [x: number, z: number, draw: () => void];

/**
 * The decorations draw from their own sequence, never the painters' shared one: dressing the view for
 * a holiday must not change a single building of it. Restarted by \`beginHoliday()\` before each paint.
 */
let random: Rng = seededRandom(2412);

/** Restarts the decorations' random sequence (called by \`paintView\` before it paints). */
export function beginHoliday(): void {
  random = seededRandom(2412);
}

/** Whether this lit window gets a pumpkin on its sill at Halloween (draws from the decorations' own sequence). */
export function wantsPumpkin(): boolean {
  return random() < PUMPKIN_SHARE;
}

/** A number in [min, max) from the decorations' own sequence. */
export function holidayBetween(min: number, max: number): number {
  return between(random, min, max);
}

/** The strings across both streets, cut into pieces, for the street painter to sort in with the rest. */
export function holidayStreetItems(sheet: Sheet): Item[] {
  const holiday = currentHoliday();
  if (!holiday) return [];
  const colors = BULBS[holiday];
  const items: Item[] = [];
  for (const x of FRONT_STRINGS) items.push(...stringItems(sheet, colors, [x, OUR_FRONT], [x + between(random, -1.5, 1.5), FRONTAGE - 0.3]));
  for (const z of PARK_STRINGS) items.push(...stringItems(sheet, colors, [-OUR_FRONT, z], [-(FRONTAGE - 0.3), z + between(random, -1.5, 1.5)]));
  return items;
}

/** The park's lit fir at Christmas, for the park painter's far-to-near list. */
export function holidayParkItems(sheet: Sheet): Item[] {
  if (currentHoliday() !== 'christmas') return [];
  const { x, z, height, radius } = PARK_FIR;
  return [[x, z, () => paintChristmasTree(sheet, x, z, height, radius)]];
}

/** Bulbs scattered over a tree's crown (a street tree dressed for Christmas); `top` and `bottom` in metres above the street. */
export function paintTreeLights(sheet: Sheet, x: number, z: number, radius: number, bottom: number, top: number): void {
  if (currentHoliday() !== 'christmas') return;
  const d = Math.hypot(x, z);
  const colors = ['#fff0c8', '#ffe0a0', '#fff8e8'];
  const count = Math.round(radius * (top - bottom) * 3);
  sheet.begin(d - radius * 0.5);
  for (let i = 0; i < count; i++) {
    const h = between(random, bottom, top);
    // Round the crown: wider in the middle.
    const k = (h - bottom) / (top - bottom);
    const spread = radius * Math.sin(Math.PI * Math.min(0.95, Math.max(0.1, k)));
    const off = between(random, -spread, spread);
    // Across the line of sight, so the bulbs spread over the crown as seen.
    const bx = x + (z / d) * off;
    const bz = z - (x / d) * off;
    bulb(sheet, pick(random, colors), bx, bz, h, d, 0.9);
  }
}

/** The pumpkin on a sill at `P` (texture point of the sill's middle), `size` texels across: a candle glows in it. */
export function paintPumpkin(sheet: Sheet, x: number, y: number, size: number): void {
  const w = Math.max(1.5, size);
  const h = Math.max(1, w * 0.8);
  const body = new Polygon([
    [x - w / 2, y - h * 0.4],
    [x - w * 0.3, y - h],
    [x + w * 0.3, y - h],
    [x + w / 2, y - h * 0.4],
    [x + w * 0.3, y],
    [x - w * 0.3, y],
  ]);
  sheet.color.fillStyle = '#e8741a';
  sheet.color.fill(body);
  sheet.color.fillStyle = '#3a6a2a';
  sheet.color.fillRect(x - 0.3, y - h - Math.max(0.6, h * 0.25), Math.max(0.6, w * 0.12), Math.max(0.6, h * 0.25));
  sheet.fairy(body, 0.75);
}

/** One string of bulbs from `a` to `b` (metres on the ground plan), sagging between them, as pieces. */
function stringItems(sheet: Sheet, colors: readonly string[], a: [number, number], b: [number, number]): Item[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const pieces = Math.max(1, Math.ceil(length / PIECE));
  const offset = Math.floor(random() * colors.length);
  const items: Item[] = [];
  for (let p = 0; p < pieces; p++) {
    const t0 = p / pieces;
    const t1 = (p + 1) / pieces;
    const tm = (t0 + t1) / 2;
    items.push([a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm, () => paintStringPiece(sheet, colors, a, b, t0, t1, length, offset)]);
  }
  return items;
}

/** The piece of a string between `t0` and `t1` along it: the wire, then its bulbs. */
function paintStringPiece(sheet: Sheet, colors: readonly string[], a: [number, number], b: [number, number], t0: number, t1: number, length: number, offset: number): void {
  const at = (t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, STRING_HEIGHT - STRING_SAG * 4 * t * (1 - t)];
  const ctx = sheet.color;
  ctx.save();
  ctx.strokeStyle = 'rgba(30,30,32,0.55)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const [x, z, h] = at(t0 + ((t1 - t0) * i) / steps);
    const [px, py] = worldPoint(x, z, h);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
  const first = Math.ceil((t0 * length) / BULB_SPACING);
  const last = Math.floor((t1 * length) / BULB_SPACING - 1e-6);
  for (let i = first; i <= last; i++) {
    const [x, z, h] = at((i * BULB_SPACING) / length);
    bulb(sheet, colors[(i + offset) % colors.length], x, z, h - 0.08, Math.hypot(x, z), 1);
  }
}

/** One bulb at (x, z), `h` up, seen `d` away: a dot of its colour that lights up at night. */
function bulb(sheet: Sheet, color: string, x: number, z: number, h: number, d: number, strength: number): void {
  const [px, py] = worldPoint(x, z, h);
  const r = Math.max(0.5, sizePx(0.07, d));
  // Round when near enough to tell: an octagon (convex, as \`fairy\` needs).
  const k = r * 0.41;
  const shape = new Polygon([[px - k, py - r], [px + k, py - r], [px + r, py - k], [px + r, py + k], [px + k, py + r], [px - k, py + r], [px - r, py + k], [px - r, py - k]]);
  sheet.begin(d);
  sheet.path(shape, color);
  sheet.fairy(shape, strength);
}

/** The park's fir, dressed: the tree, garlands of bulbs spiralling round it, a star on top. */
function paintChristmasTree(sheet: Sheet, x: number, z: number, height: number, radius: number): void {
  paintTree(sheet, random, { x, z, height, radius, style: CONIFER_STYLE, form: 'conifer' });
  const d = Math.hypot(x, z);
  const colors = BULBS.christmas;
  // Spiral garlands, only the front half of each turn shows.
  const turns = 5;
  const n = 320;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const h = height * 0.08 + t * height * 0.85;
    const r = radius * 0.95 * (1 - t) * (1 - (h / height) * 0.1);
    const angle = t * turns * Math.PI * 2;
    if (Math.cos(angle) < -0.2) continue;
    const off = Math.sin(angle) * r;
    const bx = x + (z / d) * off - (x / d) * Math.cos(angle) * r * 0.3;
    const bz = z - (x / d) * off - (z / d) * Math.cos(angle) * r * 0.3;
    bulb(sheet, colors[i % colors.length], bx, bz, h, d - radius * 0.4, 1);
  }
  // The star.
  const [sx, sy] = worldPoint(x, z, height + 0.4);
  const s = Math.max(1.5, sizePx(0.7, d));
  const star = new Polygon([[sx, sy - s], [sx + s * 0.3, sy - s * 0.3], [sx + s, sy], [sx + s * 0.3, sy + s * 0.3], [sx, sy + s], [sx - s * 0.3, sy + s * 0.3], [sx - s, sy], [sx - s * 0.3, sy - s * 0.3]]);
  sheet.begin(d - radius);
  sheet.path(star, '#ffe070');
  sheet.fairy(star, 1);
}
