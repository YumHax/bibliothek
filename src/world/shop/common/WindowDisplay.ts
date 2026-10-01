import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { part } from '../../props/Prop';
import { paint, timber } from '../../materials/palette';
import { SILL } from '../ShopWindow';

export interface WindowDisplayOptions {
  /** Along the window (local x): the glass's width, between the frame's posts. */
  width: number;
  /** Out from the glass into the shop. Default 0.5. */
  depth?: number;
  /** Its top's height. Default a little over the glass's bottom edge (`ShopWindow.SILL`), over the window's own sill board. */
  height?: number;
  /** The front panel's paint (the shop's colour, darkened). */
  color: number;
}

const TOP = 0.03;
const GLASS_GAP = 0.03;
const TOE = 0.07;
const TOP_WOOD = timber(0x9a7650, 0.5);

/**
 * The shop window's display bed on the inside: a boarded platform the width of the glass, just over its bottom edge,
 * a painted front panel towards the shop. What the shop shows the street stands on it (`on: 'windowDisplay'`, `spot`
 * `[x, z]` on its top: x along the window, +z into the shop, 0 its middle); from outside the street shows the same
 * display (docs/shops.md). Origin on the floor at the front wall, under the window's middle, +z into the shop.
 * Collides as its box.
 */
export class WindowDisplay extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** The top's height: what stands on it stands here. */
  readonly topHeight: number;
  /** The top's centre along z (local): spots are measured from it. */
  readonly topCentre: number;

  constructor(options: WindowDisplayOptions) {
    super();
    this.name = 'WindowDisplay';
    const { width } = options;
    const depth = options.depth ?? 0.5;
    const height = options.height ?? SILL + 0.05;
    const front = paint(options.color, 0.55);
    // Clear of the glass (and over the window's sill board, which it covers).
    part(this, width, TOP, depth - GLASS_GAP, TOP_WOOD, { y: height - TOP / 2, z: (depth + GLASS_GAP) / 2 });
    part(this, width, height - TOP - TOE, 0.02, front, { y: TOE + (height - TOP - TOE) / 2, z: depth - 0.03 });
    // The toe kick under the front panel, set back.
    part(this, width - 0.02, TOE, 0.02, paint(0x2a2622, 0.6), { y: TOE / 2, z: depth - 0.09 });
    this.topHeight = height;
    this.topCentre = (depth + GLASS_GAP) / 2;
    this.footprint = new THREE.Box3(new THREE.Vector3(-width / 2, 0, 0), new THREE.Vector3(width / 2, height, depth));
  }
}
