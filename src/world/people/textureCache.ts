import type * as THREE from 'three';
import { markShared } from '../materials/sharedResources';

/*
 * The people's painted canvases (face, torso, cloth tiles, hair strands, eyes), one per distinct
 * set of the look's values that feed the painter: two people who share a trouser colour or an iris
 * colour, and a zone built again after unloading, wear the texture already painted and uploaded
 * instead of painting their own. Painters draw only from a random seeded by those values, so a key
 * always paints the same canvas. Every texture is `markShared`: a zone unloading never frees it
 * (the set of looks is fixed by the plans' seeds, so the cache is bounded). A cached texture is
 * never changed after it is painted; the materials wearing it stay each person's own.
 */

const cache = new Map<string, THREE.Texture>();

/** The texture painted for `key`, painting (and marking shared) it the first time. */
export function cachedTexture<T extends THREE.Texture>(key: string, paint: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const texture = markShared(paint());
  cache.set(key, texture);
  return texture;
}
