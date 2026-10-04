// Leaves fall vertex shader (Leaves.ts): TS_FALL_SECONDS and TS_CROWN are #defines from the TypeScript constants.
attribute vec4 seed;
attribute vec3 tint;
uniform float time;
uniform float wind;
uniform float size;
uniform float pointScale;
varying vec3 vTint;
varying float vSpin;
varying float vFade;
void main() {
  float t = fract(time / TS_FALL_SECONDS + seed.w);
  vec3 p = position;
  p.y = mix(TS_CROWN + seed.z * 1.5, seed.x, t);
  // Drift downwind, and flutter from side to side as it falls.
  p.x += wind * 5.0 * t + sin(time * 1.7 + seed.w * 40.0) * 0.5;
  p.z += wind * 1.5 * t + cos(time * 1.3 + seed.w * 23.0) * 0.4;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = size * pointScale / max(-view.z, 0.5);
  vTint = tint;
  vSpin = time * (1.5 + seed.y * 3.0) + seed.w * 6.28;
  vFade = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.92, 1.0, t));
}
