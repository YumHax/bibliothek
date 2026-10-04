// Precipitation splash fragment shader (Precipitation.ts).
uniform vec3 color;
uniform float opacity;
varying float vAge;
varying float vSquash;
void main() {
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  c.y /= vSquash;
  float r = length(c);
  float ring = 1.0 - smoothstep(0.0, 0.12, abs(r - (0.2 + 0.75 * vAge)));
  if (ring <= 0.0 || r > 1.0) discard;
  gl_FragColor = vec4(color, opacity * ring * (1.0 - vAge));
}
