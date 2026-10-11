// LampMist vertex shader (LampMist.ts): an upright quad per lamp facing the eye about its own axis.
varying vec2 vMist;
varying vec3 vMistColor;
varying float vMistNear;
void main() {
  vec3 head = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float foot = length(instanceMatrix[0].xyz);
  float height = length(instanceMatrix[1].xyz);
  vec3 toEye = cameraPosition - head;
  vec3 side = normalize(vec3(-toEye.z, 0.0, toEye.x) + vec3(1e-4, 0.0, 0.0));
  // v: 0 at the ground, 1 at the head (and on up a little for the glow); the quad narrows to the head.
  float v = position.y;
  float halfWidth = mix(foot, 0.6, clamp(v, 0.0, 1.0)) + max(v - 1.0, 0.0) * 2.4;
  vec3 world = head + vec3(0.0, (v - 1.0) * height, 0.0) + side * position.x * halfWidth;
  vMist = vec2(position.x, v);
  #ifdef USE_INSTANCING_COLOR
    vMistColor = instanceColor;
  #else
    vMistColor = vec3(1.0);
  #endif
  // Inside the cone (standing under the lamp) the quad cuts across the view: faded out.
  vMistNear = smoothstep(1.2, 3.5, length(toEye.xz));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
