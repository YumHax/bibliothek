import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { matte, Prop } from './Prop';

export interface HangingBannerOptions {
  /** Big words across the banner. */
  title?: string;
  /** A smaller line under them. */
  line?: string;
  width?: number;
  height?: number;
  /** How far below the ceiling its top edge hangs. Default 0.35. */
  drop?: number;
  /** Background and lettering colours. */
  color?: number;
  ink?: number;
  accent?: number;
}

const PX_PER_M = 400;

/**
 * A promotional banner hung from the ceiling on two wires, printed the same on both faces
 * (a new game, a high-score night): a stiff vinyl sheet with a pole along the top and one along
 * the bottom. Ceiling placement: origin on the ceiling at the middle of its top edge, the sheet
 * across local x. Decoration: never collides, casts no shadow.
 */
export class HangingBanner extends Prop {
  constructor(options: HangingBannerOptions = {}) {
    super();
    this.name = 'HangingBanner';
    const width = options.width ?? 1.6;
    const height = options.height ?? 0.5;
    const drop = options.drop ?? 0.35;
    const texture = paintBanner(options, width, height);
    const sheet = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 });
    const top = -drop - height / 2;
    // Two sheets back to back, so the lettering reads the right way round from both sides.
    for (const ry of [0, Math.PI]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), sheet);
      face.position.set(0, top, ry ? -0.002 : 0.002);
      face.rotation.y = ry;
      face.castShadow = false;
      this.add(face);
    }
    const pole = matte(0x2a2a30, 0.4);
    for (const y of [-drop, -drop - height]) {
      const bar = cylinderMesh(0.008, width + 0.04, pole, { y }, { segments: 8 });
      bar.rotation.z = Math.PI / 2;
      bar.castShadow = false;
      this.add(bar);
    }
    for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) {
      const wire = cylinderMesh(0.0015, drop, pole, { x, y: -drop / 2 }, { segments: 4 });
      wire.castShadow = false;
      this.add(wire);
    }
  }
}

function paintBanner(options: HangingBannerOptions, width: number, height: number): THREE.Texture {
  const W = Math.round(width * PX_PER_M);
  const H = Math.round(height * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  const hex = (n: number): string => `#${new THREE.Color(n).getHexString()}`;
  ctx.fillStyle = hex(options.color ?? 0x1a0a2e);
  ctx.fillRect(0, 0, W, H);
  // Diagonal speed stripes in the accent at both ends.
  ctx.fillStyle = hex(options.accent ?? 0xff2fa0);
  for (let i = 0; i < 4; i++) {
    for (const [x0, dir] of [[0, 1], [W, -1]] as const) {
      ctx.beginPath();
      ctx.moveTo(x0 + dir * (i * 26), 0);
      ctx.lineTo(x0 + dir * (i * 26 + 14), 0);
      ctx.lineTo(x0 + dir * (i * 26 + 14 - 40), H);
      ctx.lineTo(x0 + dir * (i * 26 - 40), H);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hex(options.ink ?? 0xffe23a);
  ctx.font = `900 ${Math.round(H * 0.42)}px "Arial Black", Impact, sans-serif`;
  ctx.fillText(options.title ?? 'NEW!', W / 2, H * (options.line ? 0.4 : 0.5));
  if (options.line) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(H * 0.16)}px sans-serif`;
    ctx.fillText(options.line, W / 2, H * 0.78);
  }
  return toTexture(canvas, 4);
}
