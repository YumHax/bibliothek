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
 * distortion, black past the curved edge), scan lines and a faint aperture grille run across it
 * (on the picture, so they stay put as the player walks by, and fade out before they alias),
 * the corners fall off and the bright parts bloom slightly. An unlit `MeshBasicMaterial` with its
 * map sampling patched; opaque, so the canvas's alpha stays 1 (see docs/graphics.md).
 */
export function crtScreenMaterial(map: THREE.Texture, options: CrtScreenOptions = {}): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ map });
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
        // The curved border, antialiased: the distance to the nearest edge over its screen-space rate.
        vec2 crtEdge = min(crtSample, 1.0 - crtSample);
        float crtEdgeDistance = min(crtEdge.x, crtEdge.y);
        float crtInside = clamp(crtEdgeDistance / max(fwidth(crtEdgeDistance), 1e-5) + 0.5, 0.0, 1.0);
        vec3 crtColor = texture2D(map, clamp(crtSample, 0.0, 1.0)).rgb;
        // Scan lines and the aperture grille are painted on the picture (one stripe per line, one
        // triad per texel column), and fade to their mean as they shrink under two pixels: seen
        // from afar or at a slant they would beat against the screen's pixels (moire).
        float crtLinePhase = crtSample.y * crtLines;
        float crtLineFade = 1.0 - smoothstep(0.25, 0.5, fwidth(crtLinePhase));
        float crtScan = 0.78 + 0.22 * sin(crtLinePhase * 6.2831853) * crtLineFade;
        float crtColumnPhase = crtSample.x * float(textureSize(map, 0).x);
        float crtColumnFade = 1.0 - smoothstep(0.25, 0.5, fwidth(crtColumnPhase));
        float crtGrille = 0.93 + 0.07 * sin(crtColumnPhase * 6.2831853) * crtColumnFade;
        float crtVignette = smoothstep(1.45, 0.6, length(crtUv * vec2(0.85, 1.0)));
        crtColor *= crtScan * crtGrille * crtVignette * crtGain;
        crtColor += crtColor * crtColor * 0.3;
        diffuseColor.rgb *= crtColor * crtInside;
      #endif
      `,
    );
  });
}
