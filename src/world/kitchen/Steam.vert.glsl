// Steam vertex shader (Steam.ts).
uniform float viewScale;
uniform float startSize;
uniform float endSize;
attribute float life;
varying float vLife;
void main() {
  vLife = life;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  float size = mix(startSize, endSize, sqrt(max(life, 0.0)));
  gl_PointSize = life < 0.0 ? 0.0 : clamp(size * viewScale / -view.z, 1.0, 256.0);
}
