import * as THREE from 'three';
import { afterChunk, beforeChunk, patchShader, VALUE_NOISE } from './shaderPatch';

interface BumpFinishOptions {
  /**
   * Roughness where the bump map is low (a grout line, a saw cut, a gap): the seams go matt while
   * the faces keep the material's sheen. Left out, the roughness is the material's.
   */
  seamRoughness?: number;
  /** Bump heights (0..1) between which the seam's roughness gives way to the face's. */
  seamRange?: readonly [number, number];
  /** A slow mottle of the roughness over the bump map's uv (share, 0.1 = ±10 %): a slab never polished evenly. */
  mottle?: number;
}

/**
 * Finishes a material that has a `bumpMap` (tiles, concrete, plaster), from that map alone (no new
 * texture unit: the floors sit at their limit):
 * - the relief fades as a pixel covers more of the map (far off, or at a grazing angle), where its
 *   slope is finer than the pixels and would sparkle (three's bump knows nothing of the footprint);
 * - with `seamRoughness`, the low parts of the map (grout, joints) take that roughness;
 * - with `mottle`, the roughness wanders a little across the surface.
 * Shares one program per combination of options. Returns the material.
 */
export function bumpFinish<M extends THREE.MeshStandardMaterial>(material: M, options: BumpFinishOptions = {}): M {
  const seam = options.seamRoughness !== undefined;
  const mottle = options.mottle ?? 0;
  const range = options.seamRange ?? [0.2, 0.45];
  const uniforms = {
    seamRoughness: { value: options.seamRoughness ?? 1 },
    seamRange: { value: new THREE.Vector2(range[0], range[1]) },
    roughnessMottle: { value: mottle },
  };
  return patchShader(material, `bumpFinish${seam ? '|seam' : ''}${mottle > 0 ? '|mottle' : ''}`, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    let fragment = beforeChunk(shader.fragmentShader, 'bumpmap_pars_fragment', '#define dHdxy_fwd dHdxy_fwd_raw');
    fragment = afterChunk(
      fragment,
      'bumpmap_pars_fragment',
      /* glsl */ `#undef dHdxy_fwd
      uniform float seamRoughness;
      uniform vec2 seamRange;
      uniform float roughnessMottle;
      ${VALUE_NOISE}
      #ifdef USE_BUMPMAP
        // Texels of the bump map under one pixel: past one the relief thins out, by four it is nearly gone.
        vec2 dHdxy_fwd() {
          vec2 texels = fwidth(vBumpMapUv) * vec2(textureSize(bumpMap, 0));
          return dHdxy_fwd_raw() * mix(1.0, 0.15, smoothstep(1.0, 4.0, max(texels.x, texels.y)));
        }
      #endif`,
    );
    const roughness = [
      seam ? 'roughnessFactor = mix(seamRoughness, roughnessFactor, smoothstep(seamRange.x, seamRange.y, texture2D(bumpMap, vBumpMapUv).x));' : '',
      mottle > 0 ? 'roughnessFactor = clamp(roughnessFactor * (1.0 + roughnessMottle * (2.0 * patchNoise(vBumpMapUv * 6.0) - 1.0)), 0.0, 1.0);' : '',
    ].join('\n');
    if (roughness.trim()) fragment = afterChunk(fragment, 'roughnessmap_fragment', `#ifdef USE_BUMPMAP\n${roughness}\n#endif`);
    shader.fragmentShader = fragment;
  });
}
