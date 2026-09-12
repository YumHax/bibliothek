import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';

export interface LaundryBasketOptions {
  /** Radius at the rim and height to the rim. Default 0.19 x 0.55. */
  radius?: number;
  height?: number;
  /** A sleeve peeking out from under the lid. Default true. */
  overflowing?: boolean;
}

const SEGMENTS = 24;
const WICKER = 0xb98f5c;
const WICKER_DARK = 0x8a6438;

/**
 * A round wicker laundry basket with a flat lid and a wooden knob, the weave painted on a
 * canvas wrapped round it; a shirt sleeve caught under the lid if it is `overflowing`. Floor
 * furniture: base at the local origin. Collides over its square.
 */
export class LaundryBasket extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: LaundryBasketOptions = {}) {
    super();
    this.name = 'LaundryBasket';
    const r = options.radius ?? 0.19;
    const h = options.height ?? 0.55;

    const weave = new THREE.MeshStandardMaterial({ map: paintWeave(), roughness: 0.9 });
    weave.map!.wrapS = THREE.RepeatWrapping;
    weave.map!.repeat.set(6, 1);
    const body = cylinderMesh(r, h, weave, { y: h / 2 }, { radiusBottom: r * 0.88, segments: SEGMENTS });
    this.add(body);
    // Braided rim and foot rings, a touch wider than the body.
    const trim = matte(WICKER_DARK, 0.9);
    this.add(cylinderMesh(r + 0.008, 0.03, trim, { y: h - 0.015 }, { segments: SEGMENTS }));
    this.add(cylinderMesh(r * 0.88 + 0.006, 0.02, trim, { y: 0.01 }, { radiusBottom: r * 0.88, segments: SEGMENTS }));
    // Lid, sitting a little askew on the wash that did not quite fit.
    const lid = cylinderMesh(r + 0.012, 0.025, weave, { y: h + 0.02 }, { segments: SEGMENTS });
    lid.rotation.z = 0.03;
    this.add(lid);
    this.add(cylinderMesh(0.012, 0.03, matte(0x6b4a2b, 0.6), { y: h + 0.045 }, { radiusBottom: 0.018, segments: 10 }));
    // Two rope handles.
    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 8, 14, Math.PI), trim);
      handle.position.set(side * (r + 0.004), h - 0.09, 0);
      // The torus lies in XY; turned into the tangent plane so the loop arches up along the side.
      handle.rotation.y = side * (Math.PI / 2);
      handle.castShadow = true;
      this.add(handle);
    }
    if (options.overflowing ?? true) {
      const sleeve = part(this, 0.09, 0.02, 0.22, matte(0xdfe6ea, 0.95), { x: r * 0.5, y: h + 0.002, z: r * 0.75 });
      sleeve.rotation.y = -0.6;
      sleeve.castShadow = false;
    }

    this.footprint = new THREE.Box3(new THREE.Vector3(-r, 0, -r), new THREE.Vector3(r, h, r));
  }
}

/** One repeat of the weave: staggered horizontal strands over darker verticals, warm rattan tones. */
function paintWeave(): THREE.CanvasTexture {
  const W = 128;
  const H = 512;
  const [canvas, ctx] = createCanvas(W, H);
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex(WICKER_DARK);
  ctx.fillRect(0, 0, W, H);
  const strand = 14;
  const cols = 4;
  const colW = W / cols;
  for (let row = 0; row * strand < H; row++) {
    const y = row * strand;
    for (let c = 0; c < cols; c++) {
      // Over one, under one: the strand shows on alternate columns each row.
      if ((row + c) % 2) continue;
      const shade = 0.9 + ((row * 7 + c * 13) % 5) * 0.04;
      const colour = new THREE.Color(WICKER).multiplyScalar(shade);
      ctx.fillStyle = `#${colour.getHexString()}`;
      ctx.fillRect(c * colW - 1, y + 1, colW + 2, strand - 3);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(c * colW - 1, y + 1, colW + 2, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(c * colW - 1, y + strand - 4, colW + 2, 2);
    }
  }
  return toTexture(canvas, 4);
}
