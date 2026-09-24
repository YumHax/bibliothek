import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { QUALITY } from '@/graphics/quality';

/** Silvered glass returns a little less than it gets, slightly cool. */
const TINT = 0xb4bcc2;
/** Reflection texture resolution per metre of mirror (capped): a mirror is seen from a few metres at most. */
const PX_PER_M = 700;
const MAX_PX = 1024;

let polished: THREE.MeshStandardMaterial | null = null;

/**
 * The silvered face of a mirror, `width` x `height`, facing local +z. With `QUALITY.reflections`
 * a true `Reflector` (the room rendered again from behind the glass, only while the mirror is in
 * view and drawn); otherwise a polished metal plane that reflects the scene's environment map.
 * Place it a hair in front of whatever backs it.
 */
export function mirrorGlass(width: number, height: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, height);
  if (QUALITY.reflections) {
    const mirror = new Reflector(geometry, {
      color: TINT,
      textureWidth: Math.min(MAX_PX, Math.round(width * PX_PER_M)),
      textureHeight: Math.min(MAX_PX, Math.round(height * PX_PER_M)),
      clipBias: 0.003,
      multisample: 0,
    });
    mirror.name = 'Mirror';
    return mirror;
  }
  polished ??= new THREE.MeshStandardMaterial({ color: TINT, metalness: 1, roughness: 0.05 });
  const mesh = new THREE.Mesh(geometry, polished);
  mesh.name = 'Mirror';
  return mesh;
}
