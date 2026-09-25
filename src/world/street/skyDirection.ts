import * as THREE from 'three';
import { SUN_ROTATION_Y } from '../worldPlan';

const PRIMARY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SUN_ROTATION_Y);

/**
 * World direction of a point of the sky given as `SkyState` gives it (elevation, azimuth in the
 * primary window's frame), the same conversion `Outdoors` makes for the panes: so the sun over
 * the street stands where the windows show it.
 */
export function skyDirection(elevation: number, azimuth: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)).applyQuaternion(PRIMARY);
}
