import * as THREE from 'three';
import { boxMesh } from '../meshUtils';
import { basic, paint, standard } from '../materials/palette';
import { Prop } from './Prop';

export interface NeonTubeOptions {
  /** Length of the tube, centred on the origin along local x. Default 3. */
  length?: number;
  /** Colour of the glow. Default cyan. */
  color?: number;
  /** Radius of the glass. Default 0.015. */
  radius?: number;
  /** Intensity of the tube's own point light (one, in the middle); 0 for none (the glow alone). Default 0. */
  intensity?: number;
  /** How far the tube stands off the wall. Default 0.06. */
  standoff?: number;
}

const BRACKET = paint(0x2a2a30, 0.45);

/**
 * A straight tube of neon on wall brackets: the cove light along the top of an arcade's walls,
 * the strip under a bar. Glows on its own; give it an `intensity` for a real light where one is
 * worth its cost. Wall-hung: origin at the centre of the run, on the wall, +z into the room, the
 * tube running along local x. Decoration: never collides.
 */
export class NeonTube extends Prop {
  private readonly tube: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  /** The glass lit and flickered out: two shared looks, swapped (never edited) by `setLit`. */
  private readonly glass: { lit: THREE.Material; out: THREE.Material };

  constructor(options: NeonTubeOptions = {}) {
    super();
    this.name = 'NeonTube';
    const length = options.length ?? 3;
    const color = new THREE.Color(options.color ?? 0x33e0ff);
    const radius = options.radius ?? 0.015;
    const standoff = options.standoff ?? 0.06;

    const glass = standard({ color: color.clone().multiplyScalar(0.3), emissive: color, emissiveIntensity: 2.4, roughness: 0.3 });
    this.glass = { lit: glass, out: standard({ color: color.clone().multiplyScalar(0.3), emissive: color, emissiveIntensity: 0.35, roughness: 0.3 }) };
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), glass);
    this.tube = tube;
    tube.rotation.z = Math.PI / 2;
    tube.position.z = standoff;
    tube.castShadow = false;
    tube.receiveShadow = false;
    this.add(tube);
    // A faint outer halo: a wider, translucent tube around the glass.
    const halo = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 2.6, radius * 2.6, length, 10),
      basic({ color, transparent: true, opacity: 0.14, depthWrite: false }),
    );
    halo.rotation.z = Math.PI / 2;
    halo.position.z = standoff;
    halo.castShadow = false;
    this.halo = halo;
    this.add(halo);
    // Brackets every metre or so, and one at each end.
    const count = Math.max(2, Math.round(length / 1.2) + 1);
    for (let i = 0; i < count; i++) {
      const x = -length / 2 + 0.05 + (i / (count - 1)) * (length - 0.1);
      const bracket = boxMesh(0.02, radius * 2 + 0.01, standoff, BRACKET, { x, z: standoff / 2 });
      bracket.castShadow = false;
      this.add(bracket);
    }
    if ((options.intensity ?? 0) > 0) {
      // A reach: with distance 0 every fragment of the scene evaluates the light; a tube's spill is gone within a few metres.
      const light = new THREE.PointLight(color, options.intensity, 6, 2);
      light.position.set(0, -0.05, standoff + 0.1);
      light.castShadow = false;
      this.add(light);
    }
  }

  /** Lit as usual, or flickered out for a moment (the arcade's celebrations blink the tubes); its light, if any, is left alone. */
  setLit(lit: boolean): void {
    this.tube.material = lit ? this.glass.lit : this.glass.out;
    this.halo.visible = lit;
  }
}
