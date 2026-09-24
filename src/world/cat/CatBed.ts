import * as THREE from 'three';
import type { Furniture } from '@/world/Furniture';
import type { CatBedLike } from './types';
import { fabric as fabricMaterial } from '@/world/materials/finishes';

/**
 * The cat's bed: a round padded disc with a soft bolster ring around it, about 0.45 m across
 * and 0.12 m tall. The ring is a slightly squashed torus so it reads as stuffed fabric rather
 * than a tyre. Local origin: centre of the underside on the floor, +y up. Empty footprint: the
 * cat walks into it and the player steps over it.
 */

export interface CatBedOptions {
  /** Fabric of the bolster ring (dusty mauve by default; 0x8a8580 is a warm grey). */
  color?: number;
  /** Fabric of the padded floor (a lighter tone of `color` by default). */
  padding?: number;
  /** Outer diameter of the bed. */
  diameter?: number;
}

const PAD_DIAMETER = 0.36;
const PAD_HEIGHT = 0.03;
/** Squash of the ring: flatter than round. */
const RING_SQUASH = 0.8;
/** Height of the body centre when lying in the bed: the top of the padding. */
const RESTING_HEIGHT = 0.06;

export class CatBed extends THREE.Group implements Furniture, CatBedLike {
  readonly options: Required<CatBedOptions>;

  constructor(options: CatBedOptions = {}) {
    super();
    this.name = 'CatBed';
    const color = options.color ?? 0x7a6a8a;
    this.options = {
      color,
      padding: options.padding ?? new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3).getHex(),
      diameter: options.diameter ?? 0.45,
    };

    const fabric = fabricMaterial({ color: this.options.color, roughness: 1 });
    const cushion = fabricMaterial({ color: this.options.padding, roughness: 1 });

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD_DIAMETER / 2, PAD_DIAMETER / 2 - 0.01, PAD_HEIGHT, 40), cushion);
    pad.position.y = PAD_HEIGHT / 2;
    pad.castShadow = true;
    pad.receiveShadow = true;
    this.add(pad);

    // Ring proportions from the diameter: outer edge = radius + tube.
    const tube = this.options.diameter * 0.135;
    const radius = this.options.diameter / 2 - tube;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 18, 48), fabric);
    ring.rotation.x = Math.PI / 2;
    ring.scale.z = RING_SQUASH; // local z is world y after the tilt
    ring.position.y = tube * RING_SQUASH;
    ring.castShadow = true;
    ring.receiveShadow = true;
    this.add(ring);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  restingSpot(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, RESTING_HEIGHT, 0);
    return this.localToWorld(out);
  }
}
