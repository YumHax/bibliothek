import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import type { Outdoors } from '../props/outdoors/Outdoors';
import { part } from '../props/Prop';
import { paint } from '../materials/palette';
import { OutlookView } from '../outlook/OutlookView';
import { flatToStreet } from '../outlook/frames';
import { STAIRWELL_PLAN as plan, STOREY, STOREYS, landingY } from './stairwellPlan';

const FRAME = 0.05;
const FRAME_PAINT = paint(0xe6ddc8, 0.6);
const SILL = paint(0xb8ae9c, 0.7);
/** The facades of our own building's back, which the windows are in (`streetPlan`): never built in their view. */
const OUR_BACK = ['oursBack', 'oursBackW', 'oursWell', 'oursWellE', 'oursWellW'];

export interface StairWindowsOptions {
  dayNight: DayNight;
  outdoors: Outdoors;
  /** The main camera, the view through the glass is rendered from. */
  viewer: THREE.Camera;
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
  private readonly view: OutlookView;

  constructor({ dayNight, outdoors, viewer }: StairWindowsOptions) {
    super();
    this.name = 'StairWindows';
    const { x, width, height, sill } = plan.courtyardWindow;
    const z = plan.shaft.z0;
    const toStreet = flatToStreet();
    // The window's middle in the street's frame (every landing's is above the same spot): what is built round it.
    const [ox, , oz] = plan.origin;
    const eye = new THREE.Vector3(ox + x, 0, oz + z).applyMatrix4(toStreet);
    const waiting = new THREE.Color();
    this.view = new OutlookView({
      viewer,
      toOutlook: () => toStreet,
      build: (camera) =>
        import('../outlook/streetOutlook').then(({ buildStreetOutlook }) =>
          buildStreetOutlook(camera, { dayNight, lightDirection: (out) => outdoors.lightDirection(dayNight.state, out), eye: [eye.x, eye.z], without: OUR_BACK }),
        ),
      waiting: () => waiting.copy(dayNight.state.horizon).multiplyScalar(0.25 + 0.6 * dayNight.state.daylight),
    });
    this.add(this.view);
    for (let k = 0; k < STOREYS; k++) {
      const floor = landingY(k) - STOREY / 2;
      const y = floor + sill + height / 2;
      const pane = this.view.pane(width, height);
      pane.position.set(x, y, z + 0.004);
      this.add(pane);
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
  }

  /** The player walked in: what is out there is built now, at the next idle moment (`OutlookView.prefetch`). */
  setOccupied(occupied: boolean): void {
    if (occupied) this.view.prefetch();
  }

  update(dt: number): void {
    this.view.update(dt);
  }

  dispose(): void {
    this.view.dispose();
  }
}
