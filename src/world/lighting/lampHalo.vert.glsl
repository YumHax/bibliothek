// LampHalo vertex shader (LampHalo.ts): a camera-facing quad round the halo's origin (the bulb), `size` metres across,
// drawn half its size nearer the eye so the lamp's own shade or globe does not cut it in two.
uniform float size;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xyz += normalize(-mv.xyz) * size * 0.5;
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
}
