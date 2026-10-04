// StreetLamps fragment shader (StreetLamps.ts).
varying vec2 vUv;
varying vec3 vHalo;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float glow = exp(-d * d * 5.0) * (1.0 - smoothstep(0.75, 1.0, d));
  gl_FragColor = vec4(vHalo * glow, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
