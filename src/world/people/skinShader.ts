import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { IQ_HASH, valueNoise3 } from '@/graphics/glslNoise';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import type { Age } from './looks';

/*
 * People's skin. With `QUALITY.detailedMaterials`, on top of the standard material:
 * - the light scattered under the skin wraps past the terminator, reddest there (the cheap stand-in
 *   for subsurface scattering), and thin parts (ears, the nose's tip and wings, fingers) glow red
 *   when the light is behind them;
 * - a grain sticks to the skin (noise on the rest position, so it follows morphs and bends): pores
 *   and a finer relief that break up the highlights, fading as they shrink under a pixel, and a
 *   faint blotchiness of colour and shine;
 * - on the face (`faceSkin`, in the head's frame, the same angles `head.headRadius` sculpts in):
 *   an oily T-zone, wet lips, matte cheeks; and the lines that come and go with the expressions
 *   (`skinMotion`: the forehead with raised brows, crow's feet with a smile or a squint, the fold
 *   from nose to mouth deepening with a smile, the lines between the brows in a frown), deeper and
 *   partly there at rest with age;
 * - on the hands, the knuckles and fingertips redder.
 * No texture: everything is computed (the face is at about 15 of 16 units).
 */

/** Which skin: it decides the grain, where it is thin, and the face's zones and lines. */
type SkinPart = 'face' | 'body' | 'hands' | 'ears';

/** How far the light wraps past the terminator per channel on skin (red scatters deepest under it). */
const SKIN_WRAP = 'vec3(0.36, 0.19, 0.14)';

/** How old the skin looks (0 a child's .. 1 an elder's): static lines, deeper folds, drier. */
export function skinAgeOf(age: Age | undefined): number {
  return age === 'elder' ? 1 : age === 'child' ? 0 : age === 'teen' ? 0.08 : 0.25;
}

/** A skin material for `part` (a new material per call: its uniforms are its own). */
export function skinMaterial(parameters: THREE.MeshStandardMaterialParameters, part: SkinPart = 'body', age = 0.25): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial(parameters);
  if (!QUALITY.detailedMaterials) return material;
  return patchSkin(material, part, age, null);
}

/**
 * The face's skin, and where its expressions go (`wrinkles`: brows raised, smile, squint, frown,
 * 0..1 each, set every frame by `motion/face`). Without detailed materials the vector drives nothing.
 */
export function faceSkin(parameters: THREE.MeshStandardMaterialParameters, age: number): { material: THREE.MeshStandardMaterial; wrinkles: THREE.Vector4 } {
  const material = new THREE.MeshStandardMaterial(parameters);
  const wrinkles = new THREE.Vector4();
  if (!QUALITY.detailedMaterials) return { material, wrinkles };
  return { material: patchSkin(material, 'face', age, wrinkles), wrinkles };
}

const PART_DEFINE: Record<SkinPart, string> = { face: 'SKIN_FACE', body: 'SKIN_BODY', hands: 'SKIN_HANDS', ears: 'SKIN_EARS' };

function patchSkin(material: THREE.MeshStandardMaterial, part: SkinPart, age: number, wrinkles: THREE.Vector4 | null): THREE.MeshStandardMaterial {
  const ageUniform = { value: age };
  const motion = { value: wrinkles ?? new THREE.Vector4() };
  return patchShader(material, `skin|${part}`, (shader) => {
    shader.uniforms.skinAge = ageUniform;
    shader.uniforms.skinMotion = motion;
    shader.vertexShader = `varying vec3 vSkinPos;\n${afterChunk(shader.vertexShader, 'begin_vertex', 'vSkinPos = position;')}`;
    let fragment = shader.fragmentShader;
    fragment = afterChunk(fragment, 'map_fragment', SKIN_SURFACE);
    fragment = afterChunk(fragment, 'roughnessmap_fragment', SKIN_SHINE);
    fragment = afterChunk(fragment, 'normal_fragment_maps', SKIN_RELIEF);
    fragment = afterChunk(fragment, 'lights_physical_pars_fragment', SKIN_LIGHT);
    shader.fragmentShader = `#define ${PART_DEFINE[part]}\n${SKIN_HEADER}\n${fragment}`;
  });
}

