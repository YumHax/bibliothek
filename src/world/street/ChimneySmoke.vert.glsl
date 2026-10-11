// Chimney smoke vertex shader (ChimneySmoke.ts): each point a puff rising from its chimney's top, drifting downwind,
// growing and fading over its life.
attribute vec2 puff;
uniform float time;
uniform float amount;
uniform vec2 wind;
uniform float pointScale;
uniform float life;
varying float vAlpha;
void main() {
  float t = fract(time / life + puff.x);
  vec3 p = position;
  p.y += t * 3.6 + t * t * 1.2;
  p.xz += wind * (t * 4.5 + t * t * 3.0);
  p.x += sin(time * 0.6 + puff.y * 17.0 + t * 5.0) * 0.25 * t;
  p.z += cos(time * 0.5 + puff.y * 11.0 + t * 4.0) * 0.25 * t;
  vec4 view = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  float size = 0.5 + t * 2.2 + puff.y * 0.4;
  gl_PointSize = size * pointScale * 1.6 / max(-view.z, 0.5);
  vAlpha = amount * smoothstep(0.0, 0.08, t) * (1.0 - t) * 0.42;
}
