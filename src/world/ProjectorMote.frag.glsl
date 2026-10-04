// Projector mote fragment shader (Projector.ts).
uniform vec3 color;
uniform float strength;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.1, 0.5, d)) * vFade;
  gl_FragColor = vec4(color * strength * 14.0, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
