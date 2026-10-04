// postFxShaders luminance fragment shader (postFxShaders.ts).
// The light meter: each of the 16 x 16 texels averages a 4 x 4 grid of bilinear taps of the
// sixteenth-size log map under it (`METER_DOWNSAMPLE_FRAGMENT`), so every pixel of the frame counts.
// R = the log2 luminance mapped from [-14, 4] to [0, 1], G = how much of it is scene (the video
// cut-out has alpha 0 and is not metered).
uniform sampler2D tColor;
uniform float cell;
varying vec2 vUv;
void main() {
  vec2 origin = floor(vUv / cell) * cell;
  float sum = 0.0;
  float weight = 0.0;
  for (int x = 0; x < 4; x++) {
    for (int y = 0; y < 4; y++) {
      vec2 v = texture2D(tColor, origin + (vec2(float(x), float(y)) + 0.5) * cell / 4.0).rg;
      sum += v.r;
      weight += v.g;
    }
  }
  float average = weight > 0.0 ? sum / weight : 0.0;
  gl_FragColor = vec4(clamp((average + 14.0) / 18.0, 0.0, 1.0), weight / 16.0, 0.0, 1.0);
}
