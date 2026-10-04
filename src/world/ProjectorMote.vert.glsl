// Projector mote vertex shader (Projector.ts).
uniform float time;
uniform vec3 apex;
uniform vec3 centre;
uniform vec2 size;
uniform float pointScale;
attribute float phase;
varying float vFade;
void main() {
  // Seeded point in the frustum: across the picture, then back towards the lens; drifting on slow sines.
  vec3 base = centre + vec3(position.xy * size * 0.8, 0.0);
  vec3 p = mix(apex, base, position.z);
  p += vec3(sin(time * 0.13 + phase), sin(time * 0.09 + phase * 1.7) - 0.3 * fract(time * 0.004 + phase), cos(time * 0.11 + phase * 0.6)) * 0.05 * (0.3 + position.z);
  vFade = (1.0 - smoothstep(0.6, 1.0, position.z)) * (0.4 + 0.6 * abs(sin(time * 0.7 + phase * 3.1)));
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = clamp(3.3 * pointScale * (1.5 / -view.z), 1.0, 4.0 * pointScale);
}
