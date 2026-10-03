import type * as THREE from 'three';
import { HOSKINS_HASH, valueNoise2 } from '@/graphics/glslNoise';
import { isShared } from './sharedResources';

/** The patch keys already on each material (`patchShader`). */
const applied = new WeakMap<THREE.Material, Set<string>>();

export type ShaderPatch = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

/**
 * Adds `patch` to a built-in material's shader (on top of any patch already there). `key` names
 * the patched variant: every material patched with the same key shares one program, and each
 * keeps its own uniforms (the patch runs once per material).
 */
export function patchShader<M extends THREE.Material>(material: M, key: string, patch: ShaderPatch): M {
  // Once per key: a second run would declare its uniforms and varyings twice (the program fails to compile).
  const keys = applied.get(material) ?? new Set<string>();
  if (keys.has(key)) return material;
  // A shared material (the palette's, a module's) is every user's: patching it changes them all. Patch inside its `make`, before it is shared.
  if (isShared(material)) console.warn(`[shaderPatch] '${key}' patched onto a shared material: every prop using it changes`, material);
  applied.set(material, keys.add(key));
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

/** Inserts `code` right before `#include <chunk>` in `source` (throws if the chunk is missing). */
export function beforeChunk(source: string, chunk: string, code: string): string {
  const include = `#include <${chunk}>`;
  if (!source.includes(include)) throw new Error(`[shaderPatch] no ${include}`);
  return source.replace(include, `${code}\n${include}`);
}

/**
 * Replaces `#include <chunk>` in `source` by `code` (throws if the chunk is missing). Only for a
 * chunk no other patch anchors on (`afterChunk` on it would then throw).
 */
export function replaceChunk(source: string, chunk: string, code: string): string {
  const include = `#include <${chunk}>`;
  if (!source.includes(include)) throw new Error(`[shaderPatch] no ${include}`);
  return source.replace(include, code);
}

/**
 * Cheap 2D value noise for fragment shaders (0..1), prepended where a patch needs it (guarded: two patches may
 * both prepend it): `patchHash` / `patchNoise`, over the shared `hoskinsHash` (`graphics/glslNoise`).
 */
export const VALUE_NOISE = /* glsl */ `
${HOSKINS_HASH}
#ifndef PATCH_VALUE_NOISE
#define PATCH_VALUE_NOISE
float patchHash(vec2 p) { return hoskinsHash(p); }
#endif
${valueNoise2('patchNoise', 'patchHash')}
`;
