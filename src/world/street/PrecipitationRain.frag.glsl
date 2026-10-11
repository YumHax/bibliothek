// Precipitation rain fragment shader (Precipitation.ts).
uniform vec3 color;
uniform float opacity;
varying float vFade;
varying float vSide;
varying vec3 vLamp;
void main() {
  float edge = 1.0 - vSide * vSide;
  // Under a lamp a drop glints: brighter, and more of it shows.
  float glint = min(dot(vLamp, vec3(0.3, 0.5, 0.2)), 1.5);
  gl_FragColor = vec4(color + vLamp, opacity * vFade * edge * (1.0 + 1.6 * glint));
}
