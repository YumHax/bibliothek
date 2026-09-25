import { Polygon, Sheet, type Rng, azimuthOf, azimuthX, groundSquash, heightY, sizePx, worldPoint } from './Sheet';
import { between, mixHex, pick } from './paint';
import { CORNER, PARK_EDGE, PARK_FAR, PARK_FROM, PARK_TO, frontage, parkLine } from './plan';
import { paintGroundBand } from './Street';
import { paintBench, paintBin, paintLamp } from './StreetFurniture';
import { CONIFER_STYLE, TREE_STYLES, type TreeForm, WILLOW_STYLE, paintTree } from './Tree';
import { seasonalLawn } from './season';
import { holidayParkItems } from './Holiday';
import { groundEllipse, paintDucks, paintFlowerBed, paintFountain, paintLilyPads, paintPicnic, paintPlayground, paintRowingBoat } from './ParkFeatures';

const LAWN_NEAR = '#5f8c45';
const LAWN_FAR = '#95b57a';
const PATH = '#c8bda3';
const PATH_EDGE = '#a89c80';
const HEDGE = '#35652f';
const HEDGE_TOP = '#6d9e4a';
const HEDGE_FOOT = '#1c3a1c';
const WATER = '#7b9bb6';
const WATER_DEEP = '#56788f';
const SAND = '#c9bda0';

/** The pond: an ellipse on the lawn, metres from the eye. */
const POND = { x: -115, z: -25, rx: 40, rz: 26 };
/** The fountain in the middle of the pond (`Life` animates its plume). */
export const FOUNTAIN = { x: POND.x, z: POND.z };
/** Gravel paths across the lawn, as polylines from the park gates (the walkers of `Life` follow them). */
export const PATHS: [number, number][][] = [
  [[-PARK_EDGE, -10], [-70, -30], [-110, -72], [-160, -62], [-210, -20], [-PARK_FAR, 0]],
  [[-PARK_EDGE, 30], [-60, 45], [-85, 40], [-120, 15], [-150, 40], [-200, 80], [-PARK_FAR, 90]],
  [[-PARK_EDGE, -60], [-55, -90], [-90, -130], [-140, -170], [-200, -200]],
];
const KIOSK = { x: -88, z: 54, width: 6 };
const PLAYGROUND = { x: -55, z: -48, radius: 13 };
/** Round flower beds: centre and radius, metres. */
const BEDS: [number, number, number][] = [[-37, 10, 3], [-41, -37, 2.5], [-63, 17, 3.5], [-48, 63, 3], [-90, 12, 2.5], [-33, 46, 2]];
/** Weeping willows leaning over the pond's banks. */
const WILLOWS: [number, number][] = [[-74, -36], [-121, 5], [-150, -38]];

function insidePond(x: number, z: number, margin: number): boolean {
  const dx = (x - POND.x) / (POND.rx + margin);
  const dz = (z - POND.z) / (POND.rz + margin);
  return dx * dx + dz * dz < 1;
}

/** Whether (x, z) is free lawn, `margin` metres clear of the pond, the bandstand, the playground and the beds. */
function onLawn(x: number, z: number, margin: number): boolean {
  if (insidePond(x, z, margin) || Math.hypot(x - KIOSK.x, z - KIOSK.z) < 5 + margin) return false;
  if (Math.hypot(x - PLAYGROUND.x, z - PLAYGROUND.z) < PLAYGROUND.radius + margin) return false;
  return BEDS.every(([bx, bz, r]) => Math.hypot(x - bx, z - bz) > r + margin);
}

/** Points every `step` metres along a polyline. */
export function resample(line: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < line.length; i++) {
    const [x0, z0] = line[i - 1];
    const [x1, z1] = line[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  out.push(line[line.length - 1]);
  return out;
}

/** A gravel path `width` metres wide with darker edges, drawn segment by segment with true perspective. */
function paintPath(sheet: Sheet, line: [number, number][], width: number): void {
  const pts = resample(line, 4);
  for (const [w, fill] of [[width + 0.5, PATH_EDGE], [width, PATH]] as const) {
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1];
      const [x1, z1] = pts[i];
      const len = Math.hypot(x1 - x0, z1 - z0) || 1;
      const nx = (-(z1 - z0) / len) * (w / 2);
      const nz = ((x1 - x0) / len) * (w / 2);
      // Stretched a little along the path so the segments overlap without seams.
      const ex = ((x1 - x0) / len) * 0.3;
      const ez = ((z1 - z0) / len) * 0.3;
      const p = new Path2D();
      const corners = [worldPoint(x0 + nx - ex, z0 + nz - ez, 0), worldPoint(x1 + nx + ex, z1 + nz + ez, 0), worldPoint(x1 - nx + ex, z1 - nz + ez, 0), worldPoint(x0 - nx - ex, z0 - nz - ez, 0)];
      p.moveTo(corners[0][0], corners[0][1]);
      for (const [x, y] of corners.slice(1)) p.lineTo(x, y);
      p.closePath();
      sheet.begin(Math.hypot((x0 + x1) / 2, (z0 + z1) / 2), 0, { wet: 0.45, snow: 1 });
      sheet.path(p, fill);
    }
  }
}

