import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import type { DayNight } from '../props/DayNight';
import type { Outdoors } from '../props/outdoors/Outdoors';
import type { WindowLife } from '../street/windowLife';
import type { FacadeSpec } from '../street/streetPlan';
import { OutlookView, type ToOutlook } from './OutlookView';
import { flatToStreet } from './frames';

/**
 * One street built for every window that looks onto it from the same building (`OutlookView` is the picture and
 * its contents; each window only adds its panes): the flat's rooms, the stairwell's landings and the neighbours'
 * flats all see Front Street and the courtyard from our building, so they share one view, `'home'`, counted by its
 * leases and freed with the last (a zone unloading releases its windows' leases). A view's own idle timer still frees
 * its scene while no pane of it is drawn (`FREE_AFTER_UNDRAWN`), to be built again when one is.
 */
export interface OutlookLease {
  readonly view: OutlookView;
  /** How the world maps into the street for this holder's panes (`OutlookView.pane`). */
  readonly toOutlook: ToOutlook;
  /** Done with it (the window's zone unloaded): the view goes with its last lease. */
  release(): void;
}

interface Entry {
  view: OutlookView;
  users: number;
}

const shared = new Map<string, Entry>();

function lease(key: string, make: () => OutlookView, toOutlook: ToOutlook): OutlookLease {
  let entry = shared.get(key);
  if (!entry) {
    entry = { view: make(), users: 0 };
    shared.set(key, entry);
  }
  entry.users++;
  const held = entry;
  let released = false;
  return {
    view: held.view,
    toOutlook,
    release() {
      if (released) return;
      released = true;
      held.users--;
      if (held.users > 0 || shared.get(key) !== held) return;
      shared.delete(key);
      held.view.dispose();
    },
  };
}

export interface HomeOutlookOptions {
  dayNight: DayNight;
  outdoors: Outdoors;
  /** The main camera, the view through the glass is rendered from. */
  viewer: THREE.Camera;
  /** Whose homes the lit windows across are (`building/rearWindows`): the first holder to know it hands it over. */
  windowLife?: WindowLife;
}

/** What the home view is built with, filled in by whichever holder knows it (the windows of the flat do not). */
const homeExtras: { windowLife?: WindowLife } = {};

/**
 * A lease on the view from our building (`homeFacades`). `toOutlook`: how the holder's panes map into the street (the
 * flat and the stairwell are where the street has them, `flatToStreet`; a neighbour's flat is a zone of its own,
 * its window laid on the real one: `windowAt`).
 */
export function leaseHomeOutlook(options: HomeOutlookOptions, toOutlook: ToOutlook = homeFrame): OutlookLease {
  if (options.windowLife) homeExtras.windowLife ??= options.windowLife;
  const { dayNight, outdoors, viewer } = options;
  const waiting = new THREE.Color();
  return lease(
    'home',
    () =>
      new OutlookView({
        viewer,
        build: (camera) =>
          Promise.all([import('./streetOutlook'), import('./inView')]).then(([{ buildStreetOutlook }, { homeFacades }]) =>
            buildStreetOutlook(camera, {
              dayNight,
              lightDirection: (out) => outdoors.lightDirection(dayNight.state, out),
              facades: homeFacades(),
              ...(homeExtras.windowLife ? { windowLife: homeExtras.windowLife } : {}),
            }),
          ),
        waiting: () => waiting.copy(dayNight.state.horizon).multiplyScalar(0.25 + 0.6 * dayNight.state.daylight),
        name: 'home',
      }),
    toOutlook,
  );
}

const FLAT_TO_STREET = flatToStreet();
/** The flat's frame (its rooms, the stairwell) to the street's. */
const homeFrame: ToOutlook = () => FLAT_TO_STREET;

/**
 * The flat's own windows onto the 3D street (medium and high; `low` keeps the painted panorama: null). For a
 * `RoomWindow`'s `outlook`.
 */
export function homeOutlook(outdoors: Outdoors): OutlookLease | null {
  if (!outdoors.viewer || !streetWindows()) return null;
  return leaseHomeOutlook({ dayNight: outdoors.dayNight, outdoors, viewer: outdoors.viewer as THREE.Camera });
}

/** Whether windows show the 3D street (medium, high) rather than the painted panorama (low: a second render is too dear). */
export function streetWindows(): boolean {
  return QUALITY.level !== 'low';
}

export interface ElsewhereOutlookOptions {
  dayNight: DayNight;
  outdoors: Outdoors;
  viewer: THREE.Camera;
  /** Names the view (one per place: `'seller'`); holders of the same key share it. */
  key: string;
  /** The facades seen from there (`facadesInView`). */
  facades: () => readonly FacadeSpec[];
}

/**
 * A window in a zone far from where it really looks out (the seller's flat on Front Street): its panes laid on a
 * window of the street, `frame` (its glass's middle, +z into the room, in the street's frame).
 */
export function leaseOutlookFrom(options: ElsewhereOutlookOptions, frame: THREE.Matrix4): OutlookLease {
  const { dayNight, outdoors, viewer, key, facades } = options;
  const waiting = new THREE.Color();
  return lease(
    key,
    () =>
      new OutlookView({
        viewer,
        build: (camera) =>
          import('./streetOutlook').then(({ buildStreetOutlook }) =>
            buildStreetOutlook(camera, { dayNight, lightDirection: (out) => outdoors.lightDirection(dayNight.state, out), facades: facades() }),
          ),
        waiting: () => waiting.copy(dayNight.state.horizon).multiplyScalar(0.25 + 0.6 * dayNight.state.daylight),
        name: key,
      }),
    windowAt(frame),
  );
}

/** A pane's world frame to the street's, its glass laid on `frame` (the real window's glass, +z into the room). */
export function windowAt(frame: THREE.Matrix4): ToOutlook {
  const out = new THREE.Matrix4();
  return (pane) => out.copy(pane.matrixWorld).invert().premultiply(frame);
}
