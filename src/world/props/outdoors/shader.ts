import { DEPTH_SCALE, ELEVATION_MAX, ELEVATION_MIN, SCENE_HEIGHT, SCENE_WIDTH } from './Sheet';
import { SPRITE_COUNT } from './Life';

/** Angular radius of the sun disc and of the moon, in radians. */
export const SUN_RADIUS = 0.05;
export const MOON_RADIUS = 0.045;
/** Angular radii of the sunrise / sunset glow along the horizon (wide) and up the sky (short). */
const GLOW_RADIUS_X = 2.3;
const GLOW_RADIUS_Y = 0.7;
/** Distance over which the air dissolves about two thirds of a thing's own colour into the sky. */
const HAZE_DISTANCE = 900;

export const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

/**
 * The pane shader. Along the eye ray through the pane: the sky at infinity (gradient, sunset
 * glow, stars, clouds, the sun and the moon), then the scenery where the ray leaves the sphere
 * around the room. The scenery textures hold the day colours, the lights that come on at night
 * (and the curfew each goes out at, against the city's `wakefulness`), how much each surface
 * mirrors the sky and how far away it is; everything time-dependent is a uniform, so nothing is
 * repainted as the day goes by. Over the scenery, the moving sprites of
 * `Life` (cars, walkers): textured rectangles in band space, hidden where the scenery is nearer.
 */
