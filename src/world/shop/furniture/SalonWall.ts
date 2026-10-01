import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint, standard, timber, METAL } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';

export interface SalonWallOptions {
  seed?: number;
}

const GLASS = standard({ color: 0xdfe6ea, roughness: 0.04, metalness: 1 });
const GILT = METAL.brass();
const DARK_WOOD = timber(0x3a2a1e, 0.5);
const BLACK = paint(0x1c1a18, 0.5);
const FACE = paint(0xf2ecdc, 0.7);
const HAND = paint(0x1c1a18, 0.4);
const MOUNT = paint(0xf4f0e6, 0.9);
/** The prints' colour fields: a few quiet blocks each, second-hand abstracts. */
const FIELDS: readonly (readonly number[])[] = [
  [0xc8785a, 0xe8d8b8, 0x3e4a5c],
  [0x3f6a6a, 0xc9a552],
  [0x6a4a7a, 0xe0c8a8, 0x8a2a22],
  [0x8fa383, 0x3a3634],
];

/**
 * A furniture shop's wall of odds and ends hung salon-style, none of it for sale on its own tag (they are the shop's
 * dressing, bought with the flat's pieces in spirit only): a big round mirror in a gilt frame, an oval one in dark
 * wood, a sunburst clock and a school clock (both stopped, at different times: nobody winds them), a handful of small
 * framed prints in colour blocks. Wall-hung: origin at the middle of the cluster (the plan's `y` its height), x along
 * the wall, +z into the room; it spans about 2 m by 1.1 m. Decoration: never collides; static, the parts merge.
 */
export class SalonWall extends Prop {
  constructor(options: SalonWallOptions = {}) {
    super();
    this.name = 'SalonWall';
    const random = seededRandom(options.seed ?? 13);
    // The round mirror in the middle, a little high.
    disc(this, 0.3, 0.035, GILT, 0, 0.12);
    disc(this, 0.26, 0.012, GLASS, 0, 0.12, 0.035);
    // The oval, in dark wood, left of it.
    disc(this, 0.2, 0.03, DARK_WOOD, -0.62, 0.02, 0, 0.7);
    disc(this, 0.17, 0.01, GLASS, -0.62, 0.02, 0.03, 0.7);
    // The sunburst clock, up right.
    sunburst(this, 0.62, 0.3, random);
    // The school clock, below it.
    schoolClock(this, 0.72, -0.28, random);
    // The prints.
    const prints: [x: number, y: number, w: number, h: number][] = [
      [-0.12, -0.38, 0.34, 0.26],
      [-0.95, 0.4, 0.22, 0.3],
      [-0.98, -0.2, 0.26, 0.2],
      [0.3, 0.44, 0.2, 0.16],
    ];
    prints.forEach(([x, y, w, h], i) => print(this, x, y, w, h, FIELDS[i % FIELDS.length]!, i % 2 ? DARK_WOOD : BLACK));
    this.traverse((o) => (o.castShadow = false));
  }
}

/** A round (or, `sx` < 1, oval) disc facing +z, `depth` thick, its back `z0` off the wall. */
function disc(parent: THREE.Object3D, r: number, depth: number, material: THREE.Material, x: number, y: number, z0 = 0, sx = 1): THREE.Mesh {
  const mesh = cylinderMesh(r, depth, material, {}, { segments: 32 });
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z0 + depth / 2);
  mesh.scale.x = sx;
  parent.add(mesh);
  return mesh;
}

/** Two hands from the middle of a clock's face at (x, y), `z` in front of it, at a time of its own. */
function hands(parent: THREE.Object3D, x: number, y: number, z: number, r: number, random: () => number): void {
  const hour = random() * Math.PI * 2;
  const minute = random() * Math.PI * 2;
  for (const [angle, length, width] of [[hour, r * 0.55, 0.012], [minute, r * 0.85, 0.007]] as const) {
    const hand = part(parent, width, length, 0.003, HAND, { x: x + Math.sin(angle) * length * 0.4, y: y + Math.cos(angle) * length * 0.4, z });
    hand.rotation.z = -angle;
  }
}

function sunburst(parent: THREE.Object3D, x: number, y: number, random: () => number): void {
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const long = i % 2 === 0 ? 0.2 : 0.14;
    const ray = part(parent, 0.012, long, 0.01, GILT, { x: x + Math.sin(a) * (0.07 + long / 2), y: y + Math.cos(a) * (0.07 + long / 2), z: 0.012 });
    ray.rotation.z = -a;
  }
  disc(parent, 0.085, 0.025, GILT, x, y);
  disc(parent, 0.065, 0.006, FACE, x, y, 0.025);
  hands(parent, x, y, 0.034, 0.065, random);
}

function schoolClock(parent: THREE.Object3D, x: number, y: number, random: () => number): void {
  const r = 0.14;
  disc(parent, r, 0.04, BLACK, x, y);
  disc(parent, r - 0.014, 0.004, FACE, x, y, 0.04);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tick = part(parent, 0.006, i % 3 === 0 ? 0.022 : 0.012, 0.002, HAND, { x: x + Math.sin(a) * (r - 0.03), y: y + Math.cos(a) * (r - 0.03), z: 0.045 });
    tick.rotation.z = -a;
  }
  hands(parent, x, y, 0.047, r - 0.02, random);
}

/** A small framed print: the frame, a white mount, a few colour fields stacked in it. */
function print(parent: THREE.Object3D, x: number, y: number, w: number, h: number, fields: readonly number[], frame: THREE.Material): void {
  const bar = 0.018;
  const d = 0.02;
  for (const sy of [-1, 1]) part(parent, w + 2 * bar, bar, d, frame, { x, y: y + (sy * (h + bar)) / 2, z: d / 2 });
  for (const sx of [-1, 1]) part(parent, bar, h, d, frame, { x: x + (sx * (w + bar)) / 2, y, z: d / 2 });
  part(parent, w, h, 0.006, MOUNT, { x, y, z: 0.003 });
  const inner = { w: w * 0.7, h: h * 0.72 };
  const band = inner.h / fields.length;
  fields.forEach((color, i) => part(parent, inner.w, band * 0.94, 0.004, paint(color, 0.85), { x, y: y - inner.h / 2 + band * (i + 0.5), z: 0.008 }));
}
