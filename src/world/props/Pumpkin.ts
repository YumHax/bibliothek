import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, seededRandom } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { markShared, matte, Prop } from './Prop';

export interface PumpkinOptions {
  /** Radius, metres. Default 0.14 (a carving pumpkin); a small one 0.09. */
  radius?: number;
  /** Carved into a lantern with a candle in it (flickering); false: a plain pumpkin. Default true. */
  carved?: boolean;
  /** Which face it was carved with, and how the flame flickers. */
  seed?: number;
  /** Lifts it off its placement (standing on a sill or a table), metres. */
  lift?: number;
}

const SKIN = markShared(new THREE.MeshStandardMaterial({ color: 0xe0701c, roughness: 0.55 }));
const STEM = markShared(matte(0x5a6a2a, 0.8));
const RIBS = 10;
const RIB_DEPTH = 0.045;

/**
 * A pumpkin for Halloween, standing on its base at local y = 0, face towards +z: a squat ribbed
 * sphere with a stem, carved (by default) into a jack-o'-lantern whose eyes and grin glow with a
 * candle's flicker. No light: the carving is a glowing canvas over the front of the skin, so a
 * dozen of them cost nothing. Decoration: never collides, casts nothing.
 */
export class Pumpkin extends Prop implements Updatable {
  private readonly glow: THREE.MeshBasicMaterial | null = null;
  private readonly random: () => number;
  private clock = 0;
  private flame = 1;

  constructor(options: PumpkinOptions = {}) {
    super();
    this.name = 'Pumpkin';
    const radius = options.radius ?? 0.14;
    const squash = 0.78;
    this.random = seededRandom(options.seed ?? 31);
    const lift = options.lift ?? 0;

    const body = new THREE.Mesh(ribbed(new THREE.SphereGeometry(radius, 28, 16), radius), SKIN);
    body.scale.y = squash;
    body.position.y = lift + radius * squash;
    body.castShadow = false;
    this.add(body);
    this.add(cylinderMesh(radius * 0.09, radius * 0.35, STEM, { y: lift + radius * squash * 2 + radius * 0.1 }, { radiusBottom: radius * 0.13, segments: 7 }));

    if (options.carved ?? true) {
      const face = new THREE.SphereGeometry(radius * 1.004, 20, 12, Math.PI / 2 - 0.75, 1.5, Math.PI * 0.26, Math.PI * 0.5);
      this.glow = new THREE.MeshBasicMaterial({ map: carving(options.seed ?? 31), transparent: true, toneMapped: false, depthWrite: false });
      const mask = new THREE.Mesh(ribbed(face, radius), this.glow);
      mask.scale.y = squash;
      mask.position.y = body.position.y;
      this.add(mask);
    }
  }

  update(dt: number): void {
    if (!this.glow) return;
    this.clock += dt;
    if (this.clock < 0.07) return;
    this.clock = 0;
    // A candle: mostly steady, now and then a dip, easing towards each new target.
    const target = this.random() < 0.08 ? 0.55 + this.random() * 0.2 : 0.85 + this.random() * 0.2;
    this.flame += (target - this.flame) * 0.5;
    this.glow.color.setScalar(this.flame);
  }
}

/** Presses the ribs into a sphere's vertices (the same for the skin and the carving laid over it). */
function ribbed(geometry: THREE.SphereGeometry, radius: number): THREE.SphereGeometry {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const angle = Math.atan2(v.z, v.x);
    const around = Math.sqrt(v.x * v.x + v.z * v.z) / radius;
    const k = 1 - RIB_DEPTH * Math.pow(Math.abs(Math.sin((angle * RIBS) / 2)), 3) * around;
    pos.setXYZ(i, v.x * k, v.y * (1 - RIB_DEPTH * 0.3), v.z * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** The carved face: two triangle eyes, a triangle nose and a jagged grin, candle-yellow on nothing. */
function carving(seed: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 192);
  const random = seededRandom(seed);
  const W = canvas.width;
  const H = canvas.height;
  const gradient = ctx.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, W * 0.5);
  gradient.addColorStop(0, '#fff2a0');
  gradient.addColorStop(1, '#ff9a20');
  ctx.fillStyle = gradient;
  const tri = (cx: number, cy: number, w: number, h: number, up: boolean) => {
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, up ? cy + h / 2 : cy - h / 2);
    ctx.lineTo(cx + w / 2, up ? cy + h / 2 : cy - h / 2);
    ctx.lineTo(cx, up ? cy - h / 2 : cy + h / 2);
    ctx.closePath();
    ctx.fill();
  };
  const eyeW = 36 + random() * 14;
  const angry = random() < 0.5;
  tri(W * 0.34, H * 0.33, eyeW, 34, !angry);
  tri(W * 0.66, H * 0.33, eyeW, 34, !angry);
  tri(W / 2, H * 0.52, 20, 18, true);
  // The grin: a crescent with teeth notched into it.
  ctx.beginPath();
  const teeth = 3 + Math.floor(random() * 3);
  const left = W * 0.2;
  const right = W * 0.8;
  ctx.moveTo(left, H * 0.64);
  for (let i = 1; i <= teeth * 2; i++) {
    const x = left + ((right - left) * i) / (teeth * 2);
    ctx.lineTo(x, H * 0.64 + (i % 2 ? 12 : 0));
  }
  ctx.quadraticCurveTo(W / 2, H * 1.02, left, H * 0.64);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
