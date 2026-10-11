// LampMist fragment shader (LampMist.ts).
uniform float mist;
varying vec2 vMist;
varying vec3 vMistColor;
varying float vMistNear;
void main() {
  float u = vMist.x;
  float v = vMist.y;
  // The cone: brightest along its axis and under the head, thinning to the ground (and gone below it).
  float cone = exp(-u * u * 3.2) * smoothstep(0.0, 0.25, v) * (0.35 + 0.65 * v) * step(v, 1.0);
  // The glow round the head, a little above and below it.
  float r = length(vec2(u * 1.6, (v - 1.0) * 5.0));
  float glow = exp(-r * r * 1.6) * 1.4;
  vec3 col = vMistColor * (cone * 0.22 + glow * 0.35) * mist * vMistNear;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
