import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { furnishShell } from '../shell';
import { placeClock, placeRoomLight } from '../build/roomParts';
import { curtainsToSkylight } from '../build/follow';
import { heardBy } from '../build/hearing';
import { resolvePlacement } from '../Placement';
import { RoomWindow } from '../props/Window';
import { SideTable } from '../props/SideTable';
import { Doormat } from '../props/Doormat';
import { Seat } from '../Seat';
import { Television } from '../Television';
import { TravelDoor } from '../travel/TravelDoor';
import { rugsUnderfoot } from '../build/rugsUnderfoot';
import { Vestibule } from './Vestibule';
import { FavouriteGame } from './FavouriteGame';
import { FlatDressing } from './FlatDressing';
import { leaveFor } from './visits';
import { NEIGHBOUR_FLAT_PLAN as plan } from './neighbourFlatPlan';
import { FlatOutlook } from './FlatOutlook';
import { buildingWindowLife } from '@/building/rearWindows';

/**
 * Builds the neighbours' flat from `NEIGHBOUR_FLAT_PLAN`: the shell (parquet, mouldings, the window without a sun
 * light of its own, the view through it the one from the host's real flat: `FlatOutlook`), the ceiling lamp and its
 * switch, the vestibule inside the door, the door back onto the landing (in front of whoever's door it is: `visits.leaveFor`), a clock ticking, the TV with the side
 * table where the favourite game lies, the two armchairs facing it; then the dressing for whoever lives here now
 * (`FlatDressing`: their paint, furniture, shelf of their own games, themselves). One lamp, the TV's glow and nothing
 * else lights it, whoever the host: the scene's light count never changes with them.
 */
export function furnishNeighbourFlat(zone: Zone, ctx: Pick<BuildContext, 'sky' | 'cssLayer' | 'covers' | 'listener' | 'acoustics' | 'today' | 'building' | 'collection' | 'market' | 'social'>): ZoneHandle {
  const { sky, cssLayer, covers, listener, today } = ctx;
  const room = furnishShell(zone, sky, plan.room);
  placeRoomLight(zone, room, 'pendant', plan.lamp.at, plan.lamp.switchAt);
  // The window looks out from where the host's flat really is in the building (`FlatOutlook`), not the panorama.
  const windowLife = buildingWindowLife({ day: () => today.gameDay, hours: () => sky.dayNight.state.hours });
  const outlook = zone.place(new FlatOutlook({ dayNight: sky.dayNight, outdoors: sky.outdoors, viewer: listener as THREE.Camera, windowLife }), new THREE.Vector3());
  const windows: RoomWindow[] = [];
  const { width, height } = plan.window;
  windows.push(zone.placeAt(new RoomWindow(sky.outdoors, { width, height, sunlight: false, glass: outlook.glass, onCurtainsChange: curtainsToSkylight(room, windows) }), { wall: plan.window.wall, along: plan.window.along, y: RoomWindow.mountY(height) }));
  const vestibule = zone.place(new Vestibule(), new THREE.Vector3());
  zone.placeAt(new Doormat({ width: 0.8, depth: 0.5 }), { floor: [plan.arrival.at[0], plan.room.depth / 2 - 0.35] });
  placeClock(zone, ctx, { wall: 'front', along: 1.2, y: 2.15 });

  // The TV and its side table (the favourite game on it), the armchairs facing it.
  const tv = zone.placeAt(new Television(cssLayer, heardBy(ctx)), plan.tv.at);
  const table = zone.placeAt(new SideTable({ radius: 0.3, covers: [], mug: 0xe8e2d4 }), plan.sideTable.at);
  zone.placeAt(new Seat(), plan.seats.player);
  const hostSeat = zone.placeAt(new Seat(), plan.seats.host);
  let dressing: FlatDressing | null = null;
  const favourite = new FavouriteGame({ covers, screen: tv, who: () => dressing?.host.who ?? 'them', onWatch: () => dressing?.watching() });
  zone.place(favourite, table.position.clone().add(new THREE.Vector3(-0.08, table.topHeight, -0.06)), 0);
  const tvAt = resolvePlacement(plan.room, plan.tv.at).position.clone().setY(1.0);
  dressing = zone.place(new FlatDressing(zone, ctx, { room, vestibule, favourite, tvAt, hostSeat }), new THREE.Vector3());

  // Out onto the landing, in front of their own door.
  const door = new TravelDoor({ style: 'entrance', mat: false, leafColor: 0xe8e2d4, label: 'Back to the landing · go out', to: 'stairwell', onGo: () => leaveFor(dressing!.host) });
  zone.placeAt(door, plan.door.at);
  return { room, surfaceAt: rugsUnderfoot(zone) };
}
