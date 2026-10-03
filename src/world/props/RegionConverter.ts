import * as THREE from 'three';
import { paint } from '../materials/palette';
import { Prop, part } from './Prop';
import { PROUD, partOn } from './joinery';

export interface RegionConverterOptions {
  /** Body width, height, depth (m). */
  width?: number;
  height?: number;
  depth?: number;
  /** The plastic's colour. */
  body?: THREE.ColorRepresentation;
  /** The label band across its front. */
  label?: THREE.ColorRepresentation;
}

/**
 * A region converter as the TV repair shop sells it (`economy/regionLock`): a plastic block with a label band on its
 * front and, on top, the slot a Japanese cartridge goes into (a mod chip is the same block, small and green). Static:
 * base at local y = 0, front towards +z.
 */
export class RegionConverter extends Prop {
  constructor({ width = 0.12, height = 0.05, depth = 0.09, body = 0x2a2b2f, label = 0xc8342a }: RegionConverterOptions = {}) {
    super();
    const shell = part(this, width, height, depth, paint(body, 0.55), { y: height / 2 });
    // The label stands proud of the front; the slot's lip sits on top, a dark mouth in it.
    part(this, width * 0.8, height * 0.4, PROUD, paint(label, 0.5), { y: height * 0.55, z: depth / 2 + PROUD / 2 });
    const lip = partOn(this, shell, width * 0.86, 0.006, depth * 0.36, paint(0x18191b, 0.6));
    partOn(this, lip, width * 0.7, 0.001, depth * 0.12, paint(0x050506, 0.9));
  }
}
