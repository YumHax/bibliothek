// StreetLamps vertex shader (StreetLamps.ts).
varying vec2 vUv;
varying vec3 vHalo;
void main() {
  vUv = uv;
  #ifdef USE_INSTANCING_COLOR
    vHalo = instanceColor;
  #else
    vHalo = vec3(1.0);
  #endif
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * length(instanceMatrix[0].xyz);
  gl_Position = projectionMatrix * mv;
}
