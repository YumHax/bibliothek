/*
 * The stories drawn in a lit window (`windowLife.ts`, `STORY` kinds), for the facades' shader (`Buildings`): flat
 * silhouettes against the room's light, in the window's own frame (u 0..1 across, v 0..1 sill to head, scaled to its
 * aspect so heads are round), moving with the shader's clock. Returns what the window's light is multiplied by: dark
 * where someone stands, tinted where the room's light is coloured (a party's, a monitor's, the trader's box spines).
 * Prepended to the fragment shader before `main`. A template literal: no backtick in here.
 */
export const WINDOW_STORY_GLSL = /* glsl */ `
float stBox(vec2 p, vec2 c, vec2 h) {
  vec2 d = abs(p - c) - h;
  return 1.0 - smoothstep(0.0, 0.015, max(d.x, d.y));
}
float stDisc(vec2 p, vec2 c, float r) {
  return 1.0 - smoothstep(r - 0.012, r + 0.012, length(p - c));
}
float stHash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}
float stPerson(vec2 p, vec2 head, float s) {
  float m = stDisc(p, head, 0.065 * s);
  m = max(m, stBox(p, head - vec2(0.0, 0.1 * s), vec2(0.03 * s, 0.04 * s)));
  m = max(m, stDisc(p, head + vec2(-0.075 * s, -0.15 * s), 0.055 * s));
  m = max(m, stDisc(p, head + vec2(0.075 * s, -0.15 * s), 0.055 * s));
  m = max(m, stBox(p, head - vec2(0.0, 0.42 * s), vec2(0.12 * s, 0.27 * s)));
  return m;
}
vec3 windowStory(vec3 local, vec4 axis, vec4 band, float t) {
  float u = dot(local.xz - axis.xy, axis.zw) + 0.5;
  float width = 1.0 / max(length(axis.zw), 0.001);
  float height = max(band.y - band.x, 0.01);
  float a = width / height;
  vec2 p = vec2(u * a, (local.y - band.x) / height);
  float kind = band.z;
  float param = band.w;
  float dark = 0.0;
  vec3 tint = vec3(1.0);
  if (kind < 0.5) {
    // Dinner for two, a candle between them.
    float bob = 0.012 * sin(t * 0.9);
    dark = max(stPerson(p, vec2(0.24 * a, 0.62 + bob), 0.9), stPerson(p, vec2(0.76 * a, 0.6 - bob), 0.85));
    dark = max(dark, stBox(p, vec2(0.5 * a, 0.3), vec2(0.4 * a, 0.02)));
    tint = vec3(1.05, 0.9, 0.7) * (0.85 + 0.15 * stHash(floor(t * 9.0)));
  } else if (kind < 1.5) {
    // Squats.
    float squat = 0.5 + 0.5 * sin(t * 2.6);
    dark = stPerson(p, vec2(0.5 * a, 0.5 + 0.18 * squat), 1.0);
  } else if (kind < 2.5) {
    // A painter at the easel, the brush going back and forth; the canvas fills up over the days.
    dark = stPerson(p, vec2(0.3 * a, 0.64), 0.95);
    float reach = 0.5 + 0.5 * sin(t * 1.3);
    dark = max(dark, stBox(p, vec2(0.3 * a + 0.12 + 0.06 * reach, 0.48 + 0.04 * reach), vec2(0.09, 0.014)));
    dark = max(dark, stBox(p, vec2(0.7 * a - 0.08, 0.2), vec2(0.012, 0.2)));
    dark = max(dark, stBox(p, vec2(0.7 * a + 0.08, 0.2), vec2(0.012, 0.2)));
    float canvas = stBox(p, vec2(0.7 * a, 0.52), vec2(0.13, 0.15));
    vec3 colours = vec3(0.6 + 0.6 * sin(p.y * 9.0 + param * 6.0), 0.7 + 0.4 * sin(p.x * 13.0), 0.9 - 0.5 * param);
    vec3 painted = mix(vec3(1.1), colours, step(p.y, 0.37 + 0.3 * param));
    tint = mix(vec3(1.0), painted, canvas);
  } else if (kind < 3.5) {
    // A party: four bobbing heads under coloured light.
    for (int j = 0; j < 4; j++) {
      float fj = float(j);
      float hop = 0.05 * abs(sin(t * 3.4 + fj * 1.7));
      dark = max(dark, stPerson(p, vec2((0.14 + 0.24 * fj) * a, 0.58 + hop + 0.04 * stHash(fj)), 0.8));
    }
    float hue = t * 0.7;
    tint = 0.75 + 0.45 * vec3(sin(hue), sin(hue + 2.1), sin(hue + 4.2));
  } else if (kind < 4.5) {
    // A removal: boxes stacked under a bare bulb, someone carrying one across now and then.
    dark = max(stBox(p, vec2(0.2 * a, 0.1), vec2(0.13, 0.1)), stBox(p, vec2(0.22 * a, 0.27), vec2(0.1, 0.07)));
    dark = max(dark, stBox(p, vec2(0.78 * a, 0.12), vec2(0.15, 0.12)));
    float walk = fract(t / 16.0);
    if (walk < 0.5) {
      float x = (-0.2 + walk * 2.8) * a;
      dark = max(dark, stPerson(p, vec2(x, 0.66), 0.95));
      dark = max(dark, stBox(p, vec2(x, 0.42), vec2(0.1, 0.08)));
    }
    tint = vec3(1.15, 1.12, 1.05) + 0.8 * stDisc(p, vec2(0.5 * a, 0.92), 0.03);
  } else if (kind < 5.5) {
    // Shelves of boxes, as full as the parameter says, their spines in colour; someone browsing them.
    float row = floor(p.y / 0.22);
    float inRow = fract(p.y / 0.22);
    if (row < 4.0) {
      float col = floor(u * 28.0);
      float filled = step(stHash(col * 7.0 + row * 31.0), param);
      vec3 spine = 0.45 + 0.6 * vec3(stHash(col + row * 3.1), stHash(col * 1.7 + row), stHash(col * 2.3 + row * 5.0));
      float box = filled * step(0.16, inRow) * step(inRow, 0.71 + 0.25 * stHash(col * 3.3 + row));
      tint = mix(vec3(1.0), spine, box);
      dark = max(dark, step(inRow, 0.12) * 0.8);
    }
    float browse = fract(t / 38.0);
    if (browse < 0.4) dark = max(dark, stPerson(p, vec2((0.15 + browse * 1.8) * a, 0.7), 1.0));
  } else if (kind < 6.5) {
    // A cat on the sill, its tail going; someone reading behind it.
    vec2 c = vec2(0.28 * a, 0.08);
    float cat = max(stDisc(p, c, 0.07), stDisc(p, c + vec2(0.0, 0.1), 0.045));
    cat = max(cat, stDisc(p, c + vec2(-0.03, 0.15), 0.017));
    cat = max(cat, stDisc(p, c + vec2(0.03, 0.15), 0.017));
    cat = max(cat, stBox(p, c + vec2(0.08 + sin(t * 1.4) * 0.03, 0.02), vec2(0.035, 0.012)));
    dark = max(cat, stPerson(p, vec2(0.7 * a, 0.5), 0.8) * 0.7);
    tint = vec3(1.08, 0.95, 0.78);
  } else if (kind < 7.5) {
    // Someone at a desk, their back to the window, in a monitor's blue glow.
    float monitor = stBox(p, vec2(0.62 * a, 0.47), vec2(0.17, 0.11));
    dark = max(stPerson(p, vec2(0.42 * a, 0.62), 1.0), stBox(p, vec2(0.5 * a, 0.3), vec2(0.42 * a, 0.02)));
    float flick = 0.8 + 0.2 * stHash(floor(t * 6.0));
    tint = mix(vec3(0.55, 0.65, 1.0), vec3(0.8, 1.0, 1.6), monitor) * flick;
  } else {
    // A reader in an armchair, a lamp beside them.
    dark = max(stPerson(p, vec2(0.48 * a, 0.5), 0.85), stBox(p, vec2(0.48 * a, 0.18), vec2(0.2, 0.12)));
    tint = vec3(1.1, 0.92, 0.7) * (1.0 + 0.6 * stDisc(p, vec2(0.8 * a, 0.62), 0.05));
  }
  return tint * (1.0 - 0.85 * clamp(dark, 0.0, 1.0));
}
`;
