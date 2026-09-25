import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { part, matte } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface ConsoleStandOptions {
  width?: number;
  depth?: number;
  height?: number;
  /** Consoles per shelf. */
  slotsPerShelf?: number;
}

/**
 * A low TV unit: a top board the television stands on and two open shelves for consoles.
 * Local +z is the front. `slotAnchors()` gives where each console goes; the stand itself
 * is a real collider (its footprint), consoles placed in its slots are not.
 */
export class ConsoleStand extends THREE.Group implements Furniture {
  readonly options: Required<ConsoleStandOptions>;
  private readonly shelfTops: number[] = [];

  constructor(options: ConsoleStandOptions = {}) {
    super();
    this.name = 'ConsoleStand';
    this.options = { width: 1.4, depth: 0.45, height: 0.5, slotsPerShelf: 4, ...options };
    this.build();
  }

  /** Height of the top board's surface: where the TV's underside goes. */
  get topHeight(): number {
    return this.options.height;
  }

  get footprint(): THREE.Box3 {
    const { width, depth, height } = this.options;
    return new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, height, depth / 2));
  }

  /** Width available to one console. */
  get slotWidth(): number {
    return (this.options.width - 0.04) / this.options.slotsPerShelf;
  }

  /** Local-space floor centre of every console slot: middle shelf left to right, then bottom shelf. */
  slotAnchors(): THREE.Vector3[] {
    const { slotsPerShelf, width } = this.options;
    const inner = width - 0.04;
    const anchors: THREE.Vector3[] = [];
    for (const y of this.shelfTops) {
      for (let i = 0; i < slotsPerShelf; i++) {
        anchors.push(new THREE.Vector3(-inner / 2 + this.slotWidth * (i + 0.5), y, 0));
      }
    }
    return anchors;
  }

  private build(): void {
    const { width, depth, height } = this.options;
    const wood = woodMaterial(0x3b2a1e, 0.7);
    const dark = matte(0x241811, 0.8);
    const board = 0.02;
    const feet = 0.04;
    const topBoard = 0.025;
    // The sides and the back stop under the top board: sharing its faces, they would z-fight.
    const sideH = height - feet - topBoard;

    part(this, width, topBoard, depth, wood, { y: height - topBoard / 2 });
    part(this, board, sideH, depth, wood, { x: -width / 2 + board / 2, y: feet + sideH / 2 });
    part(this, board, sideH, depth, wood, { x: width / 2 - board / 2, y: feet + sideH / 2 });
    part(this, width - 2 * board, sideH, 0.012, dark, { y: feet + sideH / 2, z: -depth / 2 + 0.006 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(this, 0.04, feet, 0.04, dark, { x: sx * (width / 2 - 0.05), y: feet / 2, z: sz * (depth / 2 - 0.05) });

    // Bottom board just above the feet, one shelf halfway up.
    const shelves = [feet, feet + (height - feet - 0.025) / 2];
    for (const y of shelves) {
      part(this, width - 2 * board, board, depth - 0.012, wood, { y: y + board / 2, z: 0.006 });
    }
    this.shelfTops.push(shelves[1] + board, shelves[0] + board);
  }
}
