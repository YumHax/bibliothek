import * as THREE from 'three';
import { createCanvas, toTexture, seededRandom, FONT } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { Prop, matte } from './Prop';

export interface WallCalendarOptions {
  /** Size of the sheet. Default 0.3 x 0.45 m. */
  width?: number;
  height?: number;
  /** Seeds the month's picture (a landscape). Default the month itself, so it changes with the page. */
  seed?: number;
  /** Colour of Sundays and of the ring round today. Default a pillar-box red. */
  accent?: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const PX_PER_M = 1700;

/**
 * A paper wall calendar on a nail, open at the real current month (the player's clock, read once
 * when the room is built): a picture on the top half, the month's grid below, weeks starting on
 * Monday, Sundays in red and today ringed. Wall-hung: origin at the middle of the sheet, its back
 * on the wall, +z into the room. Decoration: never collides.
 */
export class WallCalendar extends Prop {
  constructor(options: WallCalendarOptions = {}) {
    super();
    this.name = 'WallCalendar';
    const width = options.width ?? 0.3;
    const height = options.height ?? 0.45;
    const now = new Date();
    const texture = paintPage(width, height, now, options.seed ?? now.getFullYear() * 12 + now.getMonth(), options.accent ?? '#c8322a');
    const face = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 });
    const edge = matte(0xf4f1ea, 0.9);
    // A thin pad of pages: the printed face on the front, plain paper on the edges.
    const pad = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.004), [edge, edge, edge, edge, face, edge]);
    pad.position.z = 0.002;
    pad.receiveShadow = true;
    this.add(pad);
    // The wire binding along the top and the nail it hangs from.
    const wire = new THREE.MeshStandardMaterial({ color: 0x9a9ea3, metalness: 0.8, roughness: 0.35 });
    const loops = Math.round(width / 0.012);
    for (let i = 0; i < loops; i++) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0008, 4, 8), wire);
      loop.position.set(-width / 2 + (i + 0.5) * (width / loops), height / 2 - 0.004, 0.004);
      loop.rotation.y = Math.PI / 2;
      this.add(loop);
    }
    const nail = cylinderMesh(0.0025, 0.012, wire, { y: height / 2 + 0.012, z: 0.006 }, { segments: 8 });
    nail.rotation.x = Math.PI / 2;
    this.add(nail);
  }
}

function paintPage(width: number, height: number, now: Date, seed: number, accent: string): THREE.CanvasTexture {
  const W = Math.round(width * PX_PER_M);
  const H = Math.round(height * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#f7f3ea';
  ctx.fillRect(0, 0, W, H);

  // The picture: a seeded landscape, sky, sun, three ranges of hills.
  const random = seededRandom(seed);
  const pad = W * 0.06;
  const picH = H * 0.46;
  const px = pad;
  const py = pad * 1.2;
  const pw = W - 2 * pad;
  const ph = picH - py;
  const hue = Math.floor(random() * 360);
  const sky = ctx.createLinearGradient(0, py, 0, py + ph);
  sky.addColorStop(0, `hsl(${hue}, 55%, 72%)`);
  sky.addColorStop(1, `hsl(${(hue + 40) % 360}, 65%, 88%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(px, py, pw, ph);
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  ctx.fillStyle = `hsl(${(hue + 30) % 360}, 90%, 92%)`;
  ctx.beginPath();
  ctx.arc(px + pw * (0.2 + random() * 0.6), py + ph * (0.25 + random() * 0.2), ph * 0.12, 0, Math.PI * 2);
  ctx.fill();
  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = `hsl(${(hue + 150 + layer * 12) % 360}, ${35 + layer * 10}%, ${58 - layer * 14}%)`;
    ctx.beginPath();
    const base = py + ph * (0.5 + layer * 0.17);
    ctx.moveTo(px, py + ph);
    const phase = random() * 6;
    for (let x = 0; x <= pw; x += pw / 40) ctx.lineTo(px + x, base - Math.sin(x / pw * (3 + layer) + phase) * ph * 0.1 - random() * ph * 0.02);
    ctx.lineTo(px + pw, py + ph);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // The month and the year.
  const month = now.getMonth();
  const year = now.getFullYear();
  ctx.fillStyle = '#23201c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(H * 0.05)}px ${FONT}`;
  ctx.fillText(`${MONTHS[month]!.toUpperCase()}  ${year}`, W / 2, picH + H * 0.055);

  // The grid: weekday initials, then the days, Monday first.
  const gridTop = picH + H * 0.11;
  const cellW = (W - 2 * pad) / 7;
  const rowsH = H - gridTop - pad;
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((first + days) / 7);
  const cellH = rowsH / (weeks + 1);
  ctx.font = `bold ${Math.round(cellH * 0.42)}px ${FONT}`;
  WEEKDAYS.forEach((d, i) => {
    ctx.fillStyle = i === 6 ? accent : '#6b655c';
    ctx.fillText(d, pad + (i + 0.5) * cellW, gridTop + cellH / 2);
  });
  ctx.strokeStyle = '#d8d1c3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, gridTop + cellH * 0.95);
  ctx.lineTo(W - pad, gridTop + cellH * 0.95);
  ctx.stroke();
  ctx.font = `${Math.round(cellH * 0.46)}px ${FONT}`;
  for (let day = 1; day <= days; day++) {
    const slot = first + day - 1;
    const cx = pad + ((slot % 7) + 0.5) * cellW;
    const cy = gridTop + (Math.floor(slot / 7) + 1.5) * cellH;
    ctx.fillStyle = slot % 7 === 6 ? accent : '#23201c';
    ctx.fillText(String(day), cx, cy);
    if (day === now.getDate()) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, cellH * 0.06);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(cellW, cellH) * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return toTexture(canvas, 4);
}
