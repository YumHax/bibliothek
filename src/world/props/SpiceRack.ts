import * as THREE from 'three';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { Prop, part, matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface SpiceRackOptions {
  /** Outer width. Default 0.4. */
  width?: number;
  /** Shelves in the rack, each holding a row of jars. Default 2. */
  rows?: number;
  /** Rack colour. Default a light beech. */
  wood?: number;
  seed?: number;
}

const ROW_HEIGHT = 0.11;
const DEPTH = 0.075;
const JAR_RADIUS = 0.021;
const JAR_HEIGHT = 0.075;
/** Paprika, turmeric, dried herbs, pepper, cinnamon, salt, chilli flakes, curry. */
const SPICES = [0xb8321f, 0xe0a321, 0x6b7a3a, 0x2c2622, 0x8b5a2b, 0xf1efe8, 0xc0441d, 0xc98e2a];

/**
 * A small wooden spice rack: shallow shelves between two end boards, a rail across the front of
 * each so nothing falls off, and a row of little glass jars with black caps and a white label,
 * each a different colour inside. Wall-hung: origin at the middle of its back, +z into the room.
 * Decoration: never collides.
 */
export class SpiceRack extends Prop {
  constructor(options: SpiceRackOptions = {}) {
    super();
    this.name = 'SpiceRack';
    const width = options.width ?? 0.4;
    const rows = options.rows ?? 2;
    const random = seededRandom(options.seed ?? 11);
    const wood = woodMaterial(options.wood ?? 0xc9a577, 0.6);
    const height = rows * ROW_HEIGHT + 0.02;
    const t = 0.012;
    const glass = new THREE.MeshStandardMaterial({ color: 0xe8f0f2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 });
    const cap = matte(0x1e1f22, 0.5);
    const label = matte(0xf4efe2, 0.9);

    part(this, width, height, 0.008, wood, { z: 0.004 }).castShadow = false;
    for (const side of [-1, 1]) part(this, t, height, DEPTH, wood, { x: side * (width / 2 - t / 2), z: DEPTH / 2 });
    const perRow = Math.max(1, Math.floor((width - 2 * t) / (JAR_RADIUS * 2 + 0.008)));
    const pitch = (width - 2 * t) / perRow;
    for (let r = 0; r < rows; r++) {
      const y = -height / 2 + 0.01 + r * ROW_HEIGHT;
      part(this, width - 2 * t, t, DEPTH, wood, { y: y + t / 2, z: DEPTH / 2 });
      part(this, width - 2 * t, 0.012, 0.008, wood, { y: y + t + 0.03, z: DEPTH - 0.004 }).castShadow = false;
      for (let i = 0; i < perRow; i++) {
        const x = -width / 2 + t + (i + 0.5) * pitch;
        const z = DEPTH / 2 - 0.004;
        const base = y + t;
        const spice = cylinderMesh(JAR_RADIUS - 0.003, JAR_HEIGHT * (0.5 + random() * 0.35), matte(SPICES[Math.floor(random() * SPICES.length)]!, 0.95), { x, z }, { segments: 12 });
        const fillH = (spice.geometry as THREE.CylinderGeometry).parameters.height;
        spice.position.y = base + fillH / 2 + 0.002;
        spice.castShadow = false;
        this.add(spice);
        const jar = cylinderMesh(JAR_RADIUS, JAR_HEIGHT, glass, { x, y: base + JAR_HEIGHT / 2, z }, { segments: 12 });
        jar.castShadow = false;
        this.add(jar);
        this.add(cylinderMesh(JAR_RADIUS + 0.001, 0.016, cap, { x, y: base + JAR_HEIGHT + 0.008, z }, { segments: 12 }));
        part(this, 0.024, 0.02, 0.001, label, { x, y: base + JAR_HEIGHT * 0.65, z: z + JAR_RADIUS + 0.0005 }).castShadow = false;
      }
    }
  }
}
