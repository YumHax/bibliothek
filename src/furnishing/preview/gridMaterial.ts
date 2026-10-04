import * as THREE from 'three';
import { FLOOR, onSurface } from '@/world/surface/layers';
import gridMaterialVertex from './gridMaterial.vert.glsl?raw';
import gridMaterialFragment from './gridMaterial.frag.glsl?raw';

/**
 * The placement grid drawn on a surface round a carried piece: thin lines every `cell` metres from `origin`
 * (plane-local, metres), fading out `radius` from `centre`. Unlit, no depth write, alpha kept for the canvas's
 * cut-out (normal blending over an opaque floor leaves it at 1).
 */
export function gridMaterial(cell: number): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uCell: { value: cell },
      uOrigin: { value: new THREE.Vector2() },
      uCentre: { value: new THREE.Vector2() },
      uRadius: { value: 1.4 },
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0.32 },
    },
    vertexShader: gridMaterialVertex,
    fragmentShader: gridMaterialFragment,
  });
  return onSurface(material, FLOOR.placement);
}
