import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import { QUALITY } from '@/graphics/quality';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { LampBuzz } from './details/LampBuzz';
import { snowCovered } from './snowCover';
import { nightnessOf } from './streetAir';
import type { LampDesign, Vec2 } from './streetPlan';
import { GROUND, RENDER_ORDER, onSurface } from '../surface/layers';
import { LAMP_GLOW, LAMP_LIGHT } from '../lighting/lampColours';
import { additive, additiveOne } from '@/world/materials/blend';
import { radialGlow } from '@/world/materials/glowTextures';

export interface StreetLampsOptions {
  lamps: readonly { at: Vec2; yaw: number; design?: LampDesign }[];
  /** Height of the modern arm lamps' heads (the cast-iron kinds stand lower: `LAMP_DESIGNS`). */
  height: number;
  /** How many real point lights follow the lamps nearest the player. */
  lights: number;
  /** Whose position decides which lamps get the real lights (the camera). */
  viewer: THREE.Object3D;
  /** Index of the lamp whose tube is failing: it flickers and buzzes at night. */
  flickering?: number;
}

/** How far the modern lamp's arm reaches out over the kerb. */
export const LAMP_ARM = 1.3;

/**
 * The lamp kinds (`LampDesign`), in the lamp's own frame (its foot at the origin, its head reached
 * out along +z): how high the glowing lens hangs (the arm's is the plan's `height`), how far out,
 * the pool of light it throws (radius), the base the player walks round, and the halo's size.
 */
export const LAMP_DESIGNS: Record<LampDesign, { lens: number | null; reach: number; pool: number; base: number; halo: number }> = {
  arm: { lens: null, reach: LAMP_ARM, pool: 6.5, base: 0.18, halo: 1.7 },
  crook: { lens: 4.32, reach: 0.66, pool: 5.2, base: 0.26, halo: 1.3 },
  post: { lens: 3.86, reach: 0, pool: 4.6, base: 0.24, halo: 1.3 },
};

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
/** A lamp's candela and reach (the light's `distance`). */
const INTENSITY = 55;
const REACH = 24;
/** Seconds between two choices of which lamps are real lights, and to fade a light out of one lamp (and into the next). */
const CHOOSE_EVERY = 0.5;
const HANDOVER = 0.5;
/** How far the failing lamp's buzz carries. */
const BUZZ_REACH = 14;
/** The lamps are drawn in stretches along the street (x), each its own meshes, so a stretch out of view is not drawn. */
const STRETCH_EDGES = [0, 50] as const;
/** The halo's strength round a lit head where there is no bloom to give one (low quality). */
const HALO = 0.55;

/** Where a lamp's things went: its stretch's lens and pool meshes and its index in each, its halo. */
interface LampSlot {
  lens: THREE.InstancedMesh;
  lensAt: number;
  pool: THREE.InstancedMesh;
  poolAt: number;
  halo: THREE.InstancedMesh | null;
  haloAt: number;
}

/**
 * The street lamps along the kerbs, of three kinds (`LAMP_DESIGNS`): the modern pole with its arm
 * over the road, the old cast-iron column with a lantern hung from a crook, the post-top lantern.
 * Poles and lenses are instanced per kind and per stretch of street (`STRETCH_EDGES`: what is out
 * of view is culled), the heads glowing at night, a soft pool of light on the ground under each
 * (additive, alpha kept), and where there is no bloom (low quality) a soft halo round each lit head.
 * Only a few lamps light the scene for real: `lights` point lights without shadows, always there (a
 * light added or removed recompiles every shader), dimmed to 0 by day, that move to the lamps
 * nearest the player every half second. The rest glow and pool. One lamp's tube is going
 * (`flickering`): at night it stutters (head, pool and its real light if it has one: short
 * drop-outs, now and then a dark second before it catches again) and buzzes (`LampBuzz`, heard only
 * near it and only while the player is out here). Snow settles on the heads and arms; rain wets them.
 */
