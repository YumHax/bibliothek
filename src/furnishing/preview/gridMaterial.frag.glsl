// gridMaterial fragment shader (gridMaterial.ts).
uniform float uCell;
uniform vec2 uOrigin;
uniform vec2 uCentre;
uniform float uRadius;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vPlane;
void main() {
  vec2 p = (vPlane - uOrigin) / uCell;
  vec2 width = fwidth(p);
  vec2 toLine = abs(fract(p - 0.5) - 0.5) / max(width, vec2(1e-4));
  float line = 1.0 - min(min(toLine.x, toLine.y), 1.0);
  float fade = 1.0 - smoothstep(uRadius * 0.45, uRadius, distance(vPlane, uCentre));
  float alpha = line * fade * uOpacity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
