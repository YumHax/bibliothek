// Precipitation rain vertex shader (Precipitation.ts): the #include <...> lines are chunks assemble() writes in.
#include <shelter>
attribute vec2 extra;
uniform float time;
uniform float amount;
uniform vec3 box;
uniform vec3 velocity;
uniform float streak;
varying float vFade;
void main() {
  vec3 p = position * box + velocity * time;
  vec3 origin = cameraPosition - box * 0.5;
  vec3 w = origin + mod(p - origin, box);
  w -= normalize(velocity) * streak * extra.x;
  vFade = 1.0 - extra.x * 0.8;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  if (extra.y > amount || sheltered(w)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