const SKIN_HEADER = /* glsl */ `
varying vec3 vSkinPos;
uniform float skinAge;
uniform vec4 skinMotion;
${IQ_HASH}
${valueNoise3('skinNoise', 'iqHash')}
float skinHeight = 0.0;
float skinThin = 0.0;
float skinBlotch = 0.0;
float skinAu = 0.0;
float skinFv = 0.0;
float skinBell(float x, float c, float w) { float t = (x - c) / w; return exp(-t * t); }
`;

/** After the colour: grain, blotches, the face's lines (height and shade), the thin parts, the knuckles. */
const SKIN_SURFACE = /* glsl */ `{
  vec3 p = vSkinPos;
  float foot = length(fwidth(p));
  // Each grain only where it is still bigger than a pixel (a face a metre or two off): no noise further away.
  float pores = 0.0;
  float relief = 0.0;
  if (foot < 0.0025) {
    relief = (skinNoise(p * 260.0 + 17.0) - 0.5) * (1.0 - smoothstep(0.001, 0.0025, foot));
    if (foot < 0.0008) pores = (skinNoise(p * 820.0) - 0.5) * (1.0 - smoothstep(0.0003, 0.0008, foot));
  }
  skinBlotch = skinNoise(p * 24.0 + 5.0) - 0.5;
  float grain = 1.0;
  #ifdef SKIN_FACE
    vec3 d = normalize(p);
    skinAu = abs(atan(d.x, d.z));
    skinFv = asin(clamp(d.y, -1.0, 1.0));
    float au = skinAu;
    float fv = skinFv;
    float side = d.x < 0.0 ? -1.0 : 1.0;
    float front = smoothstep(0.0, 0.35, d.z);
    // Pores are biggest on the nose and the cheeks beside it.
    float nose = skinBell(au, 0.0, 0.12) * skinBell(fv, -0.18, 0.2);
    float cheeks = skinBell(au, 0.42, 0.18) * skinBell(fv, -0.2, 0.16);
    grain = 1.0 + 0.9 * nose + 0.5 * cheeks;
    // Lines thinner than a pixel or two fade out rather than shimmer; past that (and behind the face) none is worked out.
    float lineFade = 1.0 - smoothstep(0.008, 0.025, fwidth(fv));
    if (lineFade > 0.0 && front > 0.0) {
      // How deep the expressions fold: a little with youth, more with age; some lines stay at rest with age.
      float fold = 0.55 + 0.6 * skinAge;
      float rest = max(0.0, skinAge - 0.2);
      float fvw = fv + 0.01 * sin(au * 11.0 + side * 1.7);
      float forehead = (skinMotion.x * fold + rest * 0.55) * (1.0 - smoothstep(0.3, 0.62, au))
        * (skinBell(fvw, 0.49, 0.011) + 0.85 * skinBell(fvw, 0.545, 0.011) + 0.6 * skinBell(fvw, 0.6, 0.011));
      float glabella = (skinMotion.w * fold + rest * 0.3) * skinBell(au, 0.035, 0.011) * smoothstep(0.2, 0.26, fv) * (1.0 - smoothstep(0.36, 0.43, fv));
      vec2 corner = vec2(au - 0.53, fv - 0.15);
      float r = length(corner);
      float a = atan(corner.y, max(corner.x, 1e-4));
      float fan = (skinBell(a, -0.45, 0.1) + skinBell(a, 0.0, 0.09) + 0.8 * skinBell(a, 0.42, 0.1)) * smoothstep(0.015, 0.035, r) * (1.0 - smoothstep(0.07, 0.13, r)) * step(0.0, corner.x);
      float crow = fan * ((skinMotion.y * 0.7 + skinMotion.z) * fold + rest * 0.5);
      float t = clamp((-0.33 - fv) / 0.29, 0.0, 1.0);
      float along = mix(0.17, 0.34, t) + 0.035 * sin(t * 3.1416);
      float noseFold = skinBell(au - along, 0.0, 0.016) * (1.0 - smoothstep(-0.36, -0.31, fv)) * smoothstep(-0.66, -0.6, fv)
        * (0.2 + skinMotion.y * 0.9 * fold + skinAge * 0.55);
      float ex = (au - 0.39) / 0.13;
      float under = skinBell(fv - 0.065 + 0.03 * ex * ex, 0.0, 0.01) * (1.0 - smoothstep(0.6, 1.0, abs(ex))) * (skinMotion.z * 0.5 * fold + rest * 0.6);
      float drop = clamp((-0.62 - fv) / 0.18, 0.0, 1.0);
      float marionette = skinBell(au - 0.3 - 0.03 * drop, 0.0, 0.014) * (1.0 - smoothstep(-0.65, -0.6, fv)) * smoothstep(-0.86, -0.78, fv) * rest * 0.7;
      float crease = min(1.4, (forehead + glabella + crow + noseFold + under + marionette) * front) * lineFade;
      skinHeight -= 0.0004 * crease;
      diffuseColor.rgb *= 1.0 - 0.16 * crease;
    }
    skinThin = 0.6 * skinBell(au, 0.0, 0.07) * skinBell(fv, -0.3, 0.08) + 0.4 * skinBell(au, 0.17, 0.05) * skinBell(fv, -0.36, 0.05);
  #endif
  #ifdef SKIN_HANDS
    // The hand hangs from the wrist along -y: the knuckles, the fingers' middle joints, the tips.
    float knuckles = skinBell(p.y, -0.086, 0.009) + 0.7 * skinBell(p.y, -0.128, 0.008) + 0.6 * (1.0 - smoothstep(-0.17, -0.145, p.y));
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.88, 0.87), 0.6 * min(1.0, knuckles));
    skinThin = 0.8 * (1.0 - smoothstep(-0.12, -0.09, p.y));
    grain = 0.8;
  #endif
  #ifdef SKIN_EARS
    skinThin = 1.0;
  #endif
  #ifdef SKIN_BODY
    grain = 0.7;
  #endif
  skinHeight += (pores * 0.00005 + relief * 0.00011) * grain;
  diffuseColor.rgb *= vec3(1.0) + skinBlotch * vec3(0.03, -0.035, -0.03);
}`;

