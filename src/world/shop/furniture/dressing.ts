import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { Cushion } from '../../props/Cushion';
import { cloth, paint, timber, METAL } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';

/*
 * What makes SECOND HOME's rooms on show look lived in rather than delivered: a throw over an armchair's arm, cushions
 * leaning on the bed's pillows, the things left on a dresser, a runner, a jug of flowers and a bowl of fruit on the
 * kitchen table. Each stands in the frame of the piece it dresses (the plan places it where that piece stands), and
 * none of it is for sale. Decoration: never collides; static, the parts merge.
 */

const FRINGE = 0.03;

export interface ArmchairThrowOptions {
  /** Over which arm, seen from the seat: -1 the left, 1 the right (local x). Default 1. */
  side?: -1 | 1;
  color?: number;
  /** The band woven across its end. Default cream. */
  band?: number;
}

/**
 * A knitted throw tossed over an armchair's arm (`Seat`'s: 0.8 wide, the arms 0.1 wide and 0.7 high, 0.6 deep), one
 * end hanging down the outside with its fringe, the other lying on the seat. In the chair's frame: place it where the
 * armchair stands, turned as it is.
 */
export class ArmchairThrow extends Prop {
  constructor(options: ArmchairThrowOptions = {}) {
    super();
    this.name = 'ArmchairThrow';
    const s = options.side ?? 1;
    const wool = cloth(options.color ?? 0xb8863a, 1);
    const band = cloth(options.band ?? 0xefe6d2, 1);
    const T = 0.014;
    const D = 0.44;
    const z = 0.04;
    // Over the arm's top, down its outer face, and in onto the seat cushion.
    part(this, 0.13, T, D, wool, { x: s * 0.35, y: 0.7 + T / 2, z });
    part(this, T, 0.33, D, wool, { x: s * (0.4 + T / 2), y: 0.7 - 0.33 / 2 + T, z });
    part(this, T, 0.05, D, band, { x: s * (0.4 + T / 2 + 0.001), y: 0.43, z });
    part(this, T, 0.25, D - 0.04, wool, { x: s * (0.3 - T / 2), y: 0.7 - 0.25 / 2 + T, z });
    part(this, 0.1, T, D - 0.04, wool, { x: s * 0.245, y: 0.452, z }).rotation.z = s * 0.12;
    // The fringe along the hanging end.
    for (let i = 0; i < 9; i++) part(this, 0.006, FRINGE, 0.012, band, { x: s * (0.4 + T / 2), y: 0.37 + T - FRINGE / 2, z: z - D / 2 + 0.03 + i * ((D - 0.06) / 8) });
  }
}

export interface BedCushionsOptions {
  colors?: [number, number];
}

/**
 * Two square cushions leaning on the made bed's pillows (`Bed`'s: the mattress's top at 0.52, the pillows reaching
 * about 0.47 from the headboard). In the bed's frame: place it where the bed stands.
 */
export class BedCushions extends Prop {
  constructor(options: BedCushionsOptions = {}) {
    super();
    this.name = 'BedCushions';
    const [a, b] = options.colors ?? [0xc9a552, 0x3f6a6a];
    const pairs: [number, number, number][] = [[-0.28, a, 0.12], [0.3, b, -0.1]];
    for (const [x, color, yaw] of pairs) {
      const cushion = new Cushion({ width: 0.42, depth: 0.42, thickness: 0.13, color, tilt: 1.1 });
      // Its bottom back edge (0.21 behind its origin) against the pillows.
      cushion.position.set(x, 0.532, 0.68);
      cushion.rotation.y = yaw;
      this.add(cushion);
    }
  }
}

/**
 * The top of a dresser (`Dresser`'s: 0.85 high, 0.9 wide, its top's middle 0.24 off the wall) as it would be at home:
 * a stoneware vase of dried grasses, a jewellery box with its brass clasp, a pile of folded linen. In the dresser's
 * frame (wall-hung with `y: 0`): place it where the dresser stands.
 */
