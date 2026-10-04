// glassMask fragment shader (glassMask.ts).
// The pane's fragment is kept where it is the nearest thing (its own depth against the scene's at that pixel, within a
// couple of centimetres: the mask is half the scene's resolution, and a slanted pane's depth varies across a texel);
// a mullion or a curtain in front of it is 3 cm and more nearer.
#include <packing>
uniform sampler2D tDepth;
uniform vec2 maskTexel;
uniform float cameraNear;
uniform float cameraFar;
void main() {
  vec2 uv = gl_FragCoord.xy * maskTexel;
  float scene = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar);
  float own = -perspectiveDepthToViewZ(gl_FragCoord.z, cameraNear, cameraFar);
  if (own > scene + 0.012 + 0.004 * own) discard;
  gl_FragColor = vec4(1.0);
}
