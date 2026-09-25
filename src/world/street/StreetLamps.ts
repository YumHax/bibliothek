import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import { createCanvas } from '@/covers/generated/canvasUtils';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { LampBuzz } from './details/LampBuzz';
import { snowCovered } from './snowCover';
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
  /** Index of the lamp whose tube is failing: it flickers and buzzes at night. */
  flickering?: number;
}

/** How far the arm reaches out over the kerb. */
export const LAMP_ARM = 1.3;
const ARM = LAMP_ARM;
const POLE_RADIUS = 0.075;
const WARM = new THREE.Color(0xffd7a0);
const POOL_RADIUS = 6.5;
/** A lamp's candela and reach (the light's `distance`). */
const INTENSITY = 55;
const REACH = 24;
/** Seconds between two choices of which lamps are real lights. */
const CHOOSE_EVERY = 0.5;
/** How far the failing lamp's buzz carries. */
const BUZZ_REACH = 14;

/**
 * The street lamps along the kerbs: poles, arms and heads as instanced meshes (one draw call
 * each for every lamp), the heads glowing at night, a soft pool of light on the ground under each
 * (additive, alpha kept). Only a few lamps light the scene for real: `lights` point lights without
 * shadows, always there (a light added or removed recompiles every shader), dimmed to 0 by day,
 * that move to the lamps nearest the player every half second. The rest glow and pool. One lamp's
 * tube is going (`flickering`): at night it stutters (head, pool and its real light if it has one:
 * short drop-outs, now and then a dark second before it catches again) and buzzes (`LampBuzz`,
 * heard only near it and only while the player is out here). Snow settles on the heads and arms.
 */
export class StreetLamps extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  /** The lamp heads (zone-local), under which the light hangs: what the wet ground reflects. */
  readonly headPoints: THREE.Vector3[];
  private readonly lens: THREE.InstancedMesh;
  private readonly pool: THREE.InstancedMesh;
  private readonly buzz = new LampBuzz();
  private readonly flickering: number;
  private flicker = 1;
  private flickerClock = 0;
  private dropout = 0;
  private occupied = false;
  private readonly ear = new THREE.Vector3();
  private readonly facing = new THREE.Vector3();
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
    const poles = new THREE.InstancedMesh(metal, snowCovered(new THREE.MeshStandardMaterial({ color: 0x2c3431, roughness: 0.55, metalness: 0.5 })), lamps.length);
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

    const white = new THREE.Color(1, 1, 1);
    matrices.forEach((m, i) => {
      poles.setMatrixAt(i, m);
      lens.setMatrixAt(i, m);
      pool.setMatrixAt(i, m);
      lens.setColorAt(i, white);
      pool.setColorAt(i, white);
    });
    this.lens = lens;
    this.pool = pool;
    this.flickering = options.flickering ?? -1;
    for (const mesh of [poles, lens, pool]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    lens.castShadow = false;
    pool.castShadow = false;
    this.add(poles, lens, pool);

    // Where the heads are (zone-local): the real lights sit just under them.
    this.spots = lamps.map(({ at, yaw }) => new THREE.Vector3(at[0] + Math.sin(yaw) * ARM, height - 0.4, at[1] + Math.cos(yaw) * ARM));
    this.headPoints = this.spots.map((p) => p.clone().setY(height - 0.14));
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

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    if (!occupied) this.buzz.set(0, 0, false);
  }

  dispose(): void {
    this.buzz.dispose();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const night = THREE.MathUtils.smoothstep(nightnessOf(s), 0.25, 0.6);
    this.heads.color.copy(WARM).multiplyScalar(0.25 + 2.6 * night);
    this.pools.opacity = 0.55 * night * (1 - 0.5 * s.snowCover);
    const intensity = INTENSITY * night;
    this.stutter(dt, night);
    for (let i = 0; i < this.bulbs.length; i++) this.bulbs[i]!.intensity = intensity * (this.order[i] === this.flickering ? this.flicker : 1);
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

  /**
   * The failing tube: mostly on, dropping out for a few hundredths now and then, once in a while
   * dark for a second and stuttering back. Dims its head and pool (instance colours) and buzzes.
   */
  private stutter(dt: number, night: number): void {
    const i = this.flickering;
    if (i < 0 || i >= this.spots.length) return;
    let level = 1;
    if (night > 0.05) {
      this.flickerClock -= dt;
      if (this.dropout > 0) {
        this.dropout -= dt;
        level = Math.random() < 0.35 ? 0.9 : 0.08;
      } else if (this.flickerClock <= 0) {
        this.flickerClock = 0.4 + Math.random() * 3.5;
        this.dropout = Math.random() < 0.15 ? 0.8 + Math.random() * 0.8 : 0.05 + Math.random() * 0.2;
      }
    }
    const changed = Math.abs(level - this.flicker) > 0.01;
    this.flicker = level;
    if (changed) {
      const c = new THREE.Color(level, level, level);
      this.lens.setColorAt(i, c);
      this.pool.setColorAt(i, c);
      if (this.lens.instanceColor) this.lens.instanceColor.needsUpdate = true;
      if (this.pool.instanceColor) this.pool.instanceColor.needsUpdate = true;
    }
    // The buzz: near it, only at night and while the player is out here.
    let loud = 0;
    let pan = 0;
    if (this.occupied && night > 0.05) {
      this.options.viewer.getWorldPosition(this.ear);
      const head = this.localToWorld(this.headPoints[i]!.clone());
      const distance = this.ear.distanceTo(head);
      loud = night * Math.max(0, 1 - distance / BUZZ_REACH) ** 2;
      this.options.viewer.getWorldDirection(this.facing);
      const dx = head.x - this.ear.x;
      const dz = head.z - this.ear.z;
      const d = Math.hypot(dx, dz) || 1;
      pan = ((dx * -this.facing.z + dz * this.facing.x) / d) * 0.8;
    }
    this.buzz.set(loud, pan, level < 0.5);
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
