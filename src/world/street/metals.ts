import * as THREE from 'three';
import { afterChunk, patchShader, VALUE_NOISE } from '../materials/shaderPatch';

/**
 * Bare metal outdoors (galvanised hoops and housings, cast-iron covers, coins): metalness 1, its
 * roughness broken up by world-space noise (wiped and weathered patches), so it neither mirrors
 * evenly nor reads as grey plastic. Painted metal (lamp posts, benches, car bodies, railings) is
 * paint, metalness 0: take `paint()` / a `MeshStandardMaterial` without metalness for it.
 * A new material each call (the caller owns it, or wraps it in `shared`); `spread` is how far the
 * roughness strays from `roughness` (either way).
 */
export function bareMetal(parameters: THREE.MeshStandardMaterialParameters, spread = 0.18): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ ...parameters, metalness: 1 });
  return patchShader(material, `bareMetal${spread}`, (shader) => {
    shader.vertexShader = 'varying vec3 vMetalWorld;\n' + afterChunk(shader.vertexShader, 'worldpos_vertex', /* glsl */ `
      #ifdef USE_INSTANCING
        vMetalWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vMetalWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif
    `);
    shader.fragmentShader = `varying vec3 vMetalWorld;\n${VALUE_NOISE}\n` + afterChunk(shader.fragmentShader, 'roughnessmap_fragment', /* glsl */ `
      {
        vec2 q = vMetalWorld.xz + vMetalWorld.y * 0.7;
        float n = patchNoise(q * 9.0) * 0.6 + patchNoise(q * 37.0) * 0.4;
        roughnessFactor = clamp(roughnessFactor + (n - 0.5) * ${(spread * 2).toFixed(3)}, 0.05, 1.0);
      }
    `);
  });
}
