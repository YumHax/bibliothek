import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import type { Vec2 } from '../streetPlan';

export interface PigeonsOptions {
  /** The flocks: where each pecks about and how many birds it has. */
  flocks: readonly { at: Vec2; count: number }[];
  viewer: THREE.Object3D;
  /** Birds per flock are scaled by this (fewer on low quality). */
  share?: number;
  /** A flock took off from `at` (the flutter of wings, for whoever plays it). */
  onTakeOff?: (at: Vec2) => void;
}

/** A pigeon takes off when the player comes this close; its flockmates this close to it follow. */
const SCARE = 3;
const SPREAD = 2.2;
/** How far round its flock's spot a pigeon pecks, and how far away it may land. */
const FORAGE = 1.6;
const LAND_MIN = 7;
const LAND_MAX = 14;
const FLIGHT_SPEED = 7;
const GREYS = [0x8a8e96, 0x7a7e86, 0x9a9ca2, 0x6a6e76, 0xb0aca4, 0x5a5650];
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

interface Bird {
  flock: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  flying: boolean;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  duration: number;
  /** Seconds before it takes off (a flock goes up in a ripple, not all at once), or -1. */
  startle: number;
  hop: number;
  hopFrom: [number, number];
  hopTo: [number, number];
  hopT: number;
  peck: number;
}

/**
 * Pigeons pecking about the pavement in little flocks: each bird bobs its head at the ground,
 * hops a step now and then, turns; when the player comes within `SCARE` metres it takes off, its
 * flockmates in a ripple after it, and the flock flies off in an arc (wings beating) to land a way
 * along the pavement, clear of the player, where it goes on pecking. Gone to roost at night. One
 * instanced mesh for the bodies, one for the wings (two per bird): two draw calls for them all.
 */
