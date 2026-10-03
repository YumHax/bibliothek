import { Polygon, Sheet, type Rng, azimuthOf, azimuthX, groundSquash, heightY, outline, sizePx, worldPoint } from './Sheet';
import { between, pick, shade } from './paint';
import { type Footprint, footPoint, paintBox, paintGroundShadow, paintPost } from './Solid';
import { type SeatedPose, paintSeated } from './figures';
import type { LampDesign } from '@/world/street/streetPlan';

/**
 * The window view's street furniture (the walkable street's own, in 3D, is `street/StreetFurniture`): the things
 * that stand on the pavements and in the park, each painted at a ground point (metres from the eye) in true perspective: lamp posts, benches, bins, bicycles, bollards, traffic lights,
 * a bus shelter, an advertising column, hydrants, café terraces, the roadworks' hoardings,
 * barriers and cones.
 */

const IRON = '#23292a';
/** Someone at a terrace table: a torso and a head over the chair, facing the street. */
const ON_A_CHAIR: SeatedPose = { width: 0.42, seat: 0.48, shoulders: 1.05, torso: 1, neck: 1.1, minWidth: 0, minHead: 0 };

/**
 * A street lamp of its kind (`design`, the walkable street's `LAMP_DESIGNS`), its lens `height` over the pavement: a
 * cast-iron post with a lantern on top ('post'), a column with the lantern hung from a crook ('crook'), or the modern
 * grey pole with its head on an arm ('arm'); the head glows warm at night, with the pool of light it casts on the
 * ground `reach` metres around and, when a facade stands `wall` metres behind it, the wash of light up that wall.
 */
export function paintLamp(sheet: Sheet, x: number, z: number, height: number, reach: number, wall = 0, design: LampDesign = 'post'): void {
  const d = Math.hypot(x, z);
  const cx = azimuthX(azimuthOf(x, z));
  const baseY = heightY(0, d);
  const headY = heightY(height, d);
  const postW = Math.max(1, sizePx(design === 'arm' ? 0.12 : 0.14, d));
  const footW = Math.max(1, sizePx(0.34, d));
  const lanternW = Math.max(1.5, sizePx(0.42, d));
  const lanternH = Math.max(1.5, sizePx(0.6, d));
  // Where the head hangs: over the post, or out on its crook or arm.
  const reachOut = design === 'crook' ? sizePx(0.66, d) : design === 'arm' ? sizePx(1.3, d) : 0;
  const hx = cx + reachOut;
  const rx = sizePx(reach, d);
  const metal = design === 'arm' ? '#5e6266' : IRON;
  sheet.begin(d);
  sheet.wrapped(cx - rx, cx + rx + reachOut, () => {
    if (wall > 0) {
      const dw = d + wall;
      sheet.glow(hx, heightY(height * 0.6, dw), sizePx(3.2, dw), sizePx(4.5, dw), 0.1);
    }
    sheet.glow(hx, baseY, rx, rx * groundSquash(d), 0.32);
    // A small halo round the head, the air lit only close to the glass.
    const halo = Math.max(1.5, sizePx(0.9, d));
    sheet.glow(hx, headY, halo, halo, 0.35);
    const postTop = design === 'post' ? headY : heightY(height + (design === 'crook' ? 0.55 : 0.1), d);
    sheet.rect(cx - postW / 2, postTop, postW, baseY - postTop, metal);
    if (design !== 'arm') sheet.rect(cx - footW / 2, heightY(1.1, d), footW, baseY - heightY(1.1, d), IRON);
    if (reachOut > 0) {
      // The crook curling over, or the arm reaching out straight.
      sheet.rect(Math.min(cx, hx), postTop, Math.abs(hx - cx), Math.max(1, postW * 0.6), metal);
      if (design === 'crook') sheet.rect(hx - postW * 0.3, postTop, postW * 0.6, Math.max(1, headY - lanternH * 0.5 - postTop), metal);
    }
    if (design === 'arm') {
      // A flat head, lit from under it.
      const w = Math.max(1.5, sizePx(0.6, d));
      const h = Math.max(1, sizePx(0.12, d));
      sheet.rect(hx - w / 2, postTop, w, h * 1.4, '#3a3e42');
      sheet.rect(hx - w * 0.4, postTop + h * 1.2, w * 0.8, Math.max(1, h * 0.6), '#e8e4d8');
      sheet.litRect(hx - w * 0.4, postTop + h * 1.2, w * 0.8, Math.max(1, h * 0.6), 'warm', 1);
      return;
    }
    if (lanternH >= 4) {
      // The lantern: a tapering glass box under a cap and a finial.
      const top = headY - lanternH * 0.5;
      const lantern = new Polygon([
        [hx - lanternW * 0.35, headY + lanternH * 0.5],
        [hx + lanternW * 0.35, headY + lanternH * 0.5],
        [hx + lanternW * 0.5, top],
        [hx - lanternW * 0.5, top],
      ]);
      sheet.path(lantern, '#e0dccf');
      sheet.lit(lantern, 'warm', 1);
      const cap = new Path2D();
      cap.moveTo(hx - lanternW * 0.62, top);
      cap.lineTo(hx + lanternW * 0.62, top);
      cap.lineTo(hx, top - lanternH * 0.4);
      cap.closePath();
      sheet.path(cap, IRON);
      sheet.rect(hx - postW * 0.4, top - lanternH * 0.6, postW * 0.8, lanternH * 0.25, IRON);
      sheet.rect(hx - lanternW * 0.4, headY + lanternH * 0.45, lanternW * 0.8, Math.max(1, lanternH * 0.1), IRON);
    } else {
      sheet.rect(hx - lanternW / 2, headY - lanternH / 2, lanternW, lanternH, '#d8d4c8');
      sheet.litRect(hx - lanternW / 2, headY - lanternH / 2, lanternW, lanternH, 'warm', 1);
    }
  });
}