export class DresserTop extends Prop {
  constructor(seed = 5) {
    super();
    this.name = 'DresserTop';
    const random = seededRandom(seed);
    const top = 0.85;
    const z = 0.24;
    // The vase and its grasses, fanned out.
    this.add(cylinderMesh(0.05, 0.2, paint(0x9aa39a, 0.7), { x: -0.28, y: top + 0.1, z }, { radiusBottom: 0.04, segments: 16 }));
    const grass = paint(0xc9b07a, 0.9);
    const seedHead = paint(0xe6d6b0, 1);
    for (let i = 0; i < 9; i++) {
      const stem = new THREE.Group();
      stem.position.set(-0.28, top + 0.18, z);
      stem.rotation.set((random() - 0.5) * 0.5, random() * Math.PI, (random() - 0.5) * 0.6);
      const h = 0.28 + random() * 0.2;
      part(stem, 0.004, h, 0.004, grass, { y: h / 2 });
      part(stem, 0.014, 0.06, 0.014, seedHead, { y: h });
      this.add(stem);
    }
    // The jewellery box.
    const walnut = timber(0x4a3221, 0.5);
    part(this, 0.16, 0.06, 0.1, walnut, { x: 0.04, y: top + 0.03, z: z - 0.02 });
    part(this, 0.165, 0.014, 0.105, walnut, { x: 0.04, y: top + 0.067, z: z - 0.02 });
    part(this, 0.02, 0.018, 0.006, METAL.brass(), { x: 0.04, y: top + 0.058, z: z + 0.033 });
    // Folded linen, one on the other, not quite square.
    let y = top;
    for (const [color, h] of [[0xefe6d2, 0.035], [0x8fa3ad, 0.03], [0xc8785a, 0.028]] as const) {
      part(this, 0.28, h, 0.2, cloth(color, 1), { x: 0.27 + (random() - 0.5) * 0.02, y: y + h / 2, z: z - 0.01 }).rotation.y = (random() - 0.5) * 0.1;
      y += h;
    }
  }
}

/**
 * The kitchen table (`KitchenTable`'s: 0.75 high, 0.85 by 0.7) as if the flat were already lived in: a linen runner
 * down its length, a jug of garden flowers, a bowl of fruit. In the table's frame: place it where the table stands.
 */
export class TableDressing extends Prop {
  constructor(seed = 9) {
    super();
    this.name = 'TableDressing';
    const random = seededRandom(seed);
    const top = 0.75;
    part(this, 0.8, 0.004, 0.24, cloth(0xd8cbb0, 1), { y: top + 0.002 });
    // The jug, its handle and a bunch of flowers.
    const glaze = paint(0x3a5a78, 0.35);
    this.add(cylinderMesh(0.05, 0.15, glaze, { x: -0.2, y: top + 0.004 + 0.075, z: 0.02 }, { radiusBottom: 0.06, segments: 16 }));
    part(this, 0.012, 0.08, 0.03, glaze, { x: -0.2 - 0.065, y: top + 0.1, z: 0.02 });
    const stem = paint(0x4a7a3a, 0.8);
    const blooms = [0xf4f0f4, 0xe8b830, 0xd87ab8];
    const sphere = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 11; i++) {
      const g = new THREE.Group();
      g.position.set(-0.2, top + 0.14, 0.02);
      g.rotation.set((random() - 0.5) * 0.9, 0, (random() - 0.5) * 0.9);
      const h = 0.12 + random() * 0.1;
      part(g, 0.004, h, 0.004, stem, { y: h / 2 });
      const bloom = new THREE.Mesh(sphere, cloth(blooms[i % blooms.length]!, 0.9));
      bloom.scale.setScalar(0.022 + random() * 0.012);
      bloom.position.y = h;
      bloom.castShadow = true;
      g.add(bloom);
      this.add(g);
    }
    // The fruit bowl.
    this.add(cylinderMesh(0.11, 0.06, paint(0xefe6d2, 0.4), { x: 0.18, y: top + 0.004 + 0.03, z: -0.01 }, { radiusBottom: 0.06, segments: 20 }));
    const fruit: [number, number, number, number][] = [[0xe8962e, 0.14, 0.02, 0.038], [0xc8402e, 0.22, -0.04, 0.036], [0x8ab84a, 0.2, 0.05, 0.035], [0xe8962e, 0.18, -0.01, 0.037]];
    fruit.forEach(([color, x, z, r], i) => {
      const f = new THREE.Mesh(sphere, paint(color, 0.45));
      f.scale.setScalar(r);
      f.position.set(x, top + 0.05 + r * 0.6 + (i === 3 ? 0.04 : 0), z - 0.01);
      f.castShadow = true;
      this.add(f);
    });
  }
}
