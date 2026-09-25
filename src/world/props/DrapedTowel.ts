import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { Prop, part, matte } from './Prop';
import { fabric } from '@/world/materials/finishes';

export interface DrapedTowelOptions {
  /** Width of the folded towel along the edge. Default 0.32. */
  width?: number;
  /** Thickness of the edge it hangs over (a tub's rim, a chair's back). Default 0.06. */
  edge?: number;
  /** How far it hangs down the outside (local +z) and the inside. Defaults 0.34 and 0.18. */
  drop?: number;
  inner?: number;
  /** Towel colour. Default a warm sand. */
  color?: number;
  /** A slight skew along the edge, radians, so it looks thrown there. Default 0.06. */
  skew?: number;
}

const THICKNESS = 0.022;

/**
 * A towel thrown over an edge: a fold lying across the top, a long fall down the outside and a
 * shorter one inside, a hem band at the bottom of the outer fall. Origin on the middle of the
 * edge's top, the edge running along local x, the outside towards +z. Decoration: never collides.
 */
export class DrapedTowel extends Prop {
  readonly contactShadow = false;

  constructor(options: DrapedTowelOptions = {}) {
    super();
    this.name = 'DrapedTowel';
    const width = options.width ?? 0.32;
    const edge = options.edge ?? 0.06;
    const drop = options.drop ?? 0.34;
    const inner = options.inner ?? 0.18;
    const colour = options.color ?? 0xd9c3a0;
    const cloth = fabric({ color: colour, roughness: 0.95 });
    // The skew turns the towel in its own group: `place()` owns the prop's rotation.
    const body = new THREE.Group();
    body.rotation.y = options.skew ?? 0.06;
    this.add(body);

    const half = edge / 2 + THICKNESS / 2;
    part(body, width, THICKNESS, edge + 2 * THICKNESS, cloth, { y: THICKNESS / 2 });
    // Rounded folds over each corner of the edge.
    for (const side of [-1, 1]) {
      const fold = cylinderMesh(THICKNESS, width, cloth, { y: 0, z: side * half }, { segments: 10 });
      fold.rotation.z = Math.PI / 2;
      body.add(fold);
    }
    // The outside fall hangs a hair off the face, the inside one against it.
    part(body, width, drop, THICKNESS, cloth, { y: -drop / 2, z: half + 0.002 });
    part(body, width * 0.97, inner, THICKNESS, cloth, { y: -inner / 2, z: -half });
    part(body, width + 0.002, 0.035, THICKNESS + 0.004, matte(colour, 0.7), { y: -drop + 0.05, z: half + 0.002 }).castShadow = false;
  }
}
