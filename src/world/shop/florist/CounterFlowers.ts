import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { METAL, paint } from '../../materials/palette';
import { LeafBatch, addBunch, headGeometry } from './greenery';
import { lcg } from '@/random';

export interface CounterFlowersOptions {
  seed?: number;
}

/** Greeting cards in the rack, face on. */
const CARDS = [0xf0e0e8, 0xe8f0e0, 0xf4ecd0, 0xe0e8f4];

/**
 * What the florist keeps on the counter (`on: 'counter'`, clear of the till and the bell): a jug of sweet peas, a
 * wire rack of little cards to write on, a pen beside it. Static: its parts merge.
 * Origin on the counter top, +z the customer's side. Decoration.
 */
export class CounterFlowers extends Prop {
  constructor(options: CounterFlowersOptions = {}) {
    super();
    this.name = 'CounterFlowers';
    const random = lcg(options.seed ?? 4);
    const leaves = new LeafBatch();
    // The jug of sweet peas.
    this.add(cylinderMesh(0.04, 0.13, paint(0x5a7a8a, 0.35), { y: 0.065 }, { radiusBottom: 0.05, segments: 16 }));
    addBunch(this, leaves, headGeometry(), new THREE.Vector3(0, 0.13, 0), { colors: [0xd87ab8, 0xf0a0b8, 0xb04ac0, 0xf4f0f4], stems: 12, height: 0.2, spread: 0.07, head: 0.018 }, random);
    // The card rack beside it: a wire back and ledge, cards leaning in two rows.
    const wire = METAL.satinSteel();
    const rack = new THREE.Group();
    rack.position.set(-0.13, 0, 0.02);
    this.add(rack);
    part(rack, 0.12, 0.004, 0.06, wire, { y: 0.002 });
    part(rack, 0.004, 0.14, 0.004, wire, { x: -0.058, y: 0.07, z: -0.028 });
    part(rack, 0.004, 0.14, 0.004, wire, { x: 0.058, y: 0.07, z: -0.028 });
    for (const [i, colour] of CARDS.entries()) {
      const card = part(rack, 0.05, 0.07, 0.002, paint(colour, 0.8), { x: -0.03 + (i % 2) * 0.06, y: 0.04 + Math.floor(i / 2) * 0.05, z: -0.015 + Math.floor(i / 2) * -0.008 });
      card.rotation.x = -0.25;
    }
    // The pen.
    const pen = part(this, 0.1, 0.008, 0.008, paint(0x2a3a6a, 0.4), { x: -0.14, y: 0.005, z: 0.07 });
    pen.rotation.y = 0.4;
    leaves.addTo(this);
  }
}
