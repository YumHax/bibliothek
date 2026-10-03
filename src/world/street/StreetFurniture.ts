import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createCanvas, seededRandom, toTexture, repeatTexture } from '@/covers/generated/canvasUtils';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { snowCovered } from './snowCover';
import { nightnessOf } from './streetAir';
import type { Vec2 } from './streetPlan';
import { standard } from '../materials/palette';
import { isShared } from '../materials/sharedResources';
import { RENDER_ORDER } from '../surface/layers';

export interface StreetFurnitureOptions {
  shelter: { at: Vec2; yaw: number; length: number };
  benches: readonly { at: Vec2; yaw: number }[];
  bins: readonly Vec2[];
  hedge: { x: number; from: number; to: number; height: number; depth: number };
  railings: { x: number; from: number; to: number; height: number };
  /**
   * The park's gate (its middle z along the railings, and width): a gap in the hedge, taller piers, two leaves. With
   * `hours` it opens in them (the leaves swing in towards the park) and its collider leaves `collisions` meanwhile,
   * never shutting on the `viewer` still inside the park; without, it stays shut (the views of the street).
   */
  gate: { z: number; width: number; hours?: readonly [number, number] };
  anisotropy: number;
  /** The clock: the advertising panel lights up at night, the gate keeps its hours. */
  dayNight: DayNight;
  /** The zone's live colliders (world space): the shut gate's box comes and goes there. */
  collisions?: { add(box: THREE.Box3): void; remove(box: THREE.Box3): void };
  /** The camera: whether the player is in the park (the gate waits for them to come out). */
  viewer?: THREE.Object3D;
  /** The shelter's poster, when the street paints a live one (`events/WhatsOn`); else its games fair ad. */
  ad?: THREE.Texture;
}

type Finish = 'metal' | 'wood' | 'glass' | 'hedge' | 'bin';

const BENCH = { length: 1.8, depth: 0.55 };
/** The bus shelter's frame: depth front to back, the posts' height, and how far the roof overhangs all round. */
export const SHELTER = { depth: 1.4, height: 2.5, overhang: 0.15, roof: 0.1 } as const;
/** The shelter's roof as a box on the pavement (length along the kerb, depth, top): what keeps the rain off (`Precipitation`). */
export function shelterRoof(length: number): { length: number; depth: number; height: number } {
  return { length: length + 2 * SHELTER.overhang, depth: SHELTER.depth + 2 * SHELTER.overhang, height: SHELTER.height + SHELTER.roof / 2 };
}
/** Edges of the street furniture are rounded this much (never more than a fifth of the part's thinnest side). */
const EDGE = 0.008;
/** Parts thinner than this stay sharp boxes (glass, bars): a bevel there is below a pixel. */
const EDGE_MIN_SIDE = 0.03;
/** The gate's leaves swing this far open (radians) over `GATE_SWING_S` seconds. */
const GATE_OPEN = Math.PI * 0.45;
const GATE_SWING_S = 2.5;
/** Lumps in the hedge's clipped top and sides: how far they bulge, and how long a lump runs. */
const HEDGE_LUMP = { up: 0.07, out: 0.035, every: 0.55 };

/**
 * The things standing on the pavements, merged per material (a draw call per material for the
 * lot): the bus shelter on the far pavement (posts, roof, glass back and side, its bench, a lit
 * advertising panel), the benches, the litter bins, and along Park Street the park's clipped
 * hedge behind iron railings, with the park's gate. Everything a person would bump into is in
 * `colliders` (zone-local); the railings are the street's edge on the park side. Snow settles
 * on the shelter's roof, the benches, the bins and the hedge (`snowCovered`).
 */
