// SunShaft beam fragment shader (SunShaft.ts): the #include <...> lines are chunks assemble() writes in.
// The beam is shaded by what reaches the eye through it, approximated per fragment of its back
// face: the ray from the camera to the fragment is sampled at a few points inside the volume,
// each traced back to the glass along the sun's direction to see if a mullion shades it, and
// weighted by how far along the beam it is (fading out towards the floor) and a slow noise (the
// air moving). Far side only, so the camera may stand inside the beam.
#include <sine_hash>
uniform float time;
uniform vec3 rayDir;
uniform vec3 color;
uniform float strength;
uniform float beamLength;
uniform vec4 opening;
uniform vec3 eye;
varying vec3 vLocal;

#include <iq_hash>
#include <valueNoise3_noise>

/** 1 in the sun at window-local point p, 0 behind a mullion or outside the opening. */
float lit(vec3 p) {
  float t = p.z / rayDir.z;
  vec2 onGlass = p.xy - rayDir.xy * t;
  vec2 uv = onGlass / opening.xy + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || t < 0.0 || t > beamLength) return 0.0;
  vec2 cell = fract(uv * opening.zw);
  vec2 bar = 0.028 / opening.xy * opening.zw;
  float mullion = step(bar.x * 0.5, cell.x) * step(cell.x, 1.0 - bar.x * 0.5) * step(bar.y * 0.5, cell.y) * step(cell.y, 1.0 - bar.y * 0.5);
  float fade = (1.0 - smoothstep(0.35, 1.0, t / beamLength)) * smoothstep(0.0, 0.25, t);
  return mullion * fade;
}

void main() {
  vec3 toFrag = vLocal - eye;
  float total = length(toFrag);
  vec3 dir = toFrag / total;
  // March from the eye (or the near side of the volume) to this far face.
  float start = max(0.0, total - beamLength * 2.0);
  float light = 0.0;
  const int STEPS = 10;
  float jitter = sineHash(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)));
  for (int i = 0; i < STEPS; i++) {
    float s = mix(start, total, (float(i) + jitter) / float(STEPS));
    vec3 p = eye + dir * s;
    light += lit(p) * (0.65 + 0.7 * noise(p * 2.2 + vec3(0.0, time * 0.05, time * 0.03)));
  }
  float path = (total - start) / float(STEPS);
  gl_FragColor = vec4(color * light * path * strength, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
