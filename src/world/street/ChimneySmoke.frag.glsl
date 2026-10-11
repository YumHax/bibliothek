// Chimney smoke fragment shader (ChimneySmoke.ts): a soft round puff, its edge breaking up.
uniform vec3 color;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float edge = 0.75 + 0.25 * sin(atan(c.y, c.x) * 5.0 + d * 6.0);
  gl_FragColor = vec4(color, vAlpha * pow(1.0 - d, 1.6) * edge);
}
