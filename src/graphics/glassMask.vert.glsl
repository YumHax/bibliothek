// glassMask vertex shader (glassMask.ts).
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
