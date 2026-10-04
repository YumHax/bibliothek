// WetGround vertex shader (WetGround.ts).
uniform mat4 textureMatrix;
varying vec4 vUvProj;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUvProj = textureMatrix * vec4(position, 1.0);
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
