import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { part } from '../props/Prop';
import { paint } from '../materials/palette';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { snowPaint } from '../street/snowCover';

/** A panel of the fence: its width, the boards' heights, the feet. */
const PANEL = { width: 2, low: 0.25, high: 0.95, board: 0.2, post: 1.15 };

/**
 * The resurfacing works closing the walked stretch of Linden Avenue at both ends (`LINDEN_PLAN.ends`): a line of
 * red-and-white barrier boards on their concrete feet right across the avenue, facade to facade, with the works'
 * sign in the middle (WORKS AHEAD, the avenue's resurfacing). Solid: they are where the player turns back. Zone-local
 * metres; each fence's line runs along z at x ±`at`.
 */
export class WorksFences extends THREE.Group implements Furniture {
  readonly colliders: THREE.Box3[] = [];

  constructor(at: number, z0: number, z1: number) {
    super();
    this.name = 'WorksFences';
    const boards = new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.7 });
    const posts = paint(0xd8d4cc, 0.6);
    const feet = snowPaint(0x8a8680, 0.95);
    const sign = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 });
    for (const x of [-at, at]) {
      const count = Math.ceil((z1 - z0) / PANEL.width);
      const width = (z1 - z0) / count;
      for (let i = 0; i < count; i++) {
        const z = z0 + width * (i + 0.5);
        for (const y of [PANEL.low, PANEL.high]) part(this, 0.03, PANEL.board, width - 0.12, boards, { x, y, z });
        for (const end of [-1, 1]) {
          const pz = z + end * (width / 2 - 0.05);
          part(this, 0.05, PANEL.post, 0.05, posts, { x, y: PANEL.post / 2, z: pz });
          part(this, 0.34, 0.1, 0.16, feet, { x, y: 0.05, z: pz });
        }
      }
      // The works' sign over the middle panel, facing the walked stretch.
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), sign);
      face.position.set(x - Math.sign(x) * 0.03, 1.55, 0);
      face.rotation.y = -Math.sign(x) * Math.PI / 2;
      face.castShadow = true;
      this.add(face);
      part(this, 0.05, 1.3, 0.05, posts, { x: x + Math.sign(x) * 0.02, y: 1.3 / 2, z: 0 });
      this.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.2, 0, z0), new THREE.Vector3(x + 0.2, 2, z1)));
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }
}

/** The boards' paint: red and white bands on the slant. */
function stripes(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 32);
  ctx.fillStyle = '#f2efe8';
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = '#c0281e';
  for (let x = -32; x < 256; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x + 24, 32);
    ctx.lineTo(x + 48, 0);
    ctx.lineTo(x + 24, 0);
    ctx.fill();
  }
  return toTexture(canvas);
}

/** The works' sign: WORKS AHEAD, the avenue's resurfacing, the council's apology. */
function signTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(360, 248);
  ctx.fillStyle = '#f2c624';
  ctx.fillRect(0, 0, 360, 248);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 344, 232);
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 50px system-ui, sans-serif';
  ctx.fillText('WORKS AHEAD', 180, 82, 320);
  ctx.font = '26px system-ui, sans-serif';
  ctx.fillText('Linden Avenue resurfacing', 180, 140, 320);
  ctx.fillText('No way through', 180, 180, 320);
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('The council apologises', 180, 216, 320);
  return toTexture(canvas);
}
