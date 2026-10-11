import type * as THREE from 'three';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { standardVariant } from '../materials/palette';
import { isShared } from '../materials/sharedResources';
import { SHELTER_GLSL, STREET_SHELTERS } from './shelters';

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
 * down take no snow, and nothing under a shelter (`STREET_SHELTERS`: an awning, the bus shelter, the
 * kiosk's roof) takes snow or much wet. With `depth` (metres; only for smooth, closed shapes, whose
 * corners are shared: a bush, a hedge) the snow also stands that thick on the tops, the up-facing
 * vertices pushed out along their normals. Returns the material.
 */
export function snowCovered<M extends THREE.MeshStandardMaterial>(material: M, options: { depth?: number } = {}): M {
  return weathered(material, true, options.depth ?? 0);
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

function weathered<M extends THREE.MeshStandardMaterial>(material: M, snow: boolean, depth = 0): M {
  // A palette material is every prop's of that look: weather its street twin instead (`snowPaint`, `snowStandard`).
  if (isShared(material)) throw new Error('[snowCover] a shared material cannot be weathered in place: use snowPaint / snowStandard');
  const key = snow ? (depth > 0 ? `streetSnow:${depth.toFixed(3)}` : 'streetSnow') : 'streetWet';
  return patchShader(material, key, (shader) => {
    shader.uniforms.snowCover = STREET_SNOW;
    shader.uniforms.streetWet = STREET_WET;
    shader.uniforms.shelterMin = STREET_SHELTERS.shelterMin;
    shader.uniforms.shelterMax = STREET_SHELTERS.shelterMax;
    let vertex = 'uniform float snowCover;\nvarying float vSnowUp;\nvarying vec3 vSnowWorld;\n' + afterChunk(shader.vertexShader, 'beginnormal_vertex', /* glsl */ `
      #ifdef USE_INSTANCING
        vSnowUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y;
      #else
        vSnowUp = normalize(mat3(modelMatrix) * objectNormal).y;
      #endif
    `);
    // Snow standing on the tops (smooth shapes only: a corner split between faces would open).
    if (depth > 0) vertex = afterChunk(vertex, 'begin_vertex', `transformed += normalize(objectNormal) * snowCover * ${depth.toFixed(3)} * smoothstep(0.2, 0.9, vSnowUp);`);
    shader.vertexShader = afterChunk(vertex, 'project_vertex', /* glsl */ `
      {
        vec4 snowAt = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          snowAt = instanceMatrix * snowAt;
        #endif
        vSnowWorld = (modelMatrix * snowAt).xyz;
      }
    `);
    // Under a shelter: dry and clear (the test a few centimetres up, so a shelter's own roof still takes its snow).
    const shelterCode = /* glsl */ `
      float snowShelter = 0.0;
      if (snowCover + streetWet > 0.001 && sheltered(vSnowWorld + vec3(0.0, 0.05, 0.0))) snowShelter = 1.0;
    `;
    const snowCode = snow
      ? /* glsl */ `
      float snowAmount = snowCover * smoothstep(0.35, 0.85, vSnowUp) * (1.0 - snowShelter);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${SNOW_COLOR}), snowAmount);
    `
      : 'float snowAmount = 0.0;';
    let fragment = 'uniform float snowCover;\nuniform float streetWet;\nvarying float vSnowUp;\nvarying vec3 vSnowWorld;\n' + SHELTER_GLSL + afterChunk(shader.fragmentShader, 'color_fragment', shelterCode + snowCode + WET_FRAGMENT + 'wetAmount *= 1.0 - 0.85 * snowShelter;');
    // The wet darkens what lies under the snow too little to matter: it is the snow's colour that shows there.
    fragment = afterChunk(fragment, 'metalnessmap_fragment', `float wetPorous = (1.0 - metalnessFactor) * (1.0 - snowAmount);\n${WET_COLOR}\nmetalnessFactor = mix(metalnessFactor, 0.0, snowAmount);`);
    fragment = afterChunk(fragment, 'roughnessmap_fragment', `roughnessFactor = mix(roughnessFactor, 0.8, snowAmount);\n${WET_ROUGHNESS}`);
    shader.fragmentShader = fragment;
  });
}
