import type * as THREE from 'three';
import { afterChunk, patchShader } from '../materials/shaderPatch';

/** What a sheet of water moves with: the time its waves run on, the wind on it, the rain falling into it (0..1 each). */
export interface RippleUniforms {
  time: THREE.IUniform<number>;
  wind: THREE.IUniform<number>;
  rain: THREE.IUniform<number>;
}

/**
 * GLSL: `rippleHeight(p, time, wind, rain, cell)` the surface's height (m) at world `p` (xz): three trains of small
 * waves running with the wind, and in the rain a ring spreading from where each drop fell (a drop a `cell`, each at
 * its own moment); `rippleNormal(...)` the normal it makes (world space). Shared by the pond, the puddles and the
 * gutters, and the puddles' mirror (its picture broken up where the rings spread).
 */
export const RIPPLE_GLSL = /* glsl */ `
#ifndef STREET_RIPPLES
#define STREET_RIPPLES
float rippleHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rippleHeight(vec2 p, float time, float wind, float rain, float cell) {
  float a = 0.004 + 0.012 * wind;
  float h = a * sin(dot(p, vec2(1.7, 0.6)) * 3.1 - time * 1.9)
    + a * 0.7 * sin(dot(p, vec2(-0.8, 1.3)) * 4.3 - time * 2.4)
    + a * 0.4 * sin(dot(p, vec2(0.3, -1.9)) * 7.9 - time * 3.3);
  if (rain > 0.02) {
    // Two grids of drops, the second half a cell over: more rings, and fewer cut off at a cell's edge.
    for (int k = 0; k < 2; k++) {
      float shift = float(k) * 0.5;
      vec2 at = floor(p / cell + shift) + float(k) * 41.0;
      vec2 drop = (floor(p / cell + shift) + vec2(rippleHash(at), rippleHash(at + 7.1)) - shift) * cell;
      float age = fract(time * 0.8 + rippleHash(at + 3.3));
      float d = length(p - drop);
      float ring = sin((d - age * 0.35) * 55.0) * exp(-abs(d - age * 0.35) * 30.0) * (1.0 - age);
      h += 0.004 * rain * ring;
    }
  }
  return h;
}
vec3 rippleNormal(vec2 p, float time, float wind, float rain, float cell) {
  float e = 0.02;
  float h0 = rippleHeight(p, time, wind, rain, cell);
  float hx = rippleHeight(p + vec2(e, 0.0), time, wind, rain, cell);
  float hz = rippleHeight(p + vec2(0.0, e), time, wind, rain, cell);
  return normalize(vec3(-(hx - h0) / e, 1.0, -(hz - h0) / e));
}
#endif
`;

/**
 * Open water's surface as a normal worked out in the shader, no map (`RIPPLE_GLSL`): only the normal moves, the
 * reflection does the rest. `cell` the drops' spacing (m), `key` the variant.
 */
export function rippled<M extends THREE.MeshStandardMaterial>(material: M, uniforms: RippleUniforms, key: string, cell = 0.7): M {
  return patchShader(material, `ripples:${key}`, (shader) => {
    shader.uniforms.rippleTime = uniforms.time;
    shader.uniforms.rippleWind = uniforms.wind;
    shader.uniforms.rippleRain = uniforms.rain;
    shader.vertexShader = 'varying vec3 vRippleWorld;\n' + afterChunk(shader.vertexShader, 'project_vertex', /* glsl */ `
      {
        vec4 rippleAt = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          rippleAt = instanceMatrix * rippleAt;
        #endif
        vRippleWorld = (modelMatrix * rippleAt).xyz;
      }
    `);
    shader.fragmentShader =
      'varying vec3 vRippleWorld;\nuniform float rippleTime;\nuniform float rippleWind;\nuniform float rippleRain;\n' +
      RIPPLE_GLSL +
      afterChunk(shader.fragmentShader, 'normal_fragment_maps', /* glsl */ `
        normal = normalize((viewMatrix * vec4(rippleNormal(vRippleWorld.xz, rippleTime, rippleWind, rippleRain, ${cell.toFixed(2)}), 0.0)).xyz);
      `);
  });
}
