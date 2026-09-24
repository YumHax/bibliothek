/*
 * GLSL of the `PostFx` passes. Template literals: a backtick inside a GLSL comment ends the string.
 */

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
varying vec2 vUv;

vec3 viewPosition(vec2 uv, float depth) {
  vec4 clip = vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
  vec4 view = projectionInverse * clip;
  return view.xyz / view.w;
}

vec3 viewAt(vec2 uv) {
  return viewPosition(uv, texture2D(tDepth, uv).x);
}

vec3 normalAt(vec2 uv, vec3 p) {
  vec3 l = viewAt(uv - vec2(depthTexel.x, 0.0));
  vec3 r = viewAt(uv + vec2(depthTexel.x, 0.0));
  vec3 d = viewAt(uv - vec2(0.0, depthTexel.y));
  vec3 u = viewAt(uv + vec2(0.0, depthTexel.y));
  vec3 dx = abs(l.z - p.z) < abs(r.z - p.z) ? p - l : r - p;
  vec3 dy = abs(d.z - p.z) < abs(u.z - p.z) ? p - d : u - p;
  return normalize(cross(dx, dy));
}

float interleavedNoise(vec2 px) {
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}

void main() {
  float depth = texture2D(tDepth, vUv).x;
  if (depth >= 1.0) {
    gl_FragColor = vec4(1.0);
    return;
  }
  vec3 p = viewPosition(vUv, depth);
  vec3 n = normalAt(vUv, p);
  // The radius in uv units (vertical), capped so the taps stay close for things right at the eye.
  float reach = min(radius * projection[1][1] * 0.5 / -p.z, 0.08);
  float spin = interleavedNoise(gl_FragCoord.xy) * 6.2831853;
  float occlusion = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES);
    float angle = float(i) * 2.3999632 + spin;
    vec2 offset = vec2(cos(angle) / aspect, sin(angle)) * t * reach;
    vec3 v = viewAt(vUv + offset) - p;
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
varying vec2 vUv;
void main() {
  float z = linearDepth(vUv);
  float sum = 0.0;
  float weight = 0.0;
  for (int x = 0; x < 4; x++) {
    for (int y = 0; y < 4; y++) {
      vec2 uv = vUv + (vec2(float(x), float(y)) - 1.5) * aoTexel;
      float w = exp(-abs(linearDepth(uv) - z) / (0.04 * z + 0.01));
      sum += texture2D(tAO, uv).r * w;
      weight += w;
    }
  }
  gl_FragColor = vec4(vec3(sum / max(weight, 1e-4)), 1.0);
}
`;

/**
 * Copies the resolved scene into the working buffer; while a box is held up (`amount` > 0) the
 * background beyond `focus` is gathered over a disc that grows with depth. Taps closer than the
 * pixel's own blur are weighted down so the sharp box in hand never bleeds into the blur.
 */
export const DOF_FRAGMENT = /* glsl */ `
${LINEAR_DEPTH}
uniform sampler2D tColor;
uniform vec2 texel;
uniform float focus;
uniform float amount;
uniform float maxRadius;
varying vec2 vUv;

float blurRadius(float z) {
  return clamp((z - focus * 1.5) / (focus * 5.0), 0.0, 1.0) * amount * maxRadius;
}

void main() {
  vec4 centre = texture2D(tColor, vUv);
  if (amount <= 0.0) {
    gl_FragColor = centre;
    return;
  }
  float r = blurRadius(linearDepth(vUv));
  if (r < 0.5) {
    gl_FragColor = centre;
    return;
  }
  vec3 sum = centre.rgb;
  float weight = 1.0;
  for (int i = 0; i < DOF_TAPS; i++) {
    float t = sqrt((float(i) + 0.5) / float(DOF_TAPS));
    float angle = float(i) * 2.3999632;
    vec2 uv = vUv + vec2(cos(angle), sin(angle)) * t * r * texel;
    float w = clamp(blurRadius(linearDepth(uv)) / (t * r + 0.5), 0.0, 1.0);
    sum += texture2D(tColor, uv).rgb * w;
    weight += w;
  }
  gl_FragColor = vec4(sum / weight, centre.a);
}
`;

/**
 * The light meter: each of the 16 x 16 texels averages the log luminance of a 4 x 4 grid of the
 * frame under it. R = log2(luminance) mapped from [-14, 4] to [0, 1], G = how much of it is
 * scene (the video cut-out has alpha 0 and is not metered).
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
      vec4 c = texture2D(tColor, origin + (vec2(float(x), float(y)) + 0.5) * cell / 4.0);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      sum += log2(max(l, 1e-4)) * c.a;
      weight += c.a;
    }
  }
  float average = weight > 0.0 ? sum / weight : 0.0;
  gl_FragColor = vec4(clamp((average + 14.0) / 18.0, 0.0, 1.0), weight / 16.0, 0.0, 1.0);
}
`;

/**
 * To the screen: ambient occlusion, exposure, ACES filmic (three.js's fit, so the look matches
 * the plain renderer), sRGB, then the grade in display space (white balance, lift / gain,
 * contrast S-curve, saturation), the vignette (as a black veil, so it darkens a video cut-out
 * too) and grain (which also dithers the gradients). Output stays premultiplied.
 */
export const OUTPUT_FRAGMENT = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tAO;
uniform float exposure;
uniform float aspect;
uniform float time;
uniform float contrast;
uniform float saturation;
uniform float temperature;
uniform vec3 shadows;
uniform vec3 highlights;
uniform float vignette;
uniform float grain;
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

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec4 texel = texture2D(tColor, vUv);
  vec3 color = texel.rgb;
  #if USE_AO
  color *= texture2D(tAO, vUv).r;
  #endif
  color = toSRGB(acesFilmic(color));

  color *= vec3(1.0 + 0.08 * temperature, 1.0 + 0.01 * temperature, 1.0 - 0.1 * temperature);
  color = color * highlights + shadows * (1.0 - color);
  vec3 curve = color * color * (3.0 - 2.0 * color);
  color = mix(color, curve, (contrast - 1.0) * 2.0);
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = clamp(mix(vec3(luma), color, saturation), 0.0, 1.0);

  vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
  float corner = length(q) / length(vec2(aspect, 1.0) * 0.5);
  float veil = 1.0 - vignette * smoothstep(0.35, 1.05, corner);
  float alpha = 1.0 - (1.0 - texel.a) * veil;
  color *= veil;

  float n = hash(gl_FragCoord.xy + fract(time * 7.13) * 431.0) - 0.5;
  float midtones = 1.0 - abs(luma - 0.5) * 1.2;
  color += n * (grain * midtones + 1.0 / 255.0) * alpha;

  gl_FragColor = vec4(clamp(color, 0.0, alpha), alpha);
}
`;
