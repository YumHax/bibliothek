import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../layout';
import { furnishShell } from '../shell';
import { FlushLamp } from '../props/FlushLamp';
import { WallSwitch } from '../props/WallSwitch';
import { TiledWainscot } from '../props/TiledWainscot';
import { Bathtub } from '../props/Bathtub';
import { FrostedWindow } from '../props/FrostedWindow';
import { Washbasin } from '../props/Washbasin';
import { Toilet } from '../props/Toilet';
import { TowelRail } from '../props/TowelRail';
import { LaundryBasket } from '../props/LaundryBasket';
import { placeDecor } from '../props/decor';
import { BATHROOM_PLAN } from './bathroomPlan';

/**
 * Builds the bathroom into its zone from `BATHROOM_PLAN`: shell with its door (opening out into
 * the corridor), ceiling light, the tiled wainscot, the tub under its frosted window (glowing with
 * the shared sky), the basin and the WC facing each other, the towels by the door, the laundry
 * basket, then the bath mat and the plant.
 */
export function furnishBathroom(zone: Zone, { sky }: BuildContext): ZoneHandle {
  const plan = BATHROOM_PLAN;
  const room = furnishShell(zone, sky, plan.room, { leafColor: plan.leafColor });
  const light = zone.placeAt(new FlushLamp({ onSwitch: (on) => room.setLampOn(on) }), plan.light);
  zone.placeAt(new WallSwitch({ lamp: light }), plan.lightSwitch);
  // The wainscot wraps the whole shell, so it stands at the room's origin like the Room does.
  zone.place(new TiledWainscot(plan.room, plan.wainscot), new THREE.Vector3());

  zone.placeAt(new Bathtub({ tapEnd: 'left' }), plan.bathtub);
  const window = zone.placeAt(new FrostedWindow(), plan.window);
  zone.onUnload(sky.dayNight.onChange((state) => window.setDaylight(state.daylight, state.ambient)));

  zone.placeAt(new Washbasin({ shelfSide: 'right' }), plan.washbasin);
  zone.placeAt(new Toilet(), plan.toilet);
  zone.placeAt(new TowelRail(), plan.towelRail);
  zone.placeAt(new LaundryBasket(), plan.laundryBasket);
  placeDecor(zone, plan.decor);
  return { room };
}