/** A park bench along `along`: slatted seat and back on iron legs, its back to +across. */
export function paintBench(sheet: Sheet, f: Footprint, wood = '#8a5a36'): void {
  paintGroundShadow(sheet, f.x, f.z, 0.9, 0.5, 0.2);
  for (const u of [-0.7, 0.7]) {
    const [x, z] = [f.x + f.along[0] * u, f.z + f.along[1] * u];
    paintPost(sheet, x, z, 0, 0.45, 0.06, IRON);
  }
  paintBox(sheet, f, 1.8, 0.45, 0.42, 0.47, wood);
  paintBox(sheet, f, 1.8, 0.06, 0.5, 0.9, wood, 0, 0, 0.24);
  const d = Math.hypot(f.x, f.z);
  if (sizePx(1, d) > 10) {
    // Gaps between the slats of the back.
    for (const h of [0.63, 0.77]) {
      sheet.color.fillStyle = 'rgba(0,0,0,0.35)';
      sheet.color.fill(outline([footPoint(f, -0.9, 0.2, h), footPoint(f, 0.9, 0.2, h), footPoint(f, 0.9, 0.2, h + 0.025), footPoint(f, -0.9, 0.2, h + 0.025)]));
    }
  }
}

/** A litter bin on a post. */
export function paintBin(sheet: Sheet, x: number, z: number): void {
  paintPost(sheet, x, z, 0, 0.5, 0.06, IRON);
  paintBox(sheet, { x, z, along: [1, 0] }, 0.45, 0.45, 0.35, 0.95, '#2f4a3a');
  const [cx, cy] = worldPoint(x, z, 0.95);
  const r = sizePx(0.18, Math.hypot(x, z));
  sheet.color.fillStyle = '#141816';
  sheet.color.fillRect(cx - r, cy - r * 0.3, r * 2, r * 0.6);
}

