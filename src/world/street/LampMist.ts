import * as THREE from 'three';
import { additiveOne } from '@/world/materials/blend';
import { RENDER_ORDER } from '../surface/layers';
import lampMistVertex from './LampMist.vert.glsl?raw';
import lampMistFragment from './LampMist.frag.glsl?raw';

/**
 * A lamp's light in the mist: a soft cone of sodium hanging from the head to the ground, and a glow round the head,
 * drawn as one upright quad per lamp turned to face the eye about its own axis (its instance: the head's position,
 * x scale the cone's foot radius, y the head's height over the ground). Seen as fog, rain or falling snow thickens the
 * air (`mist`, 0 clear: the mesh is hidden) and only at night; each lamp's own colour is its warmth (instance colour,
 * written with its halo's). Added with the canvas alpha kept; faded where the eye stands inside the cone.
 */
export function lampMistMaterial(mist: { value: number }): THREE.ShaderMaterial {
  const material = additiveOne(new THREE.ShaderMaterial({
    uniforms: { mist },
    vertexShader: lampMistVertex,
    fragmentShader: lampMistFragment,
    depthWrite: false,
    fog: false,
  }));
  return material;
}

/** The quad: u across (-1..1), v from the ground (0) to the head (1), stretched over the head a little for the glow. */
export function lampMistGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(2, 1.25, 1, 4).translate(0, 0.625, 0);
  return g;
}

/** Drawn with the streaks and halos (after the ground's glows). */
export const LAMP_MIST_ORDER = RENDER_ORDER.sheen;