/** The pond: a sandy bank, a stone kerb, water darkening towards the middle, then its life: fountain, lily pads, ducks, a boat. */
function paintPond(sheet: Sheet, random: Rng): void {
  const d = Math.hypot(POND.x, POND.z);
  sheet.begin(d);
  sheet.path(groundEllipse(POND.x, POND.z, POND.rx + 2.5, POND.rz + 2.5, 96), SAND);
  sheet.path(groundEllipse(POND.x, POND.z, POND.rx + 0.6, POND.rz + 0.6, 96), '#d8d2c2');
  sheet.begin(d, 0.7);
  sheet.path(groundEllipse(POND.x, POND.z, POND.rx, POND.rz, 96), WATER);
  const ctx = sheet.color;
  for (let k = 1; k <= 4; k++) {
    ctx.fillStyle = mixHex(WATER, WATER_DEEP, k / 4);
    ctx.globalAlpha = 0.35;
    ctx.fill(groundEllipse(POND.x - k * 1.5, POND.z, POND.rx * (1 - k * 0.17), POND.rz * (1 - k * 0.17), 64));
  }
  ctx.globalAlpha = 1;
  // Glints on the ripples.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 160; i++) {
    const t = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * 0.92;
    const [x, y] = worldPoint(POND.x + Math.cos(t) * r * POND.rx, POND.z + Math.sin(t) * r * POND.rz, 0);
    ctx.fillRect(x, y, between(random, 2, 5), 1);
  }
  paintLilyPads(sheet, random, POND.x - 26, POND.z + 10, 7);
  paintLilyPads(sheet, random, POND.x + 18, POND.z - 16, 4);
  paintDucks(sheet, random, POND.x + 14, POND.z + 6, 10);
  paintRowingBoat(sheet, POND.x + POND.rx - 4, POND.z - 4);
  paintFountain(sheet, random, POND.x, POND.z);
}

/** A small bandstand: posts under a dark green pointed roof, warm inside at night. */
function paintKiosk(sheet: Sheet): void {
  const { x, z, width } = KIOSK;
  const d = Math.hypot(x, z);
  const a = azimuthOf(x, z);
  const half = width / 2 / d;
  const quad = (aL: number, aR: number, hB: number, hT: number): Polygon =>
    new Polygon([
      [azimuthX(aL), heightY(hB, d)],
      [azimuthX(aR), heightY(hB, d)],
      [azimuthX(aR), heightY(hT, d)],
      [azimuthX(aL), heightY(hT, d)],
    ]);
  sheet.begin(d, 0.05);
  sheet.path(quad(a - half, a + half, 0, 0.6), '#b9b0a0');
  const inside = quad(a - half * 0.9, a + half * 0.9, 0.6, 3);
  sheet.path(inside, '#3b3a3c');
  sheet.lit(inside, 'warm', 0.5);
  for (const k of [-1, -0.33, 0.33, 1]) sheet.path(quad(a + half * k - 0.15 / d, a + half * k + 0.15 / d, 0.6, 3.1), '#e9e3d3');
  sheet.path(quad(a - half * 0.95, a + half * 0.95, 1.1, 1.2), '#e9e3d3');
  const roof = new Path2D();
  roof.moveTo(azimuthX(a - half * 1.2), heightY(3, d));
  roof.lineTo(azimuthX(a + half * 1.2), heightY(3, d));
  roof.lineTo(azimuthX(a + half * 0.1), heightY(5.6, d));
  roof.lineTo(azimuthX(a - half * 0.1), heightY(5.6, d));
  roof.closePath();
  sheet.path(roof, '#2f5a44');
  sheet.color.fillStyle = 'rgba(255,255,255,0.12)';
  sheet.color.fill(quad(a - half * 1.2, a + half * 1.2, 3, 3.25));
  sheet.path(quad(a - 0.1 / d, a + 0.1 / d, 5.5, 6.3), '#d8c88a');
}

