import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { UsableProp, type UseOptions } from '../props/UsableProp';
import { Prop } from '../props/Prop';
import { paint, standard } from '../materials/palette';

/*
 * What the kitchen is used for (docs/household.md): the cleaning kit on the table, the mixing bowl
 * that bakes a cake, the cake itself, the cat's treat jar, what the cat left by its bowl. Each stands
 * on its base at local y = 0 facing +z; the builder wires their captions and clicks to `HomeLife`.
 */

const GLASS = standard({ color: 0xe8f0f2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
const CERAMIC = standard({ color: 0xf2eee6, roughness: 0.35, side: THREE.DoubleSide });

/**
 * The cleaning kit, set out on a tea towel: a bottle of isopropyl alcohol, a jar of cotton buds, a
 * soft cloth folded beside them and a small brush. A worn box brought here is cleaned up.
 */
export class CleaningKit extends UsableProp {
  constructor(use: UseOptions) {
    super(use);
    this.name = 'CleaningKit';
    part(this, 0.3, 0.003, 0.2, paint(0xd9dfe6, 0.9), { y: 0.0015 }).castShadow = false; // the towel
    for (let i = -2; i <= 2; i++) part(this, 0.3, 0.0005, 0.008, paint(0x5d7fa8, 0.9), { y: 0.0033, z: i * 0.035 }).castShadow = false;
    this.add(cylinderMesh(0.024, 0.13, standard({ color: 0x9fc6e0, roughness: 0.2, transparent: true, opacity: 0.8 }), { x: -0.09, y: 0.068, z: -0.03 }, { segments: 14 }));
    this.add(cylinderMesh(0.011, 0.025, paint(0xf2f2f2, 0.5), { x: -0.09, y: 0.145, z: -0.03 }, { segments: 10 }));
    part(this, 0.04, 0.05, 0.002, paint(0xffffff, 0.8), { x: -0.09, y: 0.07, z: -0.005 }).castShadow = false; // its label
    this.add(cylinderMesh(0.028, 0.08, GLASS, { x: 0.0, y: 0.043, z: -0.04 }, { segments: 14 }));
    this.add(cylinderMesh(0.024, 0.07, paint(0xfafafa, 0.95), { x: 0.0, y: 0.038, z: -0.04 }, { segments: 12 }));
    part(this, 0.1, 0.012, 0.08, paint(0xe9c46a, 0.95), { x: 0.07, y: 0.009, z: 0.04 }); // the cloth
    const brush = new THREE.Group();
    brush.position.set(-0.02, 0.006, 0.06);
    brush.rotation.y = 0.5;
    part(brush, 0.1, 0.008, 0.012, paint(0x7a5230, 0.6));
    part(brush, 0.025, 0.012, 0.014, paint(0x2a2a2a, 0.9), { x: 0.06, y: 0.002 });
    this.add(brush);
    this.target(0.32, 0.16, 0.22, { y: 0.08 });
  }
}

/** A mixing bowl with a wooden spoon in it, a bag of flour and two eggs beside: click to bake. */
export class MixingBowl extends UsableProp {
  constructor(use: UseOptions) {
    super(use);
    this.name = 'MixingBowl';
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.06, 0.09, 24, 1, true), CERAMIC);
    bowl.position.set(0, 0.045, 0);
    bowl.castShadow = true;
    this.add(bowl);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), CERAMIC);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.003;
    this.add(bottom);
    const spoon = new THREE.Group();
    spoon.position.set(0.02, 0.05, 0);
    spoon.rotation.z = 0.9;
    part(spoon, 0.012, 0.22, 0.008, paint(0xc79a62, 0.6), { y: 0.06 });
    this.add(spoon);
    part(this, 0.09, 0.14, 0.06, paint(0xefe6d2, 0.9), { x: -0.17, y: 0.07, z: -0.02 }); // the flour
    part(this, 0.092, 0.03, 0.062, paint(0x3a6ea5, 0.8), { x: -0.17, y: 0.1, z: -0.02 }).castShadow = false;
    for (const [x, z] of [[0.15, 0.04], [0.19, 0.0]] as const) {
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), paint(0xe9d2b0, 0.5));
      egg.scale.set(1, 0.8, 0.8);
      egg.position.set(x, 0.018, z);
      egg.castShadow = true;
      this.add(egg);
    }
    this.target(0.44, 0.2, 0.2, { y: 0.1 });
  }
}

