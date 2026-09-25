import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { Prop, matte } from '../props/Prop';

/** A cord from the hanging point down to a dowel, the flag hanging under the dowel point down. */
const CORD = 0.04;
const FLAG_W = 0.13;
const FLAG_H = 0.17;
/** The sway: a slow swing about the cord, a slower twist. */
const SWING = 0.09;
const SWING_RATE = 1.4;
const TWIST = 0.25;
const TWIST_RATE = 0.6;

/**
 * The wishlist's mark at the market: a small red pennant with a white star, hanging from a stall's
 * pole or riser where a game the player wants is on sale, swinging gently. Show and hide it with
 * `.visible`. Origin at the hanging point; the flag faces +z (the star reads from both sides).
 * Decoration: never collides.
 */
export class WishPennant extends Prop implements Updatable {
  readonly contactShadow = false;
  private readonly swing = new THREE.Group();
  private time: number;

  constructor(seed = 1) {
    super();
    this.name = 'WishPennant';
    this.time = (seed * 1.7) % (Math.PI * 2);
    this.add(this.swing);
    const cord = new THREE.Mesh(new THREE.BoxGeometry(0.003, CORD, 0.003), matte(0xe8e2d4, 0.8));
    cord.position.y = -CORD / 2;
    const dowel = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, FLAG_W + 0.02, 6), matte(0x8a6a44, 0.7));
    dowel.rotation.z = Math.PI / 2;
    dowel.position.y = -CORD;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(FLAG_W, FLAG_H),
      new THREE.MeshStandardMaterial({ map: paintPennant(), roughness: 0.85, side: THREE.DoubleSide, alphaTest: 0.5, transparent: true }),
    );
    flag.position.y = -CORD - 0.004 - FLAG_H / 2;
    this.swing.add(cord, dowel, flag);
    this.traverse((obj) => {
      obj.castShadow = false;
    });
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.time += dt;
    this.swing.rotation.z = Math.sin(this.time * SWING_RATE) * SWING;
    this.swing.rotation.y = Math.sin(this.time * TWIST_RATE) * TWIST;
  }
}

/** A red triangle pointing down (transparent round it), a hem along the top, a white star in its upper middle. */
function paintPennant(): THREE.Texture {
  const W = 130;
  const H = 170;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#c8342a';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W / 2, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 64px system-ui, sans-serif`;
  ctx.fillText('★', W / 2, H * 0.3);
  return toTexture(canvas, 2);
}
