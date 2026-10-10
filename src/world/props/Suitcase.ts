import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { METAL, paint } from '../materials/palette';
import { PROUD, bandAround } from './joinery';
import { part } from './Prop';

export interface SuitcaseOptions {
  /** Shell colour: a faded tan by default; 0x2f3f52 (navy) and 0x6b2b2b (oxblood) read as well. */
  color?: number;
}

const LENGTH = 0.68;
const HEIGHT = 0.2;
const DEPTH = 0.45;
/** The lid's seam, from the floor (the lid is the shallower half). */
const SEAM_Y = 0.12;
/** A brass latch's height and depth, and the paper tag's thickness (m). */
const LATCH_H = 0.035;
const LATCH_D = 0.008;
const TAG_T = 0.002;

/**
 * A vintage hard-shell suitcase lying flat on the floor, the day you moved in and never unpacked: two shells meeting at
 * a darker seam band, two brass latches and a leather handle on its long front side (+z), a paper tag tied to the
 * handle. Origin on the floor under its middle. Real furniture: it collides (`footprint`).
 */
export class Suitcase extends THREE.Group implements Furniture {
  readonly footprint = new THREE.Box3(new THREE.Vector3(-LENGTH / 2 - 0.02, 0, -DEPTH / 2 - 0.02), new THREE.Vector3(LENGTH / 2 + 0.02, HEIGHT, DEPTH / 2 + 0.08));

  constructor(options: SuitcaseOptions = {}) {
    super();
    this.name = 'Suitcase';
    const shell = paint(options.color ?? 0x9a7650, 0.5);
    const trim = paint(0x3b2a1e, 0.6);
    const leather = paint(0x2e1f16, 0.55);

    const body = part(this, LENGTH, HEIGHT, DEPTH, shell, { y: HEIGHT / 2 });
    bandAround(this, body, SEAM_Y, 0.012, trim);
    // The latches either side of the handle, proud of the front over the seam.
    const front = DEPTH / 2 + PROUD;
    for (const x of [-0.2, 0.2]) part(this, 0.04, LATCH_H, LATCH_D, METAL.agedBrass(), { x, y: SEAM_Y + LATCH_H / 6, z: front + LATCH_D / 2 });
    // The handle: two leather lugs and the grip between them, standing out from the front.
    for (const x of [-0.07, 0.07]) part(this, 0.02, 0.025, 0.02, leather, { x, y: SEAM_Y + 0.03, z: front + 0.01 });
    part(this, 0.17, 0.022, 0.022, leather, { y: SEAM_Y + 0.03, z: front + 0.031 });
    // A luggage tag on its string, lying on the floor in front.
    const tag = part(this, 0.05, TAG_T, 0.09, paint(0xe9dcbc, 0.9), { x: 0.1, y: TAG_T / 2, z: front + 0.08 });
    tag.rotation.y = 0.5;
    tag.castShadow = false;
  }
}
