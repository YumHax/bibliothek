import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { part } from '../../props/Prop';
import { cloth, timber, METAL } from '../../materials/palette';

export interface FoldingScreenOptions {
  /** Leaves, each `leaf` wide. Default 3 of 0.5. */
  leaves?: number;
  leaf?: number;
  height?: number;
  /** The panels' fabric, and the frames' wood. */
  fabric?: number;
  wood?: number;
}

const BAR = 0.035;
/** How far each leaf is turned from the one before it (a zigzag). */
const FOLD = 0.55;

/**
 * A folding screen of framed fabric leaves standing in a zigzag: in a furniture showroom it is the wall that isn't
 * there, closing one room on show off from the next (the bedroom from the living room). Each leaf a timber frame
 * with a rail across, a cloth panel, brass hinges where they meet. Origin on the floor at the middle of the run, the
 * leaves along local x. Collides as its box; static, the parts merge.
 */
export class FoldingScreen extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: FoldingScreenOptions = {}) {
    super();
    this.name = 'FoldingScreen';
    const leaves = options.leaves ?? 3;
    const leaf = options.leaf ?? 0.5;
    const height = options.height ?? 1.7;
    const wood = timber(options.wood ?? 0x5e412b, 0.55);
    const panel = cloth(options.fabric ?? 0xd8c8a0, 1);
    const brass = METAL.brass();
    // Walk the zigzag: each leaf starts where the last one ended.
    const cos = Math.cos(FOLD);
    const span = leaf * cos * leaves;
    let x = -span / 2;
    let minZ = 0;
    let maxZ = 0;
    for (let i = 0; i < leaves; i++) {
      const turn = i % 2 === 0 ? FOLD : -FOLD;
      const g = new THREE.Group();
      g.position.set(x, 0, i % 2 === 0 ? 0 : -Math.sin(FOLD) * leaf);
      g.rotation.y = turn;
      // Its frame: two stiles on little feet, top and bottom rails, a rail across two thirds up.
      for (const sx of [BAR / 2, leaf - BAR / 2]) part(g, BAR, height - 0.05, BAR, wood, { x: sx, y: 0.05 + (height - 0.05) / 2 });
      for (const y of [0.18, height - BAR / 2, height * 0.66]) part(g, leaf - 2 * BAR, BAR, BAR * 0.8, wood, { x: leaf / 2, y });
      part(g, leaf - 2 * BAR, height - 0.18 - BAR - 0.02, 0.008, panel, { x: leaf / 2, y: 0.18 + (height - 0.18 - BAR) / 2 });
      part(g, leaf - 2 * BAR, 0.14, 0.008, panel, { x: leaf / 2, y: 0.09 + 0.02 });
      if (i > 0) for (const y of [0.35, height - 0.3]) part(g, 0.012, 0.07, BAR + 0.01, brass, { x: 0.004, y });
      this.add(g);
      x += leaf * cos;
      minZ = Math.min(minZ, -Math.sin(FOLD) * leaf);
      maxZ = Math.max(maxZ, 0);
    }
    this.footprint = new THREE.Box3(new THREE.Vector3(-span / 2 - 0.03, 0, minZ - 0.03), new THREE.Vector3(span / 2 + 0.03, height, maxZ + 0.03));
  }
}
