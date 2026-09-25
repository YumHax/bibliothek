import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { Prop } from './Prop';
import { fabric } from '@/world/materials/finishes';

export interface KilimRugOptions {
  /** Size of the woven part, along local x and z (the fringes come on top along x). Default 1.55 x 0.7. */
  width?: number;
  depth?: number;
  /** Madder red field, indigo, ochre and ivory by default: [field, dark, light, accent]. */
  colors?: [number, number, number, number];
  seed?: number;
}

const THICKNESS = 0.008;
const FRINGE = 0.06;
const PX_PER_M = 700;

/**
 * A flat-woven kilim: thinner than a pile rug, a row of stepped lozenges down the middle, hooked
 * borders, bands of colour at the ends and a cotton fringe past them, a little faded. Floor
 * placement, long side along local x. Decoration: never collides.
 */
export class KilimRug extends Prop {
  constructor(options: KilimRugOptions = {}) {
    super();
    this.name = 'KilimRug';
    const width = options.width ?? 1.55;
    const depth = options.depth ?? 0.7;
    const colors = options.colors ?? [0xa6392e, 0x243a5e, 0xd9a441, 0xeee4cc];
    const random = seededRandom((options.seed ?? 11) * 48271);

    const top = fabric({ map: paintKilim(width, depth, colors, random), roughness: 1, sheenTint: 0x8a8580 });
    const edge = fabric({ color: new THREE.Color(colors[0]).multiplyScalar(0.6), roughness: 1 });
    // BoxGeometry material order: +x, -x, +y (top), -y, +z, -z.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, THICKNESS, depth), [edge, edge, top, edge, edge, edge]);
    slab.position.y = THICKNESS / 2;
    slab.receiveShadow = true;
    this.add(slab);

    const tassels = new THREE.MeshStandardMaterial({ map: paintFringe(depth, random), roughness: 1, alphaTest: 0.5, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      const fringe = new THREE.Mesh(new THREE.PlaneGeometry(FRINGE, depth), tassels);
      fringe.rotation.set(-Math.PI / 2, 0, sx > 0 ? 0 : Math.PI);
      fringe.position.set(sx * (width / 2 + FRINGE / 2 - 0.004), 0.002, 0);
      fringe.receiveShadow = true;
      this.add(fringe);
    }
  }
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Bands at the ends, a hooked border, a chain of stepped diamonds down the middle, weft streaks and fading. */
function paintKilim(wM: number, dM: number, [field, dark, light, accent]: [number, number, number, number], random: () => number): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(dM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = hex(field);
  ctx.fillRect(0, 0, W, H);

  // End bands: stripes of the four colours.
  const band = W * 0.02;
  [dark, accent, light, dark].forEach((c, i) => {
    ctx.fillStyle = hex(c);
    ctx.fillRect(i * band, 0, band, H);
    ctx.fillRect(W - (i + 1) * band, 0, band, H);
  });
  // Border along the long sides: a dark strip with light triangles (a woven "running dog").
  const border = H * 0.12;
  const inset = band * 4;
  ctx.fillStyle = hex(dark);
  ctx.fillRect(inset, 0, W - 2 * inset, border);
  ctx.fillRect(inset, H - border, W - 2 * inset, border);
  ctx.fillStyle = hex(light);
  const tooth = border * 0.9;
  for (let x = inset; x < W - inset - tooth; x += tooth) {
    for (const [y0, dir] of [[border * 0.15, 1], [H - border * 0.15, -1]] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + tooth / 2, y0 + dir * border * 0.7);
      ctx.lineTo(x + tooth, y0);
      ctx.closePath();
      ctx.fill();
    }
  }
  // The stepped lozenges down the middle, each a diamond of stairs with a smaller one inside.
  const inner = H - 2 * border;
  const size = inner * 0.78;
  const count = Math.max(2, Math.floor((W - 2 * inset) / (size * 1.15)));
  const pitch = (W - 2 * inset) / count;
  const step = size / 10;
  const diamond = (cx: number, cy: number, r: number, colour: number): void => {
    ctx.fillStyle = hex(colour);
    for (let i = 0; i * step < r; i++) {
      const half = r - i * step;
      ctx.fillRect(cx - half, cy - (i + 1) * step, half * 2, step);
      ctx.fillRect(cx - half, cy + i * step, half * 2, step);
    }
  };
  for (let i = 0; i < count; i++) {
    const cx = inset + pitch * (i + 0.5);
    const cy = H / 2;
    diamond(cx, cy, size / 2, i % 2 ? dark : light);
    diamond(cx, cy, size * 0.3, accent);
    diamond(cx, cy, size * 0.12, field);
    // Little hooks between the lozenges.
    if (i < count - 1) diamond(cx + pitch / 2, cy, size * 0.1, accent);
  }
  // Weft streaks (abrash) and sun fading.
  for (let y = 0; y < H; y += 2) {
    ctx.fillStyle = `rgba(${random() < 0.5 ? '0,0,0' : '255,240,220'},${(random() * 0.07).toFixed(3)})`;
    ctx.fillRect(0, y, W, 2);
  }
  const fade = ctx.createLinearGradient(0, 0, W, 0);
  fade.addColorStop(0, 'rgba(255,245,230,0.05)');
  fade.addColorStop(1, 'rgba(255,245,230,0.16)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);
  return toTexture(canvas, 4);
}

/** Cotton warp ends knotted in groups: ivory strands on transparent. */
function paintFringe(dM: number, random: () => number): THREE.Texture {
  const W = 48;
  const H = Math.round(dM * PX_PER_M * 0.5);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.strokeStyle = '#ece3cf';
  ctx.lineWidth = 1.2;
  for (let y = 2; y < H - 2; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W * (0.7 + random() * 0.3), y + (random() - 0.5) * 3);
    ctx.stroke();
  }
  return toTexture(canvas, 4);
}
