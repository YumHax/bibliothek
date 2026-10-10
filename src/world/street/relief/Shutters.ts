import * as THREE from 'three';
import { bareMetal } from '../metals';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import type { ActivityAware } from '../../zone/lifecycle';
import type { DayNight } from '../../props/DayNight';
import type { PaintedFront } from '../Buildings';
import { isShopOpen } from '../shops/shopHours';
import type { ShopKind, Vec2 } from '../streetPlan';
import { snowCovered } from '../snowCover';
import { FacadeFrame } from './facadeFrame';
import { INSET } from '../../props/joinery';
import { frontVariant, hasShopfront, pilasterWidth } from '../shopfronts/shopfrontPlan';
import { lcg } from '@/random';

/** The shutter's box under the fascia (bottom, top, depth out of the wall), the curtain's plane, its foot. */
const BOX = { bottom: 2.8, top: 2.93, depth: 0.1 };
const CURTAIN = { out: 0.09, foot: 0.04 };
/** Metres of curtain one texture repeat covers (height), seconds to roll all the way. */
const SLATS_PER_REPEAT = 1.2;
const ROLL_SECONDS = 4;
const CHECK_EVERY = 1;

interface Shutter {
  kind: ShopKind;
  /** First of its four curtain vertices. */
  first: number;
  frame: FacadeFrame;
  s0: number;
  s1: number;
  /** 0 rolled up .. 1 down, and where it is going. */
  down: number;
  target: number;
  /** Which half of the texture: plain slats or tagged. */
  tagged: boolean;
}

/**
 * The shops' roller shutters: a steel box under each shopfront's fascia and the slatted curtain
 * that rolls down out of it when the shop shuts (`SHOP_HOURS`, via `isShopOpen`) and back up
 * when it opens, over a few seconds, the slats keeping their size as it unrolls. A few are
 * tagged. Shops that have shut for good are painted shut already; the arcade never shuts, and the walk-in shops
 * keep none (their windows stand out of the wall, lit after closing: `shopfronts/`). All
 * curtains are one mesh whose four corners per shop move (only while one is rolling); the boxes
 * are another. Snow settles on the boxes. Back from dormancy (the street built ahead, or kept while the player was
 * home) each curtain takes the clock's state at once: hours may have passed, and every shop that opened or shut
 * meanwhile rolling and rattling in the same frame was a wall of noise on arrival.
 */
export class Shutters extends THREE.Group implements Furniture, Updatable, ActivityAware {
  readonly contactShadow = false;
  private readonly shutters: Shutter[] = [];
  private readonly positions: THREE.BufferAttribute;
  private readonly uvs: THREE.BufferAttribute;
  private readonly curtain: THREE.Mesh;
  private clock = CHECK_EVERY;
  private rolling = true;
  /** Just (re)activated: the first update snaps to the clock, silently. */
  private fresh = true;
  private readonly frameMatrix = new THREE.Matrix4();

