import * as THREE from 'three';
import { Prop, part } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { createCanvas, seededRandom, toTexture } from '@/graphics/canvas';
import { decal, WALL } from '../../surface/layers';
import { HAND, POSTER, PRINT } from '../common/lettering';

export interface WallCalendarOptions {
  /** Whose calendar it is (a parts supplier's, printed across its picture). */
  supplier?: string;
  /** The month on show. */
  month?: string;
  /** Days ringed or written on, with a word: `[day, note]`. */
  notes?: readonly [day: number, note: string][];
  seed?: number;
}

const W = 0.3;
const H = 0.46;
const PX_PER_M = 900;

/**
 * A supplier's wall calendar hung on a nail: a picture of a gleaming set up top with the supplier's name, the month's
 * grid under it with a few days ringed and scribbled on (collections, a delivery), its pages curling. Wall-hung: origin
 * at its centre on the wall, +z into the room. Decoration: never collides.
 */
export class WallCalendar extends Prop {
  readonly contactShadow = false;

  constructor(options: WallCalendarOptions = {}) {
    super();
    this.name = 'WallCalendar';
    part(this, 0.006, 0.02, 0.012, paint(0x3a3a3c, 0.4), { y: H / 2 + 0.012, z: 0.006 });
    part(this, W, H, 0.004, paint(0xf2eee2, 0.9), { z: 0.002 });
    const face = decal(W, H, new THREE.MeshStandardMaterial({ map: paintCalendar(options), roughness: 0.85 }), WALL.notice);
    face.position.z += 0.004;
    this.add(face);
    this.traverse((o) => (o.castShadow = false));
  }
}

function paintCalendar(options: WallCalendarOptions): THREE.Texture {
  const w = Math.round(W * PX_PER_M);
  const h = Math.round(H * PX_PER_M);
  const [canvas, ctx] = createCanvas(w, h);
  const random = seededRandom(options.seed ?? 5);
  ctx.fillStyle = '#f4f0e4';
  ctx.fillRect(0, 0, w, h);
  // The picture: a set on a sunset.
  const ph = h * 0.46;
  const sky = ctx.createLinearGradient(0, 0, 0, ph);
  sky.addColorStop(0, '#e8783a');
  sky.addColorStop(1, '#5a2a5a');
  ctx.fillStyle = sky;
  ctx.fillRect(w * 0.05, h * 0.03, w * 0.9, ph);
  ctx.fillStyle = '#2a2224';
  ctx.fillRect(w * 0.28, ph * 0.42, w * 0.44, ph * 0.46);
  ctx.fillStyle = '#6ab0d8';
  ctx.fillRect(w * 0.32, ph * 0.48, w * 0.3, ph * 0.3);
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(w * 0.64, ph * 0.52, w * 0.04, w * 0.04);
  ctx.fillStyle = '#f4f0e4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(h * 0.045)}px ${POSTER}`;
  ctx.fillText(options.supplier ?? 'NORD ELECTRONIC SUPPLY', w / 2, h * 0.08);
  // The month and its grid.
  ctx.fillStyle = '#b0302a';
  ctx.font = `800 ${Math.round(h * 0.05)}px ${PRINT}`;
  ctx.fillText(options.month ?? 'OCTOBER', w / 2, h * 0.55);
  const top = h * 0.6;
  const cw = (w * 0.9) / 7;
  const ch = (h * 0.37) / 6;
  ctx.font = `600 ${Math.round(ch * 0.4)}px ${PRINT}`;
  ctx.fillStyle = '#2a2420';
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) => ctx.fillText(d, w * 0.05 + cw * (i + 0.5), top + ch * 0.4));
  const first = 3;
  const notes = new Map(options.notes ?? [[7, 'Kowalski'], [14, 'delivery'], [22, 'ring Hall']]);
  for (let day = 1; day <= 31; day++) {
    const cell = day - 1 + first;
    const x = w * 0.05 + cw * ((cell % 7) + 0.5);
    const y = top + ch * (Math.floor(cell / 7) + 1.3);
    ctx.fillStyle = cell % 7 >= 5 ? '#b0302a' : '#2a2420';
    ctx.font = `600 ${Math.round(ch * 0.42)}px ${PRINT}`;
    ctx.fillText(String(day), x, y);
    const note = notes.get(day);
    if (!note) continue;
    ctx.strokeStyle = '#2a4a9a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, cw * 0.42, ch * 0.4, (random() - 0.5) * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#2a4a9a';
    ctx.font = `600 ${Math.round(ch * 0.28)}px ${HAND}`;
    ctx.fillText(note, x, y + ch * 0.36, cw * 1.6);
  }
  return toTexture(canvas);
}
