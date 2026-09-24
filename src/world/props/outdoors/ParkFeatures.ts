import { Sheet, type Rng, azimuthOf, azimuthX, groundSquash, heightY, outline, sizePx, worldPoint } from './Sheet';
import { between, integer, pick } from './paint';
import { paintBox, paintGroundShadow, paintPost } from './Solid';

/**
 * The things that make the park lived in, each at a ground point in metres from the eye: flower
 * beds, a playground, picnic blankets with people on them, and on the pond a fountain, lily pads,
 * ducks and a rowing boat.
 */

const SHIRTS = ['#d94f3a', '#3b6fb3', '#e8e2d2', '#2f2f36', '#6fa35e', '#f0c94a', '#8c4f9e', '#c9c9c9'];
const SKINS = ['#f1c9a5', '#d9a071', '#8d5a3b', '#f7d9c0', '#5b3a25'];
const BLOOMS = ['#d9383a', '#f0c94a', '#e0567a', '#f0f0e8', '#b04ac0', '#f09a3a', '#6a5acd'];

/** A ground ellipse around (x, z), radii in metres. */
export function groundEllipse(x: number, z: number, rx: number, rz: number, segments = 32): Path2D {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push(worldPoint(x + Math.cos(t) * rx, z + Math.sin(t) * rz, 0));
  }
  return outline(pts);
}

/** A round flower bed: a rim of turned earth, rings of blooms in two or three colours, a clump of foliage at its heart. */
export function paintFlowerBed(sheet: Sheet, random: Rng, x: number, z: number, radius: number): void {
  const d = Math.hypot(x, z);
  sheet.begin(d);
  sheet.path(groundEllipse(x, z, radius + 0.3, radius + 0.3), '#e0dccf');
  sheet.path(groundEllipse(x, z, radius, radius), '#5a4030');
  const ctx = sheet.color;
  const colors = [pick(random, BLOOMS), pick(random, BLOOMS), pick(random, BLOOMS)];
  const dot = Math.max(1, sizePx(0.18, d));
  const count = Math.min(900, Math.floor(radius * radius * 60));
  for (let i = 0; i < count; i++) {
    const t = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * radius * 0.95;
    const ring = Math.min(2, Math.floor((r / radius) * 3));
    const [px, py] = worldPoint(x + Math.cos(t) * r, z + Math.sin(t) * r, 0.2);
    ctx.fillStyle = random() < 0.25 ? '#3f6b33' : colors[2 - ring];
    ctx.fillRect(px, py, dot, dot * 0.8);
  }
  const [cx, cy] = worldPoint(x, z, 0.6);
  const r = sizePx(radius * 0.25, d);
  ctx.fillStyle = '#35652f';
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A person sitting on the grass: folded legs, a torso and a head. */
function paintSittingPerson(sheet: Sheet, random: Rng, x: number, z: number): void {
  const d = Math.hypot(x, z);
  const cx = azimuthX(azimuthOf(x, z));
  const w = Math.max(1, sizePx(0.4, d));
  const base = heightY(0.15, d);
  const shoulders = heightY(0.8, d);
  const head = Math.max(0.8, sizePx(0.12, d));
  sheet.begin(d);
  sheet.rect(cx - w * 0.8, base - (base - shoulders) * 0.25, w * 1.6, (base - shoulders) * 0.25, pick(random, ['#2b2f3d', '#4b5563', '#6b5a48', '#e8e2d2']));
  sheet.rect(cx - w / 2, shoulders, w, (base - shoulders) * 0.8, pick(random, SHIRTS));
  const p = new Path2D();
  p.arc(cx, shoulders - head, head, 0, Math.PI * 2);
  sheet.path(p, pick(random, SKINS));
}

/** A picnic blanket, checked or plain, with one to three people on it and a basket. */
export function paintPicnic(sheet: Sheet, random: Rng, x: number, z: number): void {
  const d = Math.hypot(x, z);
  const color = pick(random, ['#c9302a', '#3b6fb3', '#e8c84a', '#6fa35e', '#e8e2d2']);
  const w = 1.8;
  const h = 1.4;
  sheet.begin(d);
  sheet.path(outline([worldPoint(x - w / 2, z - h / 2, 0), worldPoint(x + w / 2, z - h / 2, 0), worldPoint(x + w / 2, z + h / 2, 0), worldPoint(x - w / 2, z + h / 2, 0)]), color);
  const ctx = sheet.color;
  if (random() < 0.6) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let k = 1; k < 4; k++) {
      const u = -w / 2 + (w * k) / 4;
      ctx.fill(outline([worldPoint(x + u - 0.08, z - h / 2, 0), worldPoint(x + u + 0.08, z - h / 2, 0), worldPoint(x + u + 0.08, z + h / 2, 0), worldPoint(x + u - 0.08, z + h / 2, 0)]));
      const v = -h / 2 + (h * k) / 4;
      ctx.fill(outline([worldPoint(x - w / 2, z + v - 0.08, 0), worldPoint(x + w / 2, z + v - 0.08, 0), worldPoint(x + w / 2, z + v + 0.08, 0), worldPoint(x - w / 2, z + v + 0.08, 0)]));
    }
  }
  paintBox(sheet, { x: x + 0.5, z: z - 0.3, along: [1, 0] }, 0.45, 0.3, 0, 0.3, '#b08a50');
  const people = integer(random, 1, 3);
  for (let i = 0; i < people; i++) paintSittingPerson(sheet, random, x - 0.5 + i * 0.5, z + between(random, -0.3, 0.4));
}

