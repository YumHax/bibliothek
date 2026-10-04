// Precipitation snow fragment shader (Precipitation.ts).
uniform vec3 color;
uniform float opacity;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  gl_FragColor = vec4(color, opacity * (1.0 - d * 3.0));
}
