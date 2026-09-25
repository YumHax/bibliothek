import { DEPTH_SCALE, ELEVATION_MAX, ELEVATION_MIN, EYE_HEIGHT, SCENE_HEIGHT, SCENE_WIDTH } from './Sheet';
import { SPRITE_COUNT } from './Life';

/** Angular radius of the sun disc and of the moon, in radians. */
export const SUN_RADIUS = 0.05;
export const MOON_RADIUS = 0.045;
/** Angular radii of the sunrise / sunset glow along the horizon (wide) and up the sky (short). */
const GLOW_RADIUS_X = 2.3;
const GLOW_RADIUS_Y = 0.7;
/**
 * Fixed-point steps that find where the eye ray really meets the painted scenery (see `main()`):
 * the panorama was painted from one eye, and a camera a few metres from it sees it shifted by
 * parallax, the near pavement most. Each step is one depth lookup.
 */
export const PARALLAX_STEPS = 6;

export const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

/**
 * The pane shader (also on the balcony's surround). Along the eye ray through the pane: the sky at infinity (gradient, sunset
 * glow, stars, drifting clouds and the overcast, the city's glow at night, the sun and the moon),
 * then the scenery where the ray leaves the sphere around the room. The scenery textures hold the
 * day colours, the lights that come on at night (and the curfew each goes out at, against the
 * city's `wakefulness`), how much each surface mirrors the sky, how far away it is, the shadows
 * cast on it and how it takes rain and snow; everything time-dependent is a uniform, so nothing
 * is repainted as the day and the weather go by. Over the scenery, the moving sprites of `Life`
 * (cars, walkers, birds): textured rectangles in band space, hidden where the scenery is nearer.
 * Last, the weather between the eye and the view: falling rain or snow, and drops on the glass.
 */
