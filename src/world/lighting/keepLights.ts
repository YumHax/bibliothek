import type * as THREE from 'three';
import { intendedIntensity } from './LightCuller';

/** Where a hidden light's intensity waits to come back. */
const SAVED = 'keptIntensity';

/**
 * Shows or hides `root` without changing the scene's light count: `root.visible = false` would
 * take its lights out of the renderer (a lamp bought later, a prize not yet won) and recompile
 * every lit shader, twice. Here the meshes hide and the lights stay, dark (their intensity is kept
 * and handed back when shown). A subtree without lights is simply hidden.
 */
export function setShownKeepingLights(root: THREE.Object3D, shown: boolean): void {
  if (!holdsLight(root)) {
    root.visible = shown;
    return;
  }
  root.visible = true;
  for (const child of root.children) {
    if ((child as THREE.Light).isLight) setLit(child as THREE.Light, shown);
    else setShownKeepingLights(child, shown);
  }
}

function setLit(light: THREE.Light, lit: boolean): void {
  const saved = light.userData[SAVED] as number | undefined;
  if (!lit && saved === undefined) {
    light.userData[SAVED] = intendedIntensity(light);
    light.intensity = 0;
  } else if (lit && saved !== undefined) {
    light.intensity = saved;
    delete light.userData[SAVED];
  }
}

function holdsLight(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((obj) => {
    if ((obj as THREE.Light).isLight) found = true;
  });
  return found;
}