export class StreetFurniture extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  private readonly parts = new Map<Finish, THREE.BufferGeometry[]>();
  private readonly scratch = new THREE.Matrix4();
  private readonly ad: THREE.MeshStandardMaterial;
  private readonly dayNight: DayNight;
  private readonly options: StreetFurnitureOptions;
  /** The gate's two leaves (pivoting on their hinges at the piers), how open they are 0..1, its box while shut. */
  private readonly leaves: THREE.Object3D[] = [];
  private gateOpen = 0;
  private gateBox: THREE.Box3 | null = null;
  private gateShut = true;
  private readonly eye = new THREE.Vector3();

  constructor(options: StreetFurnitureOptions) {
    super();
    this.name = 'StreetFurniture';
    this.dayNight = options.dayNight;
    this.options = options;
    this.shelter(options.shelter);
    for (const bench of options.benches) this.bench(bench.at, bench.yaw);
    for (const bin of options.bins) this.bin(bin);
    this.hedge(options.hedge, options.gate);
    this.railings(options.railings, options.gate);

    const materials: Record<Finish, THREE.Material> = {
      metal: snowCovered(new THREE.MeshStandardMaterial({ color: 0x2f3a36, roughness: 0.5 })),
      wood: snowCovered(new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.8 })),
      glass: standard({ color: 0xcfe0e8, roughness: 0.06, transparent: true, opacity: 0.22, depthWrite: false }),
      hedge: snowCovered(new THREE.MeshStandardMaterial({ map: hedgeTexture(options.anisotropy), roughness: 0.95 })),
      bin: snowCovered(new THREE.MeshStandardMaterial({ color: 0x3d5446, roughness: 0.55 })),
    };
    for (const [finish, geometries] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries)!, materials[finish]);
      for (const g of geometries) g.dispose();
      mesh.castShadow = finish !== 'glass';
      mesh.receiveShadow = finish !== 'glass';
      if (finish === 'glass') mesh.renderOrder = RENDER_ORDER.sheen;
      this.add(mesh);
    }
    this.gateLeaves(options.railings, options.gate, materials.metal);
    for (const [finish, material] of Object.entries(materials)) if (!this.parts.has(finish as Finish) && finish !== 'metal' && !isShared(material)) material.dispose();

    // The shelter's advertising panel, lit from inside at night.
    const poster = options.ad ?? adTexture();
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

  /** The advertising panel's light follows the night; the gate opens and shuts with the park's hours. */
  update(dt: number): void {
    this.ad.emissiveIntensity = 0.15 + 1.1 * THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.2, 0.6);
    this.updateGate(dt);
  }

  /** Whether the park's gate stands open (its gardens walked). */
  get parkOpen(): boolean {
    return !this.gateShut;
  }

  private updateGate(dt: number): void {
    const { gate, collisions, viewer, railings } = this.options;
    if (!gate.hours) return;
    const h = this.dayNight.state.hours;
    let open = h >= gate.hours[0] && h < gate.hours[1];
    if (!open && viewer) {
      // Never shut on someone still in the park: it waits for them to come out.
      this.worldToLocal(viewer.getWorldPosition(this.eye));
      // In the gateway too (its box reaches 0.08 m street side of the railings, plus the player's radius).
      if (this.eye.x < railings.x + 0.6) open = true;
    }
    if (!this.gateBox) {
      const half = gate.width / 2 + 0.3;
      this.gateBox = new THREE.Box3(new THREE.Vector3(railings.x - 1.1, 0, gate.z - half), new THREE.Vector3(railings.x + 0.08, 3, gate.z + half)).applyMatrix4(this.matrixWorld);
      collisions?.add(this.gateBox);
    }
    if (open === this.gateShut) {
      this.gateShut = !open;
      if (this.gateShut) collisions?.add(this.gateBox);
      else collisions?.remove(this.gateBox);
    }
    const target = this.gateShut ? 0 : 1;
    if (this.gateOpen === target) return;
    this.gateOpen = THREE.MathUtils.clamp(this.gateOpen + (target > this.gateOpen ? dt : -dt) / GATE_SWING_S, 0, 1);
    const swing = GATE_OPEN * THREE.MathUtils.smootherstep(this.gateOpen, 0, 1);
    for (const [i, leaf] of this.leaves.entries()) leaf.rotation.y = (i === 0 ? -1 : 1) * swing;
  }

  dispose(): void {
    if (this.gateBox && this.gateShut) this.options.collisions?.remove(this.gateBox);
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

  /** A part, its edges rounded (`EDGE`) unless it is glass or too thin to show it. */
  private box(finish: Finish, w: number, h: number, d: number, at: Vec2, yaw: number, local: [number, number, number]): void {
    const thinnest = Math.min(w, h, d);
    const rounded = finish !== 'glass' && thinnest >= EDGE_MIN_SIDE;
    this.put(finish, rounded ? new RoundedBoxGeometry(w, h, d, 2, Math.min(EDGE, thinnest * 0.2)) : new THREE.BoxGeometry(w, h, d), at, yaw, local);
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
    const { depth, height, overhang, roof } = SHELTER;
    for (const x of [-length / 2, length / 2]) {
      for (const z of [-depth / 2, depth / 2]) this.box('metal', 0.08, height, 0.08, at, yaw, [x, height / 2, z]);
    }
    this.box('metal', length + 2 * overhang, roof, depth + 2 * overhang, at, yaw, [0, height + roof / 2, 0]);
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
    this.put('bin', new THREE.CylinderGeometry(0.24, 0.21, 0.85, 20), at, 0, [0, 0.425 + 0.05, 0]);
    this.put('metal', new THREE.CylinderGeometry(0.26, 0.26, 0.06, 20), at, 0, [0, 0.93, 0]);
    this.put('metal', new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6), at, 0, [0, 0.03, 0]);
    this.collide(at, 0, 0.55, 0.55, 1);
  }

  /** The clipped hedge, in two runs either side of the gate's gap: rounded shoulders, a lumpy top and sides. */
  private hedge({ x, from, to, height, depth }: StreetFurnitureOptions['hedge'], gate: StreetFurnitureOptions['gate']): void {
    const gap = gate.width / 2 + 0.25;
    for (const [z0, z1] of [[from, gate.z - gap], [gate.z + gap, to]] as const) {
      this.put('hedge', hedgeRun(depth, height, z1 - z0, z0), [x, (z0 + z1) / 2], 0, [0, height / 2, 0]);
    }
  }

  /**
   * Iron railings: a top and bottom rail, bars with spear tips every 14 cm, a post every 2.5 m; the
   * gate between two taller piers with ball finials, its two leaves shut. They are the street's edge (`colliders`).
   */
  private railings({ x, from, to, height }: StreetFurnitureOptions['railings'], gate: StreetFurnitureOptions['gate']): void {
    const half = gate.width / 2;
    const inGate = (z: number): boolean => Math.abs(z - gate.z) < half + 0.25;
    // The top and bottom rails in two runs, either side of the gate's piers.
    const runs = [[from, gate.z - half - 0.12], [gate.z + half + 0.12, to]] as const;
    for (const [z0, z1] of runs) {
      const mid: Vec2 = [x, (z0 + z1) / 2];
      this.box('metal', 0.04, 0.04, z1 - z0, mid, 0, [0, height - 0.08, 0]);
      this.box('metal', 0.04, 0.04, z1 - z0, mid, 0, [0, 0.12, 0]);
    }
    const bars: THREE.BufferGeometry[] = [];
    for (let z = from; z <= to; z += 0.14) if (!inGate(z)) bars.push(new THREE.BoxGeometry(0.018, height, 0.018).translate(x, height / 2, z));
    for (let z = from; z <= to; z += 2.5) if (!inGate(z)) bars.push(new THREE.BoxGeometry(0.06, height + 0.12, 0.06).translate(x, (height + 0.12) / 2, z));
    // The piers either side of the gate, with ball finials (the leaves are `gateLeaves`).
    const gateHeight = height + 0.45;
    for (const side of [-1, 1]) {
      const z = gate.z + side * (half + 0.12);
      bars.push(new THREE.BoxGeometry(0.2, gateHeight + 0.2, 0.2).translate(x, (gateHeight + 0.2) / 2, z));
      bars.push(new THREE.SphereGeometry(0.1, 10, 6).translate(x, gateHeight + 0.3, z));
    }
    const merged = mergeGeometries(bars.map((b) => (b.index ? b.toNonIndexed() : b)))!;
    for (const b of bars) b.dispose();
    this.put('metal', merged, [0, 0], 0, [0, 0, 0]);
    // The street's edge either side of the gate; the gate's own box comes and goes with its hours (`updateGate`), or
    // stands for good when it keeps none.
    for (const [z0, z1] of runs) this.colliders.push(new THREE.Box3(new THREE.Vector3(x - 1.1, 0, z0), new THREE.Vector3(x + 0.08, 3, z1)));
    if (!gate.hours) this.colliders.push(new THREE.Box3(new THREE.Vector3(x - 1.1, 0, gate.z - half - 0.12), new THREE.Vector3(x + 0.08, 3, gate.z + half + 0.12)));
  }

  /** The gate's two leaves, each hinged at its pier (bars up to a higher rail, a rail along the top), shut to begin with. */
  private gateLeaves({ x, height }: StreetFurnitureOptions['railings'], gate: StreetFurnitureOptions['gate'], metal: THREE.Material): void {
    const half = gate.width / 2;
    const gateHeight = height + 0.45;
    for (const side of [-1, 1]) {
      const bars: THREE.BufferGeometry[] = [];
      // Leaf-local: z from the hinge (0) towards the gate's middle (`side` * -1).
      for (let d = 0.07; d < half; d += 0.14) bars.push(new THREE.BoxGeometry(0.02, gateHeight, 0.02).translate(0, gateHeight / 2, -side * d));
      for (const y of [0.15, gateHeight - 0.1]) bars.push(new THREE.BoxGeometry(0.05, 0.05, half - 0.01).translate(0, y, (-side * half) / 2));
      const geometry = mergeGeometries(bars.map((b) => (b.index ? b.toNonIndexed() : b)))!;
      for (const b of bars) b.dispose();
      const leaf = new THREE.Mesh(geometry, metal);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      leaf.position.set(x, 0, gate.z + side * half);
      this.add(leaf);
      this.leaves.push(leaf);
    }
  }
}

