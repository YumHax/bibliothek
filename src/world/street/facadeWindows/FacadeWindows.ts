import * as THREE from 'three';
import type { PaintedFront } from '../Buildings';
import { FacadeFrame } from '../relief/facadeFrame';
import { TriBuilder } from '../relief/TriBuilder';
import { snowCovered } from '../snowCover';
import { buildCasement } from './casementParts';
import { FacadeShutters, ShutterLeaves } from './FacadeShutters';

/**
 * The windows of the framed facades (`paintFacade`'s `features.casements`), built whole in front of their painted
 * glass (`casementParts`): one mesh of vertex colours for the whole street, snowed on (`snowCovered`), a child of
 * `Buildings` so every picture of the street (the walkable street, a window's view onto it, the roof, the courtyard)
 * has them. Decoration: nothing collides.
 */
export class FacadeWindows extends THREE.Mesh {
  /** How many windows it holds. */
  readonly count: number;
  /** Their shutters, swinging shut and open by the hour (`FacadeShutters`). */
  readonly shutters: FacadeShutters | null;

  constructor(fronts: readonly PaintedFront[]) {
    const b = new TriBuilder();
    const leaves = new ShutterLeaves();
    let count = 0;
    for (const front of fronts) {
      const { casements } = front.features;
      if (!casements.length) continue;
      const m = new FacadeFrame(front.spec).matrix(0, 0);
      casements.forEach((c, i) => buildCasement(b, m, c, leaves, front.spec.seed * 211 + i));
      count += casements.length;
    }
    const material = snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }));
    super(b.isEmpty ? new THREE.BufferGeometry() : b.build(), material);
    this.name = 'FacadeWindows';
    this.count = count;
    this.castShadow = true;
    this.receiveShadow = true;
    this.visible = !b.isEmpty;
    this.shutters = leaves.isEmpty ? null : new FacadeShutters(leaves.build());
    if (this.shutters) this.add(this.shutters);
  }
}
