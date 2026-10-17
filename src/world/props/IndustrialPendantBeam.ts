import * as THREE from 'three';
import { additive } from '../materials/blend';
import { RENDER_ORDER } from '../surface/layers';
import { LAMP_LIGHT } from '../lighting/lampColours';
import BEAM_VERTEX from './IndustrialPendantBeam.vert.glsl?raw';
import BEAM_FRAGMENT from './IndustrialPendantBeam.frag.glsl?raw';

interface IndustrialPendantBeamOptions {
  /** The shade's mouth (radius, m) and how far down the glow reaches, and how wide it is there. */
  top: number;
  length: number;
  foot: number;
}

/** Brightness of the cone at full lamp (additive, linear light), before the lamp's level. */
const STRENGTH = 0.16;
const SEGMENTS = 24;

/**
 * The light under a factory shade made visible: a faint warm cone of air from its mouth down towards the tables,
 * brightest at the top and down its middle, fading out at its foot and at its edges, added on top of the scene (its
 * far wall only, so it reads from inside it too). No light of its own and no shadow: it only shows the pool the
 * pendant's point light throws. Origin at the shade's mouth, hanging down -y. `QUALITY.lightShafts` decides whether a
 * pendant has one (`IndustrialPendant`).
 */
export class IndustrialPendantBeam extends THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  constructor(options: IndustrialPendantBeamOptions) {
    const geometry = new THREE.CylinderGeometry(options.top, options.foot, options.length, SEGMENTS, 1, true).translate(0, -options.length / 2, 0);
    const material = additive(
      new THREE.ShaderMaterial({
        uniforms: { color: { value: LAMP_LIGHT.incandescent.clone() }, strength: { value: 0 } },
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        side: THREE.BackSide,
      }),
    );
    material.depthWrite = false;
    super(geometry, material);
    this.name = 'IndustrialPendantBeam';
    this.renderOrder = RENDER_ORDER.sheen;
    this.castShadow = false;
    this.receiveShadow = false;
    // Light, not a thing: the crosshair goes through it.
    this.raycast = () => {};
  }

  /** The lamp's level, 0 off .. 1 lit (its warm-up included). */
  setLevel(level: number): void {
    this.material.uniforms.strength!.value = STRENGTH * level;
    this.visible = level > 0.001;
  }
}
