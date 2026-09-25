import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { nightnessOf } from './streetAir';
import type { Vec2 } from './streetPlan';

export interface StreetFurnitureOptions {
  shelter: { at: Vec2; yaw: number; length: number };
  benches: readonly { at: Vec2; yaw: number }[];
  bins: readonly Vec2[];
  hedge: { x: number; from: number; to: number; height: number; depth: number };
  railings: { x: number; from: number; to: number; height: number };
  anisotropy: number;
  /** The clock: the advertising panel lights up at night. */
  dayNight: DayNight;
}

type Finish = 'metal' | 'wood' | 'glass' | 'hedge' | 'bin';

const BENCH = { length: 1.8, depth: 0.55 };

/**
 * The things standing on the pavements, merged per material (a draw call per material for the
 * lot): the bus shelter on the far pavement (posts, roof, glass back and side, its bench, a lit
 * advertising panel), the benches, the litter bins, and along Park Street the park's clipped
 * hedge behind iron railings. Everything a person would bump into is in `colliders`
 * (zone-local); the hedge and railings are behind the street's invisible edge anyway.
 */
export class StreetFurniture extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  private readonly parts = new Map<Finish, THREE.BufferGeometry[]>();
  private readonly scratch = new THREE.Matrix4();
  private readonly ad: THREE.MeshStandardMaterial;
  private readonly dayNight: DayNight;

  constructor(options: StreetFurnitureOptions) {
    super();
    this.name = 'StreetFurniture';
    this.dayNight = options.dayNight;
    this.shelter(options.shelter);
    for (const bench of options.benches) this.bench(bench.at, bench.yaw);
    for (const bin of options.bins) this.bin(bin);
    this.hedge(options.hedge);
    this.railings(options.railings);

    const materials: Record<Finish, THREE.Material> = {
      metal: new THREE.MeshStandardMaterial({ color: 0x2f3a36, roughness: 0.5, metalness: 0.55 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.8 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xcfe0e8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
      hedge: new THREE.MeshStandardMaterial({ map: hedgeTexture(options.anisotropy), roughness: 0.95 }),
      bin: new THREE.MeshStandardMaterial({ color: 0x3d5446, roughness: 0.6, metalness: 0.3 }),
    };
    for (const [finish, geometries] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries)!, materials[finish]);
      for (const g of geometries) g.dispose();
      mesh.castShadow = finish !== 'glass';
      mesh.receiveShadow = finish !== 'glass';
      if (finish === 'glass') mesh.renderOrder = 2;
      this.add(mesh);
    }
    for (const [finish, material] of Object.entries(materials)) if (!this.parts.has(finish as Finish)) material.dispose();

    // The shelter's advertising panel, lit from inside at night.
    const poster = adTexture();
    this.ad = new THREE.MeshStandardMaterial({ map: poster, emissiveMap: poster, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.3 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.75), this.ad);
    const { at, yaw, length } = options.shelter;
    panel.position.set(at[0], 1.2, at[1]).add(new THREE.Vector3(length / 2 + 0.03, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    panel.rotation.y = yaw + Math.PI / 2;
    this.add(panel);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The advertising panel's light follows the night. */
  update(): void {
    this.ad.emissiveIntensity = 0.15 + 1.1 * THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.2, 0.6);
  }

  private put(finish: Finish, geometry: THREE.BufferGeometry, at: Vec2, yaw: number, local: [number, number, number]): void {
    geometry.translate(...local);
    this.scratch.makeRotationY(yaw).setPosition(at[0], 0, at[1]);
    geometry.applyMatrix4(this.scratch);
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    const list = this.parts.get(finish) ?? [];
    list.push(g);
    this.parts.set(finish, list);
  }

  private box(finish: Finish, w: number, h: number, d: number, at: Vec2, yaw: number, local: [number, number, number]): void {
    this.put(finish, new THREE.BoxGeometry(w, h, d), at, yaw, local);
  }

  /** A collider box around `at`, `w` x `d` turned by `yaw` (axis-aligned: yaw in quarter turns). */
  private collide(at: Vec2, yaw: number, w: number, d: number, h: number, offset: [number, number] = [0, 0]): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const x = at[0] + offset[0] * c + offset[1] * s;
    const z = at[1] - offset[0] * s + offset[1] * c;
    const along = Math.abs(c) > 0.5;
    const hx = (along ? w : d) / 2;
    const hz = (along ? d : w) / 2;
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - hx, 0, z - hz), new THREE.Vector3(x + hx, h, z + hz)));
  }

  /** Local +z is the open front (towards the road); x runs along the kerb. */
  private shelter({ at, yaw, length }: StreetFurnitureOptions['shelter']): void {
    const depth = 1.4;
    const height = 2.5;
    for (const x of [-length / 2, length / 2]) {
      for (const z of [-depth / 2, depth / 2]) this.box('metal', 0.08, height, 0.08, at, yaw, [x, height / 2, z]);
    }
    this.box('metal', length + 0.3, 0.1, depth + 0.3, at, yaw, [0, height + 0.05, 0]);
    this.box('metal', length, 0.06, 0.06, at, yaw, [0, 0.25, -depth / 2]);
    this.box('glass', length, height - 0.35, 0.02, at, yaw, [0, 0.35 + (height - 0.35) / 2, -depth / 2]);
    this.box('glass', 0.02, height - 0.35, depth * 0.9, at, yaw, [-length / 2, 0.35 + (height - 0.35) / 2, 0]);
    this.box('metal', 0.04, height - 0.35, depth * 0.9, at, yaw, [length / 2, 0.35 + (height - 0.35) / 2, 0]);
    // The bench inside, along the back.
    this.box('metal', length * 0.7, 0.05, 0.36, at, yaw, [0, 0.48, -depth / 2 + 0.22]);
    this.collide(at, yaw, length + 0.2, 0.3, height, [0, -depth / 2]);
    this.collide(at, yaw, 0.2, depth, height, [-length / 2, 0]);
    this.collide(at, yaw, 0.2, depth, height, [length / 2, 0]);
  }

  /** Two cast-iron ends, three seat slats and two back slats; local +z is where one sits facing. */
  private bench(at: Vec2, yaw: number): void {
    const { length, depth } = BENCH;
    for (const x of [-length / 2 + 0.12, length / 2 - 0.12]) {
      this.box('metal', 0.06, 0.45, depth, at, yaw, [x, 0.225, 0]);
      this.box('metal', 0.06, 0.5, 0.06, at, yaw, [x, 0.7, -depth / 2 + 0.04]);
    }
    for (let i = 0; i < 3; i++) this.box('wood', length, 0.035, 0.12, at, yaw, [0, 0.46, -depth / 2 + 0.1 + i * 0.16]);
    for (let i = 0; i < 2; i++) this.box('wood', length, 0.1, 0.03, at, yaw, [0, 0.62 + i * 0.16, -depth / 2 + 0.05]);
    this.collide(at, yaw, length, depth, 0.8);
  }

  private bin(at: Vec2): void {
    this.put('bin', new THREE.CylinderGeometry(0.24, 0.21, 0.85, 12), at, 0, [0, 0.425 + 0.05, 0]);
    this.put('metal', new THREE.CylinderGeometry(0.26, 0.26, 0.06, 12), at, 0, [0, 0.93, 0]);
    this.put('metal', new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6), at, 0, [0, 0.03, 0]);
    this.collide(at, 0, 0.55, 0.55, 1);
  }

  private hedge({ x, from, to, height, depth }: StreetFurnitureOptions['hedge']): void {
    const length = to - from;
    this.put('hedge', new THREE.BoxGeometry(depth, height, length, 1, 1, 1), [x, (from + to) / 2], 0, [0, height / 2, 0]);
    // A rounded top: a second, narrower course.
    this.put('hedge', new THREE.BoxGeometry(depth * 0.8, 0.2, length), [x, (from + to) / 2], 0, [0, height + 0.08, 0]);
  }

  /** Iron railings: a top and bottom rail, bars with spear tips every 14 cm, a post every 2.5 m. */
  private railings({ x, from, to, height }: StreetFurnitureOptions['railings']): void {
    const length = to - from;
    const mid: Vec2 = [x, (from + to) / 2];
    this.box('metal', 0.04, 0.04, length, mid, 0, [0, height - 0.08, 0]);
    this.box('metal', 0.04, 0.04, length, mid, 0, [0, 0.12, 0]);
    const bars: THREE.BufferGeometry[] = [];
    for (let z = from; z <= to; z += 0.14) bars.push(new THREE.BoxGeometry(0.018, height, 0.018).translate(x, height / 2, z));
    for (let z = from; z <= to; z += 2.5) bars.push(new THREE.BoxGeometry(0.06, height + 0.12, 0.06).translate(x, (height + 0.12) / 2, z));
    const merged = mergeGeometries(bars)!;
    for (const b of bars) b.dispose();
    this.put('metal', merged, [0, 0], 0, [0, 0, 0]);
  }
}

