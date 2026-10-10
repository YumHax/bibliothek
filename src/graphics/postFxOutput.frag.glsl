// postFxShaders output fragment shader (postFxShaders.ts): the #include <...> lines are chunks assemble() writes in.
// To the screen: the white balance (a von Kries matrix from the CPU, in linear light), exposure,
// ACES filmic (three.js's fit, so the look matches the plain renderer; mixed towards PBR Neutral by the look's `neutral`), sRGB, then the grade in
// display space (lift / gain, contrast S-curve, saturation), the vignette (as a black veil, so it darkens a video cut-out too) and grain (which
// also dithers the gradients). Output stays premultiplied.
//
// `USE_FXAA`: the scene's MSAA resolves in linear HDR, before tone mapping, so an edge against a
// lamp or the sky still steps. A light FXAA (the classic one: four diagonal neighbours, two or four
// taps along the edge) runs on the HDR frame compressed by x / (1 + luma) (Karis), averaged there
// and expanded back, so a bright edge blends like a tone-mapped one; the alpha is blended with the
// colour, so the cut-out's border is smoothed and stays premultiplied.
//
// `sharpen` (`sharpened`, CAS): the frame is drawn below the screen's resolution (the pixel ratio's cap, the
// adaptive resolution) and stretched back, and FXAA softens texture detail too: a light sharpen brings the lettering
// and the facades' paint back, stronger the more the frame is stretched.
#include <luma>
uniform sampler2D tColor;
uniform vec2 texel;
uniform float exposure;
uniform float aspect;
uniform float time;
uniform float contrast;
uniform float saturation;
uniform mat3 whiteBalance;
uniform vec2 uvScale;
uniform vec2 uvLimit;
uniform vec3 shadows;
uniform vec3 highlights;
uniform float vignette;
uniform float grain;
uniform float sharpen;
// 0 ACES .. 1 Khronos PBR Neutral (`Look.neutralTone`): Neutral keeps saturated print colours where ACES whitens them.
uniform float neutral;
varying vec2 vUv;

vec3 rrtAndOdtFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 acesFilmic(vec3 color) {
  const mat3 inputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= exposure / 0.6;
  color = inputMat * color;
  color = rrtAndOdtFit(color);
  color = outputMat * color;
  return clamp(color, 0.0, 1.0);
}

/**
 * Khronos PBR Neutral: linear below the compression start (so a printed colour stays itself), the
 * peak rolled off above it and desaturated only as it nears white. Its input is scaled by 1.4 so a
 * mid grey lands where ACES (three's fit, exposure / 0.6) puts it: the looks keep their brightness.
 */
vec3 pbrNeutral(vec3 color) {
  const float startCompression = 0.76;
  const float desaturation = 0.15;
  color *= exposure * 1.4;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return clamp(color, 0.0, 1.0);
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return clamp(mix(color, vec3(newPeak), g), 0.0, 1.0);
}

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

#include <hoskins_hash>

/** The HDR texel at uv, exposed and compressed into [0, 1) (premultiplied alpha kept). */
vec4 compressed(vec2 uv) {
  vec4 c = texture2D(tColor, min(uv, uvLimit));
  vec3 x = c.rgb * exposure;
  return vec4(x / (1.0 + lumaOf(x)), c.a);
}

/** Back from compressed to the HDR value (unexposed). */
vec3 expanded(vec3 t) {
  return t / max(1.0 - lumaOf(t), 1e-3) / exposure;
}

/**
 * Contrast-adaptive sharpening (after AMD's CAS): the cross of four neighbours, compressed like the FXAA's, pushed
 * away from the centre by how much headroom the local contrast leaves (a soft texture sharpens, an edge already at
 * full contrast does not ring). sharpen 0..1. Not across the video cut-out's border (it would ring the hole).
 */
