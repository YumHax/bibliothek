/*
 * GLSL of the street's sky dome (`SkyDome`). Plain strings: no backtick may appear in them, not
 * even in a comment (the template literal would end there).
 */

export const SKY_DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Pinned to the far plane so nothing is ever clipped against it.
  gl_Position = p.xyww;
}
`;

export const SKY_DOME_FRAGMENT = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 glowColor;
uniform vec3 glowDir;
uniform float horizonGlow;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunVisible;
uniform vec3 moonDir;
uniform float moonVisibility;
uniform float starAlpha;
uniform float cloudCover;
uniform vec3 cloudTint;
uniform vec2 cloudDrift;
uniform float fog;
uniform vec3 fogColor;
uniform float cityGlow;
uniform float nightness;
uniform float wakefulness;
varying vec3 vDir;

float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

// The far city standing on the horizon all round: a row of roofs a few degrees high, a tower
// now and then; lit windows at night going out with the city's wakefulness.
float skylineHeight(float az) {
  float cell = floor(az * 38.0);
  float h = 0.035 + 0.05 * hash1(cell) + 0.02 * hash1(floor(az * 11.0) + 3.0);
  if (hash1(cell + 91.0) > 0.93) h += 0.07 + 0.08 * hash1(cell + 17.0);
  return h;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float up = max(h, 0.0);
  vec3 col = mix(horizon, zenith, pow(up, 0.5));

  // The sunset (or sunrise) glow along the horizon towards the sun.
  vec3 level = normalize(vec3(d.x, 0.0, d.z) + vec3(0.0, 1e-5, 0.0));
  float toward = max(dot(level, glowDir), 0.0);
  col += glowColor * horizonGlow * (0.25 + pow(toward, 4.0)) * exp(-up * 7.0) * 0.7;
  // The city's orange glow low down at night.
  col += vec3(0.32, 0.17, 0.07) * cityGlow * exp(-up * 6.0) * 0.35;

  // Stars, veiled by cloud.
  if (starAlpha > 0.0 && h > 0.0) {
    vec3 cell = floor(d * 260.0);
    float r = hash3(cell);
    float star = step(0.9965, r) * (0.4 + 0.6 * hash3(cell + 7.0));
    col += vec3(star * starAlpha * (1.0 - cloudCover) * smoothstep(0.02, 0.2, h));
  }

  // The sun: a disc and a halo; the moon: a pale disc.
  float sd = dot(d, sunDir);
  float clear = 1.0 - 0.85 * cloudCover;
  col += sunColor * (smoothstep(0.99955, 0.99975, sd) * 6.0 + pow(max(sd, 0.0), 180.0) * 0.6 + pow(max(sd, 0.0), 12.0) * 0.08) * sunVisible * clear;
  float md = dot(d, moonDir);
  col += vec3(0.8, 0.86, 1.0) * smoothstep(0.99965, 0.9998, md) * moonVisibility * (1.0 - 0.9 * cloudCover);

  // Clouds drifting over, thickening to a grey sheet as the cover closes in.
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.15) * 0.45 + cloudDrift * 6.0;
    float n = fbm(uv * 2.2);
    float threshold = mix(0.68, 0.22, cloudCover);
    float c = smoothstep(threshold, threshold + 0.22, n);
    c = max(c, cloudCover * cloudCover * 0.85);
    vec3 cloud = cloudTint * (0.62 + 0.38 * n);
    col = mix(col, cloud, c * smoothstep(0.0, 0.12, h) * 0.95);
  }

  // The far city.
  float az = atan(d.x, d.z);
  float roof = skylineHeight(az);
  if (h < roof) {
    vec3 far = mix(horizon, zenith, 0.25) * mix(0.62, 0.35, nightness);
    // Windows: a grid on the silhouette, lit at night where the city is still up.
    vec2 grid = vec2(az * 900.0, h * 900.0);
    vec2 cell = floor(grid);
    vec2 inCell = fract(grid);
    float window = step(0.35, inCell.x) * step(0.4, inCell.y) * step(h, roof - 0.004) * step(-0.08, h);
    float lit = step(hash3(vec3(cell, 3.0)), 0.3) * step(hash3(vec3(cell, 5.0)), wakefulness);
    far += vec3(1.0, 0.72, 0.42) * window * lit * nightness * 0.5;
    col = far;
  }

  // Haze and fog wash the low sky (and the far city) towards the air's colour.
  float haze = clamp(0.25 + fog, 0.0, 1.0) * exp(-up * mix(9.0, 2.0, fog));
  col = mix(col, fogColor, clamp(haze, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
