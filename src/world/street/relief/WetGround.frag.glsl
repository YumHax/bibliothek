// WetGround fragment shader (WetGround.ts).
uniform sampler2D tDiffuse;
uniform sampler2D mask;
uniform float strength;
varying vec4 vUvProj;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float m = texture2D(mask, vUv).r;
  vec3 sum = vec3(0.0);
  float spread = 0.006 * vUvProj.w;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      sum += texture2DProj(tDiffuse, vUvProj + vec4(float(x) * spread, float(y) * spread * 2.0, 0.0, 0.0)).rgb;
    }
  }
  vec3 toEye = normalize(cameraPosition - vWorld);
  float fresnel = 0.2 + 0.8 * pow(1.0 - clamp(toEye.y, 0.0, 1.0), 3.0);
  gl_FragColor = vec4(sum / 9.0 * strength * fresnel * m, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
