// postFxShaders ao fragment shader (postFxShaders.ts): the #include <...> lines are chunks assemble() writes in.
// Ambient occlusion from the depth buffer alone, at half resolution. Normals come from the
// neighbouring depths (the flatter side of each pixel, so edges do not smear); a spiral of taps,
// rotated per pixel, counts how much of the hemisphere above the surface is closed off within
// `radius`, fading with distance so a far background never darkens the foreground.
uniform sampler2D tDepth;
uniform mat4 projection;
uniform mat4 projectionInverse;
uniform vec2 depthTexel;
uniform float aspect;
uniform float radius;
uniform float intensity;
uniform float cameraNear;
uniform float cameraFar;
uniform vec2 uvScale;
uniform vec2 uvLimit;
varying vec2 vUv;

/** View-space position of a screen point (uv 0..1 over the frame) at a depth-buffer value. */
vec3 viewPosition(vec2 screen, float depth) {
  vec4 clip = vec4(vec3(screen, depth) * 2.0 - 1.0, 1.0);
  vec4 view = projectionInverse * clip;
  return view.xyz / view.w;
}

/** The view position at texture coordinate st (clamped to the frame). */
vec3 viewAt(vec2 st) {
  st = min(st, uvLimit);
  return viewPosition(st / uvScale, texture2D(tDepth, st).x);
}

vec3 normalAt(vec2 st, vec3 p) {
  vec3 l = viewAt(st - vec2(depthTexel.x, 0.0));
  vec3 r = viewAt(st + vec2(depthTexel.x, 0.0));
  vec3 d = viewAt(st - vec2(0.0, depthTexel.y));
  vec3 u = viewAt(st + vec2(0.0, depthTexel.y));
  vec3 dx = abs(l.z - p.z) < abs(r.z - p.z) ? p - l : r - p;
  vec3 dy = abs(d.z - p.z) < abs(u.z - p.z) ? p - d : u - p;
  return normalize(cross(dx, dy));
}

#include <interleaved_noise>

void main() {
  vec2 st = vUv * uvScale;
  float depth = texture2D(tDepth, st).x;
  if (depth >= 1.0) {
    gl_FragColor = vec4(1.0);
    return;
  }
  vec3 p = viewPosition(vUv, depth);
  vec3 n = normalAt(st, p);
  // The radius in uv units (vertical), capped so the taps stay close for things right at the eye.
  float reach = min(radius * projection[1][1] * 0.5 / -p.z, 0.08);
  float spin = interleavedNoise(gl_FragCoord.xy) * 6.2831853;
  float occlusion = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES);
    float angle = float(i) * 2.3999632 + spin;
    vec2 offset = vec2(cos(angle) / aspect, sin(angle)) * t * reach;
    vec3 v = viewAt(st + offset * uvScale) - p;
    float vv = dot(v, v);
    float falloff = max(0.0, 1.0 - vv / (radius * radius));
    occlusion += max(0.0, dot(v, n) * inversesqrt(vv + 1e-5) - 0.12) * falloff;
  }
  float ao = clamp(1.0 - intensity * occlusion / float(SAMPLES), 0.0, 1.0);
  gl_FragColor = vec4(vec3(ao), 1.0);
}
