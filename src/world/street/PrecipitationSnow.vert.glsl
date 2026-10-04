// Precipitation snow vertex shader (Precipitation.ts): the #include <...> lines are chunks assemble() writes in.
#include <shelter>
attribute vec2 extra;
uniform float time;
uniform float amount;
uniform vec3 box;
uniform vec3 velocity;
uniform float size;
uniform float pointScale;
void main() {
  vec3 p = position * box + velocity * time;
  p.x += sin(time * 0.9 + position.y * 40.0) * 0.6;
  p.z += cos(time * 0.7 + position.x * 40.0) * 0.6;
  vec3 origin = cameraPosition - box * 0.5;
  vec3 w = origin + mod(p - origin, box);
  vec4 view = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = size * pointScale * (0.6 + 0.8 * extra.x) / max(-view.z, 0.5);
  if (extra.y > amount || sheltered(w)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
