import { Sheet, type Rng, azimuthX, heightY, sizePx } from './Sheet';
import { between, deg, pick, shade } from './paint';

interface TowerStyle {
  color: string;
  /** How much of the facade is sky reflection (curtain-wall glass mirrors it, stone hardly). */
  glass: number;
  kind: 'glass' | 'stone' | 'dark';
}

/**
 * Tower claddings. Curtain walls mirror the sky only in part: tinted glass keeps its own colour, and
 * a tower mirroring it fully would melt into the sky behind it, leaving its grid floating.
 */
const STYLES: readonly TowerStyle[] = [
  { color: '#4f6f8c', glass: 0.3, kind: 'glass' },
  { color: '#3f5c78', glass: 0.34, kind: 'glass' },
  { color: '#6a8298', glass: 0.26, kind: 'glass' },
  { color: '#a9a297', glass: 0.06, kind: 'stone' },
  { color: '#8e9198', glass: 0.08, kind: 'stone' },
  { color: '#b7ab99', glass: 0.06, kind: 'stone' },
  { color: '#3d4753', glass: 0.2, kind: 'dark' },
  { color: '#2f3844', glass: 0.24, kind: 'dark' },
];

type Crown = 'flat' | 'setback' | 'spire' | 'slant' | 'lit';
const CROWNS: readonly Crown[] = ['flat', 'flat', 'setback', 'setback', 'spire', 'slant', 'lit'];

interface Tower {
  azimuth: number;
  distance: number;
  /** Footprint width and roof height, in metres. */
  width: number;
  height: number;
  style: TowerStyle;
  crown: Crown;
  /** Which side the second, shaded face shows on. */
  sideLeft: boolean;
}

/** Floor-to-floor and column pitch of the facade grids, in metres. */
const FLOOR = 3.6;
const COLUMN = 3.2;

/**
 * The skyline: a dense cluster of towers behind Front Street's block, a sparser and further one
 * behind the park, a few behind the room for completeness, painted far to near. Each tower shows a
 * lit main face and a shaded side face, a facade grid, one of a few crowns, and a scatter of
 * windows that light up at night (mostly cool office light, some warm).
 */
export function paintSkyline(sheet: Sheet, random: Rng): void {
  const towers: Tower[] = [];
  const cluster = (from: number, to: number, count: number, near: number, far: number, minH: number, maxH: number): void => {
    for (let i = 0; i < count; i++) {
      towers.push({
        azimuth: between(random, from, to),
        distance: between(random, near, far),
        width: between(random, 24, 56),
        height: between(random, minH, maxH),
        style: pick(random, STYLES),
        crown: pick(random, CROWNS),
        sideLeft: random() < 0.5,
      });
    }
  };
  cluster(deg(-32), deg(100), 24, 340, 800, 75, 230);
  cluster(deg(100), deg(200), 8, 400, 800, 75, 180);
  cluster(deg(-160), deg(-32), 10, 520, 950, 70, 200);
  // Two landmarks: a spire ahead and a stepped tower behind the park.
  towers.push({ azimuth: deg(25), distance: 620, width: 48, height: 290, style: STYLES[1], crown: 'spire', sideLeft: false });
  towers.push({ azimuth: deg(-95), distance: 700, width: 40, height: 240, style: STYLES[0], crown: 'setback', sideLeft: true });
  towers.sort((p, q) => q.distance - p.distance);
  for (const tower of towers) paintTower(sheet, random, tower);
}

function paintTower(sheet: Sheet, random: Rng, t: Tower): void {
  const { distance: d, style } = t;
  const width = sizePx(t.width, d);
  const x0 = azimuthX(t.azimuth) - width / 2;
  const base = heightY(0, d) + 2;
  const top = heightY(t.height, d);
  const sideW = width * 0.3;
  const mainW = width - sideW;
  const mainX = t.sideLeft ? x0 + sideW : x0;
  const sideX = t.sideLeft ? x0 : x0 + mainW;
  const floorPx = sizePx(FLOOR, d);
  const columnPx = sizePx(COLUMN, d);
  const ctx = sheet.color;

  sheet.begin(d, style.glass);
  sheet.wrapped(x0 - width, x0 + width * 2, () => {
    // Both faces between y0 and y1, the main one lit across for volume, the side one in shade.
    const faces = (y0: number, y1: number, inset: number): void => {
      const g = ctx.createLinearGradient(mainX + inset, 0, mainX + mainW - inset, 0);
      g.addColorStop(0, shade(style.color, t.sideLeft ? 0.92 : 1.12));
      g.addColorStop(1, shade(style.color, t.sideLeft ? 1.12 : 0.92));
      sheet.rect(mainX + inset, y0, mainW - 2 * inset, y1 - y0, g);
      sheet.rect(sideX + inset * 0.3, y0, sideW - inset * 0.6, y1 - y0, shade(style.color, 0.66));
    };
    faces(top, base, 0);

    let crownTop = top;
    if (t.crown === 'setback') {
      crownTop = heightY(t.height * 1.16, d);
      faces(crownTop, top + 1, width * 0.2);
    } else if (t.crown === 'spire') {
      const cap = heightY(t.height * 1.05, d);
      sheet.rect(x0 + width * 0.3, cap, width * 0.4, top - cap + 1, shade(style.color, 0.85));
      const mastTop = heightY(t.height * 1.2, d);
      const mastW = Math.max(1.5, sizePx(2, d));
      sheet.rect(x0 + width / 2 - mastW / 2, mastTop, mastW, cap - mastTop + 1, shade(style.color, 0.7));
      crownTop = cap;
    } else if (t.crown === 'slant') {
      const p = new Path2D();
      p.moveTo(x0, top + 1);
      p.lineTo(x0 + width, top + 1);
      p.lineTo(t.sideLeft ? x0 + width : x0, heightY(t.height * 1.1, d));
      p.closePath();
      sheet.path(p, shade(style.color, 0.95));
    }

    if (floorPx < 2.2) return; // too far for any grid to read

    const floors = Math.floor(t.height / FLOOR);
    if (style.kind === 'stone') {
      // Punched windows in a stone grid.
      ctx.fillStyle = 'rgba(30,40,55,0.7)';
      for (const [fx, fw] of [[mainX, mainW], [sideX, sideW]] as const) {
        const cols = Math.max(1, Math.floor(fw / columnPx));
        const pitch = fw / cols;
        for (let f = 0; f < floors; f++)
          for (let c = 0; c < cols; c++) ctx.fillRect(fx + c * pitch + pitch * 0.25, base - (f + 1) * floorPx + floorPx * 0.25, pitch * 0.5, floorPx * 0.5);
      }
    } else {
      // Curtain wall: floor bands and mullions.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let f = 1; f < floors; f++) ctx.fillRect(x0, base - f * floorPx, width, 1);
      if (columnPx >= 2.5) {
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        for (let x = mainX + columnPx; x < mainX + mainW; x += columnPx) ctx.fillRect(x, top, 0.8, base - top);
      }
    }

    // Windows lit at night, more of them and cooler in the offices. Homes go dark through the
    // night as people turn in; offices empty out in the evening but for the cleaners and a few
    // floors working late, which burn on.
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
