import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import type { Outdoors } from '../props/outdoors/Outdoors';
import { part } from '../props/Prop';
import { paint } from '../materials/palette';
import { WALL, onSurface } from '../surface/layers';
import { PaneReflection } from '../materials/paneReflection';
import { leaseHomeOutlook, type OutlookLease } from '../outlook/sharedOutlook';
import type { WindowLife } from '../street/windowLife';
import { STAIRWELL_PLAN as plan } from './stairwellPlan';
import { STOREY, STOREYS, landingY } from '@/world/measures/building';

/** How many of the landings' panes show the courtyard at once (the nearest to the eye). */
const LIVE = 2;
const FRAME = 0.05;
const FRAME_PAINT = paint(0xe6ddc8, 0.6);
const SILL = paint(0xb8ae9c, 0.7);

interface StairWindowsOptions {
  dayNight: DayNight;
  outdoors: Outdoors;
  /** The main camera, the view through the glass is rendered from. */
  viewer: THREE.Camera;
  /** The lives behind the windows across the courtyard (`building/rearWindows`); none: the curfews. */
  windowLife?: WindowLife;
}

/**
 * The stairwell's windows onto the courtyard, one on every half landing's south wall (in our building's back, the
 * street's `oursBack`): through the glass the courtyard itself, built in 3D from the street's plan (`outlook/`: the
 * setts, the lawn and its chestnut, the bins, the neighbour's wing and the rear building, and from the upper floors
 * over the workshop's roof Park Street and the park), in true perspective from every landing and lit by the hour and
 * the weather; a painted frame with a glazing bar, a stone sill. Nothing opens. The stairwell's frame (zone-local),
 * origin at its origin; never collides.
 */
export class StairWindows extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  /** The view from our building (`sharedOutlook`), shared with the flat's windows and the neighbours'. */
  private readonly lease: OutlookLease;
  /** Every landing's pane: the nearest `LIVE` show the courtyard (each a render of it), the rest frosted glass. */
  private readonly panes: THREE.Mesh[] = [];
  private readonly frosted: THREE.MeshBasicMaterial;
  private readonly live: THREE.Material;
  private readonly sky: () => THREE.Color;
  private readonly eye = new THREE.Vector3();
  private readonly viewer: THREE.Camera;
  /** The stairwell given back by the glass, over every pane (as the flat's windows have it). */
  private readonly reflection = new PaneReflection();
  private readonly dayNight: DayNight;

  constructor({ dayNight, outdoors, viewer, windowLife }: StairWindowsOptions) {
    super();
    this.name = 'StairWindows';
    const { x, width, height, sill } = plan.courtyardWindow;
    const z = plan.shaft.z0;
    // The stairwell is where the street has it (`flatToStreet`, the view's default frame).
    this.lease = leaseHomeOutlook({ dayNight, outdoors, viewer, ...(windowLife ? { windowLife } : {}) });
    const waiting = new THREE.Color();
    this.sky = () => waiting.copy(dayNight.state.horizon).multiplyScalar(0.5 + 0.9 * dayNight.state.daylight);
    this.frosted = onSurface(new THREE.MeshBasicMaterial({ color: 0x8a9096, fog: false }), WALL.paper);
    for (let k = 0; k < STOREYS; k++) {
      const floor = landingY(k) - STOREY / 2;
      const y = floor + sill + height / 2;
      const pane = this.lease.view.pane(width, height, this.lease.toOutlook);
      pane.position.set(x, y, z + WALL.pane.lift);
      this.add(pane);
      this.panes.push(pane);
      const reflection = this.reflection.over(pane.geometry, z + WALL.pane.lift);
      reflection.position.x = x;
      reflection.position.y = y;
      this.add(reflection);
      part(this, FRAME, height + 2 * FRAME, 0.05, FRAME_PAINT, { x: x - width / 2 - FRAME / 2, y, z: z + 0.025 });
      part(this, FRAME, height + 2 * FRAME, 0.05, FRAME_PAINT, { x: x + width / 2 + FRAME / 2, y, z: z + 0.025 });
      part(this, width, FRAME, 0.05, FRAME_PAINT, { x, y: y + height / 2 + FRAME / 2, z: z + 0.025 });
      part(this, width, FRAME, 0.05, FRAME_PAINT, { x, y: y - height / 2 - FRAME / 2, z: z + 0.025 });
      part(this, 0.03, height, 0.03, FRAME_PAINT, { x, y, z: z + 0.015 });
      part(this, width + 0.2, 0.04, 0.14, SILL, { x, y: y - height / 2 - FRAME - 0.02, z: z + 0.07 });
    }
    this.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = false;
    });
    this.live = this.panes[0]!.material as THREE.Material;
    // Both materials are in the scene from the start, so `World.prime` compiles both.
    this.panes.forEach((pane, i) => (pane.material = i < LIVE ? this.live : this.frosted));
    this.viewer = viewer;
    this.dayNight = dayNight;
  }

  /** The player walked in: what is out there is built now, at the next idle moment (`OutlookView.prefetch`). */
  setOccupied(occupied: boolean): void {
    if (occupied) this.lease.view.prefetch();
  }

  update(dt: number): void {
    this.lease.view.update(dt);
    // Only the panes nearest the eye render the courtyard (each visible one is a whole render of it, and through the
    // well up to five can be in view at once); the others, glimpsed storeys away, are frosted glass in the sky's colour.
    this.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    // A pane's rank is how many panes are nearer the eye (ties to the lower index); no allocation, every frame.
    const eyeY = this.eye.y;
    for (let i = 0; i < this.panes.length; i++) {
      const d = Math.abs(this.panes[i]!.position.y - eyeY);
      let rank = 0;
      for (let j = 0; j < this.panes.length; j++) {
        const e = Math.abs(this.panes[j]!.position.y - eyeY);
        if (e < d || (e === d && j < i)) rank++;
      }
      this.panes[i]!.material = rank < LIVE ? this.live : this.frosted;
    }
    this.frosted.color.copy(this.sky());
    this.reflection.set(this.dayNight.state.daylight);
  }

  dispose(): void {
    for (const pane of this.panes) this.lease.view.release(pane);
    this.lease.release();
  }
}
