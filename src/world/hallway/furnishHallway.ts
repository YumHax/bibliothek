import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../layout';
import { furnishShell } from '../shell';
import { FlushLamp } from '../props/FlushLamp';
import { WallSwitch } from '../props/WallSwitch';
import { HallConsole } from '../props/HallConsole';
import { CoatRack } from '../props/CoatRack';
import { TravelDoor } from '../travel/TravelDoor';
import { placeDecor } from '../props/decor';
import { HALLWAY_PLAN } from './hallwayPlan';

/**
 * Builds the flat's hallway into its zone from `HALLWAY_PLAN`: the corridor shell with its doors
 * (bathroom, bedroom, kitchen), the flush light, the console and the coat corner by the entrance,
 * the entrance itself (a `TravelDoor`: clicking it offers the arcade and the market), then the runner and the picture.
 */
export function furnishHallway(zone: Zone, { sky }: BuildContext): ZoneHandle {
  const plan = HALLWAY_PLAN;
  const room = furnishShell(zone, sky, plan.room, { leafColor: plan.leafColor });
  const light = zone.placeAt(new FlushLamp({ onSwitch: (on) => room.setLampOn(on) }), plan.light);
  zone.placeAt(new WallSwitch({ lamp: light }), plan.lightSwitch);
  zone.placeAt(new HallConsole({ width: 0.8 }), plan.console);
  zone.placeAt(new CoatRack(), plan.coatRack);
  zone.placeAt(new TravelDoor({ style: 'entrance', label: 'Click to go out' }), plan.entrance);
  placeDecor(zone, plan.decor);
  return { room };
}
