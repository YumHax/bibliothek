import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Zone } from './Zone';
import type { ZoneManager } from './ZoneManager';

/**
 * A doorway the camera stands in (this close to it) always counts as in view: the zone manager's
 * hysteresis lets the player walk 0.4 m into a zone before it is current, and the room ahead must
 * be drawn all the way. Elsewhere the opening itself is tested against the frustum, ungrown, so a
 * door right beside the player, behind them, does not pull a whole room in.
 */
const STANDING_IN = 0.4;

/**
 * Decides every frame which active zones are drawn: the player's zone, and any zone reached from it
 * through a doorway (`Zone.portals`) whose door is open (or which has no door) and whose opening is
 * in the camera's view, doorway after doorway. Zones the player cannot see this frame are told
 * `setDrawn(false)`: their meshes then cost no draw call and no shadow pass. three.js only culls by
 * frustum, not by walls, so without this a corridor draws the whole flat behind its walls.
 */
export class PortalCuller implements Updatable {
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly box = new THREE.Box3();
  private readonly eye = new THREE.Vector3();

  constructor(
    private readonly zones: readonly Zone[],
    private readonly manager: ZoneManager,
    private readonly camera: THREE.Camera,
  ) {}

  update(): void {
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this.frustum.setFromProjectionMatrix(this.viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    this.camera.getWorldPosition(this.eye);

    const seen = new Set<Zone>([this.manager.current]);
    const queue: Zone[] = [this.manager.current];
    for (let i = 0; i < queue.length; i++) {
      const zone = queue[i]!;
      for (const portal of zone.portals) {
        const next = this.manager.zone(portal.to);
        if (!next || seen.has(next) || !next.isActive) continue;
        if (!this.isOpen(zone, next, portal)) continue;
        const standingIn = this.box.copy(portal.bounds).expandByScalar(STANDING_IN).containsPoint(this.eye);
        if (!standingIn && !this.frustum.intersectsBox(portal.bounds)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    for (const zone of this.zones) if (zone.isActive) zone.setDrawn(seen.has(zone));
  }

  /** The leaf may be hung on either side of the opening: ask ours, else the other zone's portal back to us. */
  private isOpen(from: Zone, to: Zone, portal: Zone['portals'][number]): boolean {
    const door = portal.door ?? to.portals.find((p) => p.to === from.id)?.door;
    return !door || door.openness > 0;
  }
}
