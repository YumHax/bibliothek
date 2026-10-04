// Spray fragment shader (Spray.ts).
uniform vec3 tint;
uniform float strength;
varying float vAge;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * (1.0 - vAge) * strength;
  if (a < 0.003) discard;
  gl_FragColor = vec4(tint, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
