// postFxShaders meter_downsample fragment shader (postFxShaders.ts): the #include <...> lines are chunks assemble() writes in.
// The light meter's area average, in two quarter-size steps (full -> 1/4 -> 1/16, only when the
// meter reads, every quarter second): each output texel is the mean of the 4 x 4 source texels
// under it (four bilinear taps, each the mean of 2 x 2). The first step turns colour into
// (log2 luminance x alpha, alpha), the second averages those, so the cut-out (alpha 0) carries no
// weight and the average stays a log average.
#include <luma>
uniform sampler2D tSource;
uniform vec2 sourceTexel;
uniform vec2 uvScale;
varying vec2 vUv;
vec2 tap(vec2 uv) {
  #if LOG_INPUT
  vec4 c = texture2D(tSource, uv);
  return vec2(log2(max(lumaOf(c.rgb), 1e-4)) * c.a, c.a);
  #else
  return texture2D(tSource, uv).rg;
  #endif
}
void main() {
  vec2 st = vUv * uvScale;
  vec2 sum = tap(st + vec2(-1.0, -1.0) * sourceTexel) + tap(st + vec2(1.0, -1.0) * sourceTexel)
    + tap(st + vec2(-1.0, 1.0) * sourceTexel) + tap(st + vec2(1.0, 1.0) * sourceTexel);
  gl_FragColor = vec4(sum * 0.25, 0.0, 1.0);
}
