// IndustrialPendantBeam fragment shader (IndustrialPendantBeam.ts): the faint warm air under a lit shade, brightest at
// the shade's mouth and down its axis, gone at its foot and at its edges (no hard rim), added on top (alpha untouched).
uniform vec3 color;
uniform float strength;
varying float vDown;
varying vec3 vNormal;
varying vec3 vView;
// How far the cone's wall is from the eye: standing in or right by a cone, its wall would veil the whole view.
varying float vDepth;
void main() {
  // Through the middle of the cone the far wall faces the eye; towards its silhouette it turns edge-on and fades.
  // Every base of a pow kept in 0..1: interpolation can nudge vDown past 1 at the foot, and a NaN here would be spread
  // over whole tiles of the screen by the bloom's mips (black rectangles on medium and high).
  float down = clamp(vDown, 0.0, 1.0);
  float facing = clamp(abs(dot(normalize(vNormal + vec3(0.0, 1e-5, 0.0)), normalize(vView + vec3(0.0, 0.0, 1e-5)))), 0.0, 1.0);
  float body = pow(facing, 1.6);
  float fall = pow(1.0 - down, 1.8) * smoothstep(0.0, 0.08, down);
  float near = smoothstep(0.8, 2.6, vDepth);
  gl_FragColor = vec4(color * strength * body * fall * near, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
