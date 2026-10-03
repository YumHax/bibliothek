import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import type { Outdoors } from '../props/outdoors/Outdoors';
import type { WindowLife } from '../street/windowLife';
import { OutlookView } from '../outlook/OutlookView';
import { RoomWindow } from '../props/Window';
import { landingY } from '../stairwell/stairwellPlan';
import { currentHost, onHostChange } from './visits';
import { NEIGHBOUR_FLAT_PLAN as plan, type NeighbourHost } from './neighbourFlatPlan';

type Side = keyof typeof plan.outlook;

export interface FlatOutlookOptions {
  dayNight: DayNight;
  outdoors: Outdoors;
  /** The main camera, the view through the glass is rendered from. */
  viewer: THREE.Camera;
  /** Whose homes the lit windows across are (`building/rearWindows`); none: the curfews. */
  windowLife?: WindowLife;
}

/**
 * The view out of the neighbours' flat: the one from where the host's flat really is in our building, at their floor
 * (`landingY(k)`), on their side of it (`NeighbourHost.side`: the courtyard, or Front Street), built in 3D through the
 * glass like the stairwell's windows (`outlook/`). The zone is far out along +x and shared by six flats, so the
 * shared panorama (whose eye is our living room) would show nonsense: the window's `glass` is this one's panes
 * instead. One view a side (each built from where its window is, only once its pane is seen), one pane each, the
 * host's side's shown; a change of host (`onHostChange`) moves the eye to their floor. Placed at the zone's origin,
 * ticks the views; `glass` goes to the `RoomWindow`.
 */
export class FlatOutlook extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  /** The panes, for the window (`RoomWindow`'s `glass`): one a side, only the host's shown. */
  readonly glass = new THREE.Group();
  private readonly views = {} as Record<Side, { view: OutlookView; pane: THREE.Mesh }>;
  /** The real window's frame in the street's (its glass's middle, +z into the flat), for the host now. */
  private readonly target = new THREE.Matrix4();
  private readonly toStreet = new THREE.Matrix4();
  private side: Side = 'courtyard';
  private occupied = false;
  private readonly unsubscribe: () => void;

  constructor({ dayNight, outdoors, viewer, windowLife }: FlatOutlookOptions) {
    super();
    this.name = 'FlatOutlook';
    const { width, height } = plan.window;
    const waiting = new THREE.Color();
    for (const side of Object.keys(plan.outlook) as Side[]) {
      const { at, without } = plan.outlook[side];
      const view = new OutlookView({
        viewer,
        // World to the street: back through the glass (the window in the zone), out of the real one.
        toOutlook: () => this.toStreet.copy(this.glass.matrixWorld).invert().premultiply(this.target),
        build: (camera) =>
          import('../outlook/streetOutlook').then(({ buildStreetOutlook }) =>
            buildStreetOutlook(camera, { dayNight, lightDirection: (out) => outdoors.lightDirection(dayNight.state, out), eye: at, without, ...(windowLife ? { windowLife } : {}) }),
          ),
        waiting: () => waiting.copy(dayNight.state.horizon).multiplyScalar(0.25 + 0.6 * dayNight.state.daylight),
      });
      this.add(view);
      const pane = view.pane(width, height);
      this.glass.add(pane);
      this.views[side] = { view, pane };
    }
    this.lookFrom(currentHost());
    this.unsubscribe = onHostChange((host) => this.lookFrom(host));
  }

  /** The host's window: their side's pane shown, the eye at their floor. */
  private lookFrom(host: NeighbourHost): void {
    this.side = host.side ?? 'courtyard';
    const { at, out } = plan.outlook[this.side];
    // The glass's middle stands as high over their floor as over this flat's (the zone's floor is at its origin).
    const y = landingY(host.k) + RoomWindow.mountY(plan.window.height);
    // +z into the flat: away from the courtyard (out -z), or turned round on the street side (out +z).
    this.target.makeRotationY(out > 0 ? Math.PI : 0).setPosition(at[0], y, at[1]);
    for (const side of Object.keys(this.views) as Side[]) this.views[side].pane.visible = side === this.side;
    if (this.occupied) this.views[this.side].view.prefetch();
  }

  /** The player walked in: the host's view is built now, at the next idle moment (`OutlookView.prefetch`). */
  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    if (occupied) this.views[this.side].view.prefetch();
  }

  update(dt: number): void {
    // The other side's view is idle unless it was drawn lately (a change of host): its update frees it in time.
    for (const side of Object.keys(this.views) as Side[]) this.views[side].view.update(dt);
  }

  dispose(): void {
    this.unsubscribe();
    for (const side of Object.keys(this.views) as Side[]) this.views[side].view.dispose();
  }
}
