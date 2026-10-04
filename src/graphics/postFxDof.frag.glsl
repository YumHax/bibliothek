// postFxShaders dof fragment shader (postFxShaders.ts): the #include <...> lines are chunks assemble() writes in.
// Copies the resolved scene into the working buffer, darkened by the ambient occlusion (high), so
// the bloom that follows glows from the occluded colour and no glow is darkened after the fact.
// The half-resolution occlusion is upsampled from its four nearest texels weighted by how close
// their depth is to this pixel's (like `AO_BLUR_FRAGMENT`), so a silhouette gets no halo. While a
// box is held up (`amount` > 0) the background beyond `focus` is gathered over a disc that grows
// with depth: a spiral of taps rotated per pixel (no ghost copies), more of them for a wide blur
// (photo mode). Taps closer than the pixel's own blur are weighted down so the sharp box in hand
// never bleeds into the blur. The occlusion spares what glows (a lamp, a screen: light, not a
// surface in a crease) and the window panes (`glassMask`: their view is far beyond the frame), and thins out with
// the haze, as the fog hides the crease it would darken.
#include <linear_depth>
#include <interleaved_noise>
uniform sampler2D tColor;
uniform vec2 texel;
uniform float focus;
uniform float amount;
uniform float maxRadius;
uniform vec2 uvScale;
uniform vec2 uvLimit;
#if USE_AO
uniform sampler2D tAO;
uniform sampler2D tGlass;
uniform vec2 aoTexel;
uniform float fogDensity;
#endif
varying vec2 vUv;
#include <luma>

float blurRadius(float z) {
  return clamp((z - focus * 1.5) / (focus * 5.0), 0.0, 1.0) * amount * maxRadius;
}

#if USE_AO
float occlusionAt(vec2 uv, float z) {
  vec2 grid = uv / aoTexel - 0.5;
  vec2 base = floor(grid);
  vec2 f = grid - base;
  float sum = 0.0;
  float weight = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 corner = vec2(float(i - (i / 2) * 2), float(i / 2));
    vec2 at = min((base + corner + 0.5) * aoTexel, uvLimit);
    vec2 bilinear = mix(1.0 - f, f, corner);
    float w = bilinear.x * bilinear.y * exp(-abs(linearDepth(at) - z) / (0.04 * z + 0.01)) + 1e-4;
    sum += texture2D(tAO, at).r * w;
    weight += w;
  }
  return sum / weight;
}
#endif

void main() {
  vec2 st = vUv * uvScale;
  vec4 centre = texture2D(tColor, st);
  #if USE_AO
  float z = linearDepth(st);
  float ao = occlusionAt(st, z);
  // Bright as a lamp: light, not a surface in a crease. Far in the haze: the fog covers the crease.
  ao = mix(ao, 1.0, smoothstep(1.0, 3.0, lumaOf(centre.rgb)));
  // A window pane: what it shows is far beyond the mullions standing proud of it (glassMask).
  ao = mix(ao, 1.0, texture2D(tGlass, st).r);
  float fogDepth = fogDensity * z;
  ao = mix(ao, 1.0, 1.0 - exp(-fogDepth * fogDepth));
  #else
  float ao = 1.0;
  if (amount <= 0.0) {
    gl_FragColor = centre;
    return;
  }
  float z = linearDepth(st);
  #endif
  float r = amount > 0.0 ? blurRadius(z) : 0.0;
  if (r < 0.5) {
    gl_FragColor = vec4(centre.rgb * ao, centre.a);
    return;
  }
  int taps = r > DOF_WIDE_RADIUS ? DOF_MAX_TAPS : DOF_TAPS;
  float count = float(taps);
  float spin = interleavedNoise(gl_FragCoord.xy) * 6.2831853;
  vec3 sum = centre.rgb;
  float weight = 1.0;
  for (int i = 0; i < DOF_MAX_TAPS; i++) {
    if (i >= taps) break;
    float t = sqrt((float(i) + 0.5) / count);
    float angle = float(i) * 2.3999632 + spin;
    vec2 uv = min(max(st + vec2(cos(angle), sin(angle)) * t * r * texel, vec2(0.0)), uvLimit);
    float w = clamp(blurRadius(linearDepth(uv)) / (t * r + 0.5), 0.0, 1.0);
    sum += texture2D(tColor, uv).rgb * w;
    weight += w;
  }
  gl_FragColor = vec4(sum / weight * ao, centre.a);
}
