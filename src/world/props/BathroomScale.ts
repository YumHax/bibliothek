import * as THREE from 'three';
import { Prop, part, matte } from './Prop';

export interface BathroomScaleOptions {
  /** Colour of the glass platform. Default white. */
  color?: number;
}

const SIZE = 0.3;
const HEIGHT = 0.022;

/**
 * A flat glass bathroom scale left on the floor: a square platform on four rubber feet with a
 * dark display strip at its front edge. Local origin is the centre of its underside; the display
 * faces +z. Decoration only, never collides (the player steps over it).
 */
export class BathroomScale extends Prop {
  constructor(options: BathroomScaleOptions = {}) {
    super();
    this.name = 'BathroomScale';
    const glass = new THREE.MeshStandardMaterial({ color: options.color ?? 0xf4f4f2, roughness: 0.15, metalness: 0.1 });
    part(this, SIZE, HEIGHT - 0.006, SIZE, glass, { y: 0.006 + (HEIGHT - 0.006) / 2 });
    const display = part(this, 0.09, 0.002, 0.03, matte(0x14161a, 0.3), { y: HEIGHT + 0.001, z: SIZE / 2 - 0.035 });
    display.castShadow = false;
    const foot = matte(0x2a2a2a, 0.9);
    for (const dx of [-0.12, 0.12]) for (const dz of [-0.12, 0.12]) part(this, 0.025, 0.006, 0.025, foot, { x: dx, y: 0.003, z: dz }).castShadow = false;
  }
}
