import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import type { Room } from '../Room';
import type { Shelving } from '../shelving/Shelving';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight } from '../build/roomParts';
import { floorPointsToWorld } from '../zone/attach';
import { STUDY_PLAN } from './annexPlan';
import { STUDY_OVERFLOW, annexSplit, placeAnnexShelving } from './annexShelves';
import { OldFrontDoor } from './OldFrontDoor';

/** What the study built: its room, its two bookcases. */
interface StudyHandle extends ZoneHandle {
  room: Room;
  shelving: Shelving | null;
}

/**
 * Builds Mrs Roux's study into its zone from `STUDY_PLAN`: the shell (no window: it backs onto the stairs), a flush
 * light and its switch inside the door from the new room (which hangs it), her old front door seen from inside
 * (locked), a radiator, and the last two of the annex's bookcases (the new room's leftovers).
 */
export function furnishStudy(zone: Zone, ctx: Pick<BuildContext, 'sky' | 'covers' | 'collection' | 'home' | 'listener' | 'acoustics'>): StudyHandle {
  const plan = STUDY_PLAN;
  const room = furnishShell(zone, ctx.sky, plan.room);
  // Off to start (a flush light starts lit): nobody is in here before the wall is down.
  placeRoomLight(zone, room, 'flush', plan.ceilingLight, plan.lightSwitch).setOn(false);
  zone.placeAt(new OldFrontDoor(plan.oldDoorColor), plan.oldDoor);
  furnishDecor(zone, ctx, plan.decor);
  const shelving = placeAnnexShelving(zone, ctx, {
    id: 'annexStudy',
    room: plan.room,
    slots: plan.shelving.here,
    width: plan.shelving.width,
    source: STUDY_OVERFLOW,
    count: (bought) => annexSplit(bought).study,
  });
  return { room, shelving, catVisits: floorPointsToWorld(zone, plan.catVisits) };
}
