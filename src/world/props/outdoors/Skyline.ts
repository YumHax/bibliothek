import { Sheet, type Rng, azimuthX, heightY, sizePx } from './Sheet';
import { shade } from './paint';
import { SKYLINE, TOWER_STYLES, type SkylineTower } from '@/world/city/skyline';
import { between } from '@/random';

type Tower = SkylineTower;

/** Floor-to-floor and column pitch of the facade grids, in metres. */
const FLOOR = 3.6;
const COLUMN = 3.2;

/**
 * The skyline (`city/SKYLINE`, which the walkable street's sky shows too), painted far to near: a
 * dense cluster of towers behind Front Street's block, a sparser and further one behind the park, a
 * few behind the room for completeness. Each tower shows a lit main face and a shaded side face, a
 * facade grid, one of a few crowns, and a scatter of windows that light up at night (mostly cool
 * office light, some warm).
 */
export function paintSkyline(sheet: Sheet, random: Rng): void {
  for (const tower of SKYLINE) paintTower(sheet, random, tower);
}

/** A tower laid out on the sheet, in pixels: its two faces, its grid pitches, how many floors it has. */
interface TowerFrame {
  t: Tower;
  style: (typeof TOWER_STYLES)[number];
  width: number;
  x0: number;
  /** The pavement line and the roof line. */
  base: number;
  top: number;
  /** The lit main face and the shaded side face. */
  mainX: number;
  mainW: number;
  sideX: number;
  sideW: number;
  floorPx: number;
  columnPx: number;
  floors: number;
}

function frameOf(t: Tower): TowerFrame {
  const { distance: d } = t;
  const width = sizePx(t.width, d);
  const x0 = azimuthX(t.azimuth) - width / 2;
  const sideW = width * 0.3;
  const mainW = width - sideW;
  return {
    t,
    style: TOWER_STYLES[t.style]!,
    width,
    x0,
    base: heightY(0, d) + 2,
    top: heightY(t.height, d),
    mainX: t.sideLeft ? x0 + sideW : x0,
    mainW,
    sideX: t.sideLeft ? x0 : x0 + mainW,
    sideW,
    floorPx: sizePx(FLOOR, d),
    columnPx: sizePx(COLUMN, d),
    floors: Math.floor(t.height / FLOOR),
  };
}

function paintTower(sheet: Sheet, random: Rng, t: Tower): void {
  const { distance: d } = t;
  const frame = frameOf(t);
  const { style, width, x0 } = frame;

  sheet.begin(d, style.glass);
  sheet.wrapped(x0 - width, x0 + width * 2, () => {
    paintFaces(sheet, frame, frame.top, frame.base, 0);
    const crownTop = paintCrown(sheet, frame);
    if (frame.floorPx < 2.2) return; // too far for any grid to read
    paintGrid(sheet, frame);
    paintLitWindows(sheet, random, frame, crownTop);
  });
  // Aviation warning lights on the tallest, red dots that burn all night at the top corners (and the mast tip).
  if (t.height > 150) {
    const y = t.crown === 'spire' ? heightY(t.height * 1.2, d) : heightY(t.crown === 'setback' ? t.height * 1.16 : t.height, d);
    const dot = Math.max(1, sizePx(1.5, d));
    const xs = t.crown === 'spire' ? [x0 + width / 2] : [x0 + width * 0.08, x0 + width * 0.92];
    for (const x of xs) {
      sheet.color.fillStyle = '#c0302a';
      sheet.color.fillRect(x - dot / 2, y - dot, dot, dot);
      sheet.litRect(x - dot / 2, y - dot, dot, dot, 'warm', 1, 0, true);
    }
  }
}

/** Both faces between y0 and y1, inset from the tower's edges: the main one lit across for volume, the side one in shade. */
function paintFaces(sheet: Sheet, { t, style, mainX, mainW, sideX, sideW }: TowerFrame, y0: number, y1: number, inset: number): void {
  const g = sheet.color.createLinearGradient(mainX + inset, 0, mainX + mainW - inset, 0);
  g.addColorStop(0, shade(style.color, t.sideLeft ? 0.92 : 1.12));
  g.addColorStop(1, shade(style.color, t.sideLeft ? 1.12 : 0.92));
  sheet.rect(mainX + inset, y0, mainW - 2 * inset, y1 - y0, g);
  sheet.rect(sideX + inset * 0.3, y0, sideW - inset * 0.6, y1 - y0, shade(style.color, 0.66));
}

