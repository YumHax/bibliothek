import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface SpeakerOptions {
  /** Height of the cabinet. Default 0.85 (a slim floor-stander). */
  height?: number;
  /** Cabinet veneer colour. Default walnut. */
  wood?: number;
}

const WIDTH = 0.2;
const DEPTH = 0.26;
const PLINTH = 0.03;
const BAFFLE = matte(0x1c1b1a, 0.85);
const CONE = matte(0x2a2826, 0.95);
const DUST_CAP = new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.3, metalness: 0.5 });
const DOME = new THREE.MeshStandardMaterial({ color: 0xc9c4b8, roughness: 0.25, metalness: 0.7 });
const LED = new THREE.MeshStandardMaterial({ color: 0x6fd08a, emissive: 0x4fd070, emissiveIntensity: 1.6, roughness: 0.4 });

/**
 * A slim floor-standing hi-fi speaker: a walnut cabinet on a black plinth, a black baffle with a
 * woofer, a mid driver and a tweeter, a tiny green power LED. Local origin is the centre of the
 * foot on the floor; the baffle faces +z. Collides at its cabinet.
 */
export class Speaker extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;

  constructor(options: SpeakerOptions = {}) {
    super();
    this.name = 'Speaker';
    const height = options.height ?? 0.85;
    const wood = woodMaterial(options.wood ?? 0x5a3f2a, 0.5);
    const bodyH = height - PLINTH;

    part(this, WIDTH + 0.02, PLINTH, DEPTH + 0.02, BAFFLE, { y: PLINTH / 2 });
    part(this, WIDTH, bodyH, DEPTH, wood, { y: PLINTH + bodyH / 2 });
    part(this, WIDTH - 0.016, bodyH - 0.016, 0.006, BAFFLE, { y: PLINTH + bodyH / 2, z: DEPTH / 2 + 0.003 }).castShadow = false;

    // Drivers, top to bottom: tweeter dome, mid, woofer. Each a shallow cylinder with its axis along z.
    const driver = (y: number, r: number, cone: THREE.Material, cap: THREE.Material, capR: number): void => {
      for (const [radius, material, depth] of [
        [r, cone, 0.012],
        [capR, cap, 0.02],
      ] as const) {
        const disc = cylinderMesh(radius, depth, material, { y, z: DEPTH / 2 + 0.006 + depth / 2 }, { segments: 24 });
        disc.rotation.x = Math.PI / 2;
        disc.castShadow = false;
        this.add(disc);
      }
    };
    driver(PLINTH + bodyH * 0.82, 0.03, DOME, DOME, 0.012);
    driver(PLINTH + bodyH * 0.64, 0.055, CONE, DUST_CAP, 0.018);
    driver(PLINTH + bodyH * 0.36, 0.075, CONE, DUST_CAP, 0.024);
    const led = part(this, 0.008, 0.004, 0.003, LED, { x: WIDTH / 2 - 0.03, y: PLINTH + 0.03, z: DEPTH / 2 + 0.008 });
    led.castShadow = false;

    this.footprint = new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.01, 0, -DEPTH / 2 - 0.01), new THREE.Vector3(WIDTH / 2 + 0.01, height, DEPTH / 2 + 0.01));
  }
}
