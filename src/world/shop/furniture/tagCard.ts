import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { part } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { WALL, decal } from '../../surface/layers';
import { cutOut } from '../common/cutout';
import { HAND, hex, setLines } from '../common/lettering';
import { lcg } from '@/random';

const PX_PER_M = 1600;
const STRING = paint(0xd8cbb0, 0.9);

interface TagCardOptions {
  lines: readonly string[];
  width?: number;
  height?: number;
  /** The band across its top (the shop's colour), or red for a SOLD. */
  band?: number;
  ink?: number;
  seed?: number;
}

/**
 * A shopkeeper's card written by hand (SOLD, RESERVED – Mr. Dupont) as a mesh facing +z, its origin at its middle:
 * a thin card with the writing on its face, a coloured band across its top. What it hangs on hangs it (`hangTag`).
 */
export function tagCard(options: TagCardOptions): THREE.Group {
  const w = options.width ?? 0.14;
  const h = options.height ?? 0.09;
  const card = new THREE.Group();
  part(card, w, h, 0.002, paint(0xf4eedc, 0.9), { z: 0.001 });
  const face = decal(w, h, cutOut(paintCard(w, h, options)), WALL.print);
  face.position.z += 0.002;
  card.add(face);
  card.traverse((o) => (o.castShadow = false));
  return card;
}

/** A card hung on a string from a point (`at`, in `parent`'s frame), swinging a little askew, facing `yaw`. */
export function hangTag(parent: THREE.Object3D, at: THREE.Vector3, yaw: number, options: TagCardOptions & { drop?: number }): void {
  const drop = options.drop ?? 0.08;
  const h = options.height ?? 0.09;
  const holder = new THREE.Group();
  holder.position.copy(at);
  holder.rotation.set(0, yaw, (lcg(options.seed ?? 1)() - 0.5) * 0.2);
  part(holder, 0.002, drop, 0.002, STRING, { y: -drop / 2 });
  const card = tagCard(options);
  card.position.y = -drop - h / 2;
  holder.add(card);
  parent.add(holder);
}

function paintCard(wM: number, hM: number, options: TagCardOptions): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const random = lcg((options.seed ?? 1) * 131 + 7);
  ctx.fillStyle = '#f4eedc';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = hex(options.band ?? 0x7a5234);
  ctx.fillRect(0, 0, W, H * 0.16);
  // The hole it hangs by.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.08, H * 0.035, 0, Math.PI * 2);
  ctx.fill();
  const pad = W * 0.07;
  setLines(ctx, { lines: options.lines, x: pad, y: H * 0.2, w: W - pad * 2, h: H * 0.74, family: HAND, color: hex(options.ink ?? 0x1c2a4a), weight: '700', firstScale: 1.5, wobble: 0.08, random });
  return toTexture(canvas);
}
