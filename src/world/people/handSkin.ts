import type * as THREE from 'three';
import { afterChunk, patchShader } from '../materials/shaderPatch';

/*
 * The hand's skin is not one colour: palms carry little pigment (much paler than the back of a dark
 * hand, a little pinker than a fair one), the knuckles are redder (darker on dark skin), the nails
 * paler and glossy. The hand's geometry says per vertex how much of each it is (`handRegion`:
 * nail, knuckle, palm; `body.handGeometry`) and the material tints its own colour by it: no map,
 * no uniform, one program for every hand.
 */

/** Tints `material` (a hand's skin) by its geometry's `handRegion`. */
export function handSkin<M extends THREE.MeshStandardMaterial>(material: M): M {
  return patchShader(material, 'handSkin', (shader) => {
    shader.vertexShader = `attribute vec3 handRegion;\nvarying vec3 vHandRegion;\n${afterChunk(shader.vertexShader, 'begin_vertex', 'vHandRegion = handRegion;')}`;
    shader.fragmentShader = `varying vec3 vHandRegion;\n${afterChunk(
      afterChunk(
        shader.fragmentShader,
        'color_fragment',
        /* glsl */ `{
          vec3 tone = diffuseColor.rgb;
          float dark = 1.0 - smoothstep(0.04, 0.35, dot(tone, vec3(0.2126, 0.7152, 0.0722)));
          vec3 palm = mix(tone * vec3(1.0, 0.92, 0.9), vec3(0.5, 0.27, 0.21), 0.65 * dark);
          vec3 knuckle = tone * mix(vec3(1.0, 0.86, 0.84), vec3(0.8, 0.76, 0.76), dark);
          vec3 nail = mix(tone, vec3(0.8, 0.62, 0.58), 0.35 + 0.35 * dark);
          diffuseColor.rgb = mix(mix(mix(tone, palm, vHandRegion.z), knuckle, vHandRegion.y), nail, vHandRegion.x);
        }`,
      ),
      'roughnessmap_fragment',
      'roughnessFactor = mix(roughnessFactor, 0.3, vHandRegion.x);',
    )}`;
  });
}
