import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import { cylinderMesh } from '../../meshUtils';
import { part } from '../../props/Prop';
import { basic, instancedStandard, paint, standard } from '../../materials/palette';
import { mergeStaticParts } from '../../zone/mergeStatic';
import { PooledLight } from '../../lighting/LightPool';
import { TankBubbler } from '../shopSounds';
import type { PropVoice, ShopVoiced } from '../common/fitting';
import { lcg } from '@/random';

export interface AquariumWallOptions {
  /** Length along the wall. Default 2.0. */
  width?: number;
  seed?: number;
}

const DEPTH = 0.4;
const POST = 0.03;
const RACK = 1.8;
/** The two tiers: the shelf each stands on, how many tanks, their height and depth. */
const TIERS: readonly { y: number; count: number; height: number; depth: number }[] = [
  { y: 0.64, count: 2, height: 0.45, depth: 0.36 },
  { y: 1.24, count: 3, height: 0.32, depth: 0.3 },
];
/** (Not 4 cm: the lower tanks' hoods would end level with the tiled wainscot's cap behind them, 1.13 m.) */
const HOOD = 0.045;
const PLINTH = 0.09;
const GRAVEL = 0.035;
const FRAME = paint(0x1c1d20, 0.45);
const RACK_PAINT = paint(0x2a2d30, 0.5);
const DOORS = paint(0x2f5a5a, 0.55);
const HOOD_STRIP = basic({ color: 0xeaf6ff });
const GRAVELS: readonly number[] = [0x8a7a60, 0xc8b890, 0x4a4a52, 0xb8a078, 0x7a6a58];
const WEEDS: readonly number[] = [0x3a8a3a, 0x4aa04a, 0x2f6a3a, 0x6a9a3a];
/** The tanks' back glass lit through: tropical blue-green, and a cold-water tank a little greener. */
const GLOWS: readonly number[] = [0x3fb8c0, 0x5ac8a8];
const FISH_COLOURS: readonly number[] = [0xff7a2a, 0xffc830, 0x4ac8e8, 0xe84a6a, 0xf0f0f0, 0x2a5ae8, 0xff4a2a, 0xa0e040];
const BUBBLES_PER_TANK = 8;

interface Tank {
  x: number;
  bottom: number;
  width: number;
  height: number;
  depth: number;
  /** The air stone's place along the tank, where its bubbles rise. */
  stone: number;
}

interface Fish {
  tank: Tank;
  phase: number;
  speed: number;
  z: number;
  y: number;
  scale: number;
}

/**
 * PAWS & CLAWS' wall of tanks: a steel rack with cupboards under it, two big tanks on the lower shelf and three small
 * ones over them, each over its own gravel with weed, a rock or two, its back glass lit blue-green from behind and a
 * lit hood on top, fish of every colour drifting end to end (one instanced mesh) and a column of bubbles from each air
 * stone (another). The rack and the tanks' dressing merge; the water is one mesh. Its light on the room is a
 * `PooledLight` (never switched off: the fish's lamps stay on), its pump the `TankBubbler`. The shop's, not for sale.
 * Wall-hung with `y: 0`: origin on the floor at the wall, +z into the room. Collides as its box.
 */
export class AquariumWall extends THREE.Group implements Furniture, Updatable, ShopVoiced {
  readonly footprint: THREE.Box3;
  private readonly fish: Fish[] = [];
  private readonly fishMesh: THREE.InstancedMesh;
  private readonly bubbles: THREE.InstancedMesh;
  private readonly tanks: Tank[] = [];
  private readonly pose = new THREE.Matrix4();
  private readonly facing = new THREE.Quaternion();
  private readonly turn = new THREE.Euler();
  private readonly at = new THREE.Vector3();
  private readonly scaled = new THREE.Vector3();
  private time = 0;

