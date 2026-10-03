import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { Today } from '@/time/Today';
import { TravelDoor } from '../travel/TravelDoor';
import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan';
import { pinSource } from '@/building/boardNotes';
import { partyNotes } from '@/building/neighboursParty';

/** The yard door's paint, on both sides (the courtyard's `backDoor` too). */
export const YARD_DOOR_COLOUR = 0x2f4a3a;

/**
 * The stairwell's side of the way into the courtyard (`STAIRWELL_PLAN.courtyardDoor`): a panelled door at the foot of
 * the stairs that takes the player out into the yard (a travel door: the courtyard is a zone of its own, built only
 * when visited). Also pins the party's poster on the hall's noticeboard (`building/neighboursParty.partyNotes`). Kept
 * out of the courtyard's builder so the flat's chunk does not pull the yard in.
 */
export function placeCourtyardDoor(zone: Zone, today: Today): void {
  const { at, yaw, width, height } = STAIRWELL_PLAN.courtyardDoor;
  zone.place(new TravelDoor({ style: 'panelled', width, height, leafColor: YARD_DOOR_COLOUR, label: 'The courtyard · go out', to: 'courtyard' }), new THREE.Vector3(at[0], 0, at[1]), yaw);
  zone.onUnload(pinSource('neighboursParty', (day) => partyNotes(day, today.realDate())));
}
