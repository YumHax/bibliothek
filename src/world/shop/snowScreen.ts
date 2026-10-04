import * as THREE from 'three';
import { createCanvas, canvasTexture } from '@/graphics/canvas';
import { markShared } from '../props/Prop';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import { random } from '@/random';

const W = 80;
const H = 60;
/** Frames of snow a second: an untuned set flickers, it does not need 60. */
const FPS = 12;
/** How fast the set that has lost its vertical hold rolls, pictures a second. */
const ROLL = 0.55;

/** What a shop's CRT shows: an untuned channel's snow, the test card, colour bars, a picture rolling, or nothing (dark glass). */
export type ScreenLook = 'snow' | 'testCard' | 'bars' | 'rolling' | 'dark';

let screen: { material: THREE.MeshBasicMaterial; texture: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; image: ImageData } | null = null;
const stills = new Map<Exclude<ScreenLook, 'snow' | 'dark'>, THREE.MeshBasicMaterial>();

/**
 * The glass of an untuned CRT: one small noise canvas for the page, shared by every set that shows it (the TV repair
 * shop's wall), unlit so it glows grey-blue. Repainted by a `SnowTicker` placed with the sets.
 */
export function snowScreen(): THREE.MeshBasicMaterial {
  if (!screen) {
    const [canvas, ctx] = createCanvas(W, H);
    const texture = markShared(canvasTexture(canvas, { anisotropy: 'facing', mipmaps: false }));
    texture.magFilter = THREE.NearestFilter;
    const material = markShared(new THREE.MeshBasicMaterial({ map: texture, color: 0xc8d4e0 }));
    screen = { material, texture, ctx, image: ctx.createImageData(W, H) };
    paintSnow();
  }
  return screen.material;
}

/**
 * The glass of a set showing something else than snow, shared for the page like the snow: the test card (a grid,
 * the circle, the bars and the shop's caption), colour bars, or a picture that has lost its vertical hold (its frame
 * bar rolling up the screen, moved by the `SnowTicker`). Unlit, a little dimmer than white so it glows without glare.
 */
export function stillScreen(look: Exclude<ScreenLook, 'snow' | 'dark'>): THREE.MeshBasicMaterial {
  let material = stills.get(look);
  if (!material) {
    const [canvas, ctx] = createCanvas(look === 'rolling' ? W * 2 : 160, look === 'rolling' ? H * 2 : 120);
    if (look === 'testCard') paintTestCard(ctx, 160, 120);
    else if (look === 'bars') paintBars(ctx, 160, 120);
    else paintPicture(ctx, W * 2, H * 2);
    const texture = markShared(canvasTexture(canvas, { anisotropy: 'facing' }));
    if (look === 'rolling') texture.wrapT = THREE.RepeatWrapping; // convention-ok: the picture rolls vertically only
    material = markShared(new THREE.MeshBasicMaterial({ map: texture, color: look === 'rolling' ? 0xb8c0c8 : 0xd4d4d4 }));
    stills.set(look, material);
  }
  return material;
}

function paintSnow(): void {
  if (!screen) return;
  const { data } = screen.image;
  for (let i = 0; i < W * H; i++) {
    const v = random() * 200 + 40;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v + 12;
    data[i * 4 + 3] = 255;
  }
  screen.ctx.putImageData(screen.image, 0, 0);
  screen.texture.needsUpdate = true;
}

const BARS = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];

/**
 * The test card: a grey grid, the big circle, the colour bars across it, a greyscale step, a caption box. The one
 * TV REPAIR's sets show inside and the set in its window shows the street (`street/shopfronts`' atlas).
 */
