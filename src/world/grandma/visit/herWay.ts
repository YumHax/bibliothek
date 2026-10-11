import * as THREE from 'three';
import type { MemeScene } from '../memeScene';
import { PRESENCE_PLAN, type HerSpot } from '../presencePlan';

/*
 * MÉMÉ'S WAY ABOUT HER FLAT (docs/grandma.md "Her presence"): out of her seat, through the crossing in the middle of
 * the room, to a spot of `PRESENCE_PLAN` (the turns on the way keep her clear of the furniture), and back to sit down.
 * Where she stands is kept per visit's scene, so the way back retraces the way there.
 */

type Vec2 = readonly [number, number];

/** The spot she stands at, by scene; absent or null: in her seat. */
const standing = new WeakMap<MemeScene, HerSpot | null>();

const floor = ([x, z]: Vec2): THREE.Vector3 => new THREE.Vector3(x, 0, z);

/** She is in her seat again (put there without a walk: the way in, a memory's end). */
export function seated(scene: MemeScene): void {
  standing.set(scene, null);
}

/** Walks her to `spot` (from her seat or from where she stands), turns her to its way, then `then`. */
export function walkHer(scene: MemeScene, spot: HerSpot, then?: () => void): void {
  const from = standing.get(scene) ?? null;
  const path: Vec2[] = from ? [...from.via].reverse() : [...scene.home().way];
  if (!(spot.corner && !from && inArmchair(scene))) path.push(PRESENCE_PLAN.hub);
  path.push(...spot.via, spot.at);
  standing.set(scene, spot);
  scene.meme.walk(path.map(floor), () => {
    scene.meme.stand(spot.yaw, 'stand');
    then?.();
  });
}

/** Walks her back to her seat for the hour and sits her down (`reseat`), then `then`. */
export function walkHome(scene: MemeScene, then?: () => void): void {
  const from = standing.get(scene) ?? null;
  const home = scene.home();
  if (!from) {
    scene.reseat();
    then?.();
    return;
  }
  const path: Vec2[] = [...from.via].reverse();
  if (!(from.corner && inArmchair(scene))) path.push(PRESENCE_PLAN.hub);
  path.push(...[...home.way].reverse(), home.at);
  standing.set(scene, null);
  scene.meme.walk(path.map(floor), () => {
    scene.reseat();
    then?.();
  });
}

/** Her seat for the hour is her armchair (not the table's chair). */
function inArmchair(scene: MemeScene): boolean {
  return scene.home().way === PRESENCE_PLAN.leave.armchair;
}

/** The yaw that turns her from where she stands to the zone-local floor point `to` (0 faces +z). */
export function yawTo(scene: MemeScene, [x, z]: Vec2): number {
  const at = scene.meme.position;
  return Math.atan2(x - at.x, z - at.z);
}
