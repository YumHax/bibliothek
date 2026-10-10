// LampHalo fragment shader (LampHalo.ts): a soft round glow in the lamp's colour, added (the canvas alpha kept).
// `common` first: `dithering()` (DITHERING on `low`, `graphics/displayTone`) calls its `rand`.
#include <common>
#include <dithering_pars_fragment>
uniform vec3 glow;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float falloff = exp(-d * d * 5.0) * (1.0 - smoothstep(0.75, 1.0, d));
  gl_FragColor = vec4(glow * falloff, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
}
