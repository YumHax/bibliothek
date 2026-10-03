import * as THREE from 'three';
import type { PaintedFront } from '../Buildings';
import { FacadeFrame } from '../relief/facadeFrame';
import { TriBuilder } from '../relief/TriBuilder';
import { snowCovered } from '../snowCover';
import { buildCasement } from './casementParts';

/**
 * The windows of the framed facades (`paintFacade`'s `features.casements`), built whole in front of their painted
 * glass (`casementParts`): one mesh of vertex colours for the whole street, snowed on (`snowCovered`), a child of
 * `Buildings` so every picture of the street (the walkable street, a window's view onto it, the roof, the courtyard)
 * has them. Decoration: nothing collides.
 */
export class FacadeWindows extends THREE.Mesh {
  /** How many windows it holds. */
  readonly count: number;

  constructor(fronts: readonly PaintedFront[]) {
    const b = new TriBuilder();
    let count = 0;
    for (const front of fronts) {
      const { casements } = front.features;
      if (!casements.length) continue;
      const m = new FacadeFrame(front.spec).matrix(0, 0);
      for (const c of casements) buildCasement(b, m, c);
      count += casements.length;
    }
    const material = snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }));
    super(b.isEmpty ? new THREE.BufferGeometry() : b.build(), material);
    this.name = 'FacadeWindows';
    this.count = count;
    this.castShadow = true;
    this.receiveShadow = true;
    this.visible = !b.isEmpty;
  }
}