  constructor(options: AquariumWallOptions = {}) {
    super();
    this.name = 'AquariumWall';
    const W = options.width ?? 2.0;
    const random = lcg(options.seed ?? 13);
    const still = new THREE.Group();
    this.add(still);

    // The rack: four posts, the plinth, the cupboards under the big tanks, the two shelves.
    for (const x of [-W / 2 + POST / 2, W / 2 - POST / 2]) for (const z of [POST / 2, DEPTH - POST / 2]) part(still, POST, RACK, POST, RACK_PAINT, { x, y: RACK / 2, z });
    // The plinth over the skirting's 8 cm (it stands against the wall: level, their tops would fight).
    part(still, W, PLINTH, DEPTH, RACK_PAINT, { y: PLINTH / 2, z: DEPTH / 2 });
    const doors = 3;
    const doorW = (W - 2 * POST) / doors;
    for (let i = 0; i < doors; i++) {
      part(still, doorW - 0.012, TIERS[0]!.y - 0.04 - PLINTH, 0.018, DOORS, { x: -W / 2 + POST + doorW * (i + 0.5), y: PLINTH + (TIERS[0]!.y - 0.04 - PLINTH) / 2, z: DEPTH - 0.012 });
      part(still, 0.012, 0.08, 0.02, paint(0xc8c0a8, 0.4), { x: -W / 2 + POST + doorW * (i + 0.5) + doorW * 0.36, y: TIERS[0]!.y * 0.62, z: DEPTH + 0.004 });
    }
    for (const tier of TIERS) part(still, W, 0.03, DEPTH, RACK_PAINT, { y: tier.y - 0.015, z: DEPTH / 2 });
    // A cap along the top, the plugs' board and its cables down the side.
    part(still, W, 0.025, DEPTH, RACK_PAINT, { y: RACK - 0.012, z: DEPTH / 2 });
    part(still, 0.05, 0.3, 0.05, paint(0xe8e4d8, 0.5), { x: W / 2 - 0.06, y: RACK - 0.35, z: 0.05 });

    const water: THREE.BufferGeometry[] = [];
    for (let t = 0; t < TIERS.length; t++) {
      const tier = TIERS[t]!;
      const span = (W - 2 * POST - 0.04 * (tier.count + 1)) / tier.count;
      for (let i = 0; i < tier.count; i++) {
        const x = -W / 2 + POST + 0.04 + i * (span + 0.04) + span / 2;
        const tank: Tank = { x, bottom: tier.y, width: span, height: tier.height, depth: tier.depth, stone: (random() - 0.5) * span * 0.6 };
        this.tanks.push(tank);
        this.dress(still, tank, random, (t + i) % 2, water);
      }
    }
    mergeStaticParts(still);

    // The water of every tank, one see-through mesh.
    const merged = mergeGeometries(water.map((g) => g.toNonIndexed()));
    for (const g of water) g.dispose();
    if (merged) {
      const mesh = new THREE.Mesh(merged, standard({ color: 0x5aa8a0, roughness: 0.08, transparent: true, opacity: 0.28, depthWrite: false }));
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.add(mesh);
    }

    // The fish: a body and a tail, one instanced mesh for every tank.
    const body = new THREE.SphereGeometry(0.02, 8, 6).scale(1.6, 1, 0.5);
    const tail = new THREE.ConeGeometry(0.014, 0.025, 5).rotateZ(Math.PI / 2).translate(-0.042, 0, 0);
    const fishGeometry = mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()])!;
    body.dispose();
    tail.dispose();
    for (const tank of this.tanks) {
      const count = tank.height > 0.4 ? 6 : 4;
      for (let i = 0; i < count; i++) {
        this.fish.push({
          tank,
          phase: random() * Math.PI * 2,
          speed: 0.2 + random() * 0.3,
          z: 0.05 + DEPTH - tank.depth + random() * (tank.depth - 0.12),
          y: tank.bottom + GRAVEL + 0.06 + random() * (tank.height - GRAVEL - 0.14),
          scale: 0.7 + random() * 0.6,
        });
      }
    }
    this.fishMesh = new THREE.InstancedMesh(fishGeometry, instancedStandard({ roughness: 0.35 }), this.fish.length);
    this.fish.forEach((_, i) => this.fishMesh.setColorAt(i, new THREE.Color(FISH_COLOURS[i % FISH_COLOURS.length]!)));
    this.fishMesh.castShadow = false;
    this.fishMesh.frustumCulled = false;
    this.add(this.fishMesh);

    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.004, 6, 4), instancedStandard({ color: 0xf4fbff, roughness: 0.1, transparent: true, opacity: 0.6, depthWrite: false }), this.tanks.length * BUBBLES_PER_TANK);
    this.bubbles.castShadow = false;
    this.bubbles.frustumCulled = false;
    this.add(this.bubbles);

    // What the tanks' lamps throw on the room, blue-green, always on.
    const light = new PooledLight(0x6fd8d0, 0.9, 3.5, 2);
    light.position.set(0, 1.2, DEPTH + 0.5);
    this.add(light);

    this.footprint = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, RACK, DEPTH));
    this.update(0);
  }

  voices(): readonly PropVoice[] {
    return [{ voice: new TankBubbler(), at: new THREE.Vector3(0, 0.95, DEPTH / 2), options: { referenceDistance: 0.6, maxDistance: 6 } }];
  }

  update(dt: number): void {
    this.time += dt;
    this.fish.forEach((f, i) => {
      const reach = f.tank.width / 2 - 0.07;
      const a = this.time * f.speed + f.phase;
      this.at.set(f.tank.x + Math.sin(a) * reach, f.y + Math.sin(a * 2.3) * 0.015, f.z + Math.sin(a * 0.7) * 0.02);
      // Nose along the way it swims: +x while sin rises.
      this.turn.set(0, Math.cos(a) >= 0 ? 0 : Math.PI, 0);
      this.facing.setFromEuler(this.turn);
      this.pose.compose(this.at, this.facing, this.scaled.setScalar(f.scale));
      this.fishMesh.setMatrixAt(i, this.pose);
    });
    this.fishMesh.instanceMatrix.needsUpdate = true;
    this.tanks.forEach((tank, t) => {
      const rise = tank.height - GRAVEL - 0.03;
      for (let b = 0; b < BUBBLES_PER_TANK; b++) {
        const k = (this.time * 0.55 + b / BUBBLES_PER_TANK) % 1;
        this.at.set(tank.x + tank.stone + Math.sin(k * 14 + b) * 0.006, tank.bottom + GRAVEL + k * rise, DEPTH - tank.depth / 2 - 0.02);
        this.pose.compose(this.at, this.facing.identity(), this.scaled.setScalar(0.6 + k * 0.8));
        this.bubbles.setMatrixAt(t * BUBBLES_PER_TANK + b, this.pose);
      }
    });
    this.bubbles.instanceMatrix.needsUpdate = true;
  }

  /** One tank on its shelf: the black trim, the gravel, the lit back, weed, a rock, the air stone and the hood; its water into `water`. */
  private dress(parent: THREE.Object3D, tank: Tank, random: () => number, glow: number, water: THREE.BufferGeometry[]): void {
    const { x, bottom, width, height, depth } = tank;
    const back = DEPTH - depth - 0.02;
    const zc = back + depth / 2;
    // The trim round the bottom and the top of the glass, the corner posts.
    part(parent, width, 0.02, depth, FRAME, { x, y: bottom + 0.01, z: zc });
    part(parent, width, 0.012, depth, FRAME, { x, y: bottom + height - 0.006, z: zc });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(parent, 0.012, height, 0.012, FRAME, { x: x + (sx * (width - 0.012)) / 2, y: bottom + height / 2, z: zc + (sz * (depth - 0.012)) / 2 });
    part(parent, width - 0.02, GRAVEL, depth - 0.02, paint(GRAVELS[Math.floor(random() * GRAVELS.length)]!, 1), { x, y: bottom + 0.02 + GRAVEL / 2, z: zc });
    // The back glass, lit from behind.
    part(parent, width - 0.02, height - 0.04, 0.006, basic({ color: GLOWS[glow]! }), { x, y: bottom + height / 2, z: back + 0.006 });
    const weed = paint(WEEDS[Math.floor(random() * WEEDS.length)]!, 0.65);
    const blades = Math.round(width / 0.08);
    for (let i = 0; i < blades; i++) {
      const h = (0.35 + random() * 0.5) * (height - GRAVEL - 0.05);
      parent.add(cylinderMesh(0.006, h, weed, { x: x - width / 2 + 0.05 + (i / blades) * (width - 0.1), y: bottom + 0.02 + GRAVEL + h / 2, z: back + 0.04 + random() * 0.06 }, { radiusBottom: 0.012, segments: 5 }));
    }
    const rock = paint(0x6a6258, 0.9);
    for (let i = 0; i < 2; i++) {
      const s = 0.03 + random() * 0.04;
      part(parent, s * 1.6, s, s * 1.2, rock, { x: x + (random() - 0.5) * width * 0.7, y: bottom + 0.02 + GRAVEL + s / 2, z: zc + (random() - 0.3) * depth * 0.4 });
    }
    parent.add(cylinderMesh(0.012, 0.012, paint(0xd8d0c0, 0.9), { x: x + tank.stone, y: bottom + 0.02 + GRAVEL + 0.006, z: DEPTH - depth / 2 - 0.02 }, { segments: 8 }));
    // The hood and its lamp's strip under the front edge.
    part(parent, width + 0.01, HOOD, depth + 0.01, FRAME, { x, y: bottom + height + HOOD / 2, z: zc });
    part(parent, width - 0.08, 0.004, 0.02, HOOD_STRIP, { x, y: bottom + height - 0.004, z: back + depth - 0.05 });
    water.push(new THREE.BoxGeometry(width - 0.016, height - GRAVEL - 0.05, depth - 0.016).translate(x, bottom + 0.02 + GRAVEL + (height - GRAVEL - 0.05) / 2, zc));
  }
}
