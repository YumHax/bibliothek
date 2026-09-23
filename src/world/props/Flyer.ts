import * as THREE from 'three';
import { createCanvas, fitFontSize, seededRandom, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { Prop } from './Prop';

/** `paper`: a pinned-up A3 poster, a little askew; `cloth`: a hemmed banner slung on eyelets. */
export type FlyerStyle = 'paper' | 'cloth';

export interface FlyerOptions {
  style?: FlyerStyle;
  /** Big text. */
  title?: string;
  /** Smaller lines under the title. */
  lines?: string[];
  width?: number;
  height?: number;
  /** Colours: the paper (or the banner's lettering), the ink, the header block (or the banner's cloth). */
  paper?: number;
  ink?: number;
  accent?: number;
  /** Rotation about the wall normal, radians; default a slight random tilt for paper, none for cloth. */
  tilt?: number;
  seed?: number;
}

const PX_PER_M = 1000;

/**
 * Words on a wall: the posters and the banner of a hall, a shop, a fair. Painted on a canvas; a
 * paper flyer gets four drawing pins and a tilt, a cloth banner gets eyelets and hem stripes.
 * Wall-hung: origin at the centre, on the wall, +z into the room. Decoration: never collides.
 */
export class Flyer extends Prop {
  constructor(options: FlyerOptions = {}) {
    super();
    const style = options.style ?? 'paper';
    this.name = `Flyer:${style}`;
    const width = options.width ?? (style === 'paper' ? 0.3 : 2.4);
    const height = options.height ?? (style === 'paper' ? 0.42 : 0.5);
    const random = seededRandom((options.seed ?? 1) * 40503);
    const colours = {
      paper: options.paper ?? (style === 'paper' ? 0xf1e9d6 : 0xf3e7c8),
      ink: options.ink ?? 0x2a2420,
      accent: options.accent ?? (style === 'paper' ? 0xc8443a : 0x6b2f2a),
    };
    const text = { title: options.title ?? 'FLEA MARKET', lines: options.lines ?? [] };
    const map = style === 'paper' ? paintPaper(width, height, text, colours, random) : paintCloth(width, height, text, colours);
    const material = new THREE.MeshStandardMaterial({ map, roughness: 0.95, transparent: style === 'paper', alphaTest: 0.5 });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    sheet.position.z = 0.004;
    sheet.rotation.z = options.tilt ?? (style === 'paper' ? (random() - 0.5) * 0.09 : 0);
    sheet.castShadow = false;
    sheet.receiveShadow = true;
    this.add(sheet);
  }
}

interface Text {
  title: string;
  lines: string[];
}
interface Colours {
  paper: number;
  ink: number;
  accent: number;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Aged paper, a coloured header block carrying the title, the lines below in ink, a pin in each corner, a torn corner. */
function paintPaper(wM: number, hM: number, text: Text, colours: Colours, random: () => number): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = hex(colours.paper);
  ctx.fillRect(0, 0, W, H);
  // Yellowing towards the edges and a few foxing spots.
  const age = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.9);
  age.addColorStop(0, 'rgba(120,90,40,0)');
  age.addColorStop(1, 'rgba(120,90,40,0.18)');
  ctx.fillStyle = age;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = `rgba(110,80,40,${0.05 + random() * 0.1})`;
    ctx.beginPath();
    ctx.arc(random() * W, random() * H, 3 + random() * 12, 0, Math.PI * 2);
    ctx.fill();
  }
  // Header block and title.
  const headH = H * 0.3;
  ctx.fillStyle = hex(colours.accent);
  ctx.fillRect(W * 0.05, H * 0.06, W * 0.9, headH);
  ctx.fillStyle = hex(colours.paper);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFontSize(ctx, text.title, W * 0.82, headH * 0.5, 30, `Impact, "Arial Narrow", ${FONT}`, '900');
  ctx.fillText(text.title, W / 2, H * 0.06 + headH / 2);
  // Lines, then a rule and a barcode-like row of dashes as a footer.
  ctx.fillStyle = hex(colours.ink);
  const lineH = (H * 0.5) / Math.max(3, text.lines.length + 1);
  text.lines.forEach((line, i) => {
    fitFontSize(ctx, line, W * 0.84, lineH * 0.6, 24, FONT, i === 0 ? 'bold' : 'normal');
    ctx.fillText(line, W / 2, H * 0.06 + headH + lineH * (i + 0.9));
  });
  ctx.fillRect(W * 0.1, H * 0.9, W * 0.8, 3);
  // A torn-off corner: cut through the alpha.
  const corner = Math.floor(random() * 4);
  const cx = corner % 2 ? W : 0;
  const cy = corner < 2 ? 0 : H;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + (cx ? -1 : 1) * W * (0.06 + random() * 0.08), cy);
  ctx.lineTo(cx + (cx ? -1 : 1) * W * 0.02, cy + (cy ? -1 : 1) * H * 0.04);
  ctx.lineTo(cx, cy + (cy ? -1 : 1) * H * (0.04 + random() * 0.06));
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  // Drawing pins in the corners (three: the torn corner has lost its pin).
  for (let i = 0; i < 4; i++) {
    if (i === corner) continue;
    const px = i % 2 ? W - W * 0.06 : W * 0.06;
    const py = i < 2 ? H * 0.045 : H - H * 0.045;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(px + 2, py + 3, W * 0.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ['#c83a3a', '#2f6b8f', '#e6a83a'][i % 3]!;
    ctx.beginPath();
    ctx.arc(px, py, W * 0.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(px - W * 0.006, py - W * 0.006, W * 0.006, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas, 4);
}

/** A cloth banner: the accent colour, hem stripes top and bottom, the title big in the paper colour, eyelets along the top. */
function paintCloth(wM: number, hM: number, text: Text, colours: Colours): THREE.Texture {
  const W = Math.round(wM * PX_PER_M * 0.6);
  const H = Math.round(hM * PX_PER_M * 0.6);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = hex(colours.accent);
  ctx.fillRect(0, 0, W, H);
  // Weave: fine alternating lines, barely there.
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = hex(colours.paper);
  const hem = H * 0.06;
  ctx.fillRect(0, hem, W, hem * 0.5);
  ctx.fillRect(0, H - hem * 1.5, W, hem * 0.5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const subtitle = text.lines[0];
  const titleH = subtitle ? H * 0.42 : H * 0.55;
  fitFontSize(ctx, text.title, W * 0.9, titleH, 30, `Impact, "Arial Narrow", ${FONT}`, '900');
  ctx.fillText(text.title, W / 2, subtitle ? H * 0.42 : H / 2);
  if (subtitle) {
    fitFontSize(ctx, subtitle, W * 0.8, H * 0.16, 20, FONT, 'bold');
    ctx.fillText(subtitle, W / 2, H * 0.75);
  }
  // Eyelets along the top hem.
  ctx.fillStyle = '#8a8a86';
  const count = Math.max(2, Math.round(wM / 0.4));
  for (let i = 0; i < count; i++) {
    const x = W * 0.04 + (i / (count - 1)) * W * 0.92;
    ctx.beginPath();
    ctx.arc(x, hem * 0.5, hem * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas, 4);
}