export class StreetLamps extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  /** The lamp heads (zone-local), under which the light hangs: what the wet ground reflects. */
  readonly headPoints: THREE.Vector3[];
  private readonly slots: LampSlot[];
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly buzz = new LampBuzz();
  private readonly flickering: number;
  private flicker = 1;
  private flickerClock = 0;
  private dropout = 0;
  private occupied = false;
  private readonly ear = new THREE.Vector3();
  private readonly facing = new THREE.Vector3();
  private readonly head = new THREE.Vector3();
  private readonly pools: THREE.MeshBasicMaterial;
  private readonly bulbs: THREE.PointLight[] = [];
  private readonly spots: THREE.Vector3[];
  private readonly order: number[];
  /** Per real light: the lamp it hangs under, the lamp it moves to once faded out (-1: staying), how lit it is (0..1). */
  private readonly lightSlots: { lamp: number; next: number; level: number }[] = [];
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
  private readonly haloTint = new THREE.Color();

  constructor(private readonly dayNight: DayNight, private readonly options: StreetLampsOptions) {
    super();
    this.name = 'StreetLamps';
    const { lamps, height } = options;
    const designOf = (i: number): LampDesign => lamps[i]!.design ?? 'arm';
    const lensY = (design: LampDesign): number => LAMP_DESIGNS[design].lens ?? height - 0.135;
    const stretchOf = (x: number): number => STRETCH_EDGES.filter((edge) => x >= edge).length;

    const metal = snowCovered(new THREE.MeshStandardMaterial({ color: 0x2c3431, roughness: 0.5 }));
    const iron = snowCovered(new THREE.MeshStandardMaterial({ color: 0x1d2420, roughness: 0.42, metalness: 0.15 }));
    const heads = new THREE.MeshBasicMaterial({ color: GLOW.clone().multiplyScalar(HEAD_LIT) });
    this.pools = onSurface(
      // Per lamp, instance colours carry how warmed up it is (0 off).
      additive(
        new THREE.MeshBasicMaterial({
          map: radialGlow({ width: 128, height: 128, stops: [[0, 0.9], [0.35, 0.45], [0.7, 0.12], [1, 0]] }),
          color: WARM.clone(),
          opacity: 0,
          fog: true,
        }),
      ),
      GROUND.lampPool,
      { depthWrite: false },
    );
    const haloMaterial = QUALITY.bloom ? null : haloShader();
    const geometries: Record<LampDesign, { metal: THREE.BufferGeometry; lens: THREE.BufferGeometry }> = {
      arm: armLamp(height),
      crook: crookLamp(),
      post: postLamp(),
    };
    const poolGeometry = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2).translate(0, GROUND.lampPool.lift, 0);
    const haloGeometry = new THREE.PlaneGeometry(1, 1);

    // Group the lamps by stretch and by kind: one mesh of poles and one of lenses per group, one of pools (and halos) per stretch.
    const white = new THREE.Color(1, 1, 1);
    const m = new THREE.Matrix4();
    const stretches = new Map<number, number[]>();
    lamps.forEach(({ at }, i) => {
      const k = stretchOf(at[0]);
      stretches.set(k, [...(stretches.get(k) ?? []), i]);
    });
    this.slots = new Array<LampSlot>(lamps.length);
    for (const members of stretches.values()) {
      const pool = this.instanced(poolGeometry, this.pools, members.length);
      pool.renderOrder = RENDER_ORDER.groundGlow;
      const halo = haloMaterial ? this.instanced(haloGeometry, haloMaterial, members.length) : null;
      if (halo) halo.renderOrder = RENDER_ORDER.sheen;
      for (const design of Object.keys(LAMP_DESIGNS) as LampDesign[]) {
        const ofKind = members.filter((i) => designOf(i) === design);
        if (ofKind.length === 0) continue;
        const poles = this.instanced(geometries[design].metal, design === 'arm' ? metal : iron, ofKind.length);
        poles.castShadow = true;
        poles.receiveShadow = true;
        const lens = this.instanced(geometries[design].lens, heads, ofKind.length);
        ofKind.forEach((i, n) => {
          const { at, yaw } = lamps[i]!;
          m.makeRotationY(yaw).setPosition(at[0], 0, at[1]);
          poles.setMatrixAt(n, m);
          lens.setMatrixAt(n, m);
          lens.setColorAt(n, white);
          this.slots[i] = { lens, lensAt: n, pool, poolAt: members.indexOf(i), halo, haloAt: members.indexOf(i) };
        });
      }
      members.forEach((i, n) => {
        const { at, yaw } = lamps[i]!;
        const d = LAMP_DESIGNS[designOf(i)];
        const [hx, hz] = [at[0] + Math.sin(yaw) * d.reach, at[1] + Math.cos(yaw) * d.reach];
        pool.setMatrixAt(n, m.makeScale(d.pool, 1, d.pool).setPosition(hx, 0, hz));
        pool.setColorAt(n, white);
        if (halo) {
          halo.setMatrixAt(n, m.makeScale(d.halo, d.halo, d.halo).setPosition(hx, lensY(designOf(i)), hz));
          halo.setColorAt(n, new THREE.Color(0, 0, 0));
        }
      });
    }
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }

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

    // Where the heads are (zone-local): the real lights sit just under them.
    this.headPoints = lamps.map(({ at, yaw }, i) => {
      const d = LAMP_DESIGNS[designOf(i)];
      return new THREE.Vector3(at[0] + Math.sin(yaw) * d.reach, lensY(designOf(i)) - 0.005, at[1] + Math.cos(yaw) * d.reach);
    });
    this.spots = this.headPoints.map((p) => p.clone().setY(p.y - 0.26));
    this.order = lamps.map((_, i) => i);
    for (let i = 0; i < Math.min(options.lights, lamps.length); i++) {
      const bulb = new THREE.PointLight(WARM, 0, REACH, 2);
      bulb.castShadow = false;
      bulb.position.copy(this.spots[i]!);
      this.bulbs.push(bulb);
      this.lightSlots.push({ lamp: i, next: -1, level: 1 });
      this.add(bulb);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** Lamp posts and bases the player walks round (zone-local boxes). */
  static colliders(lamps: readonly { at: Vec2; design?: LampDesign }[]): THREE.Box3[] {
    return lamps.map(({ at, design }) => {
      const r = LAMP_DESIGNS[design ?? 'arm'].base;
      return new THREE.Box3(new THREE.Vector3(at[0] - r, 0, at[1] - r), new THREE.Vector3(at[0] + r, 2, at[1] + r));
    });
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
    this.warm(dt, nightness, s.fog);
    // A light leaving its lamp fades out over `HANDOVER`, moves (unseen, at 0) and fades in under the new one.
    for (let i = 0; i < this.bulbs.length; i++) {
      const slot = this.lightSlots[i]!;
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

  private instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = false;
    this.meshes.push(mesh);
    this.add(mesh);
    return mesh;
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
    for (let i = 0; i < this.lightSlots.length; i++) wanted.add(this.order[i]!);
    if (!this.placed) {
      this.placed = true;
      this.lightSlots.forEach((slot, i) => {
        slot.lamp = this.order[i]!;
        slot.next = -1;
        slot.level = 1;
        this.bulbs[i]!.position.copy(spots[slot.lamp]!);
      });
      return;
    }
    for (const slot of this.lightSlots) {
      const going = slot.next >= 0 ? slot.next : slot.lamp;
      if (wanted.has(going)) wanted.delete(going);
      else slot.next = -2;
    }
    // Send the lights no lamp wants any more to the wanted lamps left (nearest first).
    for (let k = 0; k < this.order.length && wanted.size; k++) {
      const lamp = this.order[k]!;
      if (!wanted.has(lamp)) continue;
      const slot = this.lightSlots.find((s) => s.next === -2);
      if (!slot) break;
      wanted.delete(lamp);
      // Back under its own lamp? It just fades up again.
      slot.next = slot.lamp === lamp ? -1 : lamp;
    }
    for (const slot of this.lightSlots) if (slot.next === -2) slot.next = -1;
  }

  /**
   * Each lamp's photocell: on past its own point of the dusk, off again a little below it; a lamp
   * that is on warms up (pink, dim) to full amber at its own pace, one that is off cools quickly.
   * The heads, pools and halos take it (and the failing tube's stutter) as instance colours; the
   * halos spread in fog.
   */
  private warm(dt: number, nightness: number, fog: number): void {
    const fresh = this.fresh;
    this.fresh = false;
    let changed = false;
    const halo = HALO * (1 + 1.2 * fog);
    for (let i = 0; i < this.lampWarm.length; i++) {
      const at = this.lampSwitch[i]!;
      const on = this.lampOn[i] ? nightness > at - SWITCH_SLACK : nightness > at;
      this.lampOn[i] = on;
      const before = this.lampWarm[i]!;
      const after = fresh ? (on ? 1 : 0) : on ? Math.min(1, before + dt * this.lampPace[i]!) : Math.max(0, before - dt / COOL_DOWN);
      this.lampWarm[i] = after;
      if (after === before && !fresh && i !== this.flickering) continue;
      changed = true;
      const slot = this.slots[i]!;
      const flicker = i === this.flickering ? this.flicker : 1;
      const level = lampLevel(after) * flicker;
      strikeColour(after, WHITE, this.tint).multiplyScalar(level);
      slot.pool.setColorAt(slot.poolAt, this.tint);
      if (slot.halo) slot.halo.setColorAt(slot.haloAt, this.haloTint.copy(this.tint).multiplyScalar(halo));
      // The head: the lens by day, glowing as the lamp warms.
      const day = HEAD_DAY / HEAD_LIT;
      this.tint.multiplyScalar(1 - day).addScalar(day);
      slot.lens.setColorAt(slot.lensAt, this.tint);
    }
    if (!changed) return;
    for (const mesh of this.meshes) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
      const head = this.localToWorld(this.head.copy(this.headPoints[i]!));
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

/** Merges the parts and frees them. */
function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  for (const g of parts) g.dispose();
  return out;
}

/**
 * The modern lamp: a tapered pole on a flared base, a tube arm reaching out with its brace, and at
 * its end a flat elliptical housing over a frosted lens (the glowing part).
 */
function armLamp(height: number): { metal: THREE.BufferGeometry; lens: THREE.BufferGeometry } {
  const pole = new THREE.CylinderGeometry(POLE_RADIUS * 0.75, POLE_RADIUS, height, 12).translate(0, height / 2, 0);
  const base = new THREE.CylinderGeometry(0.13, 0.18, 0.6, 12).translate(0, 0.3, 0);
  const door = new THREE.BoxGeometry(0.1, 0.32, 0.02).translate(0, 0.32, 0.17);
  const arm = new THREE.CylinderGeometry(0.03, 0.038, LAMP_ARM, 8).rotateX(Math.PI / 2).translate(0, height - 0.05, LAMP_ARM / 2);
  const brace = new THREE.CylinderGeometry(0.018, 0.018, 0.8, 6).rotateX(Math.PI / 2 - 0.6).translate(0, height - 0.32, 0.32);
  const housing = new THREE.SphereGeometry(0.2, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.45, 1.6).translate(0, height - 0.1, LAMP_ARM);
  const lens = new THREE.CylinderGeometry(0.16, 0.16, 0.025, 16).scale(0.9, 1, 1.6).translate(0, height - 0.122, LAMP_ARM);
  return { metal: merged([pole, base, door, arm, brace, housing]), lens: lens.index ? lens.toNonIndexed() : lens };
}

/**
 * The old cast-iron column: a fluted base with its collars, a slender shaft, at the top a crook
 * curling out and over, the lantern hung from it (a cap, a frame round its four panes: the glass is the lens).
 */
function crookLamp(): { metal: THREE.BufferGeometry; lens: THREE.BufferGeometry } {
  const top = 4.75;
  const { reach } = LAMP_DESIGNS.crook;
  const lensY = LAMP_DESIGNS.crook.lens!;
  const parts = [
    new THREE.CylinderGeometry(0.2, 0.25, 1.0, 16).translate(0, 0.5, 0),
    new THREE.CylinderGeometry(0.23, 0.23, 0.06, 16).translate(0, 1.03, 0),
    new THREE.CylinderGeometry(0.11, 0.17, 0.35, 12).translate(0, 1.23, 0),
    new THREE.CylinderGeometry(0.065, 0.09, top - 1.4, 10).translate(0, 1.4 + (top - 1.4) / 2, 0),
    new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12).translate(0, 2.6, 0),
    new THREE.SphereGeometry(0.08, 10, 6).translate(0, top, 0),
    // The crook: up and over in a half ring, out to the lantern's hook.
    new THREE.TorusGeometry(reach / 2, 0.028, 6, 14, Math.PI).rotateY(-Math.PI / 2).translate(0, top, reach / 2),
    new THREE.TorusGeometry(0.12, 0.016, 5, 10, Math.PI * 1.5).rotateY(-Math.PI / 2).translate(0, top - 0.2, 0.12),
    new THREE.CylinderGeometry(0.012, 0.012, 0.18, 5).translate(0, top - 0.09, reach),
  ];
  // The lantern: a pyramid cap with its finial, a frame at the panes' top and bottom, the corner posts.
  const [w, h] = [0.3, 0.38];
  const cap = new THREE.ConeGeometry(w * 0.82, 0.2, 4).rotateY(Math.PI / 4).translate(0, lensY + h / 2 + 0.1, reach);
  const finial = new THREE.SphereGeometry(0.035, 8, 5).translate(0, lensY + h / 2 + 0.23, reach);
  const frames = [lensY + h / 2, lensY - h / 2].map((y) => new THREE.BoxGeometry(w + 0.04, 0.035, w + 0.04).translate(0, y, reach));
  const posts = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.BoxGeometry(0.025, h, 0.025).translate((sx * w) / 2, lensY, reach + (sz * w) / 2)));
  const bottom = new THREE.ConeGeometry(w * 0.45, 0.12, 4).rotateY(Math.PI / 4).rotateX(Math.PI).translate(0, lensY - h / 2 - 0.06, reach);
  const glass = new THREE.BoxGeometry(w - 0.01, h - 0.02, w - 0.01).translate(0, lensY, reach);
  return { metal: merged([...parts, cap, finial, ...frames, ...posts, bottom]), lens: glass.toNonIndexed() };
}

