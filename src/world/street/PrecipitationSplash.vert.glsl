// Precipitation splash vertex shader (Precipitation.ts): the #include <...> lines are chunks assemble() writes in.
// A splash: each point is a ring on the ground that grows and fades over `period`, then turns up
// elsewhere (its spot re-drawn from its seed and the cycle's number), wrapped into the square
// around the camera. The ground is a kerb lower on the road (`roadY` inside the road's rectangles,
// in zone-local metres: `origin` is the zone's world position). The ring is squashed by the view's
// slant so it lies on the ground.
#include <shelter>
attribute vec2 extra;
uniform float time;
uniform float amount;
uniform float box;
uniform float period;
uniform float size;
uniform float pointScale;
uniform vec3 origin;
uniform float roadY;
varying float vAge;
varying float vSquash;
#include <sine_hash>
#include <roadGlsl>
void main() {
  float phase = time / period + extra.x;
  float cycle = floor(phase);
  vAge = fract(phase);
  vec2 seed = position.xz + vec2(sineHash(cycle + extra.x * 91.0), sineHash(cycle * 1.7 + extra.x * 57.0));
  vec2 corner = cameraPosition.xz - vec2(box * 0.5);
  vec2 w = corner + mod(seed * box - corner, vec2(box));
  vec2 local = w - origin.xz;
  float y = origin.y + (onRoad(local) ? roadY : 0.0) + 0.01;
  vec4 view = viewMatrix * vec4(w.x, y, w.y, 1.0);
  gl_Position = projectionMatrix * view;
  vec3 toEye = normalize(cameraPosition - vec3(w.x, y, w.y));
  vSquash = max(abs(toEye.y), 0.12);
  gl_PointSize = size * pointScale / max(-view.z, 0.5);
  if (extra.y > amount || sheltered(vec3(w.x, y, w.y))) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
