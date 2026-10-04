// Spray vertex shader (Spray.ts): TS_LIFE, TS_GRAVITY and TS_ROAD_Y are #defines from the TypeScript constants.
attribute vec3 velocity;
attribute float birth;
uniform float time;
uniform float size;
uniform float pointScale;
varying float vAge;
void main() {
  float t = time - birth;
  vAge = t / TS_LIFE;
  vec3 p = position + velocity * t + vec3(0.0, 0.5 * TS_GRAVITY * t * t, 0.0);
  p.y = max(p.y, TS_ROAD_Y);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float alive = step(0.0, t) * step(vAge, 1.0);
  gl_PointSize = alive * pointScale * min(48.0, size * (0.6 + vAge * 1.6) * 500.0 / max(0.5, -mv.z));
}
