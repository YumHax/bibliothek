import type * as THREE from 'three';
import { afterChunk, patchShader, VALUE_NOISE } from './shaderPatch';

/** How far the roughness swings (±) across the brush strokes, and how fine they are (strokes per metre across them). */
const STREAK_DEPTH = 0.12;
const STREAKS_PER_M = 420;

/**
 * Brushed metal: fine parallel strokes along the part's longest run (object x, the way a rail, a
 * shelf edge or an appliance's front is brushed), as a roughness that swings across them, so the
 * highlight of a lamp or a window stretches into a streak instead of a round blob. In object space
 * (each part brushed along itself), ALU only, no texture. One program for every brushed metal.
 */
export function brushed<M extends THREE.MeshStandardMaterial>(material: M): M {
  return patchShader(material, 'brushed', (shader) => {
    shader.vertexShader = 'varying vec3 vBrushPos;\n' + afterChunk(shader.vertexShader, 'begin_vertex', 'vBrushPos = position;');
    shader.fragmentShader =
      `varying vec3 vBrushPos;\n${VALUE_NOISE}
      float brushStrokes() {
        // Long along x, very fine across it: two octaves so the strokes are not a regular grating.
        vec2 p = vec2(vBrushPos.x * 3.0, (vBrushPos.y + vBrushPos.z) * ${STREAKS_PER_M.toFixed(1)});
        float strokes = 0.65 * patchNoise(p) + 0.35 * patchNoise(p * vec2(2.3, 2.7) + 17.0);
        // Fades as a pixel covers many strokes (far off, grazing): they would only shimmer.
        float footprint = length(fwidth(vBrushPos));
        return (strokes * 2.0 - 1.0) * (1.0 - smoothstep(0.0008, 0.004, footprint));
      }\n` +
      afterChunk(shader.fragmentShader, 'roughnessmap_fragment', `roughnessFactor = clamp(roughnessFactor + ${STREAK_DEPTH.toFixed(3)} * brushStrokes(), 0.02, 1.0);`);
  });
}
