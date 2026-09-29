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
import { GROUND, RENDER_ORDER, onSurface } from '../surface/layers';
import { LAMP_GLOW, LAMP_LIGHT } from '../lighting/lampColours';

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
/** Sodium: the light thrown, and the head's own glow (whiter). */
const WARM = LAMP_LIGHT.sodium.clone();
const GLOW = LAMP_GLOW.sodium.clone();
/** A sodium lamp striking: a dim pink glow that warms to amber and full brightness over `WARM_UP` seconds (each lamp its own pace). */
const STRIKE = new THREE.Color(1, 0.32, 0.42);
const WARM_UP = [7, 12] as const;
/** Off again (dawn, a dropout): quicker than warming. */
const COOL_DOWN = 2.5;
/** Each lamp's photocell switches at its own point of the dusk (the street's nightness), within this range; off again this much lower. */
const SWITCH_AT = [0.26, 0.5] as const;
const SWITCH_SLACK = 0.03;
/** The head by day (unlit, lens catching the sky) and fully lit, over the glow colour. */
const HEAD_DAY = 0.25;
const HEAD_LIT = 2.85;
const POOL_RADIUS = 6.5;
/** A lamp's candela and reach (the light's `distance`). */
const INTENSITY = 55;
const REACH = 24;
/** Seconds between two choices of which lamps are real lights, and to fade a light out of one lamp (and into the next). */
const CHOOSE_EVERY = 0.5;
const HANDOVER = 0.5;
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
  /** Per real light: the lamp it hangs under, the lamp it moves to once faded out (-1: staying), how lit it is (0..1). */
  private readonly slots: { lamp: number; next: number; level: number }[] = [];
  private readonly wanted = new Set<number>();
  private readonly eye = new THREE.Vector3();
  private chooseClock = CHOOSE_EVERY;
  /** No light has been handed out yet: the first choice puts them straight at the nearest lamps. */
  private placed = false;
  /** Per lamp: where its photocell switches (nightness), whether it is on, how warmed up (0 off .. 1 full amber), its pace. */
  private readonly lampSwitch: number[];
  private readonly lampOn: boolean[];
  private readonly lampWarm: Float32Array;
  private readonly lampPace: Float32Array;
  /** Just (re)activated: the lamps take the clock's state at once (nothing warms up in front of the player on arrival). */
  private fresh = true;
  private readonly tint = new THREE.Color();

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
    const poles = new THREE.InstancedMesh(metal, snowCovered(new THREE.MeshStandardMaterial({ color: 0x2c3431, roughness: 0.5 })), lamps.length);
    poles.castShadow = true;
    poles.receiveShadow = true;

    this.heads = new THREE.MeshBasicMaterial({ color: GLOW.clone().multiplyScalar(HEAD_LIT) });
    const lens = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.03, 0.5).translate(0, height - 0.135, ARM), this.heads, lamps.length);

    this.pools = onSurface(
      new THREE.MeshBasicMaterial({
        map: poolTexture(),
        color: WARM.clone(),
        transparent: true,
        // Per lamp, instance colours carry how warmed up it is (0 off).
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        opacity: 0,
        fog: true,
      }),
      GROUND.lampPool,
      { depthWrite: false },
    );
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(2 * POOL_RADIUS, 2 * POOL_RADIUS).rotateX(-Math.PI / 2).translate(0, GROUND.lampPool.lift, ARM), this.pools, lamps.length);
    pool.renderOrder = RENDER_ORDER.groundGlow;

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
    // Each lamp its own switching point and warm-up pace (fixed per lamp: the same ones come on first every evening).
    const hash = (i: number, k: number): number => {
      const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    this.lampSwitch = lamps.map((_, i) => THREE.MathUtils.lerp(SWITCH_AT[0], SWITCH_AT[1], hash(i, 1)));
    this.lampOn = lamps.map(() => false);
    this.lampWarm = new Float32Array(lamps.length);
    this.lampPace = Float32Array.from(lamps, (_, i) => 1 / THREE.MathUtils.lerp(WARM_UP[0], WARM_UP[1], hash(i, 2)));
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
      this.slots.push({ lamp: i, next: -1, level: 1 });
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

  setZoneActive(active: boolean): void {
    if (active) this.fresh = true;
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const nightness = nightnessOf(s);
    const night = THREE.MathUtils.smoothstep(nightness, 0.25, 0.6);
    this.pools.opacity = 0.55 * (1 - 0.5 * s.snowCover);
    this.stutter(dt, night);
    this.warm(dt, nightness);
    // A light leaving its lamp fades out over `HANDOVER`, moves (unseen, at 0) and fades in under the new one.
    for (let i = 0; i < this.bulbs.length; i++) {
      const slot = this.slots[i]!;
      const step = dt / HANDOVER;
      if (slot.next >= 0) {
        slot.level = Math.max(0, slot.level - step);
        if (slot.level === 0) {
          slot.lamp = slot.next;
          slot.next = -1;
          this.bulbs[i]!.position.copy(this.spots[slot.lamp]!);
        }
      } else slot.level = Math.min(1, slot.level + step);
      const warm = this.lampWarm[slot.lamp]!;
      const bulb = this.bulbs[i]!;
      bulb.intensity = INTENSITY * lampLevel(warm) * slot.level * (slot.lamp === this.flickering ? this.flicker : 1);
      strikeColour(warm, WARM, bulb.color);
    }
    this.chooseClock += dt;
    if (this.chooseClock < CHOOSE_EVERY || night === 0) return;
    this.chooseClock = 0;
    this.choose();
  }

  /**
   * The lamps nearest the player get the real lights: a light already under one of them stays; one
   * under a lamp no longer wanted is sent (fading) to a wanted lamp that has none.
   */
  private choose(): void {
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    const eye = this.eye;
    const spots = this.spots;
    this.order.sort((a, b) => spots[a]!.distanceToSquared(eye) - spots[b]!.distanceToSquared(eye));
    const wanted = this.wanted;
    wanted.clear();
    for (let i = 0; i < this.slots.length; i++) wanted.add(this.order[i]!);
    if (!this.placed) {
      this.placed = true;
      this.slots.forEach((slot, i) => {
        slot.lamp = this.order[i]!;
        slot.next = -1;
        slot.level = 1;
        this.bulbs[i]!.position.copy(spots[slot.lamp]!);
      });
      return;
    }
    for (const slot of this.slots) {
      const going = slot.next >= 0 ? slot.next : slot.lamp;
      if (wanted.has(going)) wanted.delete(going);
      else slot.next = -2;
    }
    // Send the lights no lamp wants any more to the wanted lamps left (nearest first).
    for (let k = 0; k < this.order.length && wanted.size; k++) {
      const lamp = this.order[k]!;
      if (!wanted.has(lamp)) continue;
      const slot = this.slots.find((s) => s.next === -2);
      if (!slot) break;
      wanted.delete(lamp);
      // Back under its own lamp? It just fades up again.
      slot.next = slot.lamp === lamp ? -1 : lamp;
    }
    for (const slot of this.slots) if (slot.next === -2) slot.next = -1;
  }

  /**
   * Each lamp's photocell: on past its own point of the dusk, off again a little below it; a lamp
   * that is on warms up (pink, dim) to full amber at its own pace, one that is off cools quickly.
   * The heads and pools take it (and the failing tube's stutter) as instance colours.
   */
  private warm(dt: number, nightness: number): void {
    const fresh = this.fresh;
    this.fresh = false;
    let changed = false;
    for (let i = 0; i < this.lampWarm.length; i++) {
      const at = this.lampSwitch[i]!;
      const on = this.lampOn[i] ? nightness > at - SWITCH_SLACK : nightness > at;
      this.lampOn[i] = on;
      const before = this.lampWarm[i]!;
      const after = fresh ? (on ? 1 : 0) : on ? Math.min(1, before + dt * this.lampPace[i]!) : Math.max(0, before - dt / COOL_DOWN);
      this.lampWarm[i] = after;
      if (after === before && !fresh && i !== this.flickering) continue;
      changed = true;
      const flicker = i === this.flickering ? this.flicker : 1;
      const level = lampLevel(after) * flicker;
      strikeColour(after, WHITE, this.tint).multiplyScalar(level);
      this.pool.setColorAt(i, this.tint);
      // The head: the lens by day, glowing as the lamp warms.
      const day = HEAD_DAY / HEAD_LIT;
      this.tint.multiplyScalar(1 - day).addScalar(day);
      this.lens.setColorAt(i, this.tint);
    }
    if (!changed) return;
    if (this.lens.instanceColor) this.lens.instanceColor.needsUpdate = true;
    if (this.pool.instanceColor) this.pool.instanceColor.needsUpdate = true;
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
    // Its head and pool take the level in `warm()`, with its warm-up.
    this.flicker = level;
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

const WHITE = new THREE.Color(1, 1, 1);

/** How bright a lamp is at `warm` (0..1) of its warm-up: a dim glow when it strikes, full at the end; 0 when off. */
function lampLevel(warm: number): number {
  return warm <= 0 ? 0 : 0.12 + 0.88 * warm * warm;
}

/** A striking sodium lamp's colour at `warm`: pink at first, `full` once warm (a multiplier over the lamp's own colour). */
function strikeColour(warm: number, full: THREE.Color, out: THREE.Color): THREE.Color {
  const t = THREE.MathUtils.smoothstep(warm, 0.05, 0.7);
  return out.copy(STRIKE).multiply(full).lerp(full, t);
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
