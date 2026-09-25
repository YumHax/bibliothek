import * as THREE from 'three';
import { patchShader } from '../materials/shaderPatch';

export interface CrtScreenOptions {
  /** Scan lines across the picture (the game's line count). Default 240. */
  lines?: number;
  /** How far the picture bulges (barrel distortion), 0 = flat. Default 0.06. */
  bend?: number;
  /** Brightness boost against the scan lines' darkening. Default 1.2. */
  gain?: number;
}

/**
 * The glass of an arcade monitor over a canvas texture: the picture bulges a little (barrel
 * distortion, black past the curved edge), scan lines and a faint aperture grille run across it,
 * the corners fall off and the bright parts bloom slightly. An unlit `MeshBasicMaterial` with its
 * map sampling patched; opaque, so the canvas's alpha stays 1 (see docs/graphics.md).
 */
export function crtScreenMaterial(map: THREE.Texture, options: CrtScreenOptions = {}): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  const uniforms = {
    crtLines: { value: options.lines ?? 240 },
    crtBend: { value: options.bend ?? 0.06 },
    crtGain: { value: options.gain ?? 1.2 },
  };
  return patchShader(material, 'arcade-crt', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = /* glsl */ `
      uniform float crtLines;
      uniform float crtBend;
      uniform float crtGain;
    ` + shader.fragmentShader.replace(
      '#include <map_fragment>',
      /* glsl */ `
      #ifdef USE_MAP
        vec2 crtUv = vMapUv * 2.0 - 1.0;
        crtUv *= 1.0 + crtBend * dot(crtUv, crtUv);
        vec2 crtSample = crtUv * 0.5 + 0.5;
        float crtInside = step(0.0, crtSample.x) * step(crtSample.x, 1.0) * step(0.0, crtSample.y) * step(crtSample.y, 1.0);
        vec3 crtColor = texture2D(map, clamp(crtSample, 0.0, 1.0)).rgb;
        float crtScan = 0.78 + 0.22 * sin(crtSample.y * crtLines * 6.2831853);
        float crtGrille = 0.93 + 0.07 * sin(gl_FragCoord.x * 2.0944);
        float crtVignette = smoothstep(1.45, 0.6, length(crtUv * vec2(0.85, 1.0)));
        crtColor *= crtScan * crtGrille * crtVignette * crtGain;
        crtColor += crtColor * crtColor * 0.3;
        diffuseColor.rgb *= crtColor * crtInside;
      #endif
      `,
    );
  });
}
