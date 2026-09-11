import { Polygon, Sheet, type Rng, azimuthOf, azimuthX, groundSquash, heightY, sizePx } from './Sheet';
import { between, mixHex, pick } from './paint';
import { CORNER, PARK_EDGE, PARK_FAR, PARK_FROM, PARK_TO, frontage, parkLine } from './plan';
import { paintGroundBand, paintLamp } from './Street';
import { TREE_STYLES, paintTree } from './Tree';

const LAWN_NEAR = '#5f8c45';
const LAWN_FAR = '#95b57a';
const PATH = '#c8bda3';
const HEDGE = '#35652f';
const HEDGE_TOP = '#6d9e4a';
const HEDGE_FOOT = '#1c3a1c';
const WATER = '#7b9bb6';
const SAND = '#c9bda0';

/** The pond: an ellipse on the lawn, metres from the eye. */
const POND = { x: -115, z: -25, rx: 40, rz: 26 };
/** Gravel paths across the lawn, as polylines from the park gates (the walkers of `Life` follow them). */
export const PATHS: [number, number][][] = [
  [[-PARK_EDGE, -10], [-70, -30], [-110, -72], [-160, -62], [-210, -20], [-PARK_FAR, 0]],
  [[-PARK_EDGE, 30], [-60, 45], [-85, 40], [-120, 15], [-150, 40], [-200, 80], [-PARK_FAR, 90]],
  [[-PARK_EDGE, -60], [-55, -90], [-90, -130], [-140, -170], [-200, -200]],
];
const KIOSK = { x: -88, z: 54, width: 6 };

function point(x: number, z: number, height: number): [number, number] {
  return [azimuthX(azimuthOf(x, z)), heightY(height, Math.hypot(x, z))];
}

function insidePond(x: number, z: number, margin: number): boolean {
  const dx = (x - POND.x) / (POND.rx + margin);
  const dz = (z - POND.z) / (POND.rz + margin);
  return dx * dx + dz * dz < 1;
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

/** A gravel path `width` metres wide, drawn segment by segment with true perspective. */
function paintPath(sheet: Sheet, line: [number, number][], width: number): void {
  const pts = resample(line, 4);
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1];
    const [x1, z1] = pts[i];
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = (-(z1 - z0) / len) * (width / 2);
    const nz = ((x1 - x0) / len) * (width / 2);
    const p = new Path2D();
    const corners = [point(x0 + nx, z0 + nz, 0), point(x1 + nx, z1 + nz, 0), point(x1 - nx, z1 - nz, 0), point(x0 - nx, z0 - nz, 0)];
    p.moveTo(corners[0][0], corners[0][1]);
    for (const [x, y] of corners.slice(1)) p.lineTo(x, y);
    p.closePath();
    sheet.begin(Math.hypot((x0 + x1) / 2, (z0 + z1) / 2));
    sheet.path(p, PATH);
  }
}

function paintPond(sheet: Sheet): void {
  const d = Math.hypot(POND.x, POND.z);
  const ellipse = (grow: number): Path2D => {
    const p = new Path2D();
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      const [x, y] = point(POND.x + Math.cos(t) * (POND.rx + grow), POND.z + Math.sin(t) * (POND.rz + grow), 0);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
    return p;
  };
  sheet.begin(d);
  sheet.path(ellipse(2.5), SAND);
  sheet.begin(d, 0.7);
  sheet.path(ellipse(0), WATER);
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
  const roof = new Path2D();
  roof.moveTo(azimuthX(a - half * 1.2), heightY(3, d));
  roof.lineTo(azimuthX(a + half * 1.2), heightY(3, d));
  roof.lineTo(azimuthX(a + half * 0.1), heightY(5.6, d));
  roof.lineTo(azimuthX(a - half * 0.1), heightY(5.6, d));
  roof.closePath();
  sheet.path(roof, '#2f5a44');
  sheet.path(quad(a - 0.1 / d, a + 0.1 / d, 5.5, 6.3), '#d8c88a');
}

