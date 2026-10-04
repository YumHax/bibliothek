import * as THREE from 'three';
import { annexJoined, bindRouxMove, onRouxPhase, rouxGone } from '@/building/rouxMove';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import type { Room } from '../Room';
import type { Shelving } from '../shelving/Shelving';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight } from '../build/roomParts';
import { curtainsToSkylight } from '../build/follow';
import { RoomWindow } from '../props/Window';
import { homeOutlook } from '../outlook/sharedOutlook';
import { reportFlatRoom } from '../city/flatWindows';
import { floorPointsToWorld } from '../zone/attach';
import { resolvePlacement } from '../Placement';
import { ANNEX_OPENING, ANNEX_PLAN } from './annexPlan';
import { ANNEX_PASSAGE } from './annexPassage';
import { ANNEX_OVERFLOW, STUDY_OVERFLOW, annexSplit, placeAnnexShelving } from './annexShelves';
import { Fireplace } from './Fireplace';

/** What the new room built that the rest of the game needs: its room, its bookcases, where the cat comes to look. */
interface AnnexHandle extends ZoneHandle {
  room: Room;
  shelving: Shelving | null;
}

/** Half the depth of the opening's portal box through the wall (as `furnishShell`'s). */
const PORTAL_HALF_DEPTH = 0.15;
/** Mrs Roux's evenings, as the street sees her windows before she leaves: lit from when she is home till her bedtime. */
const HER_EVENING = { from: 17, to: 23 };

/**
 * Builds Mrs Roux's front room into its zone from `ANNEX_PLAN`: the shell (her paint, the parquet), her pendant and its
 * switch, the two French windows on Front Street, the marble fireplace with her note, the radiator, and the bookcases
 * the flat gains once it is joined (`placeAnnexShelving`: the bedroom's leftovers, then the study's). The opening to the
 * collection room is a portal shut till the wall is down (`ANNEX_PASSAGE`); its plaster, sheet and archway are the
 * collection room's (`AnnexOpening`). Part of the flat from the start (its lights compiled with it); until it is
 * joined nobody can see or reach it, and the street sees her windows lit of an evening.
 */
export function furnishAnnex(zone: Zone, ctx: BuildContext): AnnexHandle {
  const { sky, home } = ctx;
  const plan = ANNEX_PLAN;
  if (home.upgrades) bindRouxMove({ today: ctx.today, upgrades: home.upgrades, ...(ctx.building ? { doorstep: ctx.building.doorstep } : {}) });
  const room = furnishShell(zone, sky, plan.room);
  zone.addPortal({ to: 'living', bounds: openingBounds(zone), door: ANNEX_PASSAGE });
  placeRoomLight(zone, room, 'pendant', plan.pendant, plan.lightSwitch);

  const { size, along } = plan.windows;
  const windows: RoomWindow[] = [];
  const onCurtainsChange = curtainsToSkylight(room, windows);
  for (const x of along) windows.push(zone.placeAt(new RoomWindow(sky.outdoors, { ...size, onCurtainsChange, outlook: homeOutlook(sky.outdoors) }), { wall: 'front', along: x, y: RoomWindow.mountY(size.height) }));

  zone.placeAt(
    new Fireplace(
      {
        title: 'On the mantelpiece',
        text: 'For the young man next door. These two rooms and yours were one flat when we came, in 1985: the door in the wall was ours to the dining room. Fill them with your little boxes, and keep the parquet waxed. — Hélène Roux',
      },
      plan.mantel,
    ),
    plan.fireplace,
  );
  furnishDecor(zone, ctx, plan.decor);
  const shelving = placeAnnexShelving(zone, ctx, {
    id: 'annex',
    room: plan.room,
    slots: plan.shelving.here,
    width: plan.shelving.width,
    source: ANNEX_OVERFLOW,
    overflow: STUDY_OVERFLOW,
    count: (bought) => annexSplit(bought).room,
  });

  // The street sees her windows lit of an evening while she lives here, dark once she has gone, ours once joined.
  const hours = (): number => sky.dayNight.state.hours;
  reportFlatRoom(zone.id, {
    get lampShown() {
      if (annexJoined()) return room.lampShown;
      return !rouxGone() && hours() >= HER_EVENING.from && hours() < HER_EVENING.to ? 1 : 0;
    },
    get curtainsOpen() {
      return annexJoined() ? room.curtainsOpen : 0.4;
    },
  });
  // The day it is joined: the news, wherever the player is.
  const notices = home.household?.notices;
  if (notices) {
    zone.onUnload(
      onRouxPhase((phase) => {
        if (phase === 'joined') notices.reward({ title: 'Two more rooms', detail: 'The wall is down: Mrs Roux’s flat is part of yours. More room for bookcases.', big: true });
      }),
    );
  }
  return { room, shelving, catVisits: floorPointsToWorld(zone, plan.catVisits) };
}

/** World box of the opening through the left wall (the gap to the collection room and a step either side). */
function openingBounds(zone: Zone): THREE.Box3 {
  const { position } = resolvePlacement(ANNEX_PLAN.room, { wall: ANNEX_OPENING.wall, along: ANNEX_OPENING.along, y: 0 });
  const half = new THREE.Vector3(PORTAL_HALF_DEPTH, 0, ANNEX_OPENING.width / 2);
  return new THREE.Box3(position.clone().sub(half), position.clone().add(half).setY(ANNEX_OPENING.height)).applyMatrix4(zone.group.matrixWorld);
}
