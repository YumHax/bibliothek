import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';

/** A box on sale as the scanner sees it. */
export interface Scannable {
  readonly isHeld: boolean;
  setScanVisible(visible: boolean): void;
  getWorldPosition(target: THREE.Vector3): THREE.Vector3;
}

export interface PriceScannerOptions {
  /** The keys, read every frame. */
  input: { isDown(...codes: string[]): boolean };
  /** Held to scan (physical code). */
  key: string;
  /** Whose eyes: the camera. */
  viewer: THREE.Object3D;
  /** The boxes on sale right now. */
  boxes: () => Iterable<Scannable>;
  /** Only boxes this close show a label (metres). */
  range?: number;
}

/** How wide the cone of boxes that get a label is: the cosine of the half-angle from the view direction. */
const CONE = 0.5;

/**
 * Scanning the stalls from the aisle: while the key is held, every box on sale within range in
 * front of the player floats its title and price above it (`ForSaleBox.setScanVisible`), so the
 * tables can be read without picking up each box. Released, the labels go. Nothing to see of its
 * own, never collides.
 */
export class PriceScanner extends THREE.Object3D implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly range: number;
  private readonly shown = new Set<Scannable>();
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly at = new THREE.Vector3();

  constructor(private readonly options: PriceScannerOptions) {
    super();
    this.range = options.range ?? 3.2;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(): void {
    const { input, key, viewer } = this.options;
    if (!input.isDown(key)) {
      if (this.shown.size) this.hideAll();
      return;
    }
    viewer.getWorldPosition(this.eye);
    viewer.getWorldDirection(this.look);
    const visible = new Set<Scannable>();
    for (const box of this.options.boxes()) {
      if (box.isHeld) continue;
      box.getWorldPosition(this.at).sub(this.eye);
      const distance = this.at.length();
      if (distance > this.range || this.at.divideScalar(distance || 1).dot(this.look) < CONE) continue;
      visible.add(box);
    }
    for (const box of this.shown) if (!visible.has(box)) box.setScanVisible(false);
    for (const box of visible) box.setScanVisible(true);
    this.shown.clear();
    for (const box of visible) this.shown.add(box);
  }

  dispose(): void {
    this.shown.clear();
  }

  private hideAll(): void {
    for (const box of this.shown) box.setScanVisible(false);
    this.shown.clear();
  }
}
