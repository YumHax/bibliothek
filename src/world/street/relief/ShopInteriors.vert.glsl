// ShopInteriors vertex shader (ShopInteriors.ts).
attribute vec2 aLocal;
attribute vec4 aRoom;
attribute vec3 aTangent;
attribute vec2 aTile;
attribute vec3 aLight;
attribute vec3 aWall;
attribute float aOpen;
attribute vec4 aPerson;
attribute vec3 aCloth;
attribute vec3 aSkin;
varying vec4 vPerson;
varying vec3 vCloth;
varying vec3 vSkin;
varying vec2 vLocal;
varying vec4 vRoom;
varying vec3 vDir;
varying vec2 vTile;
varying vec3 vLight;
varying vec3 vWall;
varying float vOpen;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 t = normalize(mat3(modelMatrix) * aTangent);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 view = world.xyz - cameraPosition;
  vDir = vec3(dot(view, t), view.y, dot(view, n));
  vLocal = aLocal;
  vRoom = aRoom;
  vTile = aTile;
  vLight = aLight;
  vWall = aWall;
  vOpen = aOpen;
  vPerson = aPerson;
  vCloth = aCloth;
  vSkin = aSkin;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
