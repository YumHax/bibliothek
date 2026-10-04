// Projector veil fragment shader (Projector.ts).
uniform float level;
uniform vec3 black;
uniform float hot;
uniform float aspect;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * vec2(1.0, aspect);
  float centre = 1.0 - smoothstep(0.0, 0.6, length(p));
  gl_FragColor = vec4((black + vec3(hot * centre * centre)) * level, 1.0);
  #include <colorspace_fragment>
}