/** A sponge cake on a cake stand, a slice already cut out of it. Shown while one is out. */
export class Cake extends Prop {
  constructor() {
    super();
    this.name = 'Cake';
    this.add(cylinderMesh(0.03, 0.06, CERAMIC, { y: 0.03 }, { radiusBottom: 0.06, segments: 20 }));
    this.add(cylinderMesh(0.14, 0.01, CERAMIC, { y: 0.065 }, { segments: 28 }));
    // Five sixths of a round sponge: the missing slice faces the room.
    const sponge = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 30, 1, false, Math.PI / 3 + Math.PI / 2, (5 * Math.PI) / 3), paint(0xe2b36a, 0.8));
    sponge.position.y = 0.105;
    sponge.castShadow = true;
    this.add(sponge);
    const icing = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.012, 30, 1, false, Math.PI / 3 + Math.PI / 2, (5 * Math.PI) / 3), paint(0xfaf3ea, 0.5));
    icing.position.y = 0.146;
    this.add(icing);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 3 + Math.PI / 2 + ((i + 0.5) * Math.PI) / 3;
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), paint(0xc0283a, 0.35));
      berry.position.set(Math.sin(a) * 0.07, 0.16, Math.cos(a) * 0.07);
      this.add(berry);
    }
  }
}

/** A glass jar of fish-shaped cat treats with a red lid: click, the cat comes running. */
export class TreatJar extends UsableProp {
  constructor(use: UseOptions) {
    super(use);
    this.name = 'TreatJar';
    this.add(cylinderMesh(0.045, 0.12, GLASS, { y: 0.06 }, { segments: 16 }));
    this.add(cylinderMesh(0.041, 0.07, paint(0xb5733a, 0.9), { y: 0.037 }, { segments: 14 })); // the treats inside
    this.add(cylinderMesh(0.048, 0.02, paint(0xc9302c, 0.5), { y: 0.13 }, { segments: 16 }));
    part(this, 0.05, 0.035, 0.002, paint(0xf4e9c8, 0.8), { y: 0.075, z: 0.046 }).castShadow = false; // a paper label with a fish on it
    part(this, 0.026, 0.01, 0.001, paint(0x3b5b7a, 0.6), { y: 0.075, z: 0.0475 }).castShadow = false;
    this.target(0.11, 0.16, 0.11, { y: 0.08 });
  }
}

/**
 * What the cat left on the floor by its bowl: a few coins in a little heap, or an old booklet
 * (`show` picks which). Hidden when there is nothing.
 */
export class CatFind extends UsableProp {
  private readonly coins = new THREE.Group();
  private readonly booklet = new THREE.Group();

  constructor(use: UseOptions) {
    super(use);
    this.name = 'CatFind';
    const gold = standard({ color: 0xd4a52a, metalness: 0.9, roughness: 0.35 });
    for (const [x, z, y] of [[0, 0, 0], [0.025, 0.012, 0], [-0.015, 0.022, 0], [0.008, 0.008, 0.004], [0.03, -0.02, 0]] as const) {
      const coin = cylinderMesh(0.012, 0.003, gold, { x, y: 0.0015 + y, z }, { segments: 16 });
      coin.rotation.x = (x * 7) % 0.2;
      this.coins.add(coin);
    }
    const cover = part(this.booklet, 0.12, 0.004, 0.13, paint(0xd8412f, 0.7), { y: 0.002 });
    cover.rotation.y = 0.35;
    const title = part(this.booklet, 0.08, 0.0008, 0.03, paint(0xf6f0dc, 0.7), { y: 0.0045, z: 0.03 });
    title.rotation.y = 0.35;
    this.add(this.coins, this.booklet);
    this.show(null);
    this.target(0.18, 0.06, 0.18, { y: 0.03 });
  }

  show(kind: 'coins' | 'manual' | null): void {
    this.coins.visible = kind === 'coins';
    this.booklet.visible = kind === 'manual';
  }
}
