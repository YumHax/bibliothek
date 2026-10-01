import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { cylinderMesh } from '../../meshUtils';
import { part } from '../../props/Prop';
import { paint, timber } from '../../materials/palette';
import { hangTag } from './tagCard';

export interface ChairStackOptions {
  /** Chairs in the stack. Default 4. */
  count?: number;
  /** The tag hung on the top one (default SOLD, in red), or none. */
  tag?: readonly string[] | null;
}

const SEAT_Y = 0.45;
const SEAT = 0.4;
/** How much higher each chair in the stack sits than the one under it. */
const STEP = 0.075;
const LEG_R = 0.013;

/**
 * Café chairs stacked seat on seat, the way a furniture shop takes in a job lot (bentwood-ish: a round-cornered
 * seat, four splayed legs, a hooped back), each a little higher and a touch askew; a card tied to the top one: SOLD,
 * waiting for the van. Origin on the floor under the stack, the backs towards -z. Collides as its box; static, the
 * parts merge.
 */
export class ChairStack extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: ChairStackOptions = {}) {
    super();
    this.name = 'ChairStack';
    const count = options.count ?? 4;
    const wood = timber(0x6a4326, 0.5);
    const seatPaint = paint(0x2a2826, 0.6);
    // The splayed legs in a plain paint of the wood's colour: the grain (a patched shader) would keep each turned leg
    // a draw of its own (`mergeStaticParts`), and it does not show on a leg that thin.
    const legWood = paint(0x6a4326, 0.5);
    for (let i = 0; i < count; i++) {
      const chair = new THREE.Group();
      // Stacked a little askew, shifted rather than turned so the grained parts still merge.
      chair.position.set((i % 2 ? 1 : -1) * 0.008 * i, i * STEP, (i % 2 ? -1 : 1) * 0.006 * i);
      part(chair, SEAT, 0.025, SEAT, seatPaint, { y: SEAT_Y });
      part(chair, SEAT + 0.02, 0.02, SEAT + 0.02, wood, { y: SEAT_Y - 0.02 });
      // The legs, splayed a little (the next chair's legs straddle them).
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const leg = cylinderMesh(LEG_R, SEAT_Y - 0.02, legWood, { x: sx * (SEAT / 2 - 0.03), y: (SEAT_Y - 0.02) / 2, z: sz * (SEAT / 2 - 0.03) }, { segments: 8 });
          leg.rotation.set(sz * 0.06, 0, -sx * 0.06);
          chair.add(leg);
        }
      // The back: two posts up from the seat and a hoop across them.
      for (const sx of [-1, 1]) part(chair, 0.025, 0.42, 0.025, wood, { x: sx * (SEAT / 2 - 0.03), y: SEAT_Y + 0.21, z: -SEAT / 2 + 0.02 });
      part(chair, SEAT - 0.03, 0.06, 0.02, wood, { y: SEAT_Y + 0.4, z: -SEAT / 2 + 0.02 });
      part(chair, SEAT - 0.06, 0.02, 0.018, wood, { y: SEAT_Y + 0.22, z: -SEAT / 2 + 0.02 });
      this.add(chair);
    }
    const tag = options.tag === undefined ? ['SOLD', 'collect Fri'] : options.tag;
    if (tag) hangTag(this, new THREE.Vector3(SEAT / 2 - 0.03, SEAT_Y + (count - 1) * STEP + 0.4, -SEAT / 2 + 0.035), 0.2, { lines: tag, band: 0xb8302a, seed: count });
    const half = SEAT / 2 + 0.04;
    this.footprint = new THREE.Box3(new THREE.Vector3(-half, 0, -half), new THREE.Vector3(half, SEAT_Y + (count - 1) * STEP + 0.45, half));
  }
}
