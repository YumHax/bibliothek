import type * as THREE from 'three';

export type ShaderPatch = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

/**
 * Adds `patch` to a built-in material's shader (on top of any patch already there). `key` names
 * the patched variant: every material patched with the same key shares one program, and each
 * keeps its own uniforms (the patch runs once per material).
 */
export function patchShader<M extends THREE.Material>(material: M, key: string, patch: ShaderPatch): M {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    patch(shader);
  };
  material.customProgramCacheKey = () => `${previousKey()}|${key}`;
  return material;
}

/** Inserts `code` right after `#include <chunk>` in `source` (throws if the chunk is missing, so a three.js upgrade fails loudly). */
export function afterChunk(source: string, chunk: string, code: string): string {
  const include = `#include <${chunk}>`;
  if (!source.includes(include)) throw new Error(`[shaderPatch] no ${include}`);
  return source.replace(include, `${include}\n${code}`);
}

/** Cheap 2D value noise for fragment shaders (0..1), prepended where a patch needs it (guarded: two patches may both prepend it). */
export const VALUE_NOISE = /* glsl */ `
#ifndef PATCH_VALUE_NOISE
#define PATCH_VALUE_NOISE
float patchHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float patchNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(patchHash(i), patchHash(i + vec2(1.0, 0.0)), u.x), mix(patchHash(i + vec2(0.0, 1.0)), patchHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
#endif
`;
