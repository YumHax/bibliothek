import * as THREE from 'three';

/**
 * Point sprites (rain, snow, splashes, petals, leaves, spray, dust motes) are sized in pixels at one
 * metre on the frame they were tuned on: 1350 pixels tall at the camera's 70° (a laptop's window at the
 * 1.5 pixel-ratio cap). `POINT_SCALE` is the view being drawn against that frame, so a flake keeps its
 * size in the world whatever the window, the pixel ratio, the adaptive resolution's step (the post
 * chain renders at a share of the canvas) or the render (the player's view, a window's view onto the
 * street, a mirror).
 */
const REFERENCE = 1350 / (2 * Math.tan(THREE.MathUtils.degToRad(35)));
const VIEWPORT = new THREE.Vector4();

/** One uniform object shared by every point sprite's material: `uniforms: { pointScale: POINT_SCALE }`. */
export const POINT_SCALE = { value: 1 };

/**
 * The pixels one metre spans one metre away in the viewport `renderer` is drawing (its height, not the
 * drawing buffer's: see `POINT_SCALE`); null for a camera without perspective.
 */
export function viewScale(renderer: THREE.WebGLRenderer, camera: THREE.Camera): number | null {
  const perspective = camera as THREE.PerspectiveCamera;
  if (!perspective.isPerspectiveCamera) return null;
  const height = renderer.getCurrentViewport(VIEWPORT).w;
  return height / (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2));
}

/** Keeps `POINT_SCALE` right for `object` wherever it is drawn: chains onto its `onBeforeRender` (set any other one first). */
export function scalesPoints(object: THREE.Object3D): void {
  const previous = object.onBeforeRender;
  object.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    previous.call(this, renderer, scene, camera, geometry, material, group);
    const scale = viewScale(renderer, camera);
    if (scale !== null) POINT_SCALE.value = scale / REFERENCE;
  };
}