  /** `onRoll`: a shutter starts rolling (up or down) at `at` (zone-local, on the pavement before it), for its rattle. */
  constructor(fronts: readonly PaintedFront[], private readonly dayNight: DayNight, private readonly onRoll?: (at: Vec2) => void) {
    super();
    this.name = 'Shutters';
    const random = lcg(4141);
    const boxes: THREE.BufferGeometry[] = [];
    const position: number[] = [];
    const normal: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    const box = new THREE.Matrix4();
    for (const front of fronts) {
      const frame = new FacadeFrame(front.spec);
      for (const shop of front.features.shopfronts) {
        // The arcade never shuts; the walk-in shops' windows stay lit behind their glass (`shopfronts/`).
        if (shop.kind === 'arcade' || hasShopfront(shop.kind)) continue;
        // A front built in 3D: the shutter runs between its pilasters.
        const inset = pilasterWidth(frontVariant(front.spec.detail, shop.kind));
        const s0 = shop.s0 + inset;
        const s1 = shop.s1 - inset;
        const first = position.length / 3;
        for (let i = 0; i < 4; i++) {
          position.push(0, 0, 0);
          normal.push(frame.n.x, 0, frame.n.y);
          uv.push(0, 0);
        }
        index.push(first, first + 1, first + 2, first, first + 2, first + 3);
        this.shutters.push({ kind: shop.kind, first, frame, s0, s1, down: 0, target: 0, tagged: random() < 0.3 });
        // The box's ends buried an `INSET` in the pilasters (ending on their faces, they would lie in the joinery's planes).
        const g = new THREE.BoxGeometry(s1 - s0 + (inset > 0 ? 2 * INSET : 0), BOX.top - BOX.bottom, BOX.depth);
        g.applyMatrix4(frame.matrix((s0 + s1) / 2, (BOX.top + BOX.bottom) / 2, BOX.depth / 2, box));
        boxes.push(g.toNonIndexed());
        g.dispose();
      }
    }
    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.Float32BufferAttribute(position, 3);
    this.positions.setUsage(THREE.DynamicDrawUsage);
    this.uvs = new THREE.Float32BufferAttribute(uv, 2);
    this.uvs.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute('uv', this.uvs);
    geometry.setIndex(index);
    const texture = shutterTexture();
    texture.wrapT = THREE.RepeatWrapping; // convention-ok: wraps one way only
    this.curtain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5, side: THREE.DoubleSide }));
    this.curtain.castShadow = false;
    this.curtain.receiveShadow = true;
    // The corners move: bounds computed now would cull it wrongly.
    this.curtain.frustumCulled = false;
    this.add(this.curtain);
    if (boxes.length) {
      const merged = new THREE.Mesh(mergeAll(boxes), snowCovered(bareMetal({ color: 0xa4a8ac, roughness: 0.5 })));
      merged.castShadow = true;
      merged.receiveShadow = true;
      this.add(merged);
    }
    // Start where the clock says, no rolling on arrival.
    this.snapToClock();
  }

  /** Every curtain where the clock says it is, without a roll or a rattle. */
  private snapToClock(): void {
    const hours = this.dayNight.state.hours;
    for (const s of this.shutters) s.down = s.target = isShopOpen(s.kind, hours) ? 0 : 1;
    this.clock = 0;
    this.rolling = false;
    this.layout();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setZoneActive(active: boolean): void {
    if (active) this.fresh = true;
  }

  update(dt: number): void {
    if (this.fresh) {
      this.fresh = false;
      this.snapToClock();
      return;
    }
    this.clock += dt;
    if (this.clock >= CHECK_EVERY) {
      this.clock = 0;
      const hours = this.dayNight.state.hours;
      for (const s of this.shutters) {
        const target = isShopOpen(s.kind, hours) ? 0 : 1;
        if (target !== s.target) {
          s.target = target;
          this.rolling = true;
          if (this.onRoll) {
            const at = new THREE.Vector3().setFromMatrixPosition(s.frame.matrix((s.s0 + s.s1) / 2, 1.5, 0.3, this.frameMatrix));
            this.onRoll([at.x, at.z]);
          }
        }
      }
    }
    if (!this.rolling) return;
    let moving = false;
    const step = dt / ROLL_SECONDS;
    for (const s of this.shutters) {
      if (s.down === s.target) continue;
      s.down = s.target > s.down ? Math.min(s.target, s.down + step) : Math.max(s.target, s.down - step);
      moving = true;
    }
    this.layout();
    this.rolling = moving;
  }

  /** Puts every curtain's corners where its roll says: from the box down to its bottom, uvs in metres so the slats keep their size. */
  private layout(): void {
    const p = new THREE.Vector3();
    const height = BOX.bottom - CURTAIN.foot;
    for (const s of this.shutters) {
      const bottom = BOX.bottom - height * s.down;
      const repeat = (BOX.bottom - bottom) / SLATS_PER_REPEAT;
      const u0 = s.tagged ? 0.5 : 0;
      const corners: [number, number, number, number][] = [
        [s.s0, bottom, u0, 0],
        [s.s1, bottom, u0 + 0.5, 0],
        [s.s1, BOX.bottom, u0 + 0.5, repeat],
        [s.s0, BOX.bottom, u0, repeat],
      ];
      corners.forEach(([along, y, u, v], i) => {
        s.frame.point(along, y, CURTAIN.out, p);
        this.positions.setXYZ(s.first + i, p.x, p.y, p.z);
        // v counts up from the foot: the slats (and the tag) ride down and up with it.
        this.uvs.setXY(s.first + i, u, v);
      });
    }
    this.positions.needsUpdate = true;
    this.uvs.needsUpdate = true;
  }
}

function mergeAll(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const count = geometries.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  let offset = 0;
  for (const g of geometries) {
    position.set(g.getAttribute('position').array as Float32Array, offset * 3);
    normal.set(g.getAttribute('normal').array as Float32Array, offset * 3);
    offset += g.getAttribute('position').count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.computeBoundingSphere();
  return out;
}

/** Galvanised slats (left half), the same with a tag and a fly-poster sprayed across (right half). One repeat is `SLATS_PER_REPEAT` metres. */
function shutterTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const [canvas, ctx] = createCanvas(w, h);
  const random = lcg(515);
  for (const half of [0, 1]) {
    const x0 = half * (w / 2);
    ctx.fillStyle = '#9a9ea2';
    ctx.fillRect(x0, 0, w / 2, h);
    const slat = h / 16;
    for (let y = 0; y < h; y += slat) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x0, y, w / 2, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x0, y + 3, w / 2, 2);
    }
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = random() < 0.5 ? 'rgba(60,50,40,0.12)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x0 + random() * (w / 2), random() * h, 2 + random() * 6, 1 + random() * 2);
    }
  }
  // The tag, on the right half.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [[16, '#15151a'], [9, '#e83a8a']] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(w / 2 + 30, 170);
    for (let i = 1; i <= 7; i++) ctx.lineTo(w / 2 + 30 + i * 28, 150 + Math.sin(i * 1.9) * 34);
    ctx.stroke();
  }
  ctx.fillStyle = '#f0e8d0';
  ctx.fillRect(w / 2 + 150, 40, 60, 80);
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(w / 2 + 156, 48, 48, 18);
  return toTexture(canvas, 'grazing');
}