export function paintTestCard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#6a6a6a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 12) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, h * 0.44, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, w, h);
  const bw = w / BARS.length;
  BARS.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * bw, h * 0.2, bw + 1, h * 0.3);
  });
  for (let i = 0; i < 6; i++) {
    const v = Math.round((i / 5) * 230);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(w * 0.2 + (i * w * 0.6) / 6, h * 0.52, (w * 0.6) / 6 + 1, h * 0.12);
  }
  ctx.fillStyle = '#101010';
  ctx.fillRect(w * 0.32, h * 0.68, w * 0.36, h * 0.13);
  ctx.fillStyle = '#f0f0f0';
  ctx.font = `700 ${Math.round(h * 0.09)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TV REPAIR', w / 2, h * 0.745);
  ctx.restore();
  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, h * 0.44, 0, Math.PI * 2);
  ctx.stroke();
}

/** Colour bars over the reverse blue, black and white strip under them. */
function paintBars(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const bw = w / BARS.length;
  BARS.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * bw, 0, bw + 1, h * 0.72);
  });
  const under = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
  under.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * bw, h * 0.72, bw + 1, h * 0.08);
  });
  ctx.fillStyle = '#00214c';
  ctx.fillRect(0, h * 0.8, w * 0.18, h * 0.2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(w * 0.18, h * 0.8, w * 0.18, h * 0.2);
  ctx.fillStyle = '#32006a';
  ctx.fillRect(w * 0.36, h * 0.8, w * 0.18, h * 0.2);
  ctx.fillStyle = '#131313';
  ctx.fillRect(w * 0.54, h * 0.8, w * 0.46, h * 0.2);
}

/** A newsreader at a desk on a blue set, and the black frame bar under the picture (what rolls up the screen). */
function paintPicture(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const bar = h * 0.1;
  const g = ctx.createLinearGradient(0, 0, 0, h - bar);
  g.addColorStop(0, '#2a5a9a');
  g.addColorStop(1, '#16335a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h - bar);
  // The desk, the presenter's shoulders and head, the station's globe behind.
  ctx.fillStyle = 'rgba(160,200,240,0.35)';
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.3, h * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a2e2a';
  ctx.beginPath();
  ctx.ellipse(w * 0.42, h * 0.72, w * 0.2, h * 0.2, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#d8a888';
  ctx.beginPath();
  ctx.arc(w * 0.42, h * 0.38, h * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1e18';
  ctx.beginPath();
  ctx.arc(w * 0.42, h * 0.33, h * 0.12, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#6a4a32';
  ctx.fillRect(0, h * 0.72, w, h * 0.28 - bar);
  ctx.fillStyle = '#e8e0c8';
  ctx.fillRect(w * 0.06, h * 0.76, w * 0.3, h * 0.06);
  // Scan lines.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < h - bar; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, h - bar, w, bar);
  ctx.fillStyle = 'rgba(230,230,230,0.5)';
  ctx.fillRect(0, h - bar * 0.55, w, 1);
}

/** The ticker driving the shared snow now, and the seconds the others have ticked since it last did. */
let driver: SnowTicker | null = null;
let driverIdle = 0;
/** Seconds without a tick from the driver before another ticker takes over (its zone unloaded). */
const HANDOVER = 0.5;

/**
 * Repaints the shared snow `FPS` times a second while its zone is active, and rolls the picture of the set that has
 * lost its hold: placed once beside the sets, so the sets themselves stay static (their parts merge into a few draws).
 * Several can tick at once (the TV shop's, the street's fronts in its window's outlook): one drives, the others wait.
 */
export class SnowTicker extends THREE.Object3D implements Furniture, Updatable {
  readonly footprint = new THREE.Box3();
  readonly contactShadow = false;
  private since = 0;

  update(dt: number): void {
    if (driver !== this) {
      driverIdle += dt;
      if (driver && driverIdle < HANDOVER) return;
      driver = this;
    }
    driverIdle = 0;
    const rolling = stills.get('rolling')?.map;
    if (rolling) rolling.offset.y = (rolling.offset.y + dt * ROLL) % 1;
    this.since += dt;
    if (this.since < 1 / FPS) return;
    this.since = 0;
    paintSnow();
  }
}
