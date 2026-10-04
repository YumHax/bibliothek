// Steam fragment shader (Steam.ts).
uniform float opacity;
varying float vLife;
void main() {
  if (vLife < 0.0) discard;
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float soft = 1.0 - smoothstep(0.2, 1.0, d);
  // Fades in over its first tenth, out over the rest.
  float fade = smoothstep(0.0, 0.1, vLife) * (1.0 - vLife);
  gl_FragColor = vec4(vec3(0.82, 0.84, 0.86), soft * fade * opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
