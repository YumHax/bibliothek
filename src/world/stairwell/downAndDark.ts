import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import { FLAT } from '@/world/zoneIds';
import { Blackout } from '@/building/blackout';
import { setBuildingCircuit } from '@/building/mains';
import { Prop } from '../props/Prop';
import type { Updatable } from '@/core/Engine';
import type { Lift } from './Lift';
import type { Staircase } from './Staircase';
import type { StairLights } from './StairLights';
import { EndlessStairs } from './endless/EndlessStairs';
import { FuseBox } from './powerCut/FuseBox';
import { PowerCutScene } from './powerCut/PowerCutScene';
import { POWER_CUT_PLAN } from './powerCut/powerCutPlan';

/** The zones the building's mains feed (`building/mains`) besides the flat and its stairs: the rooms joined to it, the neighbours' flats, the cellars, the attic. */
const ALSO_ON_CIRCUIT = ['annex', 'annexStudy', 'neighbourFlat', 'cellar', 'attic'];

/** What the stairwell hands over: its parts, and the people on the stairs (the residents, the postman). */
interface StairParts {
  stairs: Staircase;
  lift: Lift;
  lights: StairLights;
  walkers: readonly { readonly isPresent: boolean }[];
}

/** The stairwell's handle's share: how the endless stairs move the player (wired in `bootstrap/world.ts`). */
export interface DownAndDark {
  connectPlayer(shift: (dy: number) => void): void;
  /** The door of the resident stuck in the lift by a power cut (`doorKey`), or null. */
  strandedDoor(): string | null;
}

let endless: EndlessStairs | null = null;

/**
 * The stairwell at night and in the dark (docs/zones.md "The stairwell"): the building's power cut (`building/blackout`
 * ticked here, the stairwell's zone being always active; its candles, its residents out on the landings, the lift
 * stuck with Mrs Moreau: `powerCut/`), the meters cupboard in the hall whose main fuse brings the power back, and the
 * endless stairs of some nights (`endless/`).
 */
export function placeDownAndDark(zone: Zone, { sky, listener, today, home, social }: Pick<BuildContext, 'sky' | 'listener' | 'today' | 'home' | 'social'>, parts: StairParts): DownAndDark {
  const { stairs, lift, lights, walkers } = parts;
  // Read here, not at the module's top: `worldPlan` imports half the world, a cycle must not find it unset.
  setBuildingCircuit([...FLAT, ...ALSO_ON_CIRCUIT]);
  const eye = new THREE.Vector3();
  const inCar = (local: THREE.Vector3): boolean => lift.floorAt(local.x, local.z, local.y - 1.7) !== null;
  const blackout = new Blackout({
    weatherKind: () => sky.weather.state.kind,
    strikes: () => sky.weather.state.strikes,
    hours: () => sky.dayNight.state.hours,
    gameDay: () => today.gameDay,
    // Never with the player shut in the car: the lift would hold them till the power came back.
    canCut: () => !inCar(zone.group.worldToLocal(listener.getWorldPosition(eye))),
  });
  zone.place(new BlackoutClock(blackout), new THREE.Vector3());

  const scene = zone.place(new PowerCutScene({ viewer: listener, lights, lift, collisions: zone.collisions, day: () => today.gameDay, social }), new THREE.Vector3());
  for (const walker of scene.walkers) zone.place(walker, walker.position.clone());
  const [fx, fy, fz] = POWER_CUT_PLAN.fuseBox.at;
  zone.place(new FuseBox(POWER_CUT_PLAN.fuse), new THREE.Vector3(fx, fy, fz), Math.PI / 2);

  endless = zone.place(
    new EndlessStairs({
      viewer: listener,
      stairs,
      lights,
      hours: () => sky.dayNight.state.hours,
      gameDay: () => today.gameDay,
      someoneAbout: () => walkers.some((w) => w.isPresent),
      inLift: inCar,
      notices: home.household?.notices,
    }),
    new THREE.Vector3(),
  );
  const { at, yaw } = endless.doorPlace;
  zone.place(endless.door, at, yaw);
  const placed = endless;
  return { connectPlayer: (shift) => placed.connectPlayer(shift), strandedDoor: () => scene.strandedDoor };
}

/** `?debug`: tonight the stairs go round (it starts once the player sets off down from our landing). */
export function forceEndlessStairs(): void {
  endless?.force();
}

/** Ticks the building's blackout with the stairwell (always active): a prop with nothing to show. */
class BlackoutClock extends Prop implements Updatable {
  readonly contactShadow = false;
  /** The weather's strikes are missed if it slept through them: every frame. */
  readonly tickEveryFrame = true;

  constructor(private readonly blackout: Blackout) {
    super();
    this.name = 'BlackoutClock';
  }

  update(dt: number): void {
    this.blackout.update(dt);
  }
}
