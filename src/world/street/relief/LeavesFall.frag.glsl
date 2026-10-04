// Leaves fall fragment shader (Leaves.ts).
uniform float light;
varying vec3 vTint;
varying float vSpin;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vSpin);
  float sn = sin(vSpin);
  vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
  // A leaf seen turning: an ellipse whose width swings with its spin.
  float w = 0.12 + 0.2 * abs(sin(vSpin * 0.7));
  if ((r.x * r.x) / (w * w) + (r.y * r.y) / 0.16 > 1.0) discard;
  gl_FragColor = vec4(vTint * light, vFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
