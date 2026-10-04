import { cylinderMesh } from '../../meshUtils';
import * as THREE from 'three';
import { Prop, part } from '../../props/Prop';
import { paint, METAL } from '../../materials/palette';
import { lcg } from '@/random';

export interface ReceiptSpikeOptions {
  /** Slips on it. Default 9. */
  slips?: number;
  seed?: number;
}

const BASE = paint(0x2a2a2c, 0.5);
const SLIPS: readonly number[] = [0xf4f2ea, 0xe8e0c8, 0xf0e8a8, 0xe8c8c0];

/**
 * The till's spike: a heavy black foot, a steel spike, the day's job slips and receipts skewered on it every which
 * way, pink carbons among the white. Origin on the counter under its foot. Decoration: never collides; merges.
 */
export class ReceiptSpike extends Prop {
  readonly contactShadow = false;

  constructor(options: ReceiptSpikeOptions = {}) {
    super();
    this.name = 'ReceiptSpike';
    const random = lcg(options.seed ?? 7);
    this.add(cylinderMesh(0.035, 0.018, BASE, { y: 0.009 }, { radiusBottom: 0.04, segments: 16 }));
    this.add(cylinderMesh(0.002, 0.16, METAL.steel(), { y: 0.1 }, { radiusBottom: 0.003, segments: 6 }));
    const slips = options.slips ?? 9;
    for (let i = 0; i < slips; i++) {
      const w = 0.07 + random() * 0.03;
      const d = 0.09 + random() * 0.05;
      // Pierced off its middle, turned about the spike, tipped a little.
      const slip = new THREE.Group();
      slip.position.y = 0.022 + i * 0.006;
      slip.rotation.set((random() - 0.5) * 0.2, random() * Math.PI * 2, (random() - 0.5) * 0.2);
      part(slip, w, 0.0008, d, paint(SLIPS[Math.floor(random() * SLIPS.length)]!, 0.9), { x: (random() - 0.5) * w * 0.4, z: d * 0.2 });
      this.add(slip);
    }
  }
}
