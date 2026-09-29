import type * as THREE from 'three';
import { afterChunk, patchShader } from './shaderPatch';

/**
 * Makes a material's `emissive` light its own print (emissive x the mapped colour) instead of
 * adding flat grey: a hover brightens a box's art rather than washing it out. Same look as
 * `emissiveMap = map`, without the extra texture unit a second sampler would take in every lit
 * program. Returns the material.
 */
export function printGlow<M extends THREE.MeshStandardMaterial>(material: M): M {
  return patchShader(material, 'printGlow', (shader) => {
    shader.fragmentShader = afterChunk(shader.fragmentShader, 'emissivemap_fragment', 'totalEmissiveRadiance *= diffuseColor.rgb;');
  });
}