/** The hedge along Park Street's far pavement, broken by a gate where each path enters the park. */
function paintHedge(sheet: Sheet, random: Rng): void {
  const gates = PATHS.map((path) => azimuthOf(-PARK_EDGE, path[0][1]));
  const ranges: [number, number][] = [];
  let start = PARK_FROM;
  for (const gate of [...gates].sort((p, q) => p - q)) {
    const halfGap = 2.5 / frontage(gate);
    ranges.push([start, gate - halfGap]);
    start = gate + halfGap;
  }
  ranges.push([start, CORNER]);
  const ctx = sheet.color;
  for (const [from, to] of ranges) {
    for (let a0 = from; a0 < to; a0 += Math.PI / 36) {
      const a1 = Math.min(a0 + Math.PI / 36, to);
      const p = new Path2D();
      const steps = 6;
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        const [x, y] = [azimuthX(a), heightY(1.4, frontage(a))];
        if (i === 0) p.moveTo(x - 0.5, y);
        else p.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const a = a0 + ((a1 - a0) * i) / steps;
        p.lineTo(azimuthX(a), heightY(0, frontage(a)) + 0.5);
      }
      p.closePath();
      const d = frontage((a0 + a1) / 2);
      sheet.begin(d, 0, { snow: 0.6 });
      // Clipped box: sunlit top fading into the shade under the leaves.
      const g = ctx.createLinearGradient(0, heightY(1.4, d), 0, heightY(0, d));
      g.addColorStop(0, HEDGE_TOP);
      g.addColorStop(0.35, HEDGE);
      g.addColorStop(1, HEDGE_FOOT);
      sheet.path(p, g);
      // Leaves: light flecks on top, dark hollows lower down.
      ctx.save();
      ctx.clip(p);
      const leaf = Math.max(1, sizePx(0.08, d));
      for (let i = 0; i < 220; i++) {
        const a = between(random, a0, a1);
        const h = between(random, 0.05, 1.4);
        const [x, y] = [azimuthX(a), heightY(h, frontage(a))];
        ctx.fillStyle = h > 1 ? (random() < 0.6 ? '#8db862' : '#4f8a3a') : random() < 0.5 ? '#2a5226' : '#4a7f3a';
        ctx.globalAlpha = 0.6;
        ctx.fillRect(x, y, leaf * 1.4, leaf);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
  // Stone gate pillars either side of each opening, each capped.
  for (const gate of gates) {
    const d = frontage(gate);
    const half = 2.5 / d;
    for (const side of [-1, 1]) {
      const a = gate + side * half;
      const w = 0.35 / d;
      sheet.begin(d);
      const p = new Path2D();
      p.rect(azimuthX(a - w), heightY(2.2, d), azimuthX(a + w) - azimuthX(a - w), heightY(0, d) - heightY(2.2, d));
      sheet.path(p, '#a8a094');
      const cap = new Path2D();
      cap.rect(azimuthX(a - w * 1.3), heightY(2.4, d), azimuthX(a + w * 1.3) - azimuthX(a - w * 1.3), heightY(2.2, d) - heightY(2.4, d));
      sheet.path(cap, '#c8c0b2');
    }
  }
}

/** The lawn's life: soft patches of lusher and drier grass, and blades where it is near enough to see them. */
function paintGrass(sheet: Sheet, random: Rng): void {
  const ctx = sheet.color;
  for (let i = 0; i < 260; i++) {
    const x = between(random, -PARK_FAR + 5, -PARK_EDGE - 3);
    const z = between(random, -220, 160);
    const d = Math.hypot(x, z);
    const r = sizePx(between(random, 6, 20), d);
    const [cx, cy] = worldPoint(x, z, 0);
    const squash = groundSquash(d);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const tone = random() < 0.5 ? '170,200,110' : '40,80,40';
    g.addColorStop(0, `rgba(${tone},0.14)`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, Math.max(0.05, squash));
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
  for (let i = 0; i < 9000; i++) {
    const x = between(random, -90, -PARK_EDGE - 0.5);
    const z = between(random, -70, 70);
    const d = Math.hypot(x, z);
    if (insidePond(x, z, 3)) continue;
    const [px, py] = worldPoint(x, z, 0);
    ctx.fillStyle = random() < 0.5 ? 'rgba(150,190,90,0.3)' : 'rgba(30,70,30,0.25)';
    ctx.fillRect(px, py, 1, Math.max(1, sizePx(0.12, d)));
  }
}

/** A tree's form for the park: mostly broadleaves, some pines and a few poplars. */
function parkForm(random: Rng): TreeForm {
  const r = random();
  return r < 0.14 ? 'conifer' : r < 0.22 ? 'poplar' : r < 0.4 ? 'oval' : 'round';
}

/**
 * The park across Park Street: a lawn receding to the mid-rise blocks on its far side, mottled
 * and criss-crossed by gravel paths, flower beds, a pond with its fountain and ducks, a
 * playground, a bandstand, picnics on the grass, benches and lamps along the paths and a
 * hundred-odd trees (broadleaves, pines, poplars, willows over the water), far to near, then
 * the hedge along the street.
 */
export function paintPark(sheet: Sheet, random: Rng): void {
  const edges = [PARK_EDGE, 31, 36, 43, 52, 64, 80, 100, 125, 155, 195, PARK_FAR];
  for (let i = 0; i < edges.length - 1; i++) {
    // Each band shades from its near colour into its far one, so the lawn has no seams.
    const near = seasonalLawn(mixHex(LAWN_NEAR, LAWN_FAR, i / (edges.length - 1)));
    const far = seasonalLawn(mixHex(LAWN_NEAR, LAWN_FAR, (i + 1) / (edges.length - 1)));
    paintGroundBand(sheet, (a) => parkLine(a, edges[i + 1]), (a) => parkLine(a, edges[i]), (a) => {
      const g = sheet.color.createLinearGradient(0, heightY(0, parkLine(a, edges[i + 1])), 0, heightY(0, parkLine(a, edges[i])));
      g.addColorStop(0, far);
      g.addColorStop(1, near);
      return g;
    }, PARK_FROM, PARK_TO, 0, { wet: 0.1, snow: 1 });
  }
  paintGrass(sheet, random);
  for (const path of PATHS) paintPath(sheet, path, 3);
  paintPond(sheet, random);
  for (const [x, z, r] of BEDS) paintFlowerBed(sheet, random, x, z, r);

  const items: { d: number; draw: () => void }[] = [];
  const add = (x: number, z: number, draw: () => void): void => {
    items.push({ d: Math.hypot(x, z), draw });
  };
  add(KIOSK.x, KIOSK.z, () => paintKiosk(sheet));
  add(PLAYGROUND.x, PLAYGROUND.z + 9, () => paintPlayground(sheet, PLAYGROUND.x, PLAYGROUND.z));
  for (let i = 0; i < 150; i++) {
    const x = between(random, -PARK_FAR + 8, -PARK_EDGE - 5);
    const z = between(random, -230, 150);
    if (!onLawn(x, z, 4)) continue;
    const form = parkForm(random);
    const height = form === 'poplar' ? between(random, 16, 24) : between(random, 9, 20);
    const radius = form === 'poplar' ? between(random, 2, 3) : Math.min(height * 0.36, between(random, 3, 6.5));
    const style = form === 'conifer' ? CONIFER_STYLE : pick(random, TREE_STYLES);
    add(x, z, () => paintTree(sheet, random, { x, z, height, radius, style, form }));
  }
  for (const [x, z] of WILLOWS) add(x, z, () => paintTree(sheet, random, { x, z, height: 12, radius: 7, style: WILLOW_STYLE, form: 'willow' }));
  for (let i = 0; i < 14; i++) {
    const x = between(random, -130, -40);
    const z = between(random, -90, 90);
    if (!onLawn(x, z, 3)) continue;
    add(x, z, () => paintPicnic(sheet, random, x, z));
  }
  // Lamps along the paths, benches facing them, a bin now and then.
  PATHS.forEach((path, p) => {
    const pts = resample(path, 4);
    for (let i = 3; i < pts.length - 2; i += 7) {
      const [x, z] = pts[i];
      add(x, z + 2.2, () => paintLamp(sheet, x, z + 2.2, 4.5, 4));
    }
    for (let i = 2 + p; i < pts.length - 2; i += 5) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0) || 1;
      const side = i % 2 === 0 ? 1 : -1;
      const dir: [number, number] = [((x1 - x0) / len) * side, ((z1 - z0) / len) * side];
      // Two and a half metres off the path's centre line, the bench's back away from it.
      const bx = x0 - dir[1] * 2.5;
      const bz = z0 + dir[0] * 2.5;
      if (!onLawn(bx, bz, 1)) continue;
      add(bx, bz, () => paintBench(sheet, { x: bx, z: bz, along: dir }));
      if (i % 3 === 0) add(bx + dir[0] * 1.6, bz + dir[1] * 1.6, () => paintBin(sheet, bx + dir[0] * 1.6, bz + dir[1] * 1.6));
    }
  });
  for (const [x, z, draw] of holidayParkItems(sheet)) add(x, z, draw);
  items.sort((p, q) => q.d - p.d);
  for (const item of items) item.draw();

  paintHedge(sheet, random);
}
