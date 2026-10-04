import * as THREE from 'three';

/**
 * Shadow maps measured in their own texels: a normal offset that follows the map's resolution
 * instead of a fixed few centimetres (too much on a fine map, too little on a coarse one), and a
 * sun that re-aims in whole-texel steps so the edges it throws hop cleanly instead of crawling.
 */

/** Normal offset of a shadow lookup, in texels: enough to clear acne on a slope, too little to lift a contact shadow off its foot. */
const NORMAL_BIAS_TEXELS = 1.25;
/** A cube shadow's faces each see 90°: a half-angle of 45°. */
export const CUBE_FACE_HALF_ANGLE = Math.PI / 4;

/** World size (m) of one texel at `distance` from a perspective shadow camera of `halfAngle` and `mapSize` texels across. */
function texelAt(distance: number, halfAngle: number, mapSize: number): number {
  return (2 * distance * Math.tan(halfAngle)) / mapSize;
}

/** `shadow.normalBias` (m) for a map whose farthest receiver is `distance` away. */
export function normalBiasAt(distance: number, halfAngle: number, mapSize: number, texels = NORMAL_BIAS_TEXELS): number {
  return texels * texelAt(distance, halfAngle, mapSize);
}

/** Angle (radians) one texel of a perspective shadow map subtends from its light. */
export function texelAngle(halfAngle: number, mapSize: number): number {
  return (2 * Math.tan(halfAngle)) / mapSize;
}

/**
 * `out` = unit direction `dir` snapped to a grid of `step` radians in elevation and (at that
 * elevation) azimuth about +y: a light aimed along it at a fixed target moves one texel at a time.
 */
export function snapDirection(dir: THREE.Vector3, step: number, out: THREE.Vector3): THREE.Vector3 {
  const length = dir.length();
  if (length < 1e-9 || step <= 0) return out.copy(dir);
  const elevation = Math.round(Math.asin(THREE.MathUtils.clamp(dir.y / length, -1, 1)) / step) * step;
  const flat = Math.cos(elevation);
  const azimuthStep = flat > 1e-3 ? step / flat : Math.PI;
  const azimuth = Math.round(Math.atan2(dir.x, dir.z) / azimuthStep) * azimuthStep;
  return out.set(Math.sin(azimuth) * flat, Math.sin(elevation), Math.cos(azimuth) * flat).multiplyScalar(length);
}
