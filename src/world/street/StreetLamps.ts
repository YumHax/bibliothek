import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import { createCanvas } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { nightnessOf } from './streetAir';
import type { Vec2 } from './streetPlan';

export interface StreetLampsOptions {
  lamps: readonly { at: Vec2; yaw: number }[];
  /** Height of the lamp heads. */
  height: number;
  /** How many real point lights follow the lamps nearest the player. */
  lights: number;
  /** Whose position decides which lamps get the real lights (the camera). */
  viewer: THREE.Object3D;
}

/** How far the arm reaches out over the kerb. */
const ARM = 1.3;
const POLE_RADIUS = 0.075;
const WARM = new THREE.Color(0xffd7a0);
const POOL_RADIUS = 6.5;
/** A lamp's candela and reach (the light's `distance`). */
const INTENSITY = 55;
const REACH = 24;
/** Seconds between two choices of which lamps are real lights. */
const CHOOSE_EVERY = 0.5;

/**
 * The street lamps along the kerbs: poles, arms and heads as instanced meshes (one draw call
 * each for every lamp), the heads glowing at night, a soft pool of light on the ground under each
 * (additive, alpha kept). Only a few lamps light the scene for real: `lights` point lights without
 * shadows, always there (a light added or removed recompiles every shader), dimmed to 0 by day,
 * that move to the lamps nearest the player every half second. The rest glow and pool.
 */
export class StreetLamps extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly heads: THREE.MeshBasicMaterial;
  private readonly pools: THREE.MeshBasicMaterial;
  private readonly bulbs: THREE.PointLight[] = [];
  private readonly spots: THREE.Vector3[];
  private readonly order: number[];
  private readonly eye = new THREE.Vector3();
  private chooseClock = CHOOSE_EVERY;

  constructor(private readonly dayNight: DayNight, private readonly options: StreetLampsOptions) {
    super();
    this.name = 'StreetLamps';
    const { lamps, height } = options;
    const matrices = lamps.map(({ at, yaw }) => new THREE.Matrix4().makeRotationY(yaw).setPosition(at[0], 0, at[1]));

    const pole = new THREE.CylinderGeometry(POLE_RADIUS * 0.8, POLE_RADIUS, height, 10).translate(0, height / 2, 0);
    const base = new THREE.CylinderGeometry(0.14, 0.17, 0.6, 10).translate(0, 0.3, 0);
    const arm = new THREE.BoxGeometry(0.06, 0.06, ARM).translate(0, height - 0.05, ARM / 2);
    const brace = new THREE.BoxGeometry(0.04, 0.04, 0.8).rotateX(-0.6).translate(0, height - 0.32, 0.32);
    const housing = new THREE.BoxGeometry(0.34, 0.12, 0.6).translate(0, height - 0.06, ARM);
    const metal = mergeGeometries([pole, base, arm, brace, housing]);
    for (const g of [pole, base, arm, brace, housing]) g.dispose();
    const poles = new THREE.InstancedMesh(metal, new THREE.MeshStandardMaterial({ color: 0x2c3431, roughness: 0.55, metalness: 0.5 }), lamps.length);
    poles.castShadow = true;
    poles.receiveShadow = true;

    this.heads = new THREE.MeshBasicMaterial({ color: WARM.clone() });
    const lens = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.03, 0.5).translate(0, height - 0.135, ARM), this.heads, lamps.length);

    this.pools = new THREE.MeshBasicMaterial({
      map: poolTexture(),
      color: WARM.clone(),
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      opacity: 0,
      fog: true,
    });
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(2 * POOL_RADIUS, 2 * POOL_RADIUS).rotateX(-Math.PI / 2).translate(0, 0.012, ARM), this.pools, lamps.length);
    pool.renderOrder = 1;

    matrices.forEach((m, i) => {
      poles.setMatrixAt(i, m);
      lens.setMatrixAt(i, m);
      pool.setMatrixAt(i, m);
    });
    for (const mesh of [poles, lens, pool]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    lens.castShadow = false;
    pool.castShadow = false;
    this.add(poles, lens, pool);

    // Where the heads are (zone-local): the real lights sit just under them.
    this.spots = lamps.map(({ at, yaw }) => new THREE.Vector3(at[0] + Math.sin(yaw) * ARM, height - 0.4, at[1] + Math.cos(yaw) * ARM));
    this.order = lamps.map((_, i) => i);
    for (let i = 0; i < Math.min(options.lights, lamps.length); i++) {
      const bulb = new THREE.PointLight(WARM, 0, REACH, 2);
      bulb.castShadow = false;
      bulb.position.copy(this.spots[i]!);
      this.bulbs.push(bulb);
      this.add(bulb);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** Lamp posts and bases the player walks round (zone-local boxes). */
  static colliders(lamps: readonly { at: Vec2 }[]): THREE.Box3[] {
    return lamps.map(({ at }) => new THREE.Box3(new THREE.Vector3(at[0] - 0.18, 0, at[1] - 0.18), new THREE.Vector3(at[0] + 0.18, 2, at[1] + 0.18)));
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const night = THREE.MathUtils.smoothstep(nightnessOf(s), 0.25, 0.6);
    this.heads.color.copy(WARM).multiplyScalar(0.25 + 2.6 * night);
    this.pools.opacity = 0.55 * night * (1 - 0.5 * s.snowCover);
    const intensity = INTENSITY * night;
    for (const bulb of this.bulbs) bulb.intensity = intensity;
    this.chooseClock += dt;
    if (this.chooseClock < CHOOSE_EVERY || night === 0) return;
    this.chooseClock = 0;
    // The lamps nearest the player get the real lights.
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    const eye = this.eye;
    const spots = this.spots;
    this.order.sort((a, b) => spots[a]!.distanceToSquared(eye) - spots[b]!.distanceToSquared(eye));
    for (let i = 0; i < this.bulbs.length; i++) this.bulbs[i]!.position.copy(spots[this.order[i]!]!);
  }
}

/** A soft round pool: bright under the lamp, fading out to nothing at the rim. */
function poolTexture(): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = createCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
