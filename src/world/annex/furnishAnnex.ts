import * as THREE from 'three';
import { annexJoined, onRouxPhase, rouxGone, rouxPhase } from '@/building/rouxMove';
import type { Zone } from '../zone/Zone';
import { ANNEX_DOORWAY } from '../roomPlan';
import { AnnexOpening } from './AnnexOpening';
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
import { Fireplace, HEARTH_TOP } from './Fireplace';
import { FelixShoebox, markShoeboxTaken } from './FelixShoebox';
import { StockItem } from '@/economy/StockItem';
import { FELIX_LOTS, felixCopy, felixLotGame } from '@/economy/felixLots';
import { canonicalGameId } from '@/catalog';
import { ForSaleBox } from '../market/ForSaleBox';

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
 * The collection room's side of the opening to Mrs Roux's two rooms: the walled-up door, the works' sheet, the
 * archway; its collider in the room's scoped set. Called by the collection room's builder (`layout.ts`); the prop
 * gets the doorway's size from here, the room plan's `ANNEX_DOORWAY`, and reads no plan itself. The move it shows is
 * bound once at boot (`bindRouxMove`, `bootstrap/world`).
 */
export function placeAnnexOpening(zone: Zone, ctx: Pick<BuildContext, 'sky'>): AnnexOpening {
  const opening = new AnnexOpening({ collisions: zone.collisions, hours: () => ctx.sky.dayNight.state.hours, doorway: ANNEX_DOORWAY });
  zone.placeAt(opening, { wall: ANNEX_DOORWAY.wall, along: ANNEX_DOORWAY.along, y: 0 });
  opening.show(rouxPhase());
  zone.onUnload(onRouxPhase((phase) => opening.show(phase)));
  return opening;
}

/**
 * Builds Mrs Roux's front room into its zone from `ANNEX_PLAN`: the shell (her paint, the parquet), her pendant and its
 * switch, the two French windows on Front Street, the marble fireplace with her note, the radiator, and the bookcases
 * the flat gains once it is joined (`placeAnnexShelving`: the bedroom's leftovers, then the study's). The opening to the
 * collection room is a portal shut till the wall is down (`ANNEX_PASSAGE`); its plaster, sheet and archway are the
 * collection room's (`AnnexOpening`). Part of the flat from the start (its lights compiled with it); until it is
 * joined nobody can see or reach it, and the street sees her windows lit of an evening.
 */
export function furnishAnnex(zone: Zone, ctx: Pick<BuildContext, 'sky' | 'home' | 'covers' | 'collection' | 'listener' | 'acoustics' | 'money'>): AnnexHandle {
  const { sky, home } = ctx;
  const plan = ANNEX_PLAN;
  const room = furnishShell(zone, sky, plan.room);
  zone.addPortal({ to: 'living', bounds: openingBounds(zone), door: ANNEX_PASSAGE });
  placeRoomLight(zone, room, 'pendant', plan.pendant, plan.lightSwitch);

  const { size, along } = plan.windows;
  const windows: RoomWindow[] = [];
  const onCurtainsChange = curtainsToSkylight(room, windows);
  for (const x of along) windows.push(zone.placeAt(new RoomWindow(sky.outdoors, { ...size, onCurtainsChange, outlook: homeOutlook(sky.outdoors) }), { wall: 'front', along: x, y: RoomWindow.mountY(size.height) }));

  const fireplace = zone.placeAt(
    new Fireplace(
      {
        title: 'On the mantelpiece',
        text: 'For my neighbour next door. These two rooms and yours were one flat when we came, in 1985: the door in the wall was ours to the dining room. Fill them with your little boxes, and keep the parquet waxed. — Hélène Roux',
      },
      plan.mantel,
    ),
    plan.fireplace,
  );
  placeShoebox(zone, ctx, fireplace);
  // Her mantel holds two boxes face out, like the display case (docs/furnishing.md "Displays"), once the rooms are ours.
  const { showcases, boxes } = ctx.collection;
  if (showcases && boxes) {
    zone.onUnload(showcases.register(zone, 'mantel', fireplace, boxes, annexJoined));
    zone.onUnload(onRouxPhase(() => showcases.refresh()));
  }
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
        if (phase === 'joined') notices.reward({ title: 'Two more rooms', detail: 'The wall is down: Mrs Roux’s flat is part of yours.', big: true });
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

/**
 * Félix's shoebox on her hearth (`ANNEX_PLAN.shoebox`, docs/story.md Act 3): her note read with a click, and the first
 * time on each visit until it is taken, one of his own copies (`economy/felixLots`, one the player lacks) set out on the
 * marble beside it, free (a `ForSaleBox`), gone once taken.
 */
function placeShoebox(zone: Zone, { covers, collection, money }: Pick<BuildContext, 'covers' | 'collection' | 'money'>, fireplace: THREE.Object3D): void {
  const { shoebox } = ANNEX_PLAN;
  const onHearth = (x: number, z: number): THREE.Vector3 => zone.toLocal(fireplace.localToWorld(new THREE.Vector3(x, HEARTH_TOP, z)));
  const box = zone.place(new FelixShoebox(shoebox.note), onHearth(...shoebox.at), fireplace.rotation.y + shoebox.yaw);
  box.onOpen = () => {
    // From the catalogue's end (the cellar's carton takes his from its start): never the same game in both.
    // The first one the player lacks is the cellar carton's (`furnishCellar`): never that one, even when it is the last.
    const missing = FELIX_LOTS.filter((l) => !collection.owns(canonicalGameId(l.id)) && felixLotGame(l));
    const lot = [...missing.slice(1)].reverse()[0];
    const game = lot && felixCopy(lot);
    if (!game) return;
    const item = new StockItem(game, 'complete', 'bin', { list: 0, final: true });
    const forSale = new ForSaleBox(item, covers, { pose: { kind: 'flat' }, tag: false, wallet: money.wallet, where: shoebox.where, free: true, isWanted: () => collection.isWanted(game.id), thanks: () => shoebox.said });
    forSale.onSold = () => {
      zone.remove(forSale);
      markShoeboxTaken();
    };
    zone.place(forSale, onHearth(...shoebox.gameAt), fireplace.rotation.y + 0.15);
  };
}