/** The post-top lantern: a fluted column, a ladder bar under the top, the lantern standing on it. */
function postLamp(): { metal: THREE.BufferGeometry; lens: THREE.BufferGeometry } {
  const lensY = LAMP_DESIGNS.post.lens!;
  const [w, h] = [0.36, 0.46];
  const seat = lensY - h / 2;
  const parts = [
    new THREE.CylinderGeometry(0.19, 0.24, 0.9, 16).translate(0, 0.45, 0),
    new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16).translate(0, 0.93, 0),
    new THREE.CylinderGeometry(0.06, 0.085, seat - 1.0, 10).translate(0, 1.0 + (seat - 1.0) / 2, 0),
    new THREE.BoxGeometry(0.6, 0.035, 0.035).translate(0, seat - 0.45, 0),
    new THREE.CylinderGeometry(0.1, 0.07, 0.12, 10).translate(0, seat - 0.06, 0),
    new THREE.BoxGeometry(w + 0.05, 0.04, w + 0.05).translate(0, seat, 0),
    new THREE.BoxGeometry(w + 0.05, 0.035, w + 0.05).translate(0, lensY + h / 2, 0),
    new THREE.ConeGeometry(w * 0.85, 0.24, 4).rotateY(Math.PI / 4).translate(0, lensY + h / 2 + 0.12, 0),
    new THREE.SphereGeometry(0.04, 8, 5).translate(0, lensY + h / 2 + 0.27, 0),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.BoxGeometry(0.028, h, 0.028).translate((sx * w) / 2, lensY, (sz * w) / 2))),
  ];
  const glass = new THREE.BoxGeometry(w - 0.01, h - 0.02, w - 0.01).translate(0, lensY, 0);
  return { metal: merged(parts), lens: glass.toNonIndexed() };
}

/**
 * A soft halo round a lit head, for where there is no bloom (low quality): a camera-facing quad per
 * lamp (its instance's position and scale), its colour the lamp's warmth, added with the canvas
 * alpha kept (docs/graphics.md).
 */
function haloShader(): THREE.ShaderMaterial {
  return additiveOne(new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vHalo;
      void main() {
        vUv = uv;
        #ifdef USE_INSTANCING_COLOR
          vHalo = instanceColor;
        #else
          vHalo = vec3(1.0);
        #endif
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * length(instanceMatrix[0].xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vHalo;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float glow = exp(-d * d * 5.0) * (1.0 - smoothstep(0.75, 1.0, d));
        gl_FragColor = vec4(vHalo * glow, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
    fog: false,
  }));
}