/** Clipped privet: dense small leaves in greens, darker hollows. */
function hedgeTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const random = seededRandom(808);
  ctx.fillStyle = '#34502a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const g = 60 + Math.floor(random() * 70);
    ctx.fillStyle = `rgba(${Math.floor(g * 0.55)}, ${g}, ${Math.floor(g * 0.4)}, 0.8)`;
    ctx.beginPath();
    ctx.ellipse(random() * size, random() * size, 2 + random() * 3, 1 + random() * 2, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = toTexture(canvas, anisotropy);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // The hedge is one long box: the leaves keep their size along its street side.
  texture.repeat.set(80, 1);
  return texture;
}

/** The shelter's poster: an ad for a games fair (the city is full of collectors). */
function adTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 372);
  const g = ctx.createLinearGradient(0, 0, 0, 372);
  g.addColorStop(0, '#2a1f4a');
  g.addColorStop(1, '#ff2fa0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 372);
  ctx.fillStyle = '#ffd23a';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GAME', 128, 90);
  ctx.fillText('FAIR', 128, 140);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('RETRO · CARTS · CONSOLES', 128, 200);
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('Sunday, the old market hall', 128, 240);
  ctx.fillStyle = '#5fe6ff';
  for (let i = 0; i < 6; i++) ctx.fillRect(40 + i * 30, 290, 20, 34);
  return toTexture(canvas, 2);
}
