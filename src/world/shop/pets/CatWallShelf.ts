import * as THREE from 'three';
import { Prop, part } from '../../props/Prop';
import { cylinderMesh } from '../../meshUtils';
import { cloth, paint, timber } from '../../materials/palette';

export interface CatWallShelfOptions {
  /** Length along the wall. Default 0.55. */
  width?: number;
  /** The bed's colour. Default a mustard. */
  bed?: number;
}

const DEPTH = 0.28;
const BOARD = 0.03;

/**
 * A cat's nap shelf on the wall: a pine board on two black brackets, a round padded bed on it with a knitted blanket
 * folded over its edge and a plush mouse, a step below it for the jump up. The shop's, where its visiting cats sleep
 * off the afternoon. Static: its parts merge. Wall-hung: origin on the wall at the board's top, +z into the room.
 * Decoration: never collides (it is over the heads).
 */
export class CatWallShelf extends Prop {
  constructor(options: CatWallShelfOptions = {}) {
    super();
    this.name = 'CatWallShelf';
    const W = options.width ?? 0.55;
    const pine = timber(0xc9a473, 0.6);
    const iron = paint(0x1e1e20, 0.5);
    part(this, W, BOARD, DEPTH, pine, { y: -BOARD / 2, z: DEPTH / 2 });
    for (const s of [-1, 1]) {
      part(this, 0.02, 0.16, 0.012, iron, { x: s * (W / 2 - 0.08), y: -BOARD - 0.08, z: 0.006 });
      const strut = part(this, 0.02, 0.012, 0.22, iron, { x: s * (W / 2 - 0.08), y: -BOARD - 0.08, z: 0.1 });
      strut.rotation.x = -0.62;
    }
    // The bed: a padded disc, its bolster ring, the blanket over the edge, the mouse.
    const bed = options.bed ?? 0xc8a040;
    const fabric = cloth(bed);
    this.add(cylinderMesh(0.17, 0.025, cloth(new THREE.Color(bed).lerp(new THREE.Color(0xffffff), 0.3).getHex()), { y: 0.0125, z: DEPTH / 2 }, { segments: 22 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 8, 24), fabric);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1, 1, 0.75);
    ring.position.set(0, 0.035, DEPTH / 2);
    this.add(ring);
    const blanket = cloth(0x8a3a4a);
    part(this, 0.2, 0.012, 0.16, blanket, { x: W / 2 - 0.12, y: 0.075, z: DEPTH / 2 + 0.02 });
    part(this, 0.2, 0.1, 0.012, blanket, { x: W / 2 - 0.12, y: 0.03, z: DEPTH + 0.004 });
    const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8).scale(1.5, 0.8, 1), cloth(0x9a9a9a));
    mouse.position.set(-0.06, 0.045, DEPTH / 2 + 0.03);
    mouse.rotation.y = 0.6;
    this.add(mouse);
    // The step below, off to one side.
    part(this, 0.3, BOARD, 0.2, pine, { x: -W / 2 - 0.05, y: -0.42 - BOARD / 2, z: 0.1 });
    part(this, 0.02, 0.1, 0.012, iron, { x: -W / 2 - 0.05, y: -0.42 - BOARD - 0.05, z: 0.006 });
  }
}
