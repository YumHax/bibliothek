// IndustrialPendantBeam vertex shader (IndustrialPendantBeam.ts): the cone's height along it and its facing in view space.
varying float vDown;
varying vec3 vNormal;
varying vec3 vView;
varying float vDepth;
void main() {
  // The cylinder's v runs 0 at its foot to 1 at its top: 0 at the shade, 1 at the foot.
  vDown = 1.0 - uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
