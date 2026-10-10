import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import type { Outdoors } from '../props/outdoors/Outdoors';
import { part } from '../props/Prop';
import { paint } from '../materials/palette';
import { FLOOR, WALL, gapAt, onSurface } from '../surface/layers';
import { additive } from '../materials/blend';
import { spillGlow } from '../materials/glowTextures';
import { DustMotes } from '../attic/collectorProps';
import { PaneReflection } from '../materials/paneReflection';
import { leaseHomeOutlook, type OutlookLease } from '../outlook/sharedOutlook';
import type { WindowLife } from '../street/windowLife';
import { STAIRWELL_PLAN as plan } from './stairwellPlan';
import { STOREY, STOREYS, landingY } from '@/world/measures/building';

/** How many of the landings' panes show the courtyard at once (the nearest to the eye). */
const LIVE = 2;
/** Seconds a pane takes to frost over or clear as it leaves or joins the nearest `LIVE` (no snap while climbing). */
const FROST_S = 0.3;
const FRAME = 0.05;
const FRAME_PAINT = paint(0xe6ddc8, 0.6);
const SILL = paint(0xb8ae9c, 0.7);
/** The thick back wall's reveal round each window (m), its sides splayed open into the stairwell (radians). */
const REVEAL = 0.3;
const SPLAY = 0.2;
const REVEAL_PAINT = paint(0xe0d8c6, 0.9);
/** The reveal's pieces stand this clear of the wall's plane (their backs would lie in it, seen from a landing away). */
const REVEAL_GAP = gapAt(4);
/** The daylight a window lays on its half landing and the dust in its beam (`update`: by the hour and the weather). */
const PATCH_WIDTH = 1.3;
const PATCH_DEPTH = 1.1;
const DAYLIGHT = new THREE.Color(0xfff1d8);

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
 * the weather; a painted frame with a glazing bar, set in a splayed plaster reveal with a stone sill across it, a soft
 * patch of daylight on the landing in front and dust turning in it. Nothing opens. The stairwell's frame (zone-local),
 * origin at its origin; never collides.
 */