/** The hedge along Park Street's far pavement, broken by a gate where each path enters the park. */
function paintHedge(sheet: Sheet): void {
  const gates = PATHS.map((path) => azimuthOf(-PARK_EDGE, path[0][1]));
  const ranges: [number, number][] = [];
  let start = PARK_FROM;
  for (const gate of [...gates].sort((p, q) => p - q)) {
    const halfGap = 2.5 / frontage(gate);
    ranges.push([start, gate - halfGap]);
    start = gate + halfGap;
  }
  ranges.push([start, CORNER]);
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
      sheet.begin(d);
      // Clipped box: sunlit top fading into the shade under the leaves.
      const g = sheet.color.createLinearGradient(0, heightY(1.4, d), 0, heightY(0, d));
      g.addColorStop(0, HEDGE_TOP);
      g.addColorStop(0.35, HEDGE);
      g.addColorStop(1, HEDGE_FOOT);
      sheet.path(p, g);
    }
  }
  // Stone gate pillars either side of each opening.
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
    }
  }
}

/**
 * The park across Park Street: a lawn receding to the mid-rise blocks on its far side, mottled
 * and criss-crossed by gravel paths, a pond that mirrors the sky, a bandstand, a hundred-odd
 * trees and the lamps along the paths (far to near), then the hedge along the street.
 */
export function paintPark(sheet: Sheet, random: Rng): void {
  const edges = [PARK_EDGE, 31, 36, 43, 52, 64, 80, 100, 125, 155, 195, PARK_FAR];
  for (let i = 0; i < edges.length - 1; i++) {
    const color = mixHex(LAWN_NEAR, LAWN_FAR, i / (edges.length - 2));
    paintGroundBand(sheet, (a) => parkLine(a, edges[i + 1]), (a) => parkLine(a, edges[i]), () => color, PARK_FROM, PARK_TO);
  }
  // Mottling: patches of lusher and drier grass.
  const ctx = sheet.color;
  for (let i = 0; i < 420; i++) {
    const x = between(random, -PARK_FAR + 5, -PARK_EDGE - 3);
    const z = between(random, -220, 160);
    const d = Math.hypot(x, z);
    const r = sizePx(between(random, 4, 14), d);
    const [cx, cy] = point(x, z, 0);
    const p = new Path2D();
    p.ellipse(cx, cy, r, Math.max(0.5, r * groundSquash(d)), 0, 0, Math.PI * 2);
    ctx.fillStyle = random() < 0.5 ? 'rgba(170,200,110,0.16)' : 'rgba(40,80,40,0.16)';
    ctx.fill(p);
  }
  for (const path of PATHS) paintPath(sheet, path, 3);
  paintPond(sheet);

  const items: { d: number; draw: () => void }[] = [];
  items.push({ d: Math.hypot(KIOSK.x, KIOSK.z), draw: () => paintKiosk(sheet) });
  for (let i = 0; i < 130; i++) {
    const x = between(random, -PARK_FAR + 8, -PARK_EDGE - 5);
    const z = between(random, -230, 150);
    if (insidePond(x, z, 6) || Math.hypot(x - KIOSK.x, z - KIOSK.z) < 9) continue;
    const height = between(random, 9, 20);
    const radius = Math.min(height * 0.36, between(random, 3, 7));
    items.push({ d: Math.hypot(x, z), draw: () => paintTree(sheet, random, { x, z, height, radius, style: pick(random, TREE_STYLES) }) });
  }
  for (const path of PATHS) {
    const pts = resample(path, 4);
    for (let i = 3; i < pts.length - 2; i += 7) {
      const [x, z] = pts[i];
      items.push({ d: Math.hypot(x, z), draw: () => paintLamp(sheet, x, z + 2.2, 4.5, 4) });
    }
  }
  items.sort((p, q) => q.d - p.d);
  for (const item of items) item.draw();

  paintHedge(sheet);
}
