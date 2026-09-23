import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { matte } from './Prop';

export interface UmbrellaStandOptions {
  /** Colour of the stand. Default a dark green enamel. */
  color?: number;
  /** Canopy colours of the furled umbrellas in it (1-3). */
  umbrellas?: number[];
}

const RADIUS = 0.11;
const HEIGHT = 0.5;
const STEEL = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.6, roughness: 0.35 });
const WOOD = matte(0x6b4a2b, 0.6);

/**
 * An umbrella stand by a front door: an open enamel tube with two or three furled umbrellas
 * leaning in it, handles up. Local origin is the centre of the foot on the floor. Collides at the tube.
 */
export class UmbrellaStand extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: UmbrellaStandOptions = {}) {
    super();
    this.name = 'UmbrellaStand';
    const enamel = new THREE.MeshStandardMaterial({ color: options.color ?? 0x2f4a3a, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS, RADIUS * 0.9, HEIGHT, 24, 1, true), enamel);
    tube.position.y = HEIGHT / 2;
    tube.castShadow = true;
    tube.receiveShadow = true;
    this.add(tube);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(RADIUS * 0.9, 24), enamel);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.01;
    this.add(bottom);

    const canopies = (options.umbrellas ?? [0x1f2a44, 0x7a2e2e]).slice(0, 3);
    canopies.forEach((color, i) => {
      const angle = (i / canopies.length) * Math.PI * 2 + 0.7;
      const lean = 0.1 + i * 0.03;
      const umbrella = new THREE.Group();
      umbrella.position.set(Math.cos(angle) * RADIUS * 0.45, 0.03, Math.sin(angle) * RADIUS * 0.45);
      umbrella.rotation.set(Math.sin(angle) * lean, 0, -Math.cos(angle) * lean);
      // Shaft, the furled canopy tapering down to the tip, and a crook handle on top.
      umbrella.add(cylinderMesh(0.005, 0.88, STEEL, { y: 0.44 }, { segments: 8 }));
      umbrella.add(cylinderMesh(0.028, 0.5, matte(color, 0.9), { y: 0.36 }, { radiusBottom: 0.012, segments: 12 }));
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 8, 16, Math.PI), WOOD);
      handle.position.set(0.035, 0.88, 0);
      handle.castShadow = true;
      umbrella.add(handle);
      this.add(umbrella);
    });

    this.footprint = new THREE.Box3(new THREE.Vector3(-RADIUS, 0, -RADIUS), new THREE.Vector3(RADIUS, HEIGHT, RADIUS));
  }
}