/** A bicycle standing along `along`: two wheels, the frame (in `color`, else drawn), bars and saddle, all in thin strokes. */
export function paintBicycle(sheet: Sheet, random: Rng, f: Footprint, color?: string): void {
  const d = Math.hypot(f.x, f.z);
  const px = sizePx(1, d);
  if (px < 6) return;
  const ctx = sheet.color;
  const frame = color ?? pick(random, ['#b8302a', '#2a4a8a', '#1c1c1e', '#e8e2d2', '#3f6b4f', '#d9a03a']);
  const P = (u: number, h: number): [number, number] => footPoint(f, u, 0, h);
  ctx.lineWidth = Math.max(0.8, 0.04 * px);
  ctx.strokeStyle = '#141414';
  for (const u of [-0.55, 0.55]) {
    const [wx, wy] = P(u, 0.34);
    ctx.beginPath();
    ctx.ellipse(wx, wy, Math.abs(P(u + 0.33, 0.34)[0] - wx) + 0.5, 0.33 * px, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = frame;
  ctx.lineWidth = Math.max(0.8, 0.05 * px);
  ctx.beginPath();
  ctx.moveTo(...P(-0.55, 0.34));
  ctx.lineTo(...P(-0.1, 0.34));
  ctx.lineTo(...P(0.4, 0.8));
  ctx.lineTo(...P(-0.2, 0.8));
  ctx.lineTo(...P(-0.1, 0.34));
  ctx.moveTo(...P(-0.55, 0.34));
  ctx.lineTo(...P(-0.2, 0.8));
  ctx.moveTo(...P(0.55, 0.34));
  ctx.lineTo(...P(0.42, 0.95));
  ctx.stroke();
  ctx.strokeStyle = '#141414';
  ctx.beginPath();
  ctx.moveTo(...P(0.3, 0.98));
  ctx.lineTo(...P(0.5, 0.98));
  ctx.moveTo(...P(-0.3, 0.92));
  ctx.lineTo(...P(-0.1, 0.92));
  ctx.stroke();
}

/** A bicycle stand: a row of hoops with a few bikes chained to them. */
export function paintBikeRack(sheet: Sheet, random: Rng, f: Footprint, hoops: number): void {
  for (let i = 0; i < hoops; i++) {
    const u = (i - (hoops - 1) / 2) * 0.9;
    const ctx = sheet.color;
    const d = Math.hypot(f.x, f.z);
    ctx.strokeStyle = '#8a8c8e';
    ctx.lineWidth = Math.max(0.8, sizePx(0.05, d));
    ctx.beginPath();
    ctx.moveTo(...footPoint(f, u, -0.3, 0));
    ctx.lineTo(...footPoint(f, u, -0.3, 0.75));
    ctx.lineTo(...footPoint(f, u, 0.3, 0.75));
    ctx.lineTo(...footPoint(f, u, 0.3, 0));
    ctx.stroke();
  }
  for (let i = 0; i < hoops; i++) {
    if (random() < 0.35) continue;
    const u = (i - (hoops - 1) / 2) * 0.9 + 0.2;
    // Bikes stand across the rack, at right angles to it.
    paintBicycle(sheet, random, { x: f.x + f.along[0] * u, z: f.z + f.along[1] * u, along: [-f.along[1], f.along[0]] });
  }
}

/** A short cast-iron bollard. */
export function paintBollard(sheet: Sheet, x: number, z: number): void {
  paintPost(sheet, x, z, 0, 0.9, 0.18, IRON);
  const [cx, cy] = worldPoint(x, z, 0.9);
  const r = Math.max(1, sizePx(0.1, Math.hypot(x, z)));
  sheet.color.fillStyle = IRON;
  sheet.color.beginPath();
  sheet.color.arc(cx, cy, r, 0, Math.PI * 2);
  sheet.color.fill();
}

/** A traffic light on its pole: the head showing red, which glows at night. */
export function paintTrafficLight(sheet: Sheet, x: number, z: number): void {
  paintPost(sheet, x, z, 0, 3.4, 0.12, '#3a3c3e');
  const d = Math.hypot(x, z);
  const cx = azimuthX(azimuthOf(x, z));
  const w = Math.max(1.5, sizePx(0.32, d));
  const top = heightY(3.6, d);
  const bottom = heightY(2.6, d);
  sheet.begin(d);
  sheet.rect(cx - w / 2, top, w, bottom - top, '#1c1e20');
  const r = Math.max(0.6, w * 0.3);
  const colors = ['#e8382a', '#3a2a10', '#10301a'];
  colors.forEach((color, i) => {
    const cy = top + ((i + 0.5) / 3) * (bottom - top);
    sheet.color.fillStyle = color;
    sheet.color.beginPath();
    sheet.color.arc(cx, cy, r, 0, Math.PI * 2);
    sheet.color.fill();
    if (i === 0) sheet.litRect(cx - r, cy - r, r * 2, r * 2, 'warm', 0.9);
  });
}

/** A bus shelter along `along`: a glass back and roof on posts, a lit advertising panel at one end, a bench inside. */
export function paintBusShelter(sheet: Sheet, random: Rng, f: Footprint): void {
  const L = 4;
  const W = 1.4;
  paintGroundShadow(sheet, f.x, f.z, 2.2, 0.9, 0.18);
  for (const u of [-L / 2, L / 2]) for (const v of [-W / 2, W / 2]) paintPost(sheet, f.x + f.along[0] * u - f.along[1] * v, f.z + f.along[1] * u + f.along[0] * v, 0, 2.5, 0.08, '#4a4e52');
  // The glass back, mostly the street seen through it.
  paintBox(sheet, f, L, 0.04, 0.2, 2.4, '#8aa0b0', 0.55, 0, W / 2);
  paintBench(sheet, { x: f.x - f.along[1] * 0.35, z: f.z + f.along[0] * 0.35, along: f.along }, '#6a6e72');
  // The advertising panel at the far end, lit from inside after dark.
  const d = Math.hypot(f.x, f.z);
  const P = (u: number, v: number, h: number): [number, number] => footPoint(f, u, v, h);
  const panel = new Polygon([P(L / 2 - 0.1, -W / 2, 0.3), P(L / 2 - 0.1, W / 2, 0.3), P(L / 2 - 0.1, W / 2, 2.3), P(L / 2 - 0.1, -W / 2, 2.3)]);
  sheet.begin(d);
  sheet.path(panel, pick(random, ['#e8c84a', '#d94f3a', '#3b6fb3', '#e8e2d2']));
  sheet.color.fillStyle = 'rgba(0,0,0,0.25)';
  sheet.color.fill(new Polygon([P(L / 2 - 0.1, -W / 2 + 0.2, 0.9), P(L / 2 - 0.1, W / 2 - 0.2, 0.9), P(L / 2 - 0.1, W / 2 - 0.2, 1.6), P(L / 2 - 0.1, -W / 2 + 0.2, 1.6)]));
  sheet.lit(panel, 'cool', 0.8);
  paintBox(sheet, f, L + 0.2, W + 0.2, 2.5, 2.62, '#5a5e62', 0.2);
  // The stop's pole and its sign.
  const sx = f.x - f.along[0] * (L / 2 + 0.8);
  const sz = f.z - f.along[1] * (L / 2 + 0.8);
  paintPost(sheet, sx, sz, 0, 2.8, 0.07, '#4a4e52');
  paintBox(sheet, { x: sx, z: sz, along: f.along }, 0.5, 0.05, 2.3, 2.8, '#2a6aa8');
}

/** The advertising column on the corner: a dark green drum papered with posters under a little dome. */
export function paintAdColumn(sheet: Sheet, random: Rng, x: number, z: number): void {
  const d = Math.hypot(x, z);
  const cx = azimuthX(azimuthOf(x, z));
  const r = sizePx(0.6, d);
  const baseY = heightY(0, d);
  const top = heightY(2.9, d);
  paintGroundShadow(sheet, x, z, 0.9, 0.9, 0.25);
  sheet.begin(d);
  sheet.rect(cx - r, top, r * 2, baseY - top, '#2f4a3a');
  const ctx = sheet.color;
  // Posters in rows round the drum.
  for (let row = 0; row < 3; row++) {
    const y0 = heightY(0.5 + row * 0.75, d);
    const y1 = heightY(1.2 + row * 0.75, d);
    let xx = cx - r * 0.95;
    while (xx < cx + r * 0.9) {
      const pw = r * between(random, 0.3, 0.6);
      ctx.fillStyle = pick(random, ['#e8c84a', '#d94f3a', '#3b6fb3', '#e8e2d2', '#1c1c1e', '#8c4f9e', '#f09a3a']);
      ctx.fillRect(xx, y1, Math.min(pw, cx + r * 0.95 - xx), y0 - y1);
      xx += pw + 0.5;
    }
  }
  // Round shading across the drum.
  const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.4, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, top, r * 2, baseY - top);
  sheet.rect(cx - r * 1.15, top - r * 0.2, r * 2.3, r * 0.25, '#23392e');
  const dome = new Path2D();
  dome.ellipse(cx, top - r * 0.2, r * 0.95, r * 0.75, 0, Math.PI, 0);
  dome.closePath();
  sheet.path(dome, '#2f4a3a');
  sheet.rect(cx - 1, top - r * 1.25, 2, r * 0.35, '#23392e');
}

/**
 * A café or bar terrace along Front Street from x0 to x1, its tables in a row along z: round
 * bistro tables with their chairs, some taken, under parasols now and then.
 */
export function paintTerrace(sheet: Sheet, random: Rng, x0: number, x1: number, z: number): void {
  for (let x = x0 + 0.9; x < x1 - 0.6; x += between(random, 1.5, 1.9)) {
    const d = Math.hypot(x, z);
    paintGroundShadow(sheet, x, z, 0.6, 0.45, 0.2);
    // Chairs either side, the table between.
    for (const side of [-0.5, 0.5]) {
      paintPost(sheet, x + side, z, 0, 0.45, 0.05, IRON);
      paintBox(sheet, { x: x + side, z, along: [1, 0] }, 0.38, 0.38, 0.45, 0.49, pick(random, ['#b8302a', '#2f4a3a', '#c9a060', '#1c1c1e']));
      if (random() < 0.4) paintSeated(sheet, random, x + side, z + 0.05, ON_A_CHAIR);
    }
    paintPost(sheet, x, z, 0, 0.74, 0.05, IRON);
    const [tx, ty] = worldPoint(x, z, 0.75);
    const tr = sizePx(0.32, d);
    const top = new Path2D();
    top.ellipse(tx, ty, tr, Math.max(0.6, tr * groundSquash(d)), 0, 0, Math.PI * 2);
    sheet.path(top, '#d8d4cc');
    if (random() < 0.2) {
      // A parasol: a pole and a wide, shallow cone of canvas.
      paintPost(sheet, x, z, 0.75, 2.4, 0.04, '#d8d4cc');
      const [px, py] = worldPoint(x, z, 2.2);
      const pr = sizePx(1, d);
      const pry = Math.max(1, pr * groundSquash(d));
      const [, peak] = worldPoint(x, z, 2.5);
      const color = pick(random, ['#e8e2d2', '#b8302a', '#2f5a44', '#2a4a6a']);
      // Eight panels round the peak, lit and shaded in turn, seen from above.
      for (let k = 0; k < 8; k++) {
        const t0 = (k / 8) * Math.PI * 2;
        const t1 = ((k + 1) / 8) * Math.PI * 2;
        const panel = new Path2D();
        panel.moveTo(px, peak);
        panel.lineTo(px + Math.cos(t0) * pr, py + Math.sin(t0) * pry);
        panel.lineTo(px + Math.cos(t1) * pr, py + Math.sin(t1) * pry);
        panel.closePath();
        sheet.path(panel, shade(color, k % 2 === 0 ? 1.08 : 0.86));
      }
    }
  }
}

/** A newspaper kiosk (newsstand): a green box with a shallow roof, the day's papers and magazines pegged round its hatch. */
export function paintNewsstand(sheet: Sheet, random: Rng, f: Footprint): void {
  const L = 3;
  const W = 2;
  paintGroundShadow(sheet, f.x, f.z, 1.9, 1.3, 0.25);
  paintBox(sheet, f, L, W, 0, 2.5, '#2f4a3a');
  const d = Math.hypot(f.x, f.z);
  const P = (u: number, h: number): [number, number] => footPoint(f, u, -W / 2, h);
  // The open hatch on the street side, the vendor's light behind it, magazines round it.
  const hatch = new Polygon([P(-1, 1), P(1, 1), P(1, 2), P(-1, 2)]);
  sheet.begin(d);
  sheet.path(hatch, '#3a3228');
  sheet.lit(hatch, 'warm', 0.7, between(random, 0.6, 0.8));
  const ctx = sheet.color;
  for (let u = -1.4; u < 1.35; u += 0.22) {
    for (const [h0, h1] of [[0.3, 0.62], [0.66, 0.98], [2.05, 2.35]] as const) {
      if (h0 > 1 && h0 < 2 && Math.abs(u) < 1) continue;
      ctx.fillStyle = pick(random, ['#e8e2d2', '#d94f3a', '#3b6fb3', '#f0c94a', '#1c1c1e', '#8c4f9e']);
      ctx.fill(outline([P(u, h0), P(u + 0.18, h0), P(u + 0.18, h1), P(u, h1)]));
    }
  }
  paintBox(sheet, f, L + 0.5, W + 0.5, 2.5, 2.65, '#23392e');
  paintBox(sheet, f, 1.4, 0.8, 2.65, 2.95, '#23392e');
}

/** The iron grille over a street tree's pit. */
export function paintTreeGrate(sheet: Sheet, x: number, z: number): void {
  const ctx = sheet.color;
  const s = 0.75;
  ctx.fillStyle = '#2a2826';
  ctx.fill(outline([worldPoint(x - s, z - s, 0), worldPoint(x + s, z - s, 0), worldPoint(x + s, z + s, 0), worldPoint(x - s, z + s, 0)]));
  ctx.strokeStyle = 'rgba(120,115,105,0.6)';
  ctx.lineWidth = Math.max(0.6, sizePx(0.03, Math.hypot(x, z)));
  for (let k = 1; k < 5; k++) {
    const r = (s * k) / 5;
    ctx.stroke(outline([worldPoint(x - r, z - r, 0), worldPoint(x + r, z - r, 0), worldPoint(x + r, z + r, 0), worldPoint(x - r, z + r, 0)]));
  }
}

/** A manhole cover or a round patch of the road at (x, z). */
export function paintManhole(sheet: Sheet, x: number, z: number, radius = 0.35): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    pts.push(worldPoint(x + Math.cos(t) * radius, z + Math.sin(t) * radius, 0));
  }
  const ctx = sheet.color;
  ctx.fillStyle = '#34363a';
  ctx.fill(outline(pts));
  ctx.strokeStyle = 'rgba(160,160,160,0.25)';
  ctx.lineWidth = Math.max(0.6, sizePx(0.04, Math.hypot(x, z)));
  ctx.stroke(outline(pts));
}

