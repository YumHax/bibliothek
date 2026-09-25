import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { Prop, part, matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

/*
 * The small things that live on a kitchen worktop. Each is a `Prop` (never collides) standing on
 * its base at local y = 0 and facing +z, so a `wall` placement at the worktop height with an
 * `offset` off the wall puts it on the counter, turned towards the room. The kettle and the
 * toaster work, so they have their own files (`Kettle.ts`, `Toaster.ts`).
 */

const STEEL = new THREE.MeshStandardMaterial({ color: 0xc4c7cb, metalness: 0.7, roughness: 0.35 });
const BLACK = matte(0x1e1f22, 0.6);
const CERAMIC = new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.35, side: THREE.DoubleSide });
const GLASS = new THREE.MeshStandardMaterial({ color: 0xe8f0f2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
const WATER = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0.25 });

export interface FruitBowlOptions {
  /** Colour of the bowl. Default a glazed cream. */
  color?: number;
}

/** A wide ceramic bowl with oranges, apples and a lemon piled in it. */
export class FruitBowl extends Prop {
  constructor(options: FruitBowlOptions = {}) {
    super();
    this.name = 'FruitBowl';
    const glaze = options.color ? new THREE.MeshStandardMaterial({ color: options.color, roughness: 0.35, side: THREE.DoubleSide }) : CERAMIC;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.07, 0.07, 28, 1, true), glaze);
    bowl.position.y = 0.035;
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    this.add(bowl);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.07, 28), glaze);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.004;
    this.add(bottom);
    const fruit = (r: number, colour: number, x: number, z: number, y: number, squash = 1): void => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), matte(colour, 0.55));
      mesh.position.set(x, y, z);
      mesh.scale.y = squash;
      mesh.castShadow = true;
      this.add(mesh);
    };
    fruit(0.038, 0xe8892a, -0.045, 0.02, 0.045);
    fruit(0.038, 0xf09a34, 0.04, -0.035, 0.045);
    fruit(0.035, 0xc23b2f, 0.045, 0.045, 0.045, 0.9);
    fruit(0.035, 0x9fbf4a, -0.03, -0.055, 0.045, 0.9);
    fruit(0.03, 0xe8d34a, 0.0, 0.0, 0.1, 0.8);
    fruit(0.036, 0xd9612e, -0.06, -0.01, 0.105);
  }
}

/** A wooden chopping board left out with the cook's knife and two lemon halves on it. */
export class ChoppingBoard extends Prop {
  constructor() {
    super();
    this.name = 'ChoppingBoard';
    const wood = woodMaterial(0xb98a58, 0.6);
    const board = part(this, 0.38, 0.02, 0.26, wood, { y: 0.01 });
    board.rotation.y = 0.12;
    this.add(cylinderMesh(0.012, 0.022, matte(0x2a2a2a, 0.8), { x: 0.165, y: 0.01, z: -0.1 }, { segments: 10 })); // the hanging hole's grommet
    // The knife: a steel blade and a dark riveted handle, laid across a corner.
    const knife = new THREE.Group();
    knife.position.set(0.02, 0.02, 0.06);
    knife.rotation.y = -0.4;
    const blade = part(knife, 0.2, 0.003, 0.04, STEEL, { x: 0.1, y: 0.0015 });
    blade.castShadow = false;
    part(knife, 0.11, 0.018, 0.026, BLACK, { x: -0.055, y: 0.009 });
    this.add(knife);
    // Lemon halves, cut side up.
    for (const [x, z] of [
      [-0.1, -0.04],
      [-0.05, -0.08],
    ] as const) {
      this.add(cylinderMesh(0.03, 0.03, matte(0xe8d34a, 0.5), { x, y: 0.035, z }, { radiusBottom: 0.025, segments: 16 }));
      const flesh = cylinderMesh(0.028, 0.002, matte(0xf6ee9a, 0.4), { x, y: 0.051, z }, { segments: 16 });
      flesh.castShadow = false;
      this.add(flesh);
    }
  }
}

export interface StorageJarsOptions {
  /** Contents colours, one jar each, left to right (default pasta, rice, coffee beans). */
  contents?: number[];
}

/** A row of glass storage jars with wooden lids, each two-thirds full of something dry, standing along local x. */
export class StorageJars extends Prop {
  constructor(options: StorageJarsOptions = {}) {
    super();
    this.name = 'StorageJars';
    const contents = options.contents ?? [0xe0b96a, 0xf1eadb, 0x3a2418];
    const glass = new THREE.MeshStandardMaterial({ color: 0xe8f0f2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const lid = matte(0xb98a58, 0.6);
    const r = 0.045;
    const pitch = r * 2 + 0.02;
    contents.forEach((colour, i) => {
      const x = (i - (contents.length - 1) / 2) * pitch;
      const h = 0.16 + (i % 2) * 0.03;
      const filling = cylinderMesh(r - 0.004, h * 0.66, matte(colour, 0.9), { x, y: (h * 0.66) / 2 + 0.004 }, { segments: 18 });
      filling.castShadow = false;
      this.add(filling);
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true), glass);
      jar.position.set(x, h / 2, 0);
      jar.castShadow = false;
      jar.receiveShadow = true;
      this.add(jar);
      this.add(cylinderMesh(r + 0.003, 0.018, lid, { x, y: h + 0.009 }, { segments: 20 }));
    });
  }
}

