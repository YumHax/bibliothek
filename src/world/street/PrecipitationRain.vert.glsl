// Precipitation rain vertex shader (Precipitation.ts): the #include <...> lines are chunks assemble() writes in.
// A drop is a thin quad from its head back along its fall (extra.x 0 head .. 1 tail, side -1 / 1 across), turned to
// face the eye on the screen and never thinner than a pixel (a thinner one is fainter instead), lit by the sky and by
// the lamps it falls past.
#include <shelter>
#include <lamp_field>
attribute vec2 extra;
attribute float side;
uniform float time;
uniform float amount;
uniform vec3 box;
uniform vec3 velocity;
uniform float streak;
uniform vec2 viewport;
uniform float lampShare;
varying float vFade;
varying float vSide;
varying vec3 vLamp;
void main() {
  vec3 p = position * box + velocity * time;
  vec3 origin = cameraPosition - box * 0.5;
  vec3 w = origin + mod(p - origin, box);
  vec3 tail = w - normalize(velocity) * streak;
  vec4 head = projectionMatrix * viewMatrix * vec4(w, 1.0);
  vec4 back = projectionMatrix * viewMatrix * vec4(tail, 1.0);
  vec4 clip = mix(head, back, extra.x);
  vec2 along = (head.xy / max(head.w, 1e-3) - back.xy / max(back.w, 1e-3)) * viewport;
  vec2 dir = normalize(along + vec2(1e-5, 0.0));
  vec2 across = vec2(-dir.y, dir.x);
  // A drop is about 3 mm across: its width in pixels where it is, at least one.
  float px = 0.003 * projectionMatrix[1][1] * viewport.y * 0.5 / max(clip.w, 0.05);
  float width = max(px, 1.0);
  clip.xy += across * side * width / viewport * clip.w;
  gl_Position = clip;
  vFade = (1.0 - extra.x * 0.8) * min(1.0, 0.35 + px);
  vSide = side;
  vLamp = lampFieldAt(w) * lampShare;
  if (extra.y > amount || sheltered(w) || head.w <= 0.0 || back.w <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
