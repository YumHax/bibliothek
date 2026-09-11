import type * as THREE from 'three';

/** Objects that can react to being under the crosshair. */
export interface Hoverable {
  setHovered(hovered: boolean): void;
}

export function isHoverable(obj: THREE.Object3D): obj is THREE.Object3D & Hoverable {
  return typeof (obj as Partial<Hoverable>).setHovered === 'function';
}