/**
 * One run of clipped hedge, centred (y from -height/2), `length` along z: a finely cut box whose top
 * edges are rounded into shoulders and whose top and sides bulge in lumps the clippers missed
 * (smooth noise along the run, seeded by where it starts so both runs differ). Normals recomputed.
 */
function hedgeRun(depth: number, height: number, length: number, seed: number): THREE.BufferGeometry {
  const segments = Math.max(4, Math.ceil(length / 0.25));
  const g = new THREE.BoxGeometry(depth, height, length, 6, 5, segments);
  const position = g.getAttribute('position') as THREE.BufferAttribute;
  const shoulder = Math.min(0.22, depth * 0.3);
  const lump = (z: number, k: number): number => {
    const t = (z + seed * 1.7 + k * 13.1) / HEDGE_LUMP.every;
    return 0.6 * Math.sin(t * 2.1) * Math.sin(t * 0.73 + k) + 0.4 * Math.sin(t * 4.3 + 1.3 * k);
  };
  for (let i = 0; i < position.count; i++) {
    let px = position.getX(i);
    let py = position.getY(i);
    const pz = position.getZ(i);
    const up = (py + height / 2) / height;
    // The shoulders: near the top the sides draw in on a quarter circle.
    const below = height / 2 - py;
    if (below < shoulder) {
      const t = 1 - below / shoulder;
      const pull = shoulder * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
      px -= Math.sign(px) * pull * (Math.abs(px) / (depth / 2));
    }
    // Lumps: the top rises and falls, the sides bulge more towards the top (clipped less up there).
    const top = THREE.MathUtils.smoothstep(up, 0.6, 1);
    py += HEDGE_LUMP.up * top * lump(pz, 0);
    px += Math.sign(px) * HEDGE_LUMP.out * up * lump(pz, Math.sign(px) + 2) * (Math.abs(px) / (depth / 2));
    position.setXYZ(i, px, py, pz);
  }
  g.computeVertexNormals();
  return g;
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
  repeatTexture(texture);
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
  return toTexture(canvas, 'facing');
}
