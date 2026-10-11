// ShopInteriors fragment shader (ShopInteriors.ts): TS_PEOPLE_WANDER is a #define from TypeScript.
// No backtick in here (the string is a template literal).
uniform sampler2D atlas;
uniform vec2 tileSize;
uniform float daylight;
uniform vec3 sky;
uniform vec3 rowColor;
uniform float nightness;
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
varying float vAcross;
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
  // The glass gives back what is in front of it: on Front Street the row across (its stone, its windows dark by
  // day and some lit at night, its shopfronts glowing), the road below it, the sky above its roofline; elsewhere the sky.
  vec3 mirrored = sky;
  if (vAcross > 0.0) {
    vec3 r = vec3(d.x, d.y, -d.z);
    float t = vAcross / max(r.z, 0.03);
    float up = (o.y - vRoom.z) + r.y * t;
    float along = o.x + vRoom.y + r.x * t;
    if (up < 0.0) mirrored = rowColor * 0.35;
    else if (up < 17.0) {
      vec2 cellUv = vec2(along / 2.8, (up - 3.9) / 3.1);
      vec2 cell = floor(cellUv);
      vec2 inCell = fract(cellUv);
      float pane = step(0.0, cellUv.y) * step(0.28, inCell.x) * step(inCell.x, 0.72) * step(0.25, inCell.y) * step(inCell.y, 0.85);
      float lampOn = step(fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453), 0.3) * nightness;
      vec3 stone = rowColor;
      vec3 glass = mix(rowColor * 0.45 + sky * 0.2, vec3(1.0, 0.72, 0.42) * 0.8, lampOn);
      mirrored = mix(stone, glass, pane);
      // The shopfronts across: dark glass by day, a warm glow at night.
      if (up < 3.9) mirrored = mix(rowColor * 0.5, vec3(1.0, 0.8, 0.55) * 0.5, nightness * step(0.3, fract(along / 7.0)));
    }
  }
  // The glass: a little of what it faces, much more at a grazing angle.
  float fresnel = 0.05 + 0.55 * pow(1.0 - abs(d.z), 4.0);
  gl_FragColor = vec4(mix(lit * 0.9, mirrored, fresnel * (0.35 + 0.65 * max(daylight, 0.5 * nightness))), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