export const fragmentShader = /* glsl */ `
  #define SPRITES ${SPRITE_COUNT}
  #include <common>
  uniform sampler2D scene;
  uniform sampler2D lights;
  uniform sampler2D curfew;
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
  uniform float litAlpha;
  uniform float wakefulness;
  uniform vec3 sceneTint;
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
  const float HAZE_DISTANCE = ${HAZE_DISTANCE.toFixed(1)};
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
    return mix(color, tint, a * glowStrength);
  }
  // The sun: a disc with a soft halo that widens and warms as the sun gets low.
  vec3 drawSun(vec3 color, vec3 d) {
    float angle = angleBetween(d, sunDir);
    float haloRadius = 0.22 + 0.3 * sunLow;
    float halo = pow(max(1.0 - angle / haloRadius, 0.0), 2.4) * (0.7 + 0.9 * sunLow);
    float disc = 1.0 - smoothstep(SUN_RADIUS * 0.85, SUN_RADIUS * 1.1, angle);
    vec3 discColor = mix(vec3(1.0, 0.98, 0.93), sunColor * 1.15, sunLow);
    color += sunColor * halo * sunVisibility;
    return mix(color, discColor * 1.6, disc * sunVisibility);
  }
  // One texel of the lights texture (warm, cool, glass, depth), its lights switched by its own curfew.
  // Lights are on or off, never dimmed. At dusk they come on one by one (street lamps and every other
  // all-night light first, then the windows in an order hashed from their curfew) as litAlpha climbs,
  // and go out one by one as the city falls asleep: a light stays on while the wakefulness is above
  // its curfew (0 = all night).
  vec4 lightTexel(vec2 uv) {
    vec4 li = texture2D(lights, uv);
    float cf = texture2D(curfew, uv).r;
    float on = step(1.0 - litAlpha, fract(cf * 7.0)) * step(cf, wakefulness);
    return vec4(li.rg * on, li.ba);
  }
  // Bilinear filtering by hand over the four texels around uv, each switched first: blending before
  // switching would leave a rim of a window's light on the texels around it after it went out.
  vec4 sampleLights(vec2 uv) {
    vec2 st = uv / SCENE_TEXEL - 0.5;
    vec2 f = fract(st);
    vec2 c = (floor(st) + 0.5) * SCENE_TEXEL;
    vec4 a = lightTexel(c);
    vec4 b = lightTexel(c + vec2(SCENE_TEXEL.x, 0.0));
    vec4 e = lightTexel(c + vec2(0.0, SCENE_TEXEL.y));
    vec4 g = lightTexel(c + SCENE_TEXEL);
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
    vec3 albedo = vec3(0.56, 0.48, 0.39);
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
    float sun = max(sunDir.z, 0.0) * sunVisibility;
    vec3 day = albedo * sceneTint * (0.5 + 0.55 * sun);
    day = mix(day, albedo * 1.35 * sceneTint, frame - glass);
    vec3 color = mix(day, albedo * NIGHT, nightness);
    color = mix(color, mix(vec3(0.02, 0.03, 0.04), mirrored, 0.6 * (1.0 - nightness)), glass);
    return color + WARM * 0.75 * on;
  }
  // The moon: a pale disc with a bite taken out of it (the crescent) and a faint halo.
  vec3 drawMoon(vec3 color, vec3 d) {
    float angle = angleBetween(d, moonDir);
    float disc = 1.0 - smoothstep(MOON_RADIUS * 0.9, MOON_RADIUS * 1.1, angle);
    float shadow = 1.0 - smoothstep(MOON_RADIUS * 0.85, MOON_RADIUS * 1.05, angleBetween(d, moonShadowDir));
    float halo = pow(max(1.0 - angle / 0.2, 0.0), 2.0) * 0.18;
    color += vec3(0.55, 0.62, 0.85) * halo * moonVisibility;
    return mix(color, vec3(0.86, 0.9, 1.0), disc * (1.0 - shadow) * moonVisibility);
  }
  void main() {
    vec3 d = normalize(vWorld - cameraPosition);
    // Sky at infinity: gradient, glow, stars and clouds along the eye ray, then the sun and the moon.
    vec3 skyDetail = texture2D(sky, equirect(d)).rgb;
    vec3 skyColor = horizonGlow(skyGradient(d), d);
    skyColor = mix(skyColor, vec3(1.0), skyDetail.r * starAlpha);
    // Clouds, their undersides in a bluish shade.
    vec3 cloudColor = cloudTint * mix(vec3(1.0), vec3(0.66, 0.7, 0.8), skyDetail.b);
    skyColor = mix(skyColor, cloudColor, min(skyDetail.g, 1.0) * cloudAlpha);
    skyColor = drawMoon(drawSun(skyColor, d), d);

    // Scenery on a sphere around the room: where the eye ray leaves it, seen from its centre.
    vec3 o = cameraPosition - center;
    float b = dot(o, d);
    float t = -b + sqrt(max(b * b - dot(o, o) + radius * radius, 0.0));
    vec3 s = normalize(o + t * d);
    vec2 uv = band(s);
    vec4 sc = texture2D(scene, uv); // premultiplied by coverage
    vec4 li = sampleLights(uv); // warm, cool (already switched on or off), glass, depth
    float cov = sc.a * step(uv.y, 1.0);
    float sceneDist = -DEPTH_SCALE * log(1.0 - min(li.a, 0.996));
    float haze = 1.0 - exp(-sceneDist / HAZE_DISTANCE);
    // Day colours under the sun's tint; at night what the city glow leaves of them.
    vec3 base = mix(sc.rgb * sceneTint, sc.rgb * NIGHT, nightness);
    // Glass and water mirror the sky behind the viewer's back, a little above the horizon.
    vec3 r = normalize(vec3(-d.x, abs(d.y) + 0.06, -d.z));
    vec3 mirrored = horizonGlow(skyGradient(r), r) * 0.85;
    base = mix(base, mirrored * cov, li.b);
    // Atmospheric perspective: far things dissolve into the sky just above their horizon.
    vec3 level = normalize(vec3(s.x, 0.03, s.z));
    vec3 airColor = horizonGlow(skyGradient(level), level);
    base = mix(base, airColor * cov, haze);
    // The lights that are on (see lightTexel); only the air in between dims them.
    base += (WARM * li.r + COOL * li.g) * (1.0 - 0.6 * haze) * cov;
    // The building's own wall outside some windows (the kitchen wing): a rectangle facing +z that
    // the ray may cross on its way out, metres away, in front of everything painted and moving.
    float wt = (nearWallZ - cameraPosition.z) / min(d.z, -1e-5);
    vec3 wp = cameraPosition + wt * d;
    float onWall = step(d.z, -1e-5) * step(0.0, wt) * step(nearWall.x, wp.x) * step(wp.x, nearWall.y) * step(nearWall.z, wp.y) * step(wp.y, nearWall.w);
    if (onWall > 0.5) {
      base = nearWallColor(wp, mirrored);
      cov = 1.0;
      sceneDist = wt;
    }
    // Moving things, far to near: each a textured rectangle, skipped where the scenery stands in front of it.
    for (int i = 0; i < SPRITES; i++) {
      vec4 rc = spriteRect[i];
      vec4 info = spriteInfo[i];
      if (info.x <= 0.0 || uv.x < rc.x || uv.x > rc.z || uv.y < rc.y || uv.y > rc.w || info.y > sceneDist) continue;
      vec2 t = (uv - rc.xy) / (rc.zw - rc.xy);
      vec2 auv = mix(spriteCell[i].xy, spriteCell[i].zw, t);
      vec4 sp = texture2DLodEXT(sprites, auv, info.z); // premultiplied, white where the car's own colour goes
      vec3 tint = vec3(floor(info.w / 65536.0), floor(mod(info.w, 65536.0) / 256.0), mod(info.w, 256.0)) / 255.0;
      sp.rgb *= tint;
      vec3 spc = mix(sp.rgb * sceneTint, sp.rgb * NIGHT, nightness);
      spc = mix(spc, airColor * sp.a, 1.0 - exp(-info.y / HAZE_DISTANCE));
      spc += texture2DLodEXT(spriteGlow, auv, info.z).rgb * lightsOn;
      base = base * (1.0 - sp.a * info.x) + spc * info.x;
    }

    gl_FragColor = vec4(skyColor * (1.0 - cov) + base, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
