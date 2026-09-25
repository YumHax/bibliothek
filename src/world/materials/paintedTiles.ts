import type * as THREE from 'three';
import { markShared } from '../props/Prop';

const painted = new Map<string, readonly THREE.Texture[]>();

/**
 * A floor's canvases (1024² colour + bump) take tens of milliseconds to paint: this paints them
 * once per `key` (the painter and its parameters) for the page. Every call returns clones: their
 * own repeat and offset, but one source, so floors painted alike share one GPU upload, freed with
 * the last zone using it. A zone rebuilt after its unload re-uploads and never repaints.
 */
export function paintOnce<T extends readonly THREE.Texture[]>(key: string, paint: () => T): T {
  let textures = painted.get(key);
  if (!textures) {
    textures = paint().map((texture) => markShared(texture));
    painted.set(key, textures);
  }
  return textures.map((texture) => texture.clone()) as unknown as T;
}
