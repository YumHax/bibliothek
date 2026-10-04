// Projector cone fragment shader (Projector.ts).
uniform vec3 color;
uniform float strength;
varying float vAlong;
varying float vAcross;
void main() {
  // Across the side, 0..1 at any distance from the lens (the side narrows to the apex).
  float s = vAlong > 0.001 ? (vAcross - 0.5) / vAlong + 0.5 : 0.5;
  float edge = smoothstep(0.0, 0.3, s) * smoothstep(1.0, 0.7, s);
  // Brightest out of the lens, thinning towards the wall.
  float fade = mix(1.0, 0.2, vAlong);
  gl_FragColor = vec4(color * strength * edge * fade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
