import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import type { PaintedFront } from '../Buildings';
import { isShopOpen } from '../shops/shopHours';
import { nightnessOf } from '../streetAir';
import type { ShopKind } from '../streetPlan';
import { FacadeFrame } from './facadeFrame';

/** How far the light reaches out over the pavement, how high over it the decal lies, how strong it is at full night. */
const REACH = 2.8;
const LIFT = 0.014;
const STRENGTH = 0.5;
const CHECK_EVERY = 0.5;

interface Pool {
  kind: ShopKind;
  color: THREE.Color;
}

/**
 * The light the lit shopfronts spill on the pavement in front of them from dusk, while the shop is
 * open (`isShopOpen`): a soft rectangle in the shop's light, brightest against the window and
 * fading out towards the kerb, a little stronger on a wet pavement and duller under snow. One
 * instanced additive decal (canvas alpha kept); the intensity per shop is the instance colour.
 */
export class ShopGlow extends THREE.InstancedMesh implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly pools: Pool[];
  private readonly scratch = new THREE.Color();
  private clock = CHECK_EVERY;

  constructor(fronts: readonly PaintedFront[], private readonly dayNight: DayNight) {
    const pools: Pool[] = [];
    const matrices: THREE.Matrix4[] = [];
    for (const front of fronts) {
      const frame = new FacadeFrame(front.spec);
      for (const shop of front.features.shopfronts) {
        const width = shop.s1 - shop.s0;
        const m = frame.matrix((shop.s0 + shop.s1) / 2, LIFT, REACH / 2);
        matrices.push(m.multiply(new THREE.Matrix4().makeScale(width + 0.6, 1, REACH)));
        pools.push({ kind: shop.kind, color: new THREE.Color(shop.light) });
      }
    }
    const material = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      fog: true,
    });
    super(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, Math.max(1, pools.length));
    this.name = 'ShopGlow';
    this.pools = pools;
    this.count = pools.length;
    matrices.forEach((m, i) => {
      this.setMatrixAt(i, m);
      this.setColorAt(i, new THREE.Color(0, 0, 0));
    });
    this.instanceMatrix.needsUpdate = true;
    this.computeBoundingSphere();
    this.castShadow = false;
    this.receiveShadow = false;
    this.renderOrder = 1;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < CHECK_EVERY) return;
    this.clock = 0;
    const s = this.dayNight.state;
    const night = THREE.MathUtils.smoothstep(nightnessOf(s), 0.15, 0.6);
    this.visible = night > 0.01;
    if (!this.visible) return;
    const level = STRENGTH * night * (1 + 0.5 * s.wetness) * (1 - 0.5 * s.snowCover);
    this.pools.forEach((pool, i) => {
      const lit = isShopOpen(pool.kind, s.hours) ? level : 0;
      this.setColorAt(i, this.scratch.copy(pool.color).multiplyScalar(lit));
    });
    if (this.instanceColor) this.instanceColor.needsUpdate = true;
  }
}

/** Bright along the window's edge (the plane's far side, -z before turning: the wall), fading out to the kerb and at both ends. */
function glowTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 64;
  const [canvas, ctx] = createCanvas(w, h);
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    // Canvas top (y = 0) is uv v = 1, the plane's -z edge: the wall.
    const out = y / (h - 1);
    const fade = Math.pow(1 - out, 1.8);
    for (let x = 0; x < w; x++) {
      const across = Math.abs(x / (w - 1) - 0.5) * 2;
      const side = 1 - THREE.MathUtils.smoothstep(across, 0.6, 1);
      const a = Math.round(255 * fade * side);
      const k = (y * w + x) * 4;
      image.data[k] = 255;
      image.data[k + 1] = 255;
      image.data[k + 2] = 255;
      image.data[k + 3] = a;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
