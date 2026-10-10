// skyDomeShader fragment shader (skyDomeShader.ts): TS_DOME_MOON_RADIUS, TS_DOME_SUN_RADIUS are #defines from TypeScript; the #include <...> lines are chunks assemble() writes in.
// `common` first: `dithering()` (DITHERING on `low`, `graphics/displayTone`) calls its `rand`.
#include <common>
#include <dithering_pars_fragment>
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
uniform sampler2D blocks;
uniform vec3 blockEye;
uniform vec3 blockWalls[6];
varying vec3 vDir;
const vec3 FLASH = vec3(0.78, 0.84, 1.0);
#include <sky_chunk>

#include <sine_hash>
float hash1(float n) { return sineHash(n * 127.1); }
#include <valueNoise2_noise2>
#include <fbm2_fbm>

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
  // Half the blocks under a pitched zinc roof (a ridge across the cell), and chimney stacks along the tops.
  h += 0.012 * (1.0 - abs(fract(az * 38.0) * 2.0 - 1.0)) * step(0.5, hash1(cell + 33.0));
  float stack = floor(az * 420.0);
  if (hash1(stack + 5.0) > 0.84) h += 0.004 + 0.006 * hash1(stack + 8.0);
  return h;
}

void main() {
  vec3 d = normalize(vDir);
  // The angle one pixel spans (radians), before any branch: the far windows fade to their average lit share
  // once they get under two pixels, rather than shimmer as the player turns.
  float pxAngle = max(length(fwidth(d)), 1e-6);
  float h = d.y;
  float up = max(h, 0.0);
  vec3 col = mix(horizon, zenith, pow(up, 0.5));

  // The sunset (or sunrise) glow along the horizon towards the sun.
  vec3 level = normalize(vec3(d.x, 0.0, d.z) + vec3(0.0, 1e-5, 0.0));
  float toward = max(dot(level, glowDir), 0.0);
  col += glowColor * horizonGlow * (0.25 + pow(toward, 4.0)) * exp(-up * 7.0) * 0.7;
  // The city's orange glow low down at night.
  col += vec3(0.32, 0.17, 0.07) * cityGlow * exp(-up * 6.0) * 0.35;

  // Stars, veiled by cloud: a round point somewhere in one cell of 260 in a hundred (never wider than about a
  // pixel and a half, never thinner than one, so they neither show as squares nor shimmer), white, blue or
  // warm, twinkling a little; the city's glow low down drowns the faint ones.
  vec3 starP = d * 260.0;
  float starPx = length(fwidth(starP));
  if (starAlpha > 0.0 && h > 0.0) {
    vec3 cell = floor(starP);
    float r = sineHash(cell);
    if (r > 0.9965) {
      vec3 centre = cell + 0.25 + 0.5 * vec3(sineHash(cell + 1.0), sineHash(cell + 2.0), sineHash(cell + 3.0));
      float dist = length(starP - centre);
      float sigma = max(0.16, starPx * 0.45);
      float point = exp(-dist * dist / (2.0 * sigma * sigma)) * min(1.0, (0.16 * 0.16) / (sigma * sigma) * 1.6);
      float mag = 0.4 + 0.6 * sineHash(cell + 7.0);
      float twinkle = 0.78 + 0.22 * sin(beaconTime * (1.7 + 2.5 * sineHash(cell + 11.0)) + r * 6283.0);
      float temp = sineHash(cell + 13.0);
      vec3 tint = temp < 0.25 ? vec3(0.78, 0.86, 1.0) : (temp > 0.85 ? vec3(1.0, 0.86, 0.7) : vec3(1.0));
      float glowVeil = (1.0 - smoothstep(0.03, 0.35, h)) * (0.5 + 0.5 * cityGlow);
      float seen = smoothstep(0.0, 0.3, mag - glowVeil * 0.9);
      col += tint * point * mag * twinkle * seen * starAlpha * (1.0 - cloudCover) * 1.4;
    }
  }

  // The sun: a disc and the window view's halo (city/skyGlsl); the moon: the same crescent and halo, smaller.
  float sunAngle = skyAngle(d, sunDir);
  float clear = 1.0 - 0.85 * cloudCover;
  col += sunColor * skySunHalo(sunAngle, sunLow) * sunVisible * clear;
  float sunDisc = 1.0 - smoothstep(TS_DOME_SUN_RADIUS * 0.8, TS_DOME_SUN_RADIUS * 1.15, sunAngle);
  col += skySunDisc(sunColor, sunLow) * 6.0 * sunDisc * sunVisible * clear;
  col += vec3(0.55, 0.62, 0.85) * skyMoonHalo(d, moonDir) * moonVisibility * (1.0 - 0.8 * cloudCover);
  col = mix(col, vec3(0.8, 0.86, 1.0), skyMoonLit(d, moonDir, moonShadowDir, TS_DOME_MOON_RADIUS) * moonVisibility * (1.0 - 0.9 * cloudCover));

  // Clouds drifting over, thickening to a grey sheet as the cover closes in.
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.15) * 0.45 + cloudDrift * 6.0;
    float n = fbm(uv * 2.2);
    // Fair-weather heaps thinning out as the cover closes, over the window view's overcast sheet.
    float heaps = smoothstep(0.68, 0.9, n) * (1.0 - 0.5 * cloudCover);
    float c = max(heaps, skyCloudSheet(n, cloudCover) * 0.95);
    // Lit as the panes light theirs (city/skyGlsl): dark bases, a silver lining, the sunset's glow underneath.
    vec3 cloud = skyCloudLight(cloudTint * (0.66 + 0.34 * n), d, n, sunDir, sunColor, sunVisible * (1.0 - 0.7 * cloudCover), glowColor * horizonGlow, glowDir);
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
      // Its two faces in view (SkylineSilhouette's B): each turned 50 degrees off the line of sight, the one
      // facing the sun lit, the other in shade, with a glint of the sun off the glass on the lit one.
      float side = (towerId.b > 0.1 && towerId.b < 0.5) ? 1.0 : -1.0;
      float ca = cos(0.87);
      float sa = sin(0.87) * side;
      vec2 back = -level.xz;
      vec2 faceN = vec2(back.x * ca - back.y * sa, back.x * sa + back.y * ca);
      vec2 sunFlat = normalize(sunDir.xz + vec2(1e-5));
      float sunOn = max(dot(faceN, sunFlat), 0.0) * sunVisible * (1.0 - 0.85 * cloudCover) * smoothstep(-0.05, 0.1, sunDir.y);
      float glint = pow(sunOn, 12.0) * 0.6;
      vec3 faceLit = clad * (0.72 + 0.55 * sunOn) + sunColor * glint;
      far = mix(far, mix(faceLit * mix(1.0, 0.3, nightness), far, 0.55), towerCover);
    }
    // Windows: a grid on the silhouette, lit at night where the city is still up.
    vec2 grid = vec2(az * 900.0, h * 900.0);
    vec2 cell = floor(grid);
    vec2 inCell = fract(grid);
    float cellPx = pxAngle * 900.0;
    float edge = min(cellPx * 0.5, 0.2);
    float inside = step(h, roof - 0.004) * step(-0.08, h);
    float window = smoothstep(0.35 - edge, 0.35 + edge, inCell.x) * smoothstep(0.4 - edge, 0.4 + edge, inCell.y);
    float lit = step(sineHash(vec3(cell, 3.0)), 0.3) * step(sineHash(vec3(cell, 5.0)), wakefulness);
    // Under two pixels a cell, its average: 0.39 of it glass, 0.3 of the glass lit while the city is up.
    float shown = mix(window * lit, 0.39 * 0.3 * wakefulness, smoothstep(0.35, 0.6, cellPx));
    far += vec3(1.0, 0.72, 0.42) * shown * inside * nightness * 0.5;
    col = mix(col, far, cityCover);
  }
  // Aviation beacons on the tallest towers' tops (the window view's), blinking red once every two seconds at night.
  if (towerId.b > 0.5 && abs(h - towerTop) < 0.0022 && nightness > 0.05) {
    float blink = step(0.5, fract(beaconTime * 0.5 + towerId.a * 3.1));
    col = mix(col, vec3(2.2, 0.25, 0.18), blink * smoothstep(0.05, 0.4, nightness));
  }

  // The neighbourhood's blocks past the street's own rows (city/skyline BACKDROP_BLOCKS), in front of the far city:
  // the nearest one the ray from the eye meets below its roof, its face lit by the sun and sky, its windows lit at night.
  if (h < 0.45) {
    float nearest = 1e6;
    vec3 blockCol = vec3(0.0);
    for (int i = 0; i < BLOCKS; i++) {
      vec4 rect = texelFetch(blocks, ivec2(i, 0), 0);
      vec4 info = texelFetch(blocks, ivec2(i, 1), 0);
      vec2 inv = 1.0 / vec2(abs(d.x) > 1e-5 ? d.x : 1e-5, abs(d.z) > 1e-5 ? d.z : 1e-5);
      vec2 t0 = (rect.xy - blockEye.xz) * inv;
      vec2 t1 = (rect.zw - blockEye.xz) * inv;
      vec2 tNear = min(t0, t1);
      vec2 tFar = max(t0, t1);
      float tIn = max(tNear.x, tNear.y);
      float tOut = min(tFar.x, tFar.y);
      if (tIn <= 0.0 || tIn > tOut || tIn >= nearest) continue;
      float y = blockEye.y + tIn * d.y;
      if (y > info.x || y < -1.0) continue;
      nearest = tIn;
      bool xFace = tNear.x > tNear.y;
      vec3 n = xFace ? vec3(-sign(d.x), 0.0, 0.0) : vec3(0.0, 0.0, -sign(d.z));
      vec3 wall = blockWalls[int(info.y)];
      float sun = max(dot(n, sunDir), 0.0) * sunVisible * (1.0 - 0.85 * cloudCover);
      vec3 lit = wall * (mix(horizon, zenith, 0.4) * 0.75 + sunColor * sun * 0.55) * mix(1.0, 0.25, nightness);
      // Windows: storeys of 3.1 m over a ground floor, bays of 2.8 m along the face.
      vec2 hit = blockEye.xz + d.xz * tIn;
      vec2 cellUv = vec2((xFace ? hit.y : hit.x) / 2.8, (y - 1.0) / 3.1);
      vec2 cell = floor(cellUv);
      vec2 inCell = fract(cellUv);
      float pane = step(0.3, inCell.x) * step(inCell.x, 0.75) * step(0.3, inCell.y) * step(inCell.y, 0.8) * step(1.0, cell.y) * step(y, info.x - 1.2);
      float on = step(sineHash(vec3(cell, info.z)), 0.32) * step(sineHash(vec3(cell, info.z + 7.0)), wakefulness);
      // A bay seen under about two pixels: its average (0.45 x 0.5 of it glass, 0.32 of that lit), not a shimmer.
      float tiny = smoothstep(0.35, 0.6, pxAngle * tIn / 2.8);
      float glass = mix(pane, 0.225 * step(1.0, cell.y) * step(y, info.x - 1.2), tiny);
      float glassLit = mix(pane * on, 0.225 * 0.32 * wakefulness * step(1.0, cell.y) * step(y, info.x - 1.2), tiny);
      lit = mix(lit, lit * 0.55 + vec3(0.03, 0.035, 0.045), glass * (1.0 - nightness));
      lit += vec3(1.0, 0.72, 0.42) * glassLit * nightness * 0.6;
      // Hazed by the distance, more in fog and rain.
      blockCol = mix(lit, fogColor, 1.0 - exp(-tIn * (0.0035 + fog * 0.03)));
    }
    if (nearest < 1e5) col = blockCol;
  }

  // Haze and fog wash the low sky (and the far city) towards the air's colour.
  float haze = clamp(0.25 + fog, 0.0, 1.0) * exp(-up * mix(9.0, 2.0, fog));
  col = mix(col, fogColor, clamp(haze, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // `low` (no grain pass): the long gradients dither against banding (`graphics/displayTone`).
  #include <dithering_fragment>
}
