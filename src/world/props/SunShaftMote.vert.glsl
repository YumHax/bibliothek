// SunShaft mote vertex shader (SunShaft.ts).
uniform float time;
uniform vec3 rayDir;
uniform float beamLength;
uniform vec4 opening;
uniform float pointScale;
attribute float phase;
varying float vFade;
void main() {
  // Seeded point in the beam: across the opening, then along the rays; drifting on slow sines.
  float t = position.z * beamLength;
  vec3 p = vec3(position.xy * opening.xy, 0.0) + rayDir * t;
  p += vec3(sin(time * 0.13 + phase), sin(time * 0.09 + phase * 1.7) - 0.3 * fract(time * 0.004 + phase), cos(time * 0.11 + phase * 0.6)) * 0.12;
  vFade = (1.0 - smoothstep(0.5, 1.0, position.z)) * (0.4 + 0.6 * abs(sin(time * 0.7 + phase * 3.1)));
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = clamp(3.3 * pointScale * (1.5 / -view.z), 1.0, 4.0 * pointScale);
}