/** A red fire hydrant on the pavement. */
export function paintHydrant(sheet: Sheet, x: number, z: number): void {
  paintPost(sheet, x, z, 0, 0.7, 0.22, '#b8302a');
  paintPost(sheet, x, z, 0.3, 0.42, 0.36, '#9a2822');
  paintPost(sheet, x, z, 0.7, 0.8, 0.12, '#9a2822');
}

/**
 * The roadworks' plywood hoarding right across a pavement, from (x0, z0) to (x1, z1), `height`
 * tall: raw boards on a darker frame, a strip of warning tape along the top, fly-posters on it.
 */
export function paintHoarding(sheet: Sheet, random: Rng, x0: number, z0: number, x1: number, z1: number, height: number): void {
  const f: Footprint = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, along: [x1 - x0, z1 - z0].map((v) => v / Math.hypot(x1 - x0, z1 - z0)) as [number, number] };
  const length = Math.hypot(x1 - x0, z1 - z0);
  paintBox(sheet, f, length, 0.08, 0, height, '#c9a877');
  paintBox(sheet, f, length, 0.1, height - 0.25, height, '#e8c030');
  const ctx = sheet.color;
  for (let u = -length / 2 + 0.3; u < length / 2 - 0.8; u += between(random, 0.9, 1.6)) {
    if (random() < 0.4) continue;
    ctx.fillStyle = pick(random, ['#f0e8d0', '#f6d23a', '#e8e8e8', '#ff6a3a', '#9ad0e8']);
    ctx.fill(outline([footPoint(f, u, -0.06, 0.8), footPoint(f, u + 0.6, -0.06, 0.8), footPoint(f, u + 0.6, -0.06, 1.7), footPoint(f, u, -0.06, 1.7)]));
  }
}

/** A row of red and white water-filled barriers from (x0, z0) to (x1, z1), end to end. */
export function paintBarriers(sheet: Sheet, x0: number, z0: number, x1: number, z1: number): void {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const along: [number, number] = [(x1 - x0) / length, (z1 - z0) / length];
  const n = Math.max(1, Math.round(length / 1.2));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    paintBox(sheet, { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, along }, length / n - 0.05, 0.45, 0, 0.8, i % 2 === 0 ? '#d8302a' : '#ece8e0');
  }
}

/** A traffic cone. */
export function paintCone(sheet: Sheet, x: number, z: number): void {
  paintPost(sheet, x, z, 0, 0.7, 0.3, '#f06a1a');
  paintPost(sheet, x, z, 0.35, 0.47, 0.26, '#f0f0e8');
}
