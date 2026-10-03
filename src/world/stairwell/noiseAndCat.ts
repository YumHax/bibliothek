import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import { NeighboursThroughWalls } from '@/building/throughWalls';
import { NoiseWatch } from '@/building/noiseComplaints';
import { NEIGHBOUR_NOISE } from '@/building/neighbourNoisePlan';
import { mainsOn } from '@/building/mains';
import { CAT_OUTING } from '../cat/catOutingPlan';
import { DoorVisitor } from './DoorVisitor';
import { BuildingSpaces, flatStairwellRoute } from './flatHeard';
import type { StairWalkerOptions } from './StairWalker';
import { STAIRWELL_PLAN as plan, landingY } from './stairwellPlan';

/** What the cat's outings need of the stairwell (`world/cat/escapes`, wired in `bootstrap/world.ts`). */
export interface StairLife {
  /** World position of the stairwell zone's origin. */
  origin: THREE.Vector3;
  /** Mrs Dubois, who brings the cat back from in her flat. */
  catReturner: DoorVisitor;
  /** Whether whoever lives behind a door (its key) is in. */
  isHome: (key: string) => boolean;
  /** Where things are, building-wise (the flat, the stairwell). */
  spaces: BuildingSpaces;
}

/**
 * The flat and the building hearing each other (`stairwell/flatHeard`: round through the front
 * door and down the well, for every sound of both), the neighbours heard from the flat through the
 * floor and the ceiling (`building/throughWalls`), the downstairs neighbour minding the flat's noise
 * after ten (`building/noiseComplaints`, him coming up to the door), and Mrs Dubois, who brings the
 * cat back when it got into her flat. Placed by `furnishStairwell`.
 */
export function placeNoiseAndCatWays(zone: Zone, ctx: Pick<BuildContext, 'listener' | 'acoustics' | 'sky' | 'today' | 'building' | 'home'>, people: { ground: StairWalkerOptions['ground']; isHome: (key: string) => boolean }): StairLife | null {
  const { listener, acoustics, sky, today, building, home } = ctx;
  const origin = zone.group.position.clone();
  const spaces = new BuildingSpaces(origin);
  zone.onUnload(acoustics.addRoute(flatStairwellRoute(spaces)));
  const hours = () => sky.dayNight.state.hours;
  const day = () => today.gameDay;
  const inFlat = (p: THREE.Vector3) => spaces.inFlat(p);
  zone.place(new NeighboursThroughWalls({ listener, inFlat, hours, day, isHome: people.isHome, powered: mainsOn }), new THREE.Vector3());

  // Who comes up to the door (the building's doorstep: no doorstep, nobody): the neighbour from under the living room, Mrs Dubois with the cat.
  if (!building) return null;
  const door = zone.toWorld(new THREE.Vector3(plan.strip.x0 + 0.05, landingY(0) + 1.1, plan.frontDoor.z));
  const visitor = (seed: number): DoorVisitor => {
    const v = zone.place(new DoorVisitor({ viewer: listener, doorstep: building.doorstep, ground: people.ground, acoustics, door, seed }), new THREE.Vector3());
    zone.place(v.walker, v.walker.position.clone());
    return v;
  };
  const complainer = visitor(NEIGHBOUR_NOISE.complainer.seed);
  const catReturner = visitor(CAT_OUTING.neighbour.seed);
  const notices = home.household?.notices;
  zone.place(new NoiseWatch({ listener, inFlat, visitor: complainer, slipNote: (piece) => building.doorstep.slipNote(piece), hours, day, ...(notices ? { notices } : {}) }), new THREE.Vector3());
  return { origin, catReturner, isHome: people.isHome, spaces };
}
