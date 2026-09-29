import type * as THREE from 'three';
import { afterChunk, patchShader } from './shaderPatch';

/**
 * `envMapIntensity` for a material lit by the scene's environment. three r169 overwrites that
 * uniform with `scene.environmentIntensity` for every standard material without a map of its own
 * (`WebGLRenderer`, "material.envMap === null && scene.environment !== null"), so the parameter
 * does nothing in this game: this patch scales the reflections (and the image-based diffuse) by
 * `scale` on top of the room's strength instead. `standard()` applies it to any
 * `envMapIntensity` other than 1; a hand-made material calls it directly. Returns the material.
 */
export function envBoost<M extends THREE.MeshStandardMaterial>(material: M, scale: number): M {
  if (scale === 1) return material;
  const uniform = { value: scale };
  return patchShader(material, 'envBoost', (shader) => {
    shader.uniforms.envBoost = uniform;
    shader.fragmentShader = 'uniform float envBoost;\n' + afterChunk(shader.fragmentShader, 'lights_fragment_maps', /* glsl */ `
      #ifdef USE_ENVMAP
        #if defined( RE_IndirectSpecular )
          radiance *= envBoost;
        #endif
        #if defined( RE_IndirectDiffuse ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
          iblIrradiance *= envBoost;
        #endif
      #endif
    `);
  });
}
