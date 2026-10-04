// postFxShaders ao_blur fragment shader (postFxShaders.ts): the #include <...> lines are chunks assemble() writes in.
#include <linear_depth>
uniform sampler2D tAO;
uniform vec2 aoTexel;
uniform vec2 uvScale;
uniform vec2 uvLimit;
varying vec2 vUv;
void main() {
  vec2 st = vUv * uvScale;
  float z = linearDepth(st);
  float sum = 0.0;
  float weight = 0.0;
  for (int x = 0; x < 4; x++) {
    for (int y = 0; y < 4; y++) {
      vec2 uv = min(st + (vec2(float(x), float(y)) - 1.5) * aoTexel, uvLimit);
      float w = exp(-abs(linearDepth(uv) - z) / (0.04 * z + 0.01));
      sum += texture2D(tAO, uv).r * w;
      weight += w;
    }
  }
  gl_FragColor = vec4(vec3(sum / max(weight, 1e-4)), 1.0);
}
