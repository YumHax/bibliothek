// Projector cone vertex shader (Projector.ts).
attribute float along;
attribute float across;
varying float vAlong;
varying float vAcross;
void main() {
  vAlong = along;
  vAcross = across;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
