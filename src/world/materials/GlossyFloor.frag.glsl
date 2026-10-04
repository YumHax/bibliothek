// GlossyFloor fragment shader (GlossyFloor.ts).
uniform sampler2D tDiffuse;
uniform float strength;
varying vec4 vUv;
varying vec3 vWorld;
void main() {
  vec3 sum = vec3(0.0);
  // In the reflection's projective uv: a constant share of the view, twice as long along it
  // (towards the eye) as across, the glossy floor's streak.
  // Nine taps on a spiral turned per pixel (interleaved gradient noise): a lamp's reflection
  // smears into a soft streak instead of nine sharp copies on a grid.
  vec2 spread = vec2(0.009, 0.018) * vUv.w;
  float spin = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  for (int i = 0; i < 9; i++) {
    float r = sqrt((float(i) + 0.5) / 9.0);
    float a = float(i) * 2.3999632 + spin;
    sum += texture2DProj(tDiffuse, vUv + vec4(cos(a) * r * spread.x, sin(a) * r * spread.y, 0.0, 0.0)).rgb;
  }
  vec3 toEye = normalize(cameraPosition - vWorld);
  float fresnel = 0.12 + 0.88 * pow(1.0 - clamp(toEye.y, 0.0, 1.0), 4.0);
  gl_FragColor = vec4(sum / 9.0 * strength * fresnel, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
