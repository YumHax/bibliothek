/*
 * GLSL of the `PostFx` passes. Template literals: a backtick inside a GLSL comment ends the string.
 *
 * Render scale: the targets are allocated at the full drawing-buffer size and, while the adaptive
 * resolution is lowered, only their lower-left part is drawn (the viewport). A pass reads its inputs
 * at st = vUv * uvScale (texture space: the share of the texture that holds the frame) and clamps
 * its taps to uvLimit (half a texel short of the frame's edge), so nothing stale is ever read.
 */
import { HOSKINS_HASH } from './glslNoise';

export const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Linear view depth (metres, positive) of the depth buffer at `uv`. */
const LINEAR_DEPTH = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;
float linearDepth(vec2 uv) {
  return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar);
}
`;

/** Per-pixel noise in [0, 1) (Jimenez's interleaved gradient): rotates a spiral of taps per pixel, so fixed patterns turn into fine noise. */
const INTERLEAVED_NOISE = /* glsl */ `
float interleavedNoise(vec2 px) {
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}
`;

/** Rec. 709 luminance weights. */
const LUMA = /* glsl */ `
float lumaOf(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
`;

/**
 * Ambient occlusion from the depth buffer alone, at half resolution. Normals come from the
 * neighbouring depths (the flatter side of each pixel, so edges do not smear); a spiral of taps,
 * rotated per pixel, counts how much of the hemisphere above the surface is closed off within
 * `radius`, fading with distance so a far background never darkens the foreground.
 */
export const AO_FRAGMENT = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 projection;
uniform mat4 projectionInverse;
uniform vec2 depthTexel;
uniform float aspect;
uniform float radius;
uniform float intensity;
uniform float cameraNear;
uniform float cameraFar;
uniform vec2 uvScale;
uniform vec2 uvLimit;
varying vec2 vUv;

/** View-space position of a screen point (uv 0..1 over the frame) at a depth-buffer value. */
vec3 viewPosition(vec2 screen, float depth) {
  vec4 clip = vec4(vec3(screen, depth) * 2.0 - 1.0, 1.0);
  vec4 view = projectionInverse * clip;
  return view.xyz / view.w;
}

/** The view position at texture coordinate st (clamped to the frame). */
vec3 viewAt(vec2 st) {
  st = min(st, uvLimit);
  return viewPosition(st / uvScale, texture2D(tDepth, st).x);
}

vec3 normalAt(vec2 st, vec3 p) {
  vec3 l = viewAt(st - vec2(depthTexel.x, 0.0));
  vec3 r = viewAt(st + vec2(depthTexel.x, 0.0));
  vec3 d = viewAt(st - vec2(0.0, depthTexel.y));
  vec3 u = viewAt(st + vec2(0.0, depthTexel.y));
  vec3 dx = abs(l.z - p.z) < abs(r.z - p.z) ? p - l : r - p;
  vec3 dy = abs(d.z - p.z) < abs(u.z - p.z) ? p - d : u - p;
  return normalize(cross(dx, dy));
}

${INTERLEAVED_NOISE}

void main() {
  vec2 st = vUv * uvScale;
  float depth = texture2D(tDepth, st).x;
  if (depth >= 1.0) {
    gl_FragColor = vec4(1.0);
    return;
  }
  vec3 p = viewPosition(vUv, depth);
  vec3 n = normalAt(st, p);
  // The radius in uv units (vertical), capped so the taps stay close for things right at the eye.
  float reach = min(radius * projection[1][1] * 0.5 / -p.z, 0.08);
  float spin = interleavedNoise(gl_FragCoord.xy) * 6.2831853;
  float occlusion = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES);
    float angle = float(i) * 2.3999632 + spin;
    vec2 offset = vec2(cos(angle) / aspect, sin(angle)) * t * reach;
    vec3 v = viewAt(st + offset * uvScale) - p;
    float vv = dot(v, v);
    float falloff = max(0.0, 1.0 - vv / (radius * radius));
    occlusion += max(0.0, dot(v, n) * inversesqrt(vv + 1e-5) - 0.12) * falloff;
  }
  float ao = clamp(1.0 - intensity * occlusion / float(SAMPLES), 0.0, 1.0);
  gl_FragColor = vec4(vec3(ao), 1.0);
}
`;

/** 4 x 4 blur of the half-resolution occlusion, weighted by depth so it does not bleed across silhouettes. */
export const AO_BLUR_FRAGMENT = /* glsl */ `
${LINEAR_DEPTH}
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
`;

/**
 * Copies the resolved scene into the working buffer, darkened by the ambient occlusion (high), so
 * the bloom that follows glows from the occluded colour and no glow is darkened after the fact.
 * The half-resolution occlusion is upsampled from its four nearest texels weighted by how close
 * their depth is to this pixel's (like `AO_BLUR_FRAGMENT`), so a silhouette gets no halo. While a
 * box is held up (`amount` > 0) the background beyond `focus` is gathered over a disc that grows
 * with depth: a spiral of taps rotated per pixel (no ghost copies), more of them for a wide blur
 * (photo mode). Taps closer than the pixel's own blur are weighted down so the sharp box in hand
 * never bleeds into the blur. The occlusion spares what glows (a lamp, a screen: light, not a
 * surface in a crease) and the window panes (`glassMask`: their view is far beyond the frame), and thins out with
 * the haze, as the fog hides the crease it would darken.
 */
export const DOF_FRAGMENT = /* glsl */ `
${LINEAR_DEPTH}
${INTERLEAVED_NOISE}
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
${LUMA}

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
`;

/**
 * The light meter's area average, in two quarter-size steps (full -> 1/4 -> 1/16, only when the
 * meter reads, every quarter second): each output texel is the mean of the 4 x 4 source texels
 * under it (four bilinear taps, each the mean of 2 x 2). The first step turns colour into
 * (log2 luminance x alpha, alpha), the second averages those, so the cut-out (alpha 0) carries no
 * weight and the average stays a log average.
 */
export const METER_DOWNSAMPLE_FRAGMENT = /* glsl */ `
${LUMA}
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
`;

/**
 * The light meter: each of the 16 x 16 texels averages a 4 x 4 grid of bilinear taps of the
 * sixteenth-size log map under it (`METER_DOWNSAMPLE_FRAGMENT`), so every pixel of the frame counts.
 * R = the log2 luminance mapped from [-14, 4] to [0, 1], G = how much of it is scene (the video
 * cut-out has alpha 0 and is not metered).
 */
export const LUMINANCE_FRAGMENT = /* glsl */ `
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
`;

/**
 * To the screen: the white balance (a von Kries matrix from the CPU, in linear light), exposure,
 * ACES filmic (three.js's fit, so the look matches the plain renderer), sRGB, then the grade in
 * display space (lift / gain, contrast S-curve, saturation), the vignette (as a black veil, so it darkens a video cut-out too) and grain (which
 * also dithers the gradients). Output stays premultiplied.
 *
 * `USE_FXAA`: the scene's MSAA resolves in linear HDR, before tone mapping, so an edge against a
 * lamp or the sky still steps. A light FXAA (the classic one: four diagonal neighbours, two or four
 * taps along the edge) runs on the HDR frame compressed by x / (1 + luma) (Karis), averaged there
 * and expanded back, so a bright edge blends like a tone-mapped one; the alpha is blended with the
 * colour, so the cut-out's border is smoothed and stays premultiplied.
 *
 * `sharpen` (`sharpened`, CAS): the frame is drawn below the screen's resolution (the pixel ratio's cap, the
 * adaptive resolution) and stretched back, and FXAA softens texture detail too: a light sharpen brings the lettering
 * and the facades' paint back, stronger the more the frame is stretched.
 */
export const OUTPUT_FRAGMENT = /* glsl */ `
${LUMA}
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

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

${HOSKINS_HASH}

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
  vec3 color = toSRGB(acesFilmic(max(whiteBalance * texel0.rgb, vec3(0.0))));

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
`;
