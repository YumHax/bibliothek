// SunShaft mote fragment shader (SunShaft.ts).
uniform vec3 color;
uniform float strength;
uniform float moteStrength;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.1, 0.5, d)) * vFade;
  gl_FragColor = vec4(color * strength * moteStrength * 12.0, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
