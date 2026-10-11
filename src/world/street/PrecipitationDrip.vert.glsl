// Precipitation drip vertex shader (Precipitation.ts): the #include <...> lines are chunks assemble() writes in.
// Water running off the shelters' edges (an awning's front, the bus shelter's roof): each drip belongs to one of the
// shelter slots and a spot along one of its top edges, falls from there to the ground under gravity, and starts again
// at its own pace; a short streak (extra.x 0 its head, 1 its tail). Slots left empty hide their drips.
#include <shelter>
attribute vec2 extra;
attribute vec2 drip;
uniform float time;
uniform float amount;
uniform vec3 origin;
uniform float roadY;
varying float vFade;
#include <sine_hash>
#include <roadGlsl>
void main() {
  int slot = int(floor(position.x * float(SHELTERS)));
  vec3 lo = shelterMin[0];
  vec3 hi = shelterMax[0];
  for (int i = 0; i < SHELTERS; i++) {
    if (i == slot) { lo = shelterMin[i]; hi = shelterMax[i]; }
  }
  // An edge of the top (which by drip.x), a spot along it (position.z).
  float t = position.z;
  vec2 xz = drip.x < 0.25 ? vec2(mix(lo.x, hi.x, t), lo.z) : drip.x < 0.5 ? vec2(mix(lo.x, hi.x, t), hi.z) : drip.x < 0.75 ? vec2(lo.x, mix(lo.z, hi.z, t)) : vec2(hi.x, mix(lo.z, hi.z, t));
  float ground = origin.y + (onRoad(xz - origin.xz) ? roadY : 0.0);
  float drop = max(hi.y - ground, 0.1);
  float fall = sqrt(2.0 * drop / 9.8);
  float period = fall + 0.4 + 1.6 * drip.y;
  float age = mod(time + position.y * 17.0, period);
  float s = 0.5 * 9.8 * age * age;
  float v = 9.8 * age;
  float y = hi.y - 0.02 - s + extra.x * min(0.012 * v + 0.03, 0.25);
  vFade = (1.0 - extra.x) * step(age, fall) * (1.0 - smoothstep(0.75, 1.0, age / fall) * 0.5);
  gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, max(y, ground), xz.y, 1.0);
  if (extra.y > amount || hi.x < lo.x || y < ground || hi.y < 1.2) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
