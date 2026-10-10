import type * as THREE from 'three';
import { afterChunk, patchShader, VALUE_NOISE } from './shaderPatch';

/** How far the roughness wanders (±) and the colour (± share) across a painted surface. */
const ROUGHNESS_JITTER = 0.06;
const ALBEDO_JITTER = 0.03;

/**
 * Paint is never perfectly even: a slow world-space mottle (blotches of about 40 cm, a finer one
 * under it) moves its roughness by ±0.06 and its colour by ±3 %, so a large painted prop stops
 * reading as CG plastic. In world space (instancing included), so a row of identical cabinets
 * differs; ALU only, no texture. One program for every painted look (`palette`'s plain standard).
 */
export function paintMottle<M extends THREE.MeshStandardMaterial>(material: M): M {
  return patchShader(material, 'paintMottle', (shader) => {
    shader.vertexShader =
      'varying vec3 vPaintPos;\n' +
      afterChunk(
        shader.vertexShader,
        'begin_vertex',
        `vec4 paintWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          paintWorld = instanceMatrix * paintWorld;
        #endif
        vPaintPos = (modelMatrix * paintWorld).xyz;`,
      );
    shader.fragmentShader =
      `varying vec3 vPaintPos;\n${VALUE_NOISE}
      float paintUneven() {
        vec3 p = vPaintPos;
        float coarse = 0.5 * (patchNoise(p.xy * 2.5 + 3.1) + patchNoise(p.zy * 2.5 + 11.7));
        float fine = 0.5 * (patchNoise(p.xz * 9.0 + 5.3) + patchNoise(p.zy * 9.0 + 1.9));
        return mix(coarse, fine, 0.3) * 2.0 - 1.0;
      }\n` +
      afterChunk(
        afterChunk(shader.fragmentShader, 'map_fragment', `float paintN = paintUneven();\ndiffuseColor.rgb *= 1.0 + ${ALBEDO_JITTER.toFixed(3)} * paintN;`),
        'roughnessmap_fragment',
        `roughnessFactor = clamp(roughnessFactor + ${ROUGHNESS_JITTER.toFixed(3)} * paintN, 0.0, 1.0);`,
      );
  });
}
