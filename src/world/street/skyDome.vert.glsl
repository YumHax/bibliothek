// skyDomeShader vertex shader (skyDomeShader.ts).
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Pinned to the far plane so nothing is ever clipped against it.
  gl_Position = p.xyww;
}
