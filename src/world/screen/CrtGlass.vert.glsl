// CrtGlass vertex shader (CrtGlass.ts).
varying vec2 vUv;
// Where the eye is, seen from the glass (object space, x right, y up): the lamp's glint slides the other way.
varying vec2 vEye;
void main() {
  vUv = uv;
  vec3 eye = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vEye = eye.xy / max(length(eye), 0.001);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
