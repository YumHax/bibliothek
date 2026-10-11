import * as THREE from 'three';
import type { BuildContext, ZoneHandle } from '../buildContext';
import type { Zone } from '../zone/Zone';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight } from '../build/roomParts';
import { pointSound } from '../build/hearing';
import { TravelDoor } from '../travel/TravelDoor';
import { DoorDog } from '../stairwell/stairSounds';
import { FerrandDoor } from './FerrandDoor';
import { LINDEN_LANDING_PLAN as PLAN } from './lindenLandingPlan';

/**
 * Builds Mémé's landing at number 14 (docs/grandma.md "Around her flat"): the stone-floored landing outside her door,
 * her door itself (hung here, opening into her flat: the two zones are walked between), Mr Ferrand's across, the
 * glazed door of the stairs down to Linden Avenue, the light on its button, and Biscotte barking down the well.
 */
export function furnishLindenLanding(zone: Zone, ctx: BuildContext): ZoneHandle {
  const room = furnishShell(zone, ctx.sky, PLAN.room, { leafColor: 0x7a4a2a, fixedDaylight: 0.35 });
  placeRoomLight(zone, room, 'flush', PLAN.light, PLAN.lightSwitch);
  zone.placeAt(new TravelDoor({ style: 'glazed', label: 'The stairs · down to Linden Avenue', to: 'lindenAvenue' }), PLAN.stairs);
  zone.placeAt(new FerrandDoor({ colour: PLAN.ferrand.colour, mat: PLAN.ferrand.mat }), PLAN.ferrand.at);
  furnishDecor(zone, ctx, PLAN.decor);
  // Mrs Bassot's dog, a floor down, at her radiator.
  const [x, y, z] = PLAN.barking;
  zone.place(pointSound(ctx, new DoorDog(), { referenceDistance: 0.8, rolloff: 1.2, maxDistance: 7 }), new THREE.Vector3(x, y, z));
  return { room };
}
