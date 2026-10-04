// Precipitation rain fragment shader (Precipitation.ts).
uniform vec3 color;
uniform float opacity;
varying float vFade;
void main() {
  gl_FragColor = vec4(color, opacity * vFade);
}
