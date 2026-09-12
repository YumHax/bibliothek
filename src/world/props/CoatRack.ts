import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';

export interface CoatRackOptions {
  /** Two wire shelves of shoes under the coats. Default true. */
  shoeRack?: boolean;
}

const WIDTH = 0.7;
const BOARD_Y = 1.7;
/** How far the coats and the shoe rack reach into the room. */
const DEPTH = 0.25;

const WALNUT = matte(0x5e412b, 0.5);
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.6, roughness: 0.35 });

/**
 * The coat corner by a front door: a hook board with two coats and a tote bag hanging from it,
 * and a wire shoe rack underneath. Wall-hung with `y: 0`: origin on the floor at the wall,
 * +z into the room. Collides over its whole depth (the coats hang into the way).
 */
export class CoatRack extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: CoatRackOptions = {}) {
    super();
    this.name = 'CoatRack';
    this.buildHooks();
    if (options.shoeRack ?? true) this.buildShoeRack();
    this.footprint = new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, 0), new THREE.Vector3(WIDTH / 2, BOARD_Y + 0.05, DEPTH));
  }

  private buildHooks(): void {
    part(this, WIDTH, 0.1, 0.02, WALNUT, { y: BOARD_Y, z: 0.01 });
    for (const dx of [-0.24, 0, 0.24]) {
      const hook = cylinderMesh(0.006, 0.06, BRASS, { x: dx, y: BOARD_Y - 0.01, z: 0.05 }, { segments: 8 });
      hook.rotation.x = Math.PI / 2;
      this.add(hook);
      part(this, 0.014, 0.03, 0.014, BRASS, { x: dx, y: BOARD_Y + 0.005, z: 0.075 });
    }
    // Coats hang from the outer hooks: a body and a collar, in navy and camel.
    for (const [dx, colour] of [
      [-0.24, 0x2b3350],
      [0.24, 0x9a7a52],
    ] as const) {
      const cloth = matte(colour, 0.95);
      part(this, 0.36, 0.82, 0.09, cloth, { x: dx, y: BOARD_Y - 0.05 - 0.41, z: 0.085 });
      part(this, 0.2, 0.08, 0.1, cloth, { x: dx, y: BOARD_Y - 0.03, z: 0.09 });
    }
    // The tote bag on the middle hook.
    const canvas = matte(0xd9cdb4, 0.95);
    part(this, 0.3, 0.34, 0.05, canvas, { y: BOARD_Y - 0.33, z: 0.065 });
    for (const dx of [-0.1, 0.1]) part(this, 0.02, 0.18, 0.015, canvas, { x: dx, y: BOARD_Y - 0.08, z: 0.06 });
  }

  /** Two wire shelves: white trainers and black shoes below, brown boots on top. */
  private buildShoeRack(): void {
    const depth = 0.22;
    const z = 0.02 + depth / 2;
    for (const y of [0.12, 0.3]) part(this, WIDTH, 0.012, depth, STEEL, { y, z });
    for (const dx of [-0.33, 0.33]) for (const dz of [-0.09, 0.09]) this.add(cylinderMesh(0.006, 0.31, STEEL, { x: dx, y: 0.155, z: z + dz }, { segments: 6 }));
    const shoe = (y: number, colour: number, h: number, dx: number): void => {
      const material = matte(colour, 0.7);
      for (const side of [-0.06, 0.06]) part(this, 0.1, h, 0.22, material, { x: dx + side, y: y + h / 2, z });
    };
    shoe(0.126, 0xf0eee8, 0.08, -0.2);
    shoe(0.126, 0x2a2a2a, 0.07, 0.18);
    shoe(0.306, 0x6a4326, 0.16, -0.05);
  }
}
