// ShopInteriors fragment shader (ShopInteriors.ts): TS_PEOPLE_WANDER is a #define from TypeScript.
// No backtick in here (the string is a template literal).
uniform sampler2D atlas;
uniform vec2 tileSize;
uniform float daylight;
uniform vec3 sky;
uniform float depth;
uniform float tileMetres;
uniform float displayDepth;
uniform float time;
varying vec4 vPerson;
varying vec3 vCloth;
varying vec3 vSkin;
varying vec2 vLocal;
varying vec4 vRoom;
varying vec3 vDir;
varying vec2 vTile;
varying vec3 vLight;
varying vec3 vWall;
varying float vOpen;
#include <fog_pars_fragment>

vec4 art(float side, vec2 uv) {
  vec2 st = vec2(fract(uv.x), clamp(uv.y, 0.002, 0.998));
  return texture2D(atlas, vTile + vec2((side + st.x) * 0.5, st.y) * tileSize);
}

void main() {
  vec3 d = normalize(vDir);
  d.z = min(d.z, -0.02);
  vec3 o = vec3(vLocal, 0.0);
  // The room: x across the window (a little wider), y from the shop's floor to its ceiling, z into it.
  vec3 lo = vec3(-0.4, vRoom.z, -depth);
  vec3 hi = vec3(vRoom.x + 0.4, vRoom.w, 0.0);
  vec3 exitPlane = mix(lo, hi, step(0.0, d));
  vec3 tt = (exitPlane - o) / d;
  float tHit = min(min(tt.x, tt.y), tt.z);
  vec3 h = o + d * tHit;
  float wallH = vRoom.w - vRoom.z;
  vec3 col;
  if (tHit == tt.z) {
    col = art(0.0, vec2((h.x + vRoom.y) / tileMetres, (h.y - vRoom.z) / wallH)).rgb;
  } else if (tHit == tt.x) {
    col = vWall * (0.75 + 0.25 * (h.y - vRoom.z) / wallH);
  } else if (d.y < 0.0) {
    vec2 f = floor(vec2(h.x, h.z) / 0.4);
    col = vWall * (0.42 + 0.06 * mod(f.x + f.y, 2.0));
  } else {
    float lamp = exp(-dot(vec2(h.x - vRoom.x * 0.5, h.z + depth * 0.5), vec2(h.x - vRoom.x * 0.5, h.z + depth * 0.5)) * 0.8);
    col = vWall * (0.85 + 0.9 * lamp * vOpen);
  }
  #ifndef CHEAP
  // Someone in the shop while it is open (aPerson: where along the window, how deep, a phase, 1 if anyone):
  // a flat figure facing the street, drifting along the counter now and then.
  if (vPerson.w > 0.5 && vOpen > 0.5) {
    float tP = (-vPerson.y - o.z) / d.z;
    if (tP > 0.0 && tP < tHit) {
      vec3 q = o + d * tP;
      float px = vPerson.x + TS_PEOPLE_WANDER * sin(time * 0.11 + vPerson.z * 6.28);
      float hy = q.y - vRoom.z;
      float dx = abs(q.x - px);
      float body = step(0.0, hy) * step(hy, 1.45) * step(dx, mix(0.16, 0.22, smoothstep(0.85, 1.3, hy)) * (1.0 - 0.35 * smoothstep(1.32, 1.45, hy)));
      float head = step(length(vec2(dx * 1.1, hy - 1.6)), 0.11);
      if (head > 0.5) { col = vSkin; tHit = tP; }
      else if (body > 0.5) { col = vCloth * (0.85 + 0.15 * smoothstep(0.9, 1.4, hy)); tHit = tP; }
    }
  }
  // The display in front: things on a table or in a case, just behind the glass.
  float tFront = (-displayDepth - o.z) / d.z;
  if (tFront < tHit) {
    vec3 p = o + d * tFront;
    vec4 shown = art(1.0, vec2((p.x + vRoom.y) / tileMetres, (p.y - vRoom.z) / wallH));
    if (shown.a > 0.5) col = shown.rgb;
  }
  #endif
  // Lit by the shop's lamps while open, and by what daylight comes through the glass; deeper is darker.
  float fall = 1.0 - 0.3 * clamp(-h.z / depth, 0.0, 1.0);
  vec3 lit = col * (vLight * (0.04 + 1.15 * vOpen) + vec3(0.3 * daylight)) * fall;
  // The glass: a little of the sky, much more at a grazing angle.
  float fresnel = 0.05 + 0.55 * pow(1.0 - abs(d.z), 4.0);
  gl_FragColor = vec4(mix(lit * 0.9, sky, fresnel * (0.35 + 0.65 * daylight)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