export const fragmentShader = /* glsl */ `
  #define SPRITES ${SPRITE_COUNT}
  #include <common>
  uniform sampler2D scene;
  uniform sampler2D lights;
  uniform sampler2D curfew;
  uniform sampler2D ground;
  uniform sampler2D fx;
  uniform sampler2D sky;
  uniform vec3 center;
  uniform float radius;
  uniform vec4 nearWall; // x0, x1, y0, y1 of the building's own wall standing in the view (see Outdoors.NearWall)
  uniform float nearWallZ;
  uniform float nearWallStorey;
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform float nightness;
  uniform float starAlpha;
  uniform vec3 cloudTint;
  uniform float cloudAlpha;
  uniform float cloudCover;
  uniform vec2 cloudDrift;
  uniform float cityGlow;
  uniform float litAlpha;
  uniform float wakefulness;
  uniform vec3 sceneTint;
  uniform float sunShadow;
  uniform float wetness;
  uniform float snowCover;
  uniform float rain;
  uniform float snow;
  uniform float paneWet;
  uniform float wind;
  uniform float fog;
  uniform vec3 fogColor;
  uniform float lightning;
  uniform vec3 boltDir;
  uniform float boltSeed;
  uniform float boltReach;
  uniform float petals;
  uniform float hazeDistance;
  uniform float time;
  uniform vec3 glowDir;
  uniform float glowStrength;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float sunLow;
  uniform float sunVisibility;
  uniform vec3 moonDir;
  uniform vec3 moonShadowDir;
  uniform float moonVisibility;
  uniform sampler2D sprites;
  uniform sampler2D spriteGlow;
  uniform vec4 spriteRect[SPRITES];
  uniform vec4 spriteCell[SPRITES];
  uniform vec4 spriteInfo[SPRITES]; // alpha, distance, atlas lod, packed tint
  uniform float lightsOn;
  varying vec3 vWorld;
  const float DEPTH_SCALE = ${DEPTH_SCALE.toFixed(1)};
  const float EYE_HEIGHT = ${EYE_HEIGHT.toFixed(1)};
  const int PARALLAX_STEPS = ${PARALLAX_STEPS};
  const float SUN_RADIUS = ${SUN_RADIUS.toFixed(4)};
  const float MOON_RADIUS = ${MOON_RADIUS.toFixed(4)};
  const float GLOW_RADIUS_X = ${GLOW_RADIUS_X.toFixed(4)};
  const float GLOW_RADIUS_Y = ${GLOW_RADIUS_Y.toFixed(4)};
  const float ELEVATION_MIN = ${ELEVATION_MIN.toFixed(5)};
  const float ELEVATION_MAX = ${ELEVATION_MAX.toFixed(5)};
  const vec2 SCENE_TEXEL = vec2(${(1 / SCENE_WIDTH).toFixed(8)}, ${(1 / SCENE_HEIGHT).toFixed(8)});
  // Lights in linear light: tungsten windows and lamps, cool office and screen light.
  const vec3 WARM = vec3(1.0, 0.68, 0.34);
  const vec3 COOL = vec3(0.70, 0.82, 1.0);
  // What is left of the day colours under a city sky at night.
  const vec3 NIGHT = vec3(0.075, 0.09, 0.14);
  // The sodium-orange glow of the city on the underside of the night sky.
  const vec3 CITY = vec3(0.16, 0.085, 0.04);
  const vec3 SNOW = vec3(0.9, 0.92, 0.96);
  // The blue-white of a lightning flash, and the galvanised grey of a roller shutter.
  const vec3 FLASH = vec3(0.78, 0.84, 1.0);
  const vec3 SHUTTER = vec3(0.5, 0.51, 0.52);

  vec2 equirect(vec3 d) {
    return vec2(atan(d.x, d.z) / PI2 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  }
  // The scenery textures cover only the ELEVATION_MIN..MAX band, at full width.
  vec2 band(vec3 d) {
    return vec2(atan(d.x, d.z) / PI2 + 0.5, (asin(clamp(d.y, -1.0, 1.0)) - ELEVATION_MIN) / (ELEVATION_MAX - ELEVATION_MIN));
  }
  float angleBetween(vec3 a, vec3 b) {
    return acos(clamp(dot(a, b), -1.0, 1.0));
  }
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * valueNoise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      a *= 0.5;
    }
    return v;
  }
  // Sky gradient: zenith colour at the top, the horizon colour taking over in the last third.
  vec3 skyGradient(vec3 d) {
    float t = 1.0 - clamp(asin(clamp(d.y, 0.0, 1.0)) / PI_HALF, 0.0, 1.0);
    vec3 mid = mix(zenith, horizon, 0.45);
    return t < 0.62 ? mix(zenith, mid, t / 0.62) : mix(mid, horizon, (t - 0.62) / 0.38);
  }
  // Sunrise / sunset: a wide warm glow hugging the horizon on the sun's side, pink then mauve higher up.
  vec3 horizonGlow(vec3 color, vec3 d) {
    if (glowStrength <= 0.001) return color;
    vec3 level = normalize(vec3(d.x, 0.0, d.z));
    float dh = angleBetween(level, glowDir) / GLOW_RADIUS_X;
    float dv = asin(clamp(d.y, -1.0, 1.0)) / GLOW_RADIUS_Y;
    float r = clamp(sqrt(dh * dh + dv * dv), 0.0, 1.0);
    vec3 tint; float a;
    if (r < 0.4) { float k = r / 0.4; tint = mix(vec3(1.0, 0.305, 0.045), vec3(0.87, 0.155, 0.127), k); a = mix(0.8, 0.4, k); }
    else if (r < 0.75) { float k = (r - 0.4) / 0.35; tint = mix(vec3(0.87, 0.155, 0.127), vec3(0.51, 0.10, 0.26), k); a = mix(0.4, 0.15, k); }
    else { tint = vec3(0.51, 0.10, 0.26); a = mix(0.15, 0.0, (r - 0.75) / 0.25); }
    // An overcast sky smothers the glow.
    return mix(color, tint, a * glowStrength * (1.0 - 0.8 * cloudCover));
  }
  // The city's light low on the night sky, stronger under cloud.
  vec3 addCityGlow(vec3 color, vec3 d) {
    float low = 1.0 - clamp(d.y / 0.55, 0.0, 1.0);
    return color + CITY * cityGlow * low * low;
  }
  // The sun: a disc with a soft halo that widens and warms as the sun gets low; hidden by cloud.
  vec3 drawSun(vec3 color, vec3 d, float veil) {
    float angle = angleBetween(d, sunDir);
    float haloRadius = 0.22 + 0.3 * sunLow;
    float halo = pow(max(1.0 - angle / haloRadius, 0.0), 2.4) * (0.7 + 0.9 * sunLow);
    float disc = 1.0 - smoothstep(SUN_RADIUS * 0.85, SUN_RADIUS * 1.1, angle);
    vec3 discColor = mix(vec3(1.0, 0.98, 0.93), sunColor * 1.15, sunLow);
    float seen = sunVisibility * (1.0 - veil);
    color += sunColor * halo * sunVisibility * (1.0 - 0.85 * cloudCover);
    return mix(color, discColor * 1.6, disc * seen);
  }
  // One texel of the lights texture (warm, cool, glass, depth), its lights switched by its own curfew.
  // Lights are on or off, never dimmed. At dusk they come on one by one (street lamps and every other
  // all-night light first, then the windows in an order hashed from their curfew) as litAlpha climbs,
  // and go out one by one as the city falls asleep: a light stays on while the wakefulness is above
  // its curfew (0 = all night). A curfew byte of 7 mod 8 animates it (see Sheet.lit): the cool light
  // of a television flickers with what is on, a warm beacon blinks once every two seconds.
  // A curfew byte of 6 mod 8 is a fairy light: it twinkles, bulb by bulb, and the caller colours it
  // with the bulb painted under it (fairy comes back 1). Every other window with someone home
  // (a curfew above zero: lamps and signs have none) lives a little: now and then a figure crosses
  // the room, a dark band sliding over the light, and later in the evening some blinds come down.
  vec4 lightTexel(vec2 uv, out float fairy) {
    vec4 li = texture2D(lights, uv);
    float cf = texture2D(curfew, uv).r;
    float on = step(1.0 - litAlpha, fract(cf * 7.0)) * step(cf, wakefulness);
    float code = mod(floor(cf * 255.0 + 0.5), 8.0);
    float animated = step(6.5, code);
    fairy = step(5.5, code) * (1.0 - animated);
    float screen = 0.45 + 0.55 * valueNoise(vec2(time * 3.0, cf * 97.0)) * (0.7 + 0.3 * step(0.5, fract(time * 0.23 + cf * 5.0)));
    float beacon = step(0.5, fract(time * 0.5 + cf * 3.1));
    vec2 texel = floor(uv / SCENE_TEXEL);
    float twinkle = 0.3 + 0.7 * smoothstep(0.3, 0.6, valueNoise(vec2(time * 1.7, texel.x * 0.37 + texel.y * 1.73)));
    li.r *= mix(1.0, beacon, animated) * mix(1.0, twinkle, fairy);
    li.g *= mix(1.0, screen, animated);
    float home = step(0.02, cf) * (1.0 - animated) * (1.0 - fairy);
    if (home > 0.5 && li.r + li.g > 0.0) {
      float h = fract(cf * 91.7);
      float slot = floor(time / 23.0 + h * 17.0);
      float moving = step(0.62, fract(sin(slot * 12.9898 + cf * 78.233) * 43758.5453)) * step(h, 0.7);
      float dir = h < 0.35 ? 1.0 : -1.0;
      float across = abs(fract((texel.x - dir * time * (1.5 + 2.5 * fract(cf * 37.1))) / 36.0 + h) - 0.5) * 36.0;
      float figure = moving * (1.0 - step(1.4, across));
      float blinds = step(0.74, fract(cf * 13.7)) * step(wakefulness, 0.84 + 0.15 * fract(cf * 53.3));
      float slats = 0.75 + 0.25 * step(0.5, fract(texel.y * 0.5));
      li.rg *= (1.0 - 0.65 * figure) * mix(1.0, 0.4 * slats, blinds);
    }
    return vec4(li.rg * on, li.ba);
  }
  // Bilinear filtering by hand over the four texels around uv, each switched first: blending before
  // switching would leave a rim of a window's light on the texels around it after it went out.
  vec4 sampleLights(vec2 uv, out float fairy) {
    vec2 st = uv / SCENE_TEXEL - 0.5;
    vec2 f = fract(st);
    vec2 c = (floor(st) + 0.5) * SCENE_TEXEL;
    float fa, fb, fe, fg;
    vec4 a = lightTexel(c, fa);
    vec4 b = lightTexel(c + vec2(SCENE_TEXEL.x, 0.0), fb);
    vec4 e = lightTexel(c + vec2(0.0, SCENE_TEXEL.y), fe);
    vec4 g = lightTexel(c + SCENE_TEXEL, fg);
    fairy = mix(mix(fa, fb, f.x), mix(fe, fg, f.x), f.y);
    return mix(mix(a, b, f.x), mix(e, g, f.x), f.y);
  }
  // Hash of a window of the near wall (storey, bay) to a curfew, like the painted windows'.
  float wallCurfew(float storey, float bay) {
    return fract(sin(storey * 12.9898 + bay * 78.233) * 43758.5453);
  }
  // The near wall where the eye ray meets it at p: rendered plaster in daylight, a string course
  // at every floor, a cornice under the roof, and on the floors below the flat's two windows per
  // storey, their glass mirroring the sky and lit at night like the city's.
  vec3 nearWallColor(vec3 p, vec3 mirrored) {
    float h = p.y - nearWall.z;
    float storey = floor(h / nearWallStorey);
    float f = h - storey * nearWallStorey;
    vec3 albedo = vec3(0.56, 0.48, 0.39) * (1.0 - 0.25 * wetness);
    albedo *= 1.0 - 0.22 * step(f, 0.14);
    albedo *= 1.0 - 0.3 * step(nearWall.w - p.y, 0.35);
    // Two bays of windows, on the storeys below the flat's (the flat's own kitchen wall is blind here).
    float faceW = nearWall.y - nearWall.x;
    float cell = faceW * 0.5;
    float u = p.x - nearWall.x;
    float bay = floor(u / cell);
    float du = abs(u - bay * cell - cell * 0.5);
    float below = step(p.y, -0.01); // world y 0 is the flat's floor
    float frame = step(du, 0.45) * step(0.9, f) * step(f, 2.3) * below;
    float glass = step(du, 0.39) * step(0.96, f) * step(f, 2.24) * below;
    float cf = wallCurfew(storey, bay);
    float on = step(1.0 - litAlpha, fract(cf * 7.0)) * step(cf, wakefulness) * glass;
    // Daylight on the wall: the sky, and the sun where it reaches this face (its normal is +z).
    float sun = max(sunDir.z, 0.0) * sunVisibility * sunShadow;
    vec3 day = albedo * sceneTint * (0.5 + 0.55 * sun);
    day = mix(day, albedo * 1.35 * sceneTint, frame - glass);
    // Snow settles on the string courses and the sills.
    day = mix(day, SNOW * sceneTint, snowCover * 0.8 * step(f, 0.14));
    vec3 color = mix(day, albedo * NIGHT, nightness);
    color = mix(color, mix(vec3(0.02, 0.03, 0.04), mirrored, 0.6 * (1.0 - nightness)), glass);
    return color + WARM * 0.75 * on;
  }
  // The moon: a pale disc with a bite taken out of it (the crescent) and a faint halo; hidden by cloud.
  vec3 drawMoon(vec3 color, vec3 d, float veil) {
    float angle = angleBetween(d, moonDir);
    float disc = 1.0 - smoothstep(MOON_RADIUS * 0.9, MOON_RADIUS * 1.1, angle);
    float shadow = 1.0 - smoothstep(MOON_RADIUS * 0.85, MOON_RADIUS * 1.05, angleBetween(d, moonShadowDir));
    float halo = pow(max(1.0 - angle / 0.2, 0.0), 2.0) * 0.18;
    color += vec3(0.55, 0.62, 0.85) * halo * moonVisibility * (1.0 - 0.8 * cloudCover);
    return mix(color, vec3(0.86, 0.9, 1.0), disc * (1.0 - shadow) * moonVisibility * (1.0 - veil));
  }
  // A lightning bolt under the clouds, towards boltDir: a jagged stroke from the cloud base down to
  // the horizon with one fork, reseeded each strike; 0 away from it.
  float boltAlong(vec3 d) {
    float el = asin(clamp(d.y, -1.0, 1.0));
    if (el < -0.03 || el > 0.42) return 0.0;
    float az = atan(d.x, d.z) - atan(boltDir.x, boltDir.z);
    az = mod(az + PI, PI2) - PI;
    if (abs(az) > 0.16) return 0.0;
    float x = (valueNoise(vec2(el * 16.0, boltSeed)) - 0.5) * 0.06 + (valueNoise(vec2(el * 70.0, boltSeed + 3.1)) - 0.5) * 0.014;
    float w = 0.0018 + 0.0012 * el / 0.42;
    float core = 1.0 - smoothstep(w * 0.5, w, abs(az - x));
    float glow = (1.0 - smoothstep(0.0, w * 10.0, abs(az - x))) * 0.35;
    float side = fract(boltSeed * 7.13) < 0.5 ? -1.0 : 1.0;
    float fx0 = x + (0.3 - el) * 0.35 * side + (valueNoise(vec2(el * 50.0, boltSeed + 9.0)) - 0.5) * 0.01;
    float fork = step(0.14, el) * step(el, 0.3) * (1.0 - smoothstep(w * 0.3, w * 0.7, abs(az - fx0))) * 0.7;
    return core + glow + fork;
  }
  // The whole sky along d: gradient, glow, stars, the drifting cumulus and the overcast, the sun and the moon.
  vec3 skyAlong(vec3 d) {
    vec2 eq = equirect(d);
    vec3 detail = texture2D(sky, eq).rgb;
    vec3 clouds = texture2D(sky, eq + vec2(cloudDrift.x, 0.0)).rgb;
    vec3 color = addCityGlow(horizonGlow(skyGradient(d), d), d);
    // The overcast: a sheet of cloud over the whole sky, thicker the more the sky is covered.
    vec2 sp = d.xz / max(d.y + 0.12, 0.05) * 1.4 + cloudDrift * 60.0;
    float n = fbm(sp);
    float sheet = smoothstep(1.0 - cloudCover, 1.25 - cloudCover, n + 0.2 * cloudCover) * smoothstep(-0.03, 0.08, d.y);
    // Stars only through the gaps.
    color = mix(color, vec3(1.0), detail.r * starAlpha * (1.0 - sheet));
    vec3 cumulus = cloudTint * mix(vec3(1.0), vec3(0.66, 0.7, 0.8), clouds.b);
    float heaps = min(clouds.g, 1.0) * cloudAlpha * (0.5 + 0.7 * cloudCover);
    color = mix(color, cumulus, heaps);
    vec3 stratus = cloudTint * mix(1.0, 0.62, smoothstep(0.35, 1.0, n)) * (1.0 - 0.35 * rain);
    color = mix(color, addCityGlow(stratus, d), sheet * (0.35 + 0.6 * cloudAlpha / 0.55));
    float veil = max(sheet, heaps * 0.8);
    color = drawMoon(drawSun(color, d, veil), d, veil);
    if (lightning > 0.01) {
      // The flash lights the clouds from inside, most towards the strike; the bolt below them.
      float toward = 0.5 + 0.5 * dot(normalize(vec3(d.x, 0.0, d.z)), boltDir);
      color += FLASH * lightning * (0.18 + 0.7 * max(sheet, heaps) * (0.4 + 0.6 * toward));
      color += FLASH * 2.2 * boltAlong(d) * lightning * boltReach;
    }
    // Fog swallows the sky too.
    return mix(color, fogColor, 0.92 * fog);
  }
  // Falling rain: two layers of thin slanted streaks drifting down the view, faint against the scene.
  float rainStreaks(vec3 d) {
    float az = atan(d.x, d.z);
    float el = asin(clamp(d.y, -1.0, 1.0));
    float streak = 0.0;
    for (int i = 0; i < 2; i++) {
      float scale = i == 0 ? 260.0 : 520.0;
      vec2 p = vec2((az + el * (0.12 + 0.6 * wind)) * scale, el * scale * 0.08 + time * (i == 0 ? 9.0 : 6.0));
      vec2 cell = floor(p);
      vec2 f = fract(p);
      float h = hash21(cell + float(i) * 13.0);
      float x = abs(f.x - h);
      streak += step(h, 0.28) * smoothstep(0.08, 0.0, x) * smoothstep(0.0, 0.3, f.y) * smoothstep(1.0, 0.6, f.y);
    }
    return streak;
  }
  // Falling snow: soft flakes on three depths, swaying as they drift down.
  float snowFlakes(vec3 d) {
    float az = atan(d.x, d.z);
    float el = asin(clamp(d.y, -1.0, 1.0));
    float flakes = 0.0;
    for (int i = 0; i < 3; i++) {
      float scale = 60.0 + float(i) * 45.0;
      vec2 p = vec2(az * scale + sin(time * 0.7 + float(i) * 2.0 + el * 20.0) * (0.4 + wind) + time * wind * 1.5, el * scale + time * (0.9 - float(i) * 0.2));
      vec2 cell = floor(p);
      vec2 f = fract(p) - 0.5;
      vec2 o = vec2(hash21(cell + float(i) * 7.0), hash21(cell + float(i) * 11.0 + 3.0)) - 0.5;
      float r = 0.07 + 0.05 * hash21(cell + 5.0);
      flakes += step(0.55, hash21(cell * 1.7 + float(i))) * smoothstep(r, r * 0.3, length(f - o * 0.6));
    }
    return min(flakes, 1.0);
  }
  // Spring petals blowing past on the wind: sparse pink flecks tumbling sideways as they fall.
  float petalFlakes(vec3 d) {
    float az = atan(d.x, d.z);
    float el = asin(clamp(d.y, -1.0, 1.0));
    float flakes = 0.0;
    for (int i = 0; i < 2; i++) {
      float scale = 45.0 + float(i) * 35.0;
      vec2 p = vec2(az * scale + time * (0.6 + 2.5 * wind) + sin(time * 1.3 + el * 30.0 + float(i)) * 0.5, el * scale + time * (0.45 - float(i) * 0.1));
      vec2 cell = floor(p);
      vec2 f = fract(p) - 0.5;
      vec2 o = vec2(hash21(cell + float(i) * 5.0), hash21(cell + float(i) * 9.0 + 1.0)) - 0.5;
      float spin = sin(time * 3.0 + hash21(cell) * 6.0);
      vec2 q = f - o * 0.6;
      q.x /= 0.35 + 0.65 * abs(spin);
      flakes += step(0.86, hash21(cell * 1.3 + float(i))) * (1.0 - smoothstep(0.03, 0.06, length(q)));
    }
    return min(flakes, 1.0);
  }
  // How much fog lies between the eye and a thing dist metres away, height metres above the
  // street: the dawn mist hugs the ground, so the street and the park drown before the rooftops.
  float fogAt(float dist, float height) {
    if (fog < 0.002) return 0.0;
    float density = fog * 0.03 * mix(0.5, 1.6, exp(-max(height, 0.0) / 9.0));
    return 1.0 - exp(-dist * density);
  }
  // Raindrops on the outside of the glass, in the pane's own plane (x or z along it, y up), beading
  // and running off: each 2 cm cell may hold a drop that comes and goes on its own clock.
  vec2 paneDrops(vec3 p) {
    vec2 q = vec2(p.x + p.z, p.y) * 45.0;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash21(cell);
    float life = fract(time * 0.12 + h * 7.0);
    vec2 o = vec2(hash21(cell + 1.7), hash21(cell + 3.1)) - 0.5;
    float r = (0.12 + 0.22 * hash21(cell + 9.0)) * smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.8, life);
    float drop = step(1.0 - paneWet * 0.85, h) * smoothstep(r, r * 0.6, length(f - o * 0.5));
    // A bright glint on each drop's upper side.
    float glint = drop * smoothstep(r * 0.55, 0.0, length(f - o * 0.5 - vec2(-0.25, 0.3) * r));
    return vec2(drop, glint);
  }
  void main() {
    vec3 d = normalize(vWorld - cameraPosition);

    // Where the eye ray meets the scenery. The panorama was painted from one eye (center); a
    // camera away from it sees each thing along another direction, the nearer the more. Start from a
    // sphere radius out, then step: read the painted distance along the current direction and
    // move to the point of the ray that far from the painting's eye. A few steps settle on the
    // surface (the sky, painted at no distance, sends the ray to infinity along itself).
    vec3 o = cameraPosition - center;
    float b = dot(o, d);
    float oo = dot(o, o);
    float t = -b + sqrt(max(b * b - oo + radius * radius, 0.0));
    vec3 s = normalize(o + t * d);
    vec2 uv = band(s);
    for (int i = 0; i < PARALLAX_STEPS; i++) {
      float stored = texture2D(lights, uv).a;
      float reach = stored < 0.002 ? 5000.0 : -DEPTH_SCALE * log(1.0 - min(stored, 0.996));
      t = -b + sqrt(max(b * b - oo + reach * reach, 0.0));
      s = normalize(o + t * d);
      uv = band(s);
    }
    float hitHeight = EYE_HEIGHT + (o.y + t * d.y);

    // Wind: a swaying crown (fx R, its phase in G) is looked up a few texels aside, the top most; its
    // margin shows the crown when it sways that way and whatever is behind it otherwise.
    vec4 fx0 = texture2D(fx, uv);
    vec2 suv = uv;
    if (fx0.r > 0.0 && wind > 0.02) {
      float amplitude = fx0.r * 255.0 / 16.0;
      float phase = mod(floor(fx0.g * 255.0 + 0.5), 128.0) / 127.0;
      float gust = 0.5 + 0.5 * sin(time * 0.8 - uv.x * 40.0);
      float lean = (sin(time * 1.9 + phase * 6.2832) * 0.5 + sin(time * 3.4 + phase * 19.0) * 0.18 + gust * 0.55) * wind * amplitude;
      vec2 duv = uv - vec2(lean, abs(lean) * 0.12) * SCENE_TEXEL;
      vec4 fx1 = texture2D(fx, duv);
      if (fx0.g > 0.5 || (fx1.g > 0.5 && fx1.r > 0.0)) suv = duv;
    }

    vec4 sc = texture2D(scene, suv); // premultiplied by coverage
    float fairy;
    vec4 li = sampleLights(suv, fairy); // warm, cool (already switched on or off), glass, depth
    vec4 gr = texture2D(ground, suv); // cast shadow, wet, snow
    float cov = sc.a * step(uv.y, 1.0);
    float sceneDist = -DEPTH_SCALE * log(1.0 - min(li.a, 0.996));
    // A shop shut behind its roller shutter (fx B is the shop's curfew): ribbed grey, unlit, not glass.
    float shutterCf = fx0.b;
    float shut = step(0.002, shutterCf) * step(wakefulness, shutterCf);
    if (shut > 0.5) {
      float ribs = 0.82 + 0.18 * step(0.5, fract(floor(uv.y / SCENE_TEXEL.y) / 3.0));
      sc = vec4(SHUTTER * ribs, 1.0);
      li = vec4(0.0, 0.0, 0.0, li.a);
      fairy = 0.0;
      cov = 1.0;
    }
    float haze = 1.0 - exp(-sceneDist / hazeDistance);
    float wet = gr.g * wetness * (1.0 - snowCover);
    float snowy = gr.b * snowCover;
    // Day colours under the sun's tint, in the shadows the sun casts while it shines, darker where
    // wet, white where snow has settled; at night what the city glow leaves of them.
    vec3 day = sc.rgb * sceneTint * (1.0 - gr.r * sunShadow) * (1.0 - 0.4 * wet);
    day = mix(day, SNOW * sceneTint * (1.0 - 0.5 * gr.r * sunShadow) * cov, snowy * 0.88);
    vec3 night = mix(sc.rgb * NIGHT * (1.0 - 0.3 * wet), SNOW * NIGHT * 2.2 * cov, snowy * 0.88);
    vec3 base = mix(day, night, nightness);
    // Glass and water mirror the sky behind the viewer's back, a little above the horizon; so does a wet road.
    vec3 r = normalize(vec3(-d.x, abs(d.y) + 0.06, -d.z));
    vec3 mirrored = addCityGlow(horizonGlow(skyGradient(r), r), r) * 0.85;
    base = mix(base, mirrored * cov, min(1.0, li.b + wet * 0.4));
    // Atmospheric perspective: far things dissolve into the sky just above their horizon.
    vec3 level = normalize(vec3(s.x, 0.03, s.z));
    vec3 airColor = addCityGlow(horizonGlow(skyGradient(level), level), level);
    base = mix(base, airColor * cov, haze);
    // A lightning flash lights everything for a split second.
    base += sc.rgb * FLASH * lightning * 0.9;
    // The lights that are on (see lightTexel); only the air in between dims them. A fairy light
    // shines in its bulb's own colour.
    vec3 bulb = sc.rgb / max(max(sc.r, max(sc.g, sc.b)), 0.05);
    base += (mix(WARM, bulb * 1.3, fairy) * li.r + COOL * li.g) * (1.0 - 0.6 * haze) * cov;
    // On a wet road at night the lights above it run down in long shimmering streaks.
    if (wet > 0.02 && litAlpha > 0.01) {
      vec3 streak = vec3(0.0);
      float unused;
      for (int k = 1; k <= 4; k++) {
        vec4 up = lightTexel(uv + vec2(0.0, SCENE_TEXEL.y * float(k * k) * 3.0), unused);
        streak += (WARM * up.r + COOL * up.g) / float(k + 1);
      }
      base += streak * wet * 0.35 * cov;
    }
    // The building's own wall outside some windows (the kitchen wing): a rectangle facing +z that
    // the ray may cross on its way out, metres away, in front of everything painted and moving.
    float wt = (nearWallZ - cameraPosition.z) / min(d.z, -1e-5);
    vec3 wp = cameraPosition + wt * d;
    float onWall = step(d.z, -1e-5) * step(0.0, wt) * step(nearWall.x, wp.x) * step(wp.x, nearWall.y) * step(nearWall.z, wp.y) * step(wp.y, nearWall.w);
    if (onWall > 0.5) {
      base = nearWallColor(wp, mirrored) + vec3(0.56, 0.48, 0.39) * FLASH * lightning * 0.9;
      cov = 1.0;
      sceneDist = wt;
      hitHeight = EYE_HEIGHT - 1.2 + wp.y;
    }
    // Fog and mist: the view fades into the grey with distance, lights last.
    float fogged = fogAt(sceneDist, hitHeight);
    base = mix(base, fogColor * cov, fogged);
    // Moving things, far to near: each a textured rectangle, skipped where the scenery stands in front
    // of it. Over the open sky (a bird) nothing stands in front, and it covers the sky as it goes.
    float occluder = cov > 0.01 ? sceneDist : 1e6;
    for (int i = 0; i < SPRITES; i++) {
      vec4 rc = spriteRect[i];
      vec4 info = spriteInfo[i];
      if (info.x <= 0.0 || uv.x < rc.x || uv.x > rc.z || uv.y < rc.y || uv.y > rc.w || info.y > occluder) continue;
      vec2 st = (uv - rc.xy) / (rc.zw - rc.xy);
      vec2 auv = mix(spriteCell[i].xy, spriteCell[i].zw, st);
      vec4 sp = texture2DLodEXT(sprites, auv, info.z); // premultiplied, white where the car's own colour goes
      vec3 tint = vec3(floor(info.w / 65536.0), floor(mod(info.w, 65536.0) / 256.0), mod(info.w, 256.0)) / 255.0;
      sp.rgb *= tint;
      vec3 spc = mix(sp.rgb * sceneTint, sp.rgb * NIGHT, nightness);
      spc = mix(spc, airColor * sp.a, 1.0 - exp(-info.y / hazeDistance));
      float spriteFog = fogAt(info.y, 1.5);
      spc = mix(spc, fogColor * sp.a, spriteFog);
      spc += texture2DLodEXT(spriteGlow, auv, info.z).rgb * lightsOn * (1.0 - 0.8 * spriteFog);
      float a = sp.a * info.x;
      base = base * (1.0 - a) + spc * info.x;
      cov = cov * (1.0 - a) + a;
    }

    vec3 color = base;
    if (cov < 0.999) color += skyAlong(d) * (1.0 - cov);

    // The weather between the window and the view: rain streaks lit by the day (or the city at
    // night), snowflakes, then the drops on the glass itself.
    vec3 airLight = mix(sceneTint * 0.55, vec3(0.12, 0.1, 0.09) + CITY * 0.6, nightness);
    if (rain > 0.01) color = mix(color, airLight * 1.4, min(1.0, rainStreaks(d)) * 0.22 * rain);
    if (snow > 0.01) color = mix(color, mix(SNOW * sceneTint, SNOW * 0.3, nightness), snowFlakes(d) * 0.85 * snow);
    float petalFall = petals * smoothstep(0.1, 0.5, wind) * (1.0 - rain) * (1.0 - nightness);
    if (petalFall > 0.01) color = mix(color, vec3(0.98, 0.78, 0.84) * sceneTint, petalFlakes(d) * 0.9 * petalFall);
    if (paneWet > 0.01) {
      vec2 drop = paneDrops(vWorld);
      color = mix(color, color * 0.72 + airLight * 0.25, drop.x * 0.8);
      color += airLight * drop.y * 0.6;
    }

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
