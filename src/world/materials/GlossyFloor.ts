import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { FLOOR, onSurface } from '../surface/layers';
import { additiveOne } from '@/world/materials/blend';
import glossyFloorVertex from './GlossyFloor.vert.glsl?raw';
import glossyFloorFragment from './GlossyFloor.frag.glsl?raw';

/**
 * Reflection texture size: half the drawing buffer's (the reflection is blurred anyway), with the
 * frame's proportions, its long side capped (it is a second render of the room, per pixel like the
 * first): at most 640 x 360 on a wide screen, fewer pixels than the fixed 512 x 512 it replaced.
 * Checked before each render, resized only when the canvas is (a window resize).
 */
const SIZE_SHARE = 0.5;
const MAX_SIDE_PX = 640;
const drawingBuffer = new THREE.Vector2();

/**
 * The reflection of a polished floor, laid a hair over it: the room rendered again from under the
 * floor (a `Reflector`), blurred over nine taps (a share of the view, stretched along it as a
 * glossy floor smears a reflection towards the eye; no per-pixel depth of the reflected thing, so
 * the blur does not grow with its height over the floor), added on top of the floor's own shading, faint
 * when looking down and strong at a grazing angle (Fresnel). Added light only: the alpha is left
 * alone. Only built with `QUALITY.reflections`; `strength` is the reflection at grazing incidence.
 */
export function glossyFloor(width: number, depth: number, strength: number): THREE.Mesh {
  const floor = new Reflector(new THREE.PlaneGeometry(width, depth), {
    textureWidth: 256,
    textureHeight: 256,
    clipBias: 0.003,
    multisample: 0,
    shader: GLOSSY_SHADER,
  });
  floor.name = 'GlossyFloor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR.gloss.lift;
  const material = onSurface(floor.material as THREE.ShaderMaterial, FLOOR.gloss, { depthWrite: false });
  material.uniforms.strength!.value = strength; // declared by GLOSSY_SHADER below
  material.transparent = true;
  material.depthWrite = false;
  additiveOne(material);
  floor.receiveShadow = false;
  floor.castShadow = false;
  const reflect = floor.onBeforeRender.bind(floor);
  floor.onBeforeRender = (renderer, scene, camera, geometry, mat, group) => {
    fitToDrawingBuffer(floor, renderer);
    reflect(renderer, scene, camera, geometry, mat, group);
  };
  return floor;
}

/** Keeps the reflection's texture at `SIZE_SHARE` of the drawing buffer, in its proportions, long side at most `MAX_SIDE_PX`. */
function fitToDrawingBuffer(floor: Reflector, renderer: THREE.WebGLRenderer): void {
  renderer.getDrawingBufferSize(drawingBuffer);
  let w = drawingBuffer.x * SIZE_SHARE;
  let h = drawingBuffer.y * SIZE_SHARE;
  const long = Math.max(w, h, 1);
  if (long > MAX_SIDE_PX) {
    w *= MAX_SIDE_PX / long;
    h *= MAX_SIDE_PX / long;
  }
  const target = floor.getRenderTarget();
  const width = Math.max(64, Math.round(w));
  const height = Math.max(64, Math.round(h));
  if (target.width !== width || target.height !== height) target.setSize(width, height);
}

const GLOSSY_SHADER = {
  name: 'GlossyFloorShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    strength: { value: 0.2 },
  },
  vertexShader: glossyFloorVertex,
  fragmentShader: glossyFloorFragment,
};