export class Pigeons extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly birds: Bird[] = [];
  private readonly bodies: THREE.InstancedMesh;
  private readonly wings: THREE.InstancedMesh;
  private readonly spots: THREE.Vector3[];
  private readonly eye = new THREE.Vector3();
  private readonly pose = new THREE.Matrix4();
  private readonly turn = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly spot = new THREE.Vector3();
  private readonly unit = new THREE.Vector3(1, 1, 1);
  private readonly lift = new THREE.Matrix4();
  private readonly wingOffset = new THREE.Matrix4();
  private time = 0;

  constructor(private readonly dayNight: DayNight, private readonly options: PigeonsOptions) {
    super();
    this.name = 'Pigeons';
    const share = options.share ?? 1;
    this.spots = options.flocks.map(({ at }) => new THREE.Vector3(at[0], 0, at[1]));
    options.flocks.forEach(({ at, count }, flock) => {
      for (let i = 0; i < Math.max(1, Math.round(count * share)); i++) {
        const [x, z] = [at[0] + (Math.random() - 0.5) * 2 * FORAGE, at[1] + (Math.random() - 0.5) * FORAGE];
        this.birds.push({
          flock, x, z, y: 0, yaw: Math.random() * Math.PI * 2, flying: false, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, duration: 1,
          startle: -1, hop: 1 + Math.random() * 4, hopFrom: [x, z], hopTo: [x, z], hopT: 1, peck: Math.random() * 10,
        });
      }
    });
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
    this.bodies = new THREE.InstancedMesh(bodyGeometry(), material, this.birds.length);
    this.wings = new THREE.InstancedMesh(wingGeometry(), new THREE.MeshStandardMaterial({ color: 0x7a7e86, roughness: 0.9, side: THREE.DoubleSide, flatShading: true }), this.birds.length * 2);
    const color = new THREE.Color();
    this.birds.forEach((_, i) => {
      color.setHex(GREYS[i % GREYS.length]!);
      this.bodies.setColorAt(i, color);
    });
    for (const mesh of [this.bodies, this.wings]) {
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.add(mesh);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.time += dt;
    // Off to roost at night.
    const out = this.dayNight.state.daylight > 0.12;
    this.visible = out;
    if (!out) return;
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    for (const bird of this.birds) {
      if (bird.flying) this.fly(bird, dt);
      else this.forage(bird, dt);
    }
    this.draw();
  }

  private forage(bird: Bird, dt: number): void {
    if (bird.startle >= 0) {
      bird.startle -= dt;
      if (bird.startle < 0) this.takeOff(bird);
      return;
    }
    if (Math.hypot(this.eye.x - bird.x, this.eye.z - bird.z) < SCARE) {
      this.scare(bird);
      return;
    }
    // A hop to a nearby spot now and then; pecking in between.
    bird.hop -= dt;
    if (bird.hop <= 0 && bird.hopT >= 1) {
      bird.hop = 1.5 + Math.random() * 4;
      const spot = this.spots[bird.flock]!;
      bird.hopFrom = [bird.x, bird.z];
      bird.hopTo = [
        THREE.MathUtils.clamp(bird.x + (Math.random() - 0.5) * 0.8, spot.x - FORAGE * 1.5, spot.x + FORAGE * 1.5),
        THREE.MathUtils.clamp(bird.z + (Math.random() - 0.5) * 0.5, spot.z - FORAGE, spot.z + FORAGE),
      ];
      bird.hopT = 0;
      bird.yaw = Math.atan2(bird.hopTo[0] - bird.x, bird.hopTo[1] - bird.z);
    }
    if (bird.hopT < 1) {
      bird.hopT = Math.min(1, bird.hopT + dt * 2.2);
      bird.x = THREE.MathUtils.lerp(bird.hopFrom[0], bird.hopTo[0], bird.hopT);
      bird.z = THREE.MathUtils.lerp(bird.hopFrom[1], bird.hopTo[1], bird.hopT);
      bird.y = Math.sin(bird.hopT * Math.PI) * 0.06;
    } else bird.y = 0;
    bird.peck += dt;
  }

  /** This bird and its flockmates close by take off, one after another. */
  private scare(bird: Bird): void {
    for (const other of this.birds) {
      if (other.flying || other.startle >= 0 || other.flock !== bird.flock) continue;
      const d = Math.hypot(other.x - bird.x, other.z - bird.z);
      if (d < SPREAD || other === bird) other.startle = other === bird ? 0 : 0.05 + Math.random() * 0.35;
    }
  }

  private takeOff(bird: Bird): void {
    // Somewhere along the same pavement, well clear of the player; the whole flock moves there.
    const spot = this.spots[bird.flock]!;
    if (spot.distanceTo(this.eye) < LAND_MIN || !this.birds.some((b) => b.flock === bird.flock && b.flying)) {
      const away = Math.sign(spot.x - this.eye.x) || 1;
      spot.x += away * (LAND_MIN + Math.random() * (LAND_MAX - LAND_MIN));
      spot.x = THREE.MathUtils.clamp(spot.x, -38, 36);
      if (Math.abs(spot.x - this.eye.x) < LAND_MIN) spot.x = this.eye.x - away * LAND_MIN;
      this.options.onTakeOff?.([bird.x, bird.z]);
    }
    bird.flying = true;
    bird.from.set(bird.x, bird.y, bird.z);
    bird.to.set(spot.x + (Math.random() - 0.5) * 2 * FORAGE, 0, spot.z + (Math.random() - 0.5) * FORAGE);
    bird.duration = Math.max(1.4, bird.from.distanceTo(bird.to) / FLIGHT_SPEED);
    bird.t = 0;
    bird.yaw = Math.atan2(bird.to.x - bird.x, bird.to.z - bird.z);
  }

  private fly(bird: Bird, dt: number): void {
    bird.t = Math.min(1, bird.t + dt / bird.duration);
    const t = bird.t;
    bird.x = THREE.MathUtils.lerp(bird.from.x, bird.to.x, t);
    bird.z = THREE.MathUtils.lerp(bird.from.z, bird.to.z, t);
    bird.y = Math.sin(t * Math.PI) * (2.2 + bird.duration * 0.6);
    if (t >= 1) {
      bird.flying = false;
      bird.y = 0;
      bird.hopT = 1;
      bird.hop = 1 + Math.random() * 3;
    }
  }

  private draw(): void {
    this.birds.forEach((bird, i) => {
      // Pecking pitches the body forward in quick dips; in flight it is level and the wings beat.
      const peck = bird.flying ? 0 : Math.max(0, Math.sin(bird.peck * 5 + i)) ** 6 * 0.7;
      this.euler.set(peck, bird.yaw, 0);
      this.turn.setFromEuler(this.euler);
      this.spot.set(bird.x, bird.y, bird.z);
      this.pose.compose(this.spot, this.turn, this.unit);
      this.bodies.setMatrixAt(i, this.pose);
      if (!bird.flying) {
        this.wings.setMatrixAt(2 * i, HIDDEN);
        this.wings.setMatrixAt(2 * i + 1, HIDDEN);
        return;
      }
      const beat = Math.sin(this.time * 24 + i) * 0.9;
      for (const side of [-1, 1] as const) {
        this.wingOffset.makeRotationZ(side * (0.2 + beat)).premultiply(this.lift.makeTranslation(side * 0.035, 0.2, 0));
        if (side < 0) this.wingOffset.multiply(MIRROR);
        this.wings.setMatrixAt(2 * i + (side > 0 ? 1 : 0), this.wingOffset.premultiply(this.pose));
      }
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;
  }
}

const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);

/** A pigeon at rest, beak to +z: a plump body, the head on a short neck, a tail; about 32 cm long. */
function bodyGeometry(): THREE.BufferGeometry {
  const body = new THREE.IcosahedronGeometry(0.1, 1).scale(0.85, 0.8, 1.35).translate(0, 0.14, 0);
  const head = new THREE.IcosahedronGeometry(0.045, 1).translate(0, 0.24, 0.12);
  const beak = new THREE.ConeGeometry(0.012, 0.04, 4).rotateX(Math.PI / 2).translate(0, 0.235, 0.17);
  const tail = new THREE.BoxGeometry(0.08, 0.015, 0.12).rotateX(-0.25).translate(0, 0.13, -0.17);
  const legs = new THREE.BoxGeometry(0.05, 0.07, 0.015).translate(0, 0.035, 0.01);
  const parts = [body, head, beak, tail, legs].map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(parts.map((g) => {
    g.deleteAttribute('uv');
    return g;
  }))!;
  merged.computeVertexNormals();
  return merged;
}

/** One wing, spreading along +x from the shoulder: a flat tapering blade. */
function wingGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(0, -0.06), new THREE.Vector2(0.24, -0.02), new THREE.Vector2(0.26, 0.02), new THREE.Vector2(0, 0.06)]);
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}