/**
 * A playground on a patch of red safety surface and a sandpit: a swing frame, a slide up a little
 * tower, a climbing frame and a seesaw.
 */
export function paintPlayground(sheet: Sheet, x: number, z: number): void {
  const d = Math.hypot(x, z);
  sheet.begin(d);
  sheet.path(groundEllipse(x, z, 12, 9), '#b0584a');
  sheet.path(groundEllipse(x - 4, z + 2, 4, 3), '#d9c79a');
  const ctx = sheet.color;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke(groundEllipse(x, z, 12, 9, 48));
  // Swings: two A-frames and a top bar, seats hanging on chains.
  const sx = x + 4;
  const sz = z + 4;
  paintGroundShadow(sheet, sx, sz + 0.5, 2.2, 0.8, 0.12);
  for (const u of [-1.8, 1.8]) {
    paintPost(sheet, sx + u - 0.5, sz, 0, 2.4, 0.09, '#3a6ab0');
    paintPost(sheet, sx + u + 0.5, sz, 0, 2.4, 0.09, '#3a6ab0');
  }
  paintBox(sheet, { x: sx, z: sz, along: [1, 0] }, 3.8, 0.12, 2.3, 2.45, '#3a6ab0');
  for (const u of [-0.8, 0.8]) {
    paintPost(sheet, sx + u - 0.2, sz, 0.45, 2.3, 0.02, '#8a8c8e');
    paintPost(sheet, sx + u + 0.2, sz, 0.45, 2.3, 0.02, '#8a8c8e');
    paintBox(sheet, { x: sx + u, z: sz, along: [1, 0] }, 0.5, 0.2, 0.4, 0.47, '#1c1c1e');
  }
  // The slide's tower and its chute sloping down to the sand.
  const tx = x - 4;
  const tz = z - 3;
  paintBox(sheet, { x: tx, z: tz, along: [1, 0] }, 1.4, 1.4, 0, 1.5, '#e8c84a');
  paintBox(sheet, { x: tx, z: tz, along: [1, 0] }, 1.6, 1.6, 2.4, 2.8, '#c9302a');
  for (const [u, v] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]] as const) paintPost(sheet, tx + u, tz + v, 1.5, 2.5, 0.08, '#6a4a32');
  const chute = outline([worldPoint(tx + 0.7, tz - 0.3, 1.5), worldPoint(tx + 0.7, tz + 0.3, 1.5), worldPoint(tx + 3.2, tz + 0.3, 0.3), worldPoint(tx + 3.2, tz - 0.3, 0.3)]);
  sheet.path(chute, '#2f8a4a');
  // A climbing frame of bars.
  const cx = x + 3;
  const cz = z - 4;
  for (let u = -1; u <= 1; u += 0.5) for (const v of [-0.8, 0.8]) paintPost(sheet, cx + u, cz + v, 0, 1.8, 0.05, '#c9302a');
  for (const h of [0.6, 1.2, 1.8]) {
    paintBox(sheet, { x: cx, z: cz - 0.8, along: [1, 0] }, 2, 0.05, h - 0.03, h + 0.03, '#c9302a');
    paintBox(sheet, { x: cx, z: cz + 0.8, along: [1, 0] }, 2, 0.05, h - 0.03, h + 0.03, '#c9302a');
  }
  // A seesaw.
  paintBox(sheet, { x: x - 6, z: z + 5, along: [0.94, 0.34] }, 3, 0.25, 0.3, 0.45, '#e8c84a');
  paintBox(sheet, { x: x - 6, z: z + 5, along: [0.94, 0.34] }, 0.3, 0.3, 0, 0.35, '#3a6ab0');
}

/**
 * The fountain in the middle of the pond: a stone basin, a white plume falling back in a spray,
 * and rings of ripples spreading out over the water.
 */
