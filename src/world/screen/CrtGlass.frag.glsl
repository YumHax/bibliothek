// CrtGlass fragment shader (CrtGlass.ts).
uniform float playing;
uniform float opening;
uniform float collapse;
uniform float afterglow;
uniform sampler2D smudges;
uniform float scanLines;
// The tube's face: its height over its width, and the radius of its rounded corners (a share of the width).
uniform float aspect;
uniform float cornerRadius;
// 0..1: how lit the room's ceiling lamp is (its glint on the glass), eased by CrtGlass.ts.
uniform float lampLit;
varying vec2 vUv;
varying vec2 vEye;
void main() {
  vec2 c = vUv - 0.5;
  // The tube's corners curve away from the eye and dim.
  float corner = smoothstep(0.18, 0.5, length(c * vec2(1.0, 1.25)));
  float scan = 0.5 + 0.5 * cos(vUv.y * scanLines * 6.2831853);
  float dark = playing * (0.22 * scan + 0.55 * corner * corner);
  // Power on: the picture opens from a bright line; off: squashed to a line, then to a dot.
  float squash = clamp(collapse / 0.6, 0.0, 1.0);
  float shrink = clamp((collapse - 0.6) / 0.4, 0.0, 1.0);
  float halfH = collapse > 0.0 ? mix(0.5, 0.004, squash) : 0.5 * opening;
  float halfW = collapse > 0.0 ? mix(0.5, 0.006, shrink) : 0.5;
  float outside = max(smoothstep(halfH, halfH + 0.006, abs(c.y)), smoothstep(halfW, halfW + 0.006, abs(c.x)));
  float beam = collapse > 0.0 ? collapse : 1.0 - opening;
  float line = beam * (1.0 - outside) * (1.0 - smoothstep(0.0, max(halfH, 0.004) + 0.01, abs(c.y)));
  float spot = afterglow * (1.0 - smoothstep(0.0, 0.035, length(c * vec2(1.0, 1.33))));
  // The bulge's broad sheen from above and a small glint of the ceiling lamp, upper left.
  // Both follow the room: the sheen dims with the lamp off, the glint all but goes, and it slides as the eye moves.
  float sheen = mix(0.6, 1.0, lampLit) * 0.05 * (1.0 - smoothstep(0.0, 0.55, length(c - vec2(-0.12, 0.28)) * 1.4));
  vec2 glintAt = vec2(-0.3, 0.33) - vEye * vec2(0.22, 0.16);
  float glint = mix(0.12, 1.0, lampLit) * 0.1 * (1.0 - smoothstep(0.0, 0.06, length((c - glintAt) * vec2(1.0, 1.6))));
  float prints = texture2D(smudges, vUv).r;
  // The tube's rounded corners: black past a rounded rectangle (in units of the width), whatever the picture.
  vec2 halfSize = vec2(0.5, 0.5 * aspect);
  vec2 q = abs(c * vec2(1.0, aspect)) - (halfSize - cornerRadius);
  float rounded = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - cornerRadius;
  float corners = smoothstep(-0.002, 0.002, rounded);
  float light = (sheen + glint + prints * 0.3) * (1.0 - corners) + 0.9 * line + 0.35 * spot;
  // Premultiplied mix of a black veil (scan lines, the dark around a collapsing picture) and a white one (reflections, the beam).
  float black = max(max(min(dark, 0.9), outside * beam > 0.0 ? outside : 0.0), corners);
  float alpha = clamp(black + light, 0.0, 1.0);
  vec3 color = alpha > 0.0 ? vec3(min(light, 1.0) / alpha) : vec3(0.0);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
