import type * as THREE from 'three';
import { VALUE_NOISE, afterChunk, patchShader } from '../materials/shaderPatch';

/**
 * The park's lawn past its tiling: the 3 m grass tile (`groundTextures.lawnTile`) under a world-space mottle tens of
 * metres across (lusher hollows, drier rises, two scales so it never repeats) and the mower's stripes, bands a mower
 * wide that look light or dark by which way the grass was laid and which way the eye looks along them (the darker
 * when seen against the cut), as on a mown park. No texture: ALU on the lawn's fragments only.
 */
export function lawnLook<M extends THREE.MeshStandardMaterial>(material: M): M {
  return patchShader(material, 'parkLawn', (shader) => {
    shader.vertexShader = 'varying vec3 vLawnWorld;\n' + afterChunk(shader.vertexShader, 'project_vertex', 'vLawnWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader =
      'varying vec3 vLawnWorld;\n' +
      VALUE_NOISE +
      afterChunk(shader.fragmentShader, 'map_fragment', /* glsl */ `
        {
          vec2 lawnP = vLawnWorld.xz;
          float lawnBig = patchNoise(lawnP / 23.0) * 0.6 + patchNoise(lawnP / 7.3 + 11.0) * 0.4;
          // Lusher in the hollows (a cooler, deeper green), drier on the rises (a little yellow).
          diffuseColor.rgb *= mix(vec3(1.08, 1.04, 0.86), vec3(0.86, 0.96, 0.9), lawnBig);
          // The stripes: bands 1.4 m wide along z, every other one laid the other way.
          float band = mod(floor(lawnP.x / 1.4), 2.0) * 2.0 - 1.0;
          vec3 lawnEye = normalize(cameraPosition - vLawnWorld);
          float against = band * lawnEye.z / max(length(lawnEye.xz), 1e-3);
          diffuseColor.rgb *= 1.0 + 0.07 * against * (1.0 - smoothstep(25.0, 70.0, length(cameraPosition - vLawnWorld)));
        }
      `);
  });
}
