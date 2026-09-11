import { Polygon, Sheet, type Rng, azimuthX, heightY, sizePx } from './Sheet';
import { between, deg, integer, pick, shade } from './paint';
import { CORNER, PARK_FAR, PARK_FROM, PARK_TO, frontage, parkLine } from './plan';

/** Brick, stone, render and ochre: the mid-rise walls of a cosy old neighbourhood. */
const WALLS = ['#b8654b', '#a86a52', '#c9a583', '#d9ccb4', '#8f8a80', '#b99b6d', '#e0d5c1', '#9c6b55', '#cdb79b', '#7f7a74'];
const AWNINGS = ['#7a2f2f', '#2f4f6a', '#3f6b4f', '#b8862f', '#5a3f6a', '#333333'];
const SHOP_BASES = ['#3a3634', '#2e3a3a', '#4a3b33', '#2a2a30', '#5a3a2a'];
const CURTAINS = ['#d9cfbf', '#c9b9a4', '#e6e0d4', '#b9b3a8'];
const SHOP_GLASS = '#26313d';
const WINDOW_GLASS = '#34434f';
/** Ground floor height and floor-to-floor height, in metres. */
const GROUND = 4.2;
const FLOOR = 3.1;

export interface BuildingSpec {
  /** Azimuth range of the facade. */
  a0: number;
  a1: number;
  /** Distance of the building line along an azimuth. */
  line: (a: number) => number;
  floors: number;
}

/** Paints buildings shoulder to shoulder along `line` from azimuth `from` to `to`, `widths` metres each. */
export function paintFacadeRow(sheet: Sheet, random: Rng, from: number, to: number, line: (a: number) => number, floors: [number, number], widths: [number, number] = [9, 16]): void {
  let a = from;
  while (a < to) {
    const w = between(random, widths[0], widths[1]);
    const da = w / line(a);
    paintBuilding(sheet, random, { a0: a, a1: a + da, line, floors: integer(random, floors[0], floors[1]) });
    a += da;
  }
}

/**
 * The far backdrops: the mid-rise blocks lining the far side of the park, and taller blocks a
 * few streets behind Front Street whose upper floors peek over its roofs. Painted before the park
 * and the street.
 */
export function paintBackdrops(sheet: Sheet, random: Rng): void {
  paintFacadeRow(sheet, random, PARK_FROM, PARK_TO, (a) => parkLine(a, PARK_FAR), [7, 11], [14, 26]);
  for (let i = 0; i < 26; i++) {
    const z = between(random, 110, 260);
    const x0 = between(random, -180, 420);
    const w = between(random, 18, 40);
    paintBuilding(sheet, random, { a0: Math.atan2(x0, z), a1: Math.atan2(x0 + w, z), line: (a) => z / Math.max(Math.cos(a), 0.06), floors: integer(random, 9, 18) });
  }
}

/** Front Street's block, from the corner all the way round behind the room. */
export function paintFrontBlock(sheet: Sheet, random: Rng): void {
  paintFacadeRow(sheet, random, CORNER, deg(180), (a) => frontage(a), [5, 6]);
}

/**
 * One building: wall, a shop front or an entrance at street level, rows of windows (frames,
 * curtains, sills and the odd balcony when close enough to matter), a cornice and a roof. Far
 * buildings drop the fine details and keep the windows as dots.
 */