export class StairWindows extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  /** The view from our building (`sharedOutlook`), shared with the flat's windows and the neighbours'. */
  private readonly lease: OutlookLease;
  /** Every landing's pane: the nearest `LIVE` show the courtyard (each a render of it), the rest frosted glass. */
  private readonly panes: THREE.Mesh[] = [];
  /** Over each pane, its frost fading in or out (`frost`: 0 the courtyard clear, 1 frosted). */
  private readonly frosts: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; frost: number }[] = [];
  private readonly frosted: THREE.MeshBasicMaterial;
  /** The patch of daylight each window lays on its landing (one material, its strength by the sky). */
  private readonly daylight = onSurface(
    additive(new THREE.MeshBasicMaterial({ map: spillGlow(64, 64, 1.6, 0.35), color: DAYLIGHT, depthWrite: false, fog: false })),
    FLOOR.glowPool,
  );
  private readonly motes: DustMotes[] = [];
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
      const frostMaterial = onSurface(new THREE.MeshBasicMaterial({ color: 0x8a9096, fog: false, transparent: true, depthWrite: false }), WALL.paneFrost);
      const frost = new THREE.Mesh(pane.geometry, frostMaterial);
      frost.name = 'StairPaneFrost';
      frost.position.set(x, y, z + WALL.paneFrost.lift);
      // Seen (clear) until the first tick, so `World.prime` compiles it with the rest.
      frostMaterial.opacity = 0;
      this.add(frost);
      this.frosts.push({ mesh: frost, material: frostMaterial, frost: k < LIVE ? 0 : 1 });
      const reflection = this.reflection.over(pane.geometry, z + WALL.pane.lift);
      reflection.position.x = x;
      reflection.position.y = y;
      this.add(reflection);
      part(this, FRAME, height + 2 * FRAME, 0.05, FRAME_PAINT, { x: x - width / 2 - FRAME / 2, y, z: z + 0.025 });
      part(this, FRAME, height + 2 * FRAME, 0.05, FRAME_PAINT, { x: x + width / 2 + FRAME / 2, y, z: z + 0.025 });
      part(this, width, FRAME, 0.05, FRAME_PAINT, { x, y: y + height / 2 + FRAME / 2, z: z + 0.025 });
      part(this, width, FRAME, 0.05, FRAME_PAINT, { x, y: y - height / 2 - FRAME / 2, z: z + 0.025 });
      part(this, 0.03, height, 0.03, FRAME_PAINT, { x, y, z: z + 0.015 });
      // The reveal: the wall's thickness round the frame, its sides splayed so the light comes in wide, a stone sill across it.
      const spread = REVEAL * Math.tan(SPLAY);
      const jamb = REVEAL / Math.cos(SPLAY);
      const edge = width / 2 + FRAME;
      for (const side of [-1, 1]) {
        const piece = part(this, 0.04, height + 2 * FRAME, jamb, REVEAL_PAINT, { x: x + side * (edge + spread / 2 + 0.02), y, z: z + REVEAL_GAP + REVEAL / 2 });
        piece.rotation.y = side * SPLAY;
      }
      part(this, 2 * (edge + spread) + 0.08, 0.04, REVEAL, REVEAL_PAINT, { x, y: y + height / 2 + FRAME + 0.02, z: z + REVEAL_GAP + REVEAL / 2 });
      part(this, 2 * (edge + spread) + 0.08, 0.04, REVEAL + 0.04, SILL, { x, y: y - height / 2 - FRAME - 0.02, z: z + (REVEAL + 0.04) / 2 });
      // The daylight on the landing in front of it, brightest under the sill; the dust turning in its beam.
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(PATCH_WIDTH, PATCH_DEPTH).rotateX(-Math.PI / 2), this.daylight);
      patch.name = 'StairDaylight';
      patch.position.set(x, floor + FLOOR.glowPool.lift, z + REVEAL + PATCH_DEPTH / 2);
      this.add(patch);
      const motes = new DustMotes(width * 0.9, 0.9, height + 0.6, 90);
      motes.position.set(x, floor + sill - 0.3, z + REVEAL + 0.5);
      (motes.material as THREE.PointsMaterial).opacity = 0;
      this.motes.push(motes);
      this.add(motes);
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
      // Joining the nearest: the courtyard at once under the frost, which clears; leaving: the frost comes over it,
      // and once it is whole the pane goes back to the plain frosted glass (no render of the courtyard behind it).
      const f = this.frosts[i]!;
      const wanted = rank < LIVE ? 0 : 1;
      const step = dt / FROST_S;
      f.frost = wanted > f.frost ? Math.min(wanted, f.frost + step) : Math.max(wanted, f.frost - step);
      const live = wanted === 0 || f.frost < 1;
      this.panes[i]!.material = live ? this.live : this.frosted;
      f.mesh.visible = live && f.frost > 0;
      f.material.opacity = f.frost;
    }
    this.frosted.color.copy(this.sky());
    for (const f of this.frosts) f.material.color.copy(this.frosted.color);
    // Daylight through the courtyard windows: a soft patch on each landing, a little sun in it on a clear day.
    const s = this.dayNight.state;
    const light = s.daylight * (0.35 + 0.65 * s.sunThrough);
    this.daylight.opacity = 0.16 * light;
    for (const motes of this.motes) {
      (motes.material as THREE.PointsMaterial).opacity = 0.5 * light * s.sunThrough;
      if (s.sunThrough > 0.05 && Math.abs(motes.position.y - eyeY) < STOREY * 1.5) motes.update(dt);
    }
    this.reflection.set(this.dayNight.state.daylight);
  }

  dispose(): void {
    for (const f of this.frosts) f.material.dispose();
    this.daylight.dispose();
    for (const pane of this.panes) this.lease.view.release(pane);
    this.lease.release();
  }
}
