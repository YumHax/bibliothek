import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { markShared } from '../props/Prop';
import { drawText } from './games/ArcadeGame';

/** The polished steel of the physical machines' rails, legs, posts and plunger rods. */
export const CHROME = markShared(new THREE.MeshStandardMaterial({ color: 0xc4c7cc, metalness: 0.75, roughness: 0.25 }));

export interface MarqueeStyle {
  /** Canvas size in pixels. Default 512 x 96. */
  width?: number;
  height?: number;
  /** The gradient's colours, evenly spaced, left to right (`diagonal`: corner to corner). */
  stops: readonly string[];
  diagonal?: boolean;
  /** The title's colour and size (pixels), and its baseline's middle (default just under the centre). */
  ink: string;
  size: number;
  textY?: number;
  /** Paint between the gradient and the title: the alley's notches, the claw's starburst, a cabinet's bands. */
  decorate?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  /** Default 4. */
  anisotropy?: number;
}

/** A machine's lit title strip: `title` in pixel type over a gradient. */
export function paintMarquee(title: string, style: MarqueeStyle): THREE.CanvasTexture {
  const { width = 512, height = 96 } = style;
  const [canvas, ctx] = createCanvas(width, height);
  const gradient = style.diagonal ? ctx.createLinearGradient(0, 0, width, height) : ctx.createLinearGradient(0, 0, width, 0);
  style.stops.forEach((stop, i) => gradient.addColorStop(style.stops.length > 1 ? i / (style.stops.length - 1) : 0, stop));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  style.decorate?.(ctx, width, height);
  drawText(ctx, title, width / 2, style.textY ?? height / 2 + 2, style.size, style.ink);
  return toTexture(canvas, style.anisotropy ?? 4);
}

/** A machine's lit display: a canvas to paint and the plane showing it (unlit, so it reads as lit). */
export interface MachineDisplay {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly material: THREE.MeshBasicMaterial;
  readonly mesh: THREE.Mesh;
}

/** A `pixels`-sized canvas on a `size`-metre plane facing +z; `color` dims it (a hover brightens it back). */
export function displayScreen(pixels: [width: number, height: number], size: [width: number, height: number], { anisotropy = 1, color }: { anisotropy?: number; color?: number } = {}): MachineDisplay {
  const [canvas, ctx] = createCanvas(...pixels);
  const texture = toTexture(canvas, anisotropy);
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, ...(color !== undefined ? { color } : {}) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), material);
  return { canvas, ctx, texture, material, mesh };
}

/**
 * The note taped over a machine's glass on a day it is out of order: "OUT OF ORDER" in marker on
 * a sheet of paper, `width` metres across, a little askew. Hidden until the day says so (the
 * machine's `MachineRun` shows it); the caller puts it on the glass, a few mm proud.
 */
export function outOfOrderNote(width = 0.3): THREE.Mesh {
  const note = new THREE.Mesh(new THREE.PlaneGeometry(width, (width * 16) / 30), new THREE.MeshStandardMaterial({ map: paintNote(), roughness: 0.8 }));
  note.rotation.z = -0.06;
  note.visible = false;
  return note;
}

function paintNote(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(300, 160);
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(0, 0, 300, 160);
  ctx.fillStyle = 'rgba(200,190,160,0.7)';
  for (const [x, y] of [[0, 0], [270, 0], [0, 138], [270, 138]] as const) ctx.fillRect(x, y, 30, 22);
  ctx.save();
  ctx.translate(150, 70);
  ctx.rotate(-0.04);
  ctx.fillStyle = '#c8261e';
  ctx.font = 'bold 42px "Comic Sans MS", "Marker Felt", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OUT OF', 0, -18);
  ctx.fillText('ORDER', 0, 24);
  ctx.restore();
  ctx.fillStyle = '#333';
  ctx.font = '16px "Comic Sans MS", "Marker Felt", cursive';
  ctx.textAlign = 'center';
  ctx.fillText('sorry — the mgmt', 150, 140);
  return toTexture(canvas, 4);
}