/**
 * A steel wire dish rack beside a sink, just used: dinner and side plates standing in it, a bowl on
 * edge, two mugs upside down at its end, a wet drip tray under it, and past the end a cutlery pot
 * and a glass drying upside down.
 */
export class DishRack extends Prop {
  constructor() {
    super();
    this.name = 'DishRack';
    const w = 0.36;
    const d = 0.26;
    const rail = 0.005;
    // Two long rails, three cross rails, four short feet.
    for (const dz of [-d / 2 + rail, d / 2 - rail]) part(this, w, rail, rail, STEEL, { y: 0.02, z: dz }).castShadow = false;
    for (const dx of [-w / 2 + rail, 0, w / 2 - rail]) part(this, rail, rail, d, STEEL, { x: dx, y: 0.02 }).castShadow = false;
    for (const dx of [-w / 2 + 0.02, w / 2 - 0.02]) for (const dz of [-d / 2 + 0.02, d / 2 - 0.02]) part(this, rail, 0.02, rail, STEEL, { x: dx, y: 0.01, z: dz }).castShadow = false;
    // Plates on edge, leaning back a little, their axis along x.
    for (let i = 0; i < 3; i++) {
      const plate = cylinderMesh(0.105, 0.006, CERAMIC, { x: -w / 2 + 0.06 + i * 0.045, y: 0.115, z: 0.01 }, { segments: 28 });
      plate.rotation.z = Math.PI / 2;
      plate.rotation.x = -0.15;
      this.add(plate);
      // A short upright prong either side holds each plate.
      for (const dz of [-0.03, 0.05]) part(this, rail, 0.07, rail, STEEL, { x: -w / 2 + 0.06 + i * 0.045, y: 0.055, z: dz }).castShadow = false;
    }
    // Two mugs upside down at the free end.
    for (const [dx, dz, colour] of [
      [w / 2 - 0.06, -0.05, 0x8fa383],
      [w / 2 - 0.06, 0.06, 0xc8785a],
    ] as const) {
      const mug = cylinderMesh(0.038, 0.085, matte(colour, 0.4), { x: dx, y: 0.0225 + 0.0425, z: dz }, { radiusBottom: 0.035, segments: 18 });
      this.add(mug);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 8, 14, Math.PI), matte(colour, 0.4));
      handle.position.set(dx + 0.036, 0.065, dz);
      handle.rotation.z = -Math.PI / 2;
      handle.castShadow = true;
      this.add(handle);
    }
    // Two side plates behind the dinner plates, and a bowl on edge beside them.
    for (let i = 0; i < 2; i++) {
      const plate = cylinderMesh(0.08, 0.006, matte(i ? 0xdfe6ec : 0xf2eee6, 0.3), { x: -w / 2 + 0.2 + i * 0.035, y: 0.09, z: 0.02 }, { segments: 24 });
      plate.rotation.z = Math.PI / 2;
      plate.rotation.x = -0.12;
      this.add(plate);
    }
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), matte(0x5d7fa6, 0.3));
    bowl.material.side = THREE.DoubleSide;
    bowl.position.set(-w / 2 + 0.03, 0.09, -0.07);
    bowl.rotation.z = Math.PI / 2 - 0.25;
    bowl.castShadow = true;
    this.add(bowl);
    // A white drip tray under it all, still wet: a glossy film of water on it.
    part(this, w + 0.04, 0.008, d + 0.03, matte(0xeeeeea, 0.4), { y: 0.004 }).castShadow = false;
    const film = part(this, w, 0.001, d, WATER, { y: 0.0085 });
    film.castShadow = false;
    // At the end, off the tray: a steel cutlery pot with handles poking out, a glass drying upside down.
    const pot = cylinderMesh(0.035, 0.11, STEEL, { x: w / 2 + 0.05, y: 0.055, z: -0.04 }, { segments: 16 });
    this.add(pot);
    const handles: [number, number, number, number][] = [
      [-0.012, -0.01, 0.2, 0x2a2a2a],
      [0.01, 0.008, -0.15, 0x2a2a2a],
      [0.0, 0.015, 0.1, 0xc4c7cb],
      [0.014, -0.012, -0.25, 0xc4c7cb],
      [-0.01, 0.012, 0.3, 0x8b5a2b],
    ];
    for (const [dx, dz, tilt, colour] of handles) {
      const stick = part(this, 0.012, 0.09, 0.004, matte(colour, 0.4), { x: w / 2 + 0.05 + dx, y: 0.14, z: -0.04 + dz });
      stick.rotation.z = tilt;
      stick.castShadow = false;
    }
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.1, 18, 1, true), GLASS);
    glass.position.set(w / 2 + 0.05, 0.05, 0.06);
    this.add(glass);
    // Its base, a little inside the wall so the two glass surfaces do not coincide.
    this.add(cylinderMesh(0.0285, 0.004, GLASS, { x: w / 2 + 0.05, y: 0.098, z: 0.06 }, { segments: 18 }));
  }
}