/** After the roughness: the face's oily and matte zones, a little drier with age, blotchy shine. */
const SKIN_SHINE = /* glsl */ `{
  #ifdef SKIN_FACE
    float oily = (1.0 - smoothstep(0.15, 0.45, skinAu)) * smoothstep(0.32, 0.42, skinFv) * (1.0 - smoothstep(0.65, 0.8, skinFv))
      + (1.0 - smoothstep(0.05, 0.13, skinAu)) * smoothstep(-0.4, -0.3, skinFv) * (1.0 - smoothstep(0.15, 0.3, skinFv));
    float lips = (1.0 - smoothstep(0.2, 0.27, skinAu)) * smoothstep(-0.69, -0.65, skinFv) * (1.0 - smoothstep(-0.53, -0.49, skinFv));
    float chin = (1.0 - smoothstep(0.1, 0.25, skinAu)) * smoothstep(-0.98, -0.85, skinFv) * (1.0 - smoothstep(-0.78, -0.7, skinFv));
    roughnessFactor += -0.18 * min(1.0, oily) - 0.28 * lips - 0.07 * chin + 0.05 * skinAge;
  #endif
  roughnessFactor = clamp(roughnessFactor + 0.06 * skinBlotch, 0.28, 0.95);
}`;

/** After the normal: the grain and lines as a relief, from the screen-space derivatives of their height (no tangents). */
const SKIN_RELIEF = /* glsl */ `{
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  float hx = dFdx(skinHeight);
  float hy = dFdy(skinHeight);
  vec3 r1 = cross(dpy, normal);
  vec3 r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  if (abs(det) > 1e-12) normal = normalize(abs(det) * normal - grad);
}`;

/** Each direct light: the standard lighting, the wrap under the skin, the glow through its thin parts. */
const SKIN_LIGHT = /* glsl */ `void RE_Direct_Skin(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  float facing = dot(geometryNormal, directLight.direction);
  vec3 wrap = saturate((vec3(facing) + ${SKIN_WRAP}) / (vec3(1.0) + ${SKIN_WRAP})) - vec3(saturate(facing));
  reflectedLight.directDiffuse += directLight.color * BRDF_Lambert(material.diffuseColor) * wrap;
  vec3 through = normalize(directLight.direction + geometryNormal * 0.35);
  float back = pow(saturate(dot(geometryViewDir, -through)), 4.0);
  reflectedLight.directDiffuse += directLight.color * skinThin * back * material.diffuseColor * vec3(1.1, 0.28, 0.16);
}
#undef RE_Direct
#define RE_Direct RE_Direct_Skin`;
