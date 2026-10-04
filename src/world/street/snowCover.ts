import type * as THREE from 'three';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { standardVariant } from '../materials/palette';
import { isShared } from '../materials/sharedResources';

/**
 * How white the street's up-facing surfaces are (0..1): `SkyState.snowCover`, written twice a
 * second by `StreetGround` and read by every material `snowCovered()` patched. One uniform object
 * shared by all of them.
 */
export const STREET_SNOW = { value: 0 };
/** How wet the street is (0..1): `SkyState.wetness` less what lies under snow, written with `STREET_SNOW`. */
export const STREET_WET = { value: 0 };

const SNOW_COLOR = '0.92, 0.94, 0.97';

/*
 * Wet: everything out in the rain darkens as it soaks (porous things most, bare metal hardly) and
 * goes glossy, the up-facing faces most (water stands on them), the sides a little (it runs off).
 */
const WET_FRAGMENT = /* glsl */ `
  float wetUp = smoothstep(-0.2, 0.8, vSnowUp);
  float wetAmount = streetWet * (0.45 + 0.55 * wetUp);
`;
const WET_COLOR = 'diffuseColor.rgb *= 1.0 - 0.32 * wetAmount * wetPorous;';
const WET_ROUGHNESS = 'roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.28), wetAmount * (0.35 + 0.65 * wetUp));';

/**
 * The street's weather on a material: snow laid on its up-facing faces (car roofs and bonnets, the
 * shelter's roof, bench slats, the tops of bins, hedges and awnings: the albedo goes to snow white by
 * how much the face looks up, world space, instancing included, times `STREET_SNOW`, rougher and
 * not metallic), and the rain's wet (`STREET_WET`: darker and glossier). Faces that look sideways or
 * down take no snow. Returns the material.
 */
export function snowCovered<M extends THREE.MeshStandardMaterial>(material: M): M {
  return weathered(material, true);
}

/**
 * The street's snowy twin of the palette's `paint(color, roughness)`: one material for every street prop
 * of that look, apart from the palette's own (`snowCovered(paint(...))` would snow on every room's prop
 * of that colour too, and refuses).
 */
export function snowPaint(color: THREE.ColorRepresentation, roughness = 0.6): THREE.MeshStandardMaterial {
  return snowStandard({ color, roughness });
}

/** The street's snowy twin of the palette's `standard(parameters)` (see `snowPaint`). */
export function snowStandard(parameters: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return standardVariant('streetSnow', parameters, snowCovered);
}

function weathered<M extends THREE.MeshStandardMaterial>(material: M, snow: boolean): M {
  // A palette material is every prop's of that look: weather its street twin instead (`snowPaint`, `snowStandard`).
  if (isShared(material)) throw new Error('[snowCover] a shared material cannot be weathered in place: use snowPaint / snowStandard');
  return patchShader(material, snow ? 'streetSnow' : 'streetWet', (shader) => {
    shader.uniforms.snowCover = STREET_SNOW;
    shader.uniforms.streetWet = STREET_WET;
    shader.vertexShader = 'varying float vSnowUp;\n' + afterChunk(shader.vertexShader, 'beginnormal_vertex', /* glsl */ `
      #ifdef USE_INSTANCING
        vSnowUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y;
      #else
        vSnowUp = normalize(mat3(modelMatrix) * objectNormal).y;
      #endif
    `);
    const snowCode = snow
      ? /* glsl */ `
      float snowAmount = snowCover * smoothstep(0.35, 0.85, vSnowUp);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${SNOW_COLOR}), snowAmount);
    `
      : 'float snowAmount = 0.0;';
    let fragment = 'uniform float snowCover;\nuniform float streetWet;\nvarying float vSnowUp;\n' + afterChunk(shader.fragmentShader, 'color_fragment', snowCode + WET_FRAGMENT);
    // The wet darkens what lies under the snow too little to matter: it is the snow's colour that shows there.
    fragment = afterChunk(fragment, 'metalnessmap_fragment', `float wetPorous = (1.0 - metalnessFactor) * (1.0 - snowAmount);\n${WET_COLOR}\nmetalnessFactor = mix(metalnessFactor, 0.0, snowAmount);`);
    fragment = afterChunk(fragment, 'roughnessmap_fragment', `roughnessFactor = mix(roughnessFactor, 0.8, snowAmount);\n${WET_ROUGHNESS}`);
    shader.fragmentShader = fragment;
  });
}