export function paintFountain(sheet: Sheet, random: Rng, x: number, z: number): void {
  const d = Math.hypot(x, z);
  const ctx = sheet.color;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (const r of [3.2, 5, 7.5, 10.5]) ctx.stroke(groundEllipse(x, z, r, r, 40));
  sheet.begin(d, 0.1);
  sheet.path(groundEllipse(x, z, 2, 2), '#c9c2b2');
  sheet.path(groundEllipse(x, z, 1.6, 1.6), '#9ab4c8');
  const [cx, base] = worldPoint(x, z, 0.3);
  const [, top] = worldPoint(x, z, 4.2);
  const w = sizePx(0.35, d);
  const plume = ctx.createLinearGradient(0, top, 0, base);
  plume.addColorStop(0, 'rgba(255,255,255,0.35)');
  plume.addColorStop(0.3, 'rgba(255,255,255,0.9)');
  plume.addColorStop(1, 'rgba(235,245,255,0.8)');
  ctx.fillStyle = plume;
  ctx.beginPath();
  ctx.moveTo(cx - w, base);
  ctx.quadraticCurveTo(cx - w * 0.4, (top + base) / 2, cx - w * 0.2, top);
  ctx.lineTo(cx + w * 0.2, top);
  ctx.quadraticCurveTo(cx + w * 0.4, (top + base) / 2, cx + w, base);
  ctx.closePath();
  ctx.fill();
  // The spray falling back all round.
  const r = sizePx(1.6, d);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 90; i++) {
    const t = between(random, -1, 1);
    const fall = random();
    ctx.fillRect(cx + t * r * (0.3 + fall * 0.7), top + (base - top) * (0.15 + fall * 0.85), 1, 1);
  }
}

/** Lily pads in a loose cluster on the water. */
export function paintLilyPads(sheet: Sheet, random: Rng, x: number, z: number, spread: number): void {
  const ctx = sheet.color;
  for (let i = 0; i < 40; i++) {
    const px = x + between(random, -spread, spread);
    const pz = z + between(random, -spread, spread) * 0.6;
    const r = between(random, 0.3, 0.7);
    ctx.fillStyle = random() < 0.5 ? '#4d7a3a' : '#5f8c45';
    ctx.fill(groundEllipse(px, pz, r, r, 10));
    if (random() < 0.12) {
      const [fx, fy] = worldPoint(px, pz, 0.05);
      ctx.fillStyle = '#f0c0d0';
      ctx.fillRect(fx, fy - 1, 1.5, 1.5);
    }
  }
}

/** Ducks paddling, each trailing a faint V of a wake. */
export function paintDucks(sheet: Sheet, random: Rng, x: number, z: number, spread: number): void {
  const ctx = sheet.color;
  for (let i = integer(random, 5, 9); i > 0; i--) {
    const px = x + between(random, -spread, spread);
    const pz = z + between(random, -spread, spread) * 0.6;
    const d = Math.hypot(px, pz);
    const [cx, cy] = worldPoint(px, pz, 0.1);
    const r = Math.max(1, sizePx(0.25, d));
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - r * 6, cy + r * 1.5);
    ctx.lineTo(cx, cy + r * 0.4);
    ctx.lineTo(cx - r * 6, cy - r * 0.8);
    ctx.stroke();
    ctx.fillStyle = random() < 0.4 ? '#f4f2ea' : '#6a5a40';
    ctx.fillRect(cx - r, cy - r * 0.5, r * 2, r);
    ctx.fillStyle = random() < 0.5 ? '#2f6a3a' : '#5a4a30';
    ctx.fillRect(cx + r * 0.6, cy - r * 1.2, r * 0.8, r * 0.8);
  }
}

/** A rowing boat moored at the pond's edge, oars shipped. */
export function paintRowingBoat(sheet: Sheet, x: number, z: number): void {
  const d = Math.hypot(x, z);
  sheet.begin(d, 0.05);
  const hull = outline([worldPoint(x - 1.8, z, 0.3), worldPoint(x - 1, z - 0.6, 0.35), worldPoint(x + 1.4, z - 0.6, 0.35), worldPoint(x + 1.8, z, 0.3), worldPoint(x + 1.4, z + 0.6, 0.35), worldPoint(x - 1, z + 0.6, 0.35)]);
  sheet.path(hull, '#e8e2d2');
  sheet.color.fillStyle = '#8a5a36';
  sheet.color.fill(outline([worldPoint(x - 1.4, z, 0.35), worldPoint(x - 0.8, z - 0.45, 0.35), worldPoint(x + 1.2, z - 0.45, 0.35), worldPoint(x + 1.5, z, 0.35), worldPoint(x + 1.2, z + 0.45, 0.35), worldPoint(x - 0.8, z + 0.45, 0.35)]));
  sheet.color.fillStyle = '#e8e2d2';
  for (const u of [-0.3, 0.6]) sheet.color.fill(outline([worldPoint(x + u, z - 0.45, 0.4), worldPoint(x + u + 0.25, z - 0.45, 0.4), worldPoint(x + u + 0.25, z + 0.45, 0.4), worldPoint(x + u, z + 0.45, 0.4)]));
  const ctx = sheet.color;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  const [bx, by] = worldPoint(x, z, 0);
  const r = sizePx(2.4, d);
  ctx.beginPath();
  ctx.ellipse(bx, by, r, Math.max(1, r * groundSquash(d) * 0.5), 0, 0, Math.PI * 2);
  ctx.stroke();
}