export function paintBuilding(sheet: Sheet, random: Rng, spec: BuildingSpec): void {
  const { a0, a1, line, floors } = spec;
  const P = (a: number, h: number): [number, number] => [azimuthX(a), heightY(h, line(a))];
  const quad = (aL: number, aR: number, hB: number, hT: number): Polygon => new Polygon([P(aL, hB), P(aR, hB), P(aR, hT), P(aL, hT)]);
  const d = line((a0 + a1) / 2);
  const w = (a1 - a0) * d;
  /** Azimuth of the point `s` metres along the facade from its left edge. */
  const at = (s: number): number => a0 + (a1 - a0) * (s / w);
  const detail = (p: Path2D, fill: string): void => {
    sheet.color.fillStyle = fill;
    sheet.color.fill(p);
  };
  const h = GROUND + (floors - 1) * FLOOR + 0.5;
  const fine = sizePx(1.3, d) > 7;
  const wall = pick(random, WALLS);
  const ctx = sheet.color;

  const paintWindow = (s0: number, s1: number, hb: number, ht: number, litShare: number): void => {
    if (fine) detail(quad(at(s0 - 0.1), at(s1 + 0.1), hb - 0.08, ht + 0.1), random() < 0.7 ? '#e6e1d8' : '#3a3a3c');
    const glass = quad(at(s0), at(s1), hb, ht);
    sheet.begin(d, 0.22);
    sheet.path(glass, WINDOW_GLASS);
    sheet.begin(d, 0.05);
    if (fine) {
      const [, yt] = P(a0, ht);
      const [, yb] = P(a0, hb);
      const g = ctx.createLinearGradient(0, yt, 0, yb);
      g.addColorStop(0, 'rgba(190,210,230,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0.15)');
      ctx.fillStyle = g;
      ctx.fill(glass);
      if (random() < 0.45) {
        const cw = (s1 - s0) * between(random, 0.25, 0.45);
        const left = random() < 0.5;
        detail(quad(at(left ? s0 : s1 - cw), at(left ? s0 + cw : s1), hb + 0.05, ht - 0.05), pick(random, CURTAINS));
      }
      detail(quad(at(s0 - 0.15), at(s1 + 0.15), hb - 0.16, hb - 0.04), shade(wall, 1.3));
    }
    // Homes: bedtimes spread evenly through the night, so about as many stay up as the city is awake.
    if (random() < litShare) sheet.lit(glass, random() < 0.12 ? 'cool' : 'warm', 1, random());
  };

  sheet.begin(d, 0.05);
  sheet.wrapped(P(a0, 0)[0], P(a1, 0)[0], () => {
    // The wall, in the street's shade towards the bottom.
    const body = quad(a0, a1, 0, h);
    sheet.path(body, wall);
    const [, yTop] = P(a0, h);
    const [, yBot] = P(a0, 0);
    const g = ctx.createLinearGradient(0, yBot, 0, yTop);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(255,255,255,0.04)');
    ctx.fillStyle = g;
    ctx.fill(body);

    // Street level: a shop front or a residential entrance.
    const cols = Math.max(1, Math.floor(w / 2.7));
    const pitch = w / cols;
    const winW = Math.min(1.35, pitch * 0.55);
    if (fine && random() < 0.6) {
      sheet.path(quad(a0, a1, 0, GROUND - 0.6), pick(random, SHOP_BASES));
      const units = Math.max(1, Math.floor(w / 4.2));
      const unit = w / units;
      const doorAt = integer(random, 0, units - 1);
      const lit = random() < 0.8;
      // Shops shut around eleven; one in six is a bar or a late shop that keeps going till one or two.
      const closing = random() < 0.16 ? between(random, 0.15, 0.3) : between(random, 0.55, 0.85);
      for (let i = 0; i < units; i++) {
        let s0 = i * unit + 0.35;
        const s1 = (i + 1) * unit - 0.35;
        if (i === doorAt) {
          detail(quad(at(s0), at(s0 + 1.1), 0.1, 2.7), '#1a1a1e');
          s0 += 1.35;
        }
        const glass = quad(at(s0), at(s1), 0.6, 2.9);
        sheet.begin(d, 0.3);
        sheet.path(glass, SHOP_GLASS);
        sheet.begin(d, 0.05);
        const gg = ctx.createLinearGradient(0, P(a0, 2.9)[1], 0, P(a0, 0.6)[1]);
        gg.addColorStop(0, 'rgba(200,215,230,0.3)');
        gg.addColorStop(1, 'rgba(0,0,0,0.1)');
        ctx.fillStyle = gg;
        ctx.fill(glass);
        if (lit) sheet.lit(glass, 'warm', 1, closing);
        if (random() < 0.55) {
          const awning = pick(random, AWNINGS);
          detail(quad(at(i * unit + 0.15), at((i + 1) * unit - 0.15), 2.95, 3.5), awning);
          detail(quad(at(i * unit + 0.15), at((i + 1) * unit - 0.15), 2.95, 3.08), shade(awning, 0.6));
          detail(quad(at(s0), at(s1), 2.55, 2.95), 'rgba(0,0,0,0.25)');
        }
      }
      // The fascia board between the shops and the first floor, sometimes lit as a sign.
      const fascia = quad(at(0.2), at(w - 0.2), GROUND - 0.55, GROUND - 0.1);
      detail(fascia, shade(pick(random, SHOP_BASES), 1.4));
      // The sign goes out with the shop, unless it is one of the few left burning all night.
      if (random() < 0.4) sheet.lit(fascia, random() < 0.5 ? 'cool' : 'warm', 0.45, random() < 0.25 ? 0 : closing);
    } else {
      sheet.path(quad(a0, a1, 0, GROUND - 0.5), shade(wall, 0.82));
      detail(quad(at(w / 2 - 0.7), at(w / 2 + 0.7), 0.1, 2.8), '#2c2622');
      for (let c = 0; c < cols; c++) {
        const s0 = c * pitch + (pitch - winW) / 2;
        if (Math.abs(s0 + winW / 2 - w / 2) < 1.4) continue; // the door is there
        paintWindow(s0, s0 + winW, 1.1, 3.0, 0.3);
      }
    }

    // Upper floors.
    for (let f = 1; f < floors; f++) {
      const hb = GROUND + (f - 1) * FLOOR + 0.55;
      const ht = hb + 1.95;
      for (let c = 0; c < cols; c++) {
        const s0 = c * pitch + (pitch - winW) / 2;
        paintWindow(s0, s0 + winW, hb, ht, 0.34);
      }
      if (fine && random() < 0.22) {
        detail(quad(at(0.3), at(w - 0.3), hb - 0.3, hb - 0.12), 'rgba(25,25,28,0.6)');
        detail(quad(at(0.3), at(w - 0.3), hb - 0.12, hb + 0.9), 'rgba(30,30,34,0.3)');
        for (let s = 0.3; s < w - 0.3; s += 0.5) detail(quad(at(s), at(s + 0.06), hb - 0.1, hb + 0.9), 'rgba(30,30,34,0.7)');
      }
      if (fine && random() < 0.5) detail(quad(a0, a1, hb - 0.55, hb - 0.42), 'rgba(255,255,255,0.12)');
    }
    if (fine && random() < 0.6) detail(quad(at(0.25), at(0.37), 0, h), shade(wall, 0.45));
    // Party wall: a shadow line along the left edge.
    detail(quad(a0, at(Math.min(0.15, w * 0.02)), 0, h + 0.6), 'rgba(0,0,0,0.35)');

    // Cornice and roof.
    sheet.path(quad(a0 - 0.15 / d, a1 + 0.15 / d, h, h + 0.55), shade(wall, 1.25));
    detail(quad(a0, a1, h - 0.35, h), 'rgba(0,0,0,0.3)');
    const base = h + 0.55;
    const roof = pick(random, ['mansard', 'flat', 'flat', 'pitched'] as const);
    if (roof === 'mansard' || roof === 'pitched') {
      const top = base + (roof === 'mansard' ? 3.2 : 2.6);
      const inset = Math.min(roof === 'mansard' ? 1.4 : 1.0, w * 0.12);
      const p = new Path2D();
      const [x0, y0] = P(a0, base);
      const [x1, y1] = P(a1, base);
      const [x2, y2] = P(at(w - inset), top);
      const [x3, y3] = P(at(inset), top);
      p.moveTo(x0, y0);
      p.lineTo(x1, y1);
      p.lineTo(x2, y2);
      p.lineTo(x3, y3);
      p.closePath();
      sheet.begin(d, roof === 'mansard' ? 0.15 : 0.05);
      sheet.path(p, roof === 'mansard' ? '#4a4f58' : '#9a5a3d');
      detail(quad(at(inset), at(w - inset), top - 0.18, top), roof === 'mansard' ? '#6b717c' : '#b9755a');
      if (fine && roof === 'mansard') {
        for (let c = 0; c < cols; c++) {
          const s0 = c * pitch + (pitch - winW * 0.7) / 2;
          detail(quad(at(s0 - 0.1), at(s0 + winW * 0.7 + 0.1), base + 0.7, base + 2.0), '#d8d3c8');
          const pane = quad(at(s0), at(s0 + winW * 0.7), base + 0.8, base + 1.9);
          detail(pane, WINDOW_GLASS);
          if (random() < 0.3) sheet.lit(pane, 'warm', 1, random());
        }
      }
      sheet.begin(d, 0.05);
      if (roof === 'pitched') sheet.path(quad(at(w * 0.7), at(w * 0.7 + 0.8), top - 0.5, top + 1.2), shade(wall, 0.7));
    } else {
      sheet.path(quad(a0, a1, base, base + 0.7), shade(wall, 0.9));
      for (let i = integer(random, 1, 3); i > 0; i--) {
        const s = between(random, 1, Math.max(1.5, w - 1.7));
        sheet.path(quad(at(s), at(s + 0.7), base, base + between(random, 1.2, 2)), shade(wall, 0.7));
      }
      if (fine && random() < 0.18) {
        const s = between(random, 1, Math.max(2, w - 3.5));
        sheet.path(quad(at(s + 0.3), at(s + 0.5), base, base + 1.6), '#2a2724');
        sheet.path(quad(at(s + 1.9), at(s + 2.1), base, base + 1.6), '#2a2724');
        sheet.path(quad(at(s), at(s + 2.4), base + 1.6, base + 4.0), '#5a4a3c');
        const cone = new Path2D();
        const [cx0, cy0] = P(at(s), base + 4.0);
        const [cx1, cy1] = P(at(s + 2.4), base + 4.0);
        const [cx2, cy2] = P(at(s + 1.2), base + 5.0);
        cone.moveTo(cx0, cy0);
        cone.lineTo(cx1, cy1);
        cone.lineTo(cx2, cy2);
        cone.closePath();
        sheet.path(cone, '#4a3c30');
      }
      if (fine && random() < 0.3) {
        const s = between(random, 0.5, Math.max(1, w - 0.5));
        sheet.path(quad(at(s), at(s + 0.08), base, base + 3), '#2a2a2c');
      }
    }
  });
}
