import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../layout';
import { furnishShell } from '../shell';
import { PendantLamp } from '../props/PendantLamp';
import { Bed } from '../props/Bed';
import { Nightstand } from '../props/Nightstand';
import { BedsideLamp } from '../props/BedsideLamp';
import { Wardrobe } from '../props/Wardrobe';
import { Dresser } from '../props/Dresser';
import { BedroomChair } from '../props/BedroomChair';
import { placeDecor } from '../props/decor';
import { BEDROOM_PLAN } from './bedroomPlan';

/**
 * Builds the bedroom into its zone from `BEDROOM_PLAN`: shell (the hallway hangs the door),
 * ceiling light, the bed with a nightstand and a lamp each side, the wardrobe, the dresser, the
 * chair, then the rug, pictures and plant. The room has no window (see the plan's header).
 */
export function furnishBedroom(zone: Zone, { sky }: BuildContext): ZoneHandle {
  const plan = BEDROOM_PLAN;
  const room = furnishShell(zone, sky, plan.room);
  zone.placeAt(new PendantLamp({ onSwitch: (on) => room.setLampOn(on) }), plan.pendant);

  // The bed and, either side, a nightstand with its lamp standing on the top.
  zone.placeAt(new Bed(), plan.bed);
  for (const at of plan.nightstands) {
    const stand = zone.placeAt(new Nightstand(), at);
    zone.place(new BedsideLamp(), zone.toLocal(stand.localToWorld(stand.lampAnchor.clone())));
  }
  zone.placeAt(new Wardrobe({ depth: plan.wardrobe.depth }), plan.wardrobe.at);
  zone.placeAt(new Dresser({ width: plan.dresser.width }), plan.dresser.at);
  zone.placeAt(new BedroomChair(), plan.chair);

  placeDecor(zone, plan.decor);
  return { room };
}
