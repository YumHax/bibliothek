import { SKY_CHUNK } from '../city/skyGlsl';

/** Angular radii of the sun's and the moon's discs over the street (the window view's are drawn larger). */
export const DOME_SUN_RADIUS = 0.02;
export const DOME_MOON_RADIUS = 0.024;

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
uniform float sunLow;
uniform vec3 moonDir;
uniform vec3 moonShadowDir;
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
uniform sampler2D skyline;
uniform float skylineTop;
uniform vec3 towerColors[8];
uniform float beaconTime;
uniform float lightning;
uniform vec3 boltDir;
uniform float boltSeed;
uniform float boltReach;
varying vec3 vDir;
const vec3 FLASH = vec3(0.78, 0.84, 1.0);
${SKY_CHUNK}

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

// A lightning bolt under the clouds towards boltDir, as the window panes draw it (props/outdoors/shader):
// a jagged stroke from the cloud base down to the horizon with one fork, reseeded each strike; 0 away from it.
float boltAlong(vec3 d) {
  float el = asin(clamp(d.y, -1.0, 1.0));
  if (el < -0.03 || el > 0.42) return 0.0;
  float az = atan(d.x, d.z) - atan(boltDir.x, boltDir.z);
  az = mod(az + 3.14159265, 6.2831853) - 3.14159265;
  if (abs(az) > 0.16) return 0.0;
  float x = (noise2(vec2(el * 16.0, boltSeed)) - 0.5) * 0.06 + (noise2(vec2(el * 70.0, boltSeed + 3.1)) - 0.5) * 0.014;
  float w = 0.0018 + 0.0012 * el / 0.42;
  float core = 1.0 - smoothstep(w * 0.5, w, abs(az - x));
  float glow = (1.0 - smoothstep(0.0, w * 10.0, abs(az - x))) * 0.35;
  float side = fract(boltSeed * 7.13) < 0.5 ? -1.0 : 1.0;
  float fx0 = x + (0.3 - el) * 0.35 * side + (noise2(vec2(el * 50.0, boltSeed + 9.0)) - 0.5) * 0.01;
  float fork = step(0.14, el) * step(el, 0.3) * (1.0 - smoothstep(w * 0.3, w * 0.7, abs(az - fx0))) * 0.7;
  return core + glow + fork;
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

  // The sun: a disc and the window view's halo (city/skyGlsl); the moon: the same crescent and halo, smaller.
  float sunAngle = skyAngle(d, sunDir);
  float clear = 1.0 - 0.85 * cloudCover;
  col += sunColor * skySunHalo(sunAngle, sunLow) * sunVisible * clear;
  float sunDisc = 1.0 - smoothstep(${DOME_SUN_RADIUS.toFixed(4)} * 0.8, ${DOME_SUN_RADIUS.toFixed(4)} * 1.15, sunAngle);
  col += skySunDisc(sunColor, sunLow) * 6.0 * sunDisc * sunVisible * clear;
  col += vec3(0.55, 0.62, 0.85) * skyMoonHalo(d, moonDir) * moonVisibility * (1.0 - 0.8 * cloudCover);
  col = mix(col, vec3(0.8, 0.86, 1.0), skyMoonLit(d, moonDir, moonShadowDir, ${DOME_MOON_RADIUS.toFixed(4)}) * moonVisibility * (1.0 - 0.9 * cloudCover));

  // Clouds drifting over, thickening to a grey sheet as the cover closes in.
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.15) * 0.45 + cloudDrift * 6.0;
    float n = fbm(uv * 2.2);
    // Fair-weather heaps thinning out as the cover closes, over the window view's overcast sheet.
    float heaps = smoothstep(0.68, 0.9, n) * (1.0 - 0.5 * cloudCover);
    float c = max(heaps, skyCloudSheet(n, cloudCover) * 0.95);
    vec3 cloud = cloudTint * (0.62 + 0.38 * n);
    col = mix(col, cloud, c * smoothstep(0.0, 0.12, h) * 0.95);
  }

  // A strike: the flash inside the clouds, most towards it, and the bolt below them (the far city hides its foot).
  if (lightning > 0.01) {
    float towardBolt = 0.5 + 0.5 * dot(level, boltDir);
    col += FLASH * lightning * (0.18 + 0.7 * cloudCover * (0.4 + 0.6 * towardBolt)) * smoothstep(-0.02, 0.1, h);
    col += FLASH * 2.2 * boltAlong(d) * lightning * boltReach;
  }

  // The far city: the low roofs all round, and the towers (the window view's) where they stand.
  // The towers' tops blend between columns (linear R); which cladding and beacon, read at the column's centre.
  // Their edges are smoothed over a pixel (fwidth, worked out before any branch).
  float az = atan(d.x, d.z);
  float azU = az / 6.2831853 + 0.5;
  vec4 tower = texture2D(skyline, vec2(azU, 0.5));
  vec4 towerId = texture2D(skyline, vec2((floor(azU * SKYLINE_COLUMNS) + 0.5) / SKYLINE_COLUMNS, 0.5));
  float towerTop = tower.r * skylineTop;
  float roof = max(skylineHeight(az), towerTop);
  float px = max(fwidth(h), 1e-5);
  float cityCover = 1.0 - smoothstep(roof - px, roof + px, h);
  if (cityCover > 0.0) {
    vec3 far = mix(horizon, zenith, 0.25) * mix(0.62, 0.35, nightness);
    float towerCover = (1.0 - smoothstep(towerTop - px, towerTop + px, h)) * step(0.002, tower.r);
    if (towerCover > 0.0) {
      // A tower's cladding, lit by the sky and hazed by the distance.
      int style = int(towerId.g * 8.0);
      vec3 clad = towerColors[0];
      for (int i = 1; i < 8; i++) if (i == style) clad = towerColors[i];
      far = mix(far, mix(clad * mix(1.0, 0.3, nightness), far, 0.55), towerCover);
    }
    // Windows: a grid on the silhouette, lit at night where the city is still up.
    vec2 grid = vec2(az * 900.0, h * 900.0);
    vec2 cell = floor(grid);
    vec2 inCell = fract(grid);
    float window = step(0.35, inCell.x) * step(0.4, inCell.y) * step(h, roof - 0.004) * step(-0.08, h);
    float lit = step(hash3(vec3(cell, 3.0)), 0.3) * step(hash3(vec3(cell, 5.0)), wakefulness);
    far += vec3(1.0, 0.72, 0.42) * window * lit * nightness * 0.5;
    col = mix(col, far, cityCover);
  }
  // Aviation beacons on the tallest towers' tops (the window view's), blinking red once every two seconds at night.
  if (towerId.b > 0.5 && abs(h - towerTop) < 0.0022 && nightness > 0.05) {
    float blink = step(0.5, fract(beaconTime * 0.5 + towerId.a * 3.1));
    col = mix(col, vec3(2.2, 0.25, 0.18), blink * smoothstep(0.05, 0.4, nightness));
  }

  // Haze and fog wash the low sky (and the far city) towards the air's colour.
  float haze = clamp(0.25 + fog, 0.0, 1.0) * exp(-up * mix(9.0, 2.0, fog));
  col = mix(col, fogColor, clamp(haze, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
