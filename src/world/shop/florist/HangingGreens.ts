import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop } from '../../props/Prop';
import { paint, timber } from '../../materials/palette';
import { hangFromCeiling } from '../common/ceilingDrop';
import { LeafBatch, LEAF_GREENS, addTrail, headGeometry, stem } from './greenery';
import { lcg, pick } from '@/random';

/** A basket of trailing greens on a jute hanger, `drop` below the ceiling at (x, z) of the prop's frame. */
export interface HangingBasket {
  at: [x: number, z: number];
  /** From the ceiling to the basket's rim. Default 0.45. */
  drop?: number;
  /** How far its vines trail below the basket. Default 0.35. */
  trail?: number;
}

/** A pole on two cords with bunches of dried flowers tied upside down along it. */
export interface DriedRail {
  at: [x: number, z: number];
  length: number;
  /** Turned about the vertical (the pole runs along local x). */
  yaw?: number;
  /** From the ceiling to the pole. Default 0.55. */
  drop?: number;
}

export interface HangingGreensOptions {
  baskets?: readonly HangingBasket[];
  rails?: readonly DriedRail[];
  seed?: number;
}

const BASKET = paint(0x9a7a4a, 0.95);
const BASKET_RIM = paint(0x7a5a34, 0.95);
/** Dried lavender, statice, strawflowers, eucalyptus, wheat: faded colours. */
const DRIED: readonly number[] = [0x8a78a8, 0xb08aa0, 0xc89a5a, 0xd8c890, 0xa86a5a, 0xe8e0c8];
const TWINE = paint(0xc8b080, 1);

/**
 * What hangs from the florist's ceiling, all in one prop so it merges into a few draws: baskets of pothos and ivy on
 * jute hangers, their vines trailing over the rim (kept above head height by their `drop`), and poles on cords with
 * bunches of dried flowers tied upside down along them. Ceiling-hung at `{ ceiling: [0, 0] }`: its frame is the
 * room's, y up from the ceiling. Decoration: never collides.
 */
export class HangingGreens extends Prop {
  constructor(options: HangingGreensOptions = {}) {
    super();
    this.name = 'HangingGreens';
    const random = lcg(options.seed ?? 12);
    const leaves = new LeafBatch();
    for (const basket of options.baskets ?? []) {
      const g = new THREE.Group();
      g.position.set(basket.at[0], 0, basket.at[1]);
      this.add(g);
      const y = hangFromCeiling(g, basket.drop ?? 0.45, 'jute');
      // The macramé's three legs down to the basket's rim.
      const r = 0.13;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        stem(g, new THREE.Vector3(0, y, 0), new THREE.Vector3(Math.cos(a) * r, y - 0.2, Math.sin(a) * r), TWINE, 0.006);
      }
      const rim = y - 0.2;
      // The basket ends under its rim (its top would lie in the rim's).
      g.add(cylinderMesh(r, 0.12, BASKET, { y: rim - 0.08 }, { radiusBottom: r * 0.7, segments: 16 }));
      g.add(cylinderMesh(r * 1.04, 0.02, BASKET_RIM, { y: rim - 0.01 }, { segments: 16 }));
      // A mound of leaves over the rim, then the vines.
      const greens = random() < 0.5 ? LEAF_GREENS.lime : LEAF_GREENS.classic;
      for (let i = 0; i < 18; i++) {
        const a = random() * Math.PI * 2;
        const d = random() * r * 0.9;
        leaves.leaf(pick(random, greens), new THREE.Vector3(basket.at[0] + Math.cos(a) * d, rim - 0.01, basket.at[1] + Math.sin(a) * d), new THREE.Vector3(Math.cos(a), 0.7, Math.sin(a)), 0.06 + random() * 0.03, 0.05, random() * Math.PI);
      }
      const trail = basket.trail ?? 0.35;
      const vines = 7 + Math.floor(random() * 3);
      for (let i = 0; i < vines; i++) {
        const a = (i / vines) * Math.PI * 2 + random() * 0.4;
        const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const from = new THREE.Vector3(basket.at[0] + out.x * r, rim - 0.01, basket.at[1] + out.z * r);
        addTrail(this, leaves, from, trail * (0.5 + random() * 0.6), random, greens, 0.04, out);
      }
    }

    const head = headGeometry();
    for (const rail of options.rails ?? []) {
      const g = new THREE.Group();
      g.position.set(rail.at[0], 0, rail.at[1]);
      g.rotation.y = rail.yaw ?? 0;
      this.add(g);
      const drop = rail.drop ?? 0.55;
      for (const x of [-rail.length / 2 + 0.08, rail.length / 2 - 0.08]) {
        const end = new THREE.Group();
        end.position.x = x;
        g.add(end);
        hangFromCeiling(end, drop, 'cord');
      }
      const pole = cylinderMesh(0.014, rail.length, timber(0x8a6a44, 0.8), { y: -drop - 0.014 });
      pole.rotation.z = Math.PI / 2;
      g.add(pole);
      // Bunches upside down, tied at the pole, heads down.
      const bunches = Math.floor(rail.length / 0.14);
      for (let b = 0; b < bunches; b++) {
        const x = -rail.length / 2 + 0.07 + b * ((rail.length - 0.14) / Math.max(1, bunches - 1));
        const tie = new THREE.Vector3(x, -drop - 0.03, 0);
        const color = pick(random, DRIED);
        const flower = paint(color, 0.95);
        const dry = paint(0x9a9a6a, 0.9);
        g.add(cylinderMesh(0.012, 0.02, TWINE, { x, y: tie.y, z: 0 }, { segments: 8 }));
        const stems = 9 + Math.floor(random() * 5);
        const length = 0.24 + random() * 0.1;
        for (let i = 0; i < stems; i++) {
          const a = random() * Math.PI * 2;
          const d = 0.02 + random() * 0.04;
          const tip = new THREE.Vector3(x + Math.cos(a) * d, tie.y - length * (0.85 + random() * 0.2), Math.sin(a) * d);
          stem(g, tie, tip, dry, 0.004);
          const bloom = new THREE.Mesh(head, flower);
          const r = 0.012 + random() * 0.01;
          bloom.position.copy(tip);
          bloom.scale.set(r, r * 1.6, r);
          g.add(bloom);
        }
      }
    }
    leaves.addTo(this);
  }
}