/** The crown: a set-back top storey, a capped spire with its mast, a slanted roof, or nothing; where the crown's top is. */
function paintCrown(sheet: Sheet, frame: TowerFrame): number {
  const { t, style, width, x0, top } = frame;
  const d = t.distance;
  if (t.crown === 'setback') {
    const crownTop = heightY(t.height * 1.16, d);
    paintFaces(sheet, frame, crownTop, top + 1, width * 0.2);
    return crownTop;
  }
  if (t.crown === 'spire') {
    const cap = heightY(t.height * 1.05, d);
    sheet.rect(x0 + width * 0.3, cap, width * 0.4, top - cap + 1, shade(style.color, 0.85));
    const mastTop = heightY(t.height * 1.2, d);
    const mastW = Math.max(1.5, sizePx(2, d));
    sheet.rect(x0 + width / 2 - mastW / 2, mastTop, mastW, cap - mastTop + 1, shade(style.color, 0.7));
    return cap;
  }
  if (t.crown === 'slant') {
    const p = new Path2D();
    p.moveTo(x0, top + 1);
    p.lineTo(x0 + width, top + 1);
    p.lineTo(t.sideLeft ? x0 + width : x0, heightY(t.height * 1.1, d));
    p.closePath();
    sheet.path(p, shade(style.color, 0.95));
  }
  return top;
}

/** The facade grid: punched windows in a stone grid, or a curtain wall's floor bands and mullions. */
function paintGrid(sheet: Sheet, { style, width, x0, base, top, mainX, mainW, sideX, sideW, floorPx, columnPx, floors }: TowerFrame): void {
  const ctx = sheet.color;
  if (style.kind === 'stone') {
    ctx.fillStyle = 'rgba(30,40,55,0.7)';
    for (const [fx, fw] of [[mainX, mainW], [sideX, sideW]] as const) {
      const cols = Math.max(1, Math.floor(fw / columnPx));
      const pitch = fw / cols;
      for (let f = 0; f < floors; f++)
        for (let c = 0; c < cols; c++) ctx.fillRect(fx + c * pitch + pitch * 0.25, base - (f + 1) * floorPx + floorPx * 0.25, pitch * 0.5, floorPx * 0.5);
    }
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let f = 1; f < floors; f++) ctx.fillRect(x0, base - f * floorPx, width, 1);
  if (columnPx >= 2.5) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let x = mainX + columnPx; x < mainX + mainW; x += columnPx) ctx.fillRect(x, top, 0.8, base - top);
  }
}

/**
 * Windows lit at night, more of them and cooler in the offices. Homes go dark through the night as people turn in;
 * offices empty out in the evening but for the cleaners and a few floors working late, which burn on. A lit crown
 * on the towers that have one, and on some curtain walls.
 */
function paintLitWindows(sheet: Sheet, random: Rng, { t, style, width, x0, base, mainX, mainW, sideX, sideW, floorPx, columnPx, floors }: TowerFrame, crownTop: number): void {
  const litShare = style.kind === 'stone' ? 0.3 : 0.42;
  const coolShare = style.kind === 'stone' ? 0.35 : 0.7;
  for (const [fx, fw] of [[mainX, mainW], [sideX, sideW]] as const) {
    const cols = Math.max(1, Math.floor(fw / columnPx));
    const pitch = fw / cols;
    for (let f = 0; f < floors; f++)
      for (let c = 0; c < cols; c++) {
        if (random() >= litShare) continue;
        const kind = random() < coolShare ? 'cool' : 'warm';
        const curfew = kind === 'cool' ? (random() < 0.2 ? 0 : between(random, 0.45, 0.9)) : random();
        sheet.litRect(fx + c * pitch + pitch * 0.2, base - (f + 1) * floorPx + floorPx * 0.22, pitch * 0.6, floorPx * 0.55, kind, 1, curfew);
      }
  }
  if (t.crown === 'lit' || (style.kind !== 'stone' && random() < 0.3)) {
    sheet.litRect(x0, crownTop + 1, width, Math.max(1.5, floorPx * 0.8), random() < 0.5 ? 'cool' : 'warm', 0.9);
  }
}
