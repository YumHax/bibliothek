import type * as THREE from 'three';
import { afterChunk, patchShader } from '../materials/shaderPatch';

/**
 * How white the street's up-facing surfaces are (0..1): `SkyState.snowCover`, written once a
 * frame by `StreetGround` and read by every material `snowCovered()` patched. One uniform object
 * shared by all of them.
 */
export const STREET_SNOW = { value: 0 };

const SNOW_COLOR = '0.92, 0.94, 0.97';

/**
 * Lays the snow on a material's up-facing faces (car roofs and bonnets, the shelter's roof, bench
 * slats, the tops of bins, hedges and awnings): the albedo goes to snow white by how much the
 * face looks up (world space, instancing included) times `STREET_SNOW`, rougher and not metallic.
 * Faces that look sideways or down stay as they are. Returns the material.
 */
export function snowCovered<M extends THREE.MeshStandardMaterial>(material: M): M {
  return patchShader(material, 'streetSnow', (shader) => {
    shader.uniforms.snowCover = STREET_SNOW;
    shader.vertexShader = 'varying float vSnowUp;\n' + afterChunk(shader.vertexShader, 'beginnormal_vertex', /* glsl */ `
      #ifdef USE_INSTANCING
        vSnowUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y;
      #else
        vSnowUp = normalize(mat3(modelMatrix) * objectNormal).y;
      #endif
    `);
    let fragment = 'uniform float snowCover;\nvarying float vSnowUp;\n' + afterChunk(shader.fragmentShader, 'color_fragment', /* glsl */ `
      float snowAmount = snowCover * smoothstep(0.35, 0.85, vSnowUp);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${SNOW_COLOR}), snowAmount);
    `);
    fragment = afterChunk(fragment, 'roughnessmap_fragment', 'roughnessFactor = mix(roughnessFactor, 0.8, snowAmount);');
    fragment = afterChunk(fragment, 'metalnessmap_fragment', 'metalnessFactor = mix(metalnessFactor, 0.0, snowAmount);');
    shader.fragmentShader = fragment;
  });
}