vec4 sharpened(vec4 centre, vec2 st) {
  vec3 x = centre.rgb * exposure;
  vec3 m = x / (1.0 + lumaOf(x));
  vec4 a = compressed(st + vec2(0.0, -texel.y));
  vec4 b = compressed(st + vec2(-texel.x, 0.0));
  vec4 d = compressed(st + vec2(texel.x, 0.0));
  vec4 e = compressed(st + vec2(0.0, texel.y));
  if (min(min(a.a, b.a), min(d.a, e.a)) < 0.99 || centre.a < 0.99) return centre;
  vec3 mn = min(m, min(min(a.rgb, b.rgb), min(d.rgb, e.rgb)));
  vec3 mx = max(m, max(max(a.rgb, b.rgb), max(d.rgb, e.rgb)));
  vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
  vec3 w = -amp * 0.2 * sharpen;
  vec3 t = clamp((m + w * (a.rgb + b.rgb + d.rgb + e.rgb)) / (1.0 + 4.0 * w), 0.0, 0.999);
  return vec4(expanded(t), centre.a);
}

#if USE_FXAA

vec4 antialiased(vec4 centre, vec2 st) {
  vec3 m = centre.rgb * exposure;
  float lM = sqrt(lumaOf(m / (1.0 + lumaOf(m))));
  vec4 nw = compressed(st + vec2(-1.0, -1.0) * texel);
  vec4 ne = compressed(st + vec2(1.0, -1.0) * texel);
  vec4 sw = compressed(st + vec2(-1.0, 1.0) * texel);
  vec4 se = compressed(st + vec2(1.0, 1.0) * texel);
  float lNW = sqrt(lumaOf(nw.rgb));
  float lNE = sqrt(lumaOf(ne.rgb));
  float lSW = sqrt(lumaOf(sw.rgb));
  float lSE = sqrt(lumaOf(se.rgb));
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  // Flat, or an edge too faint to step: the pixel as it is (and the alpha's edges too).
  float alphaRange = max(max(nw.a, ne.a), max(sw.a, se.a)) - min(min(nw.a, ne.a), min(sw.a, se.a));
  if (lMax - lMin < max(0.05, lMax * 0.125) && alphaRange < 0.5) return centre;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcpMin, -8.0, 8.0) * texel;
  vec4 a = 0.5 * (compressed(st + dir * (1.0 / 3.0 - 0.5)) + compressed(st + dir * (2.0 / 3.0 - 0.5)));
  vec4 b = 0.5 * a + 0.25 * (compressed(st - dir * 0.5) + compressed(st + dir * 0.5));
  float lB = sqrt(lumaOf(b.rgb));
  vec4 t = (lB < lMin || lB > lMax) ? a : b;
  return vec4(expanded(t.rgb), t.a);
}
#endif

void main() {
  vec2 st = vUv * uvScale;
  vec4 texel0 = texture2D(tColor, st);
  #if USE_FXAA
  texel0 = antialiased(texel0, st);
  #endif
  if (sharpen > 0.001) texel0 = sharpened(texel0, st);
  // Premultiplied: the balance scales the colour only, a cut-out stays a cut-out.
  vec3 balanced = max(whiteBalance * texel0.rgb, vec3(0.0));
  vec3 mapped = acesFilmic(balanced);
  if (neutral > 0.001) mapped = mix(mapped, pbrNeutral(balanced), neutral);
  vec3 color = toSRGB(mapped);

  color = color * highlights + shadows * (1.0 - color);
  vec3 curve = color * color * (3.0 - 2.0 * color);
  color = mix(color, curve, (contrast - 1.0) * 2.0);
  float luma = lumaOf(color);
  color = clamp(mix(vec3(luma), color, saturation), 0.0, 1.0);

  vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
  float corner = length(q) / length(vec2(aspect, 1.0) * 0.5);
  float veil = 1.0 - vignette * smoothstep(0.35, 1.05, corner);
  float alpha = 1.0 - (1.0 - texel0.a) * veil;
  color *= veil;

  float n = hoskinsHash(gl_FragCoord.xy + fract(time * 7.13) * 431.0) - 0.5;
  float midtones = 1.0 - abs(luma - 0.5) * 1.2;
  color += n * (grain * midtones + 1.0 / 255.0) * alpha;

  gl_FragColor = vec4(clamp(color, 0.0, alpha), alpha);
}
