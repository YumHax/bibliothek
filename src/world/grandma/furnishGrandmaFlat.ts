import type { BuildContext, ZoneHandle } from '../buildContext';
import type { Zone } from '../zone/Zone';
import { furnishShell } from '../shell';
import { placeRoomLight } from '../build/roomParts';
import { rugsUnderfoot } from '../build/rugsUnderfoot';
import { TravelDoor } from '../travel/TravelDoor';
import { KitchenTable } from '../kitchen/KitchenTable';
import { Chair } from '../kitchen/Chair';
import { Seat } from '../Seat';
import { Cushion } from '../props/Cushion';
import { GRANDMA } from '@/grandma/grandma';
import { furnishGrandmaDecor } from './furnishGrandmaDecor';
import { placeAlbum } from './albumWiring';
import { placeMeme } from './meme';
import { GRANDMA_FLAT_PLAN as PLAN } from './grandmaFlatPlan';

/** What the builder reads. */
type GrandmaContext = Pick<BuildContext, 'sky' | 'listener' | 'acoustics' | 'money' | 'today' | 'notices' | 'memories' | 'grandma' | 'social'>;

/**
 * Builds Mémé's flat (docs/story.md "Mémé"): her living-dining room across town, reached by bus line 38 and left by
 * the landing door (the bus back to Front Street). She sits in her armchair by the old set; on the way in she says
 * hello (on a Sunday with the envelope, `GrandmaVisits.arrive`); the photo album on the dining table plays the memory
 * she has ready (`MEMORIES`), or the ones seen again, as a film (`BuildContext.memories`).
 */
export function furnishGrandmaFlat(zone: Zone, ctx: GrandmaContext): ZoneHandle {
  const { sky } = ctx;
  const room = furnishShell(zone, sky, PLAN.room);
  placeRoomLight(zone, room, 'pendant', PLAN.pendant, PLAN.lightSwitch);
  zone.placeAt(new TravelDoor({ style: 'panelled', label: 'Linden Avenue · the bus back to Front Street', to: 'street', leafColor: 0x6a4a2a }), PLAN.exit);

  // The sitting corner: her armchair and the visitor's turned to the old set (on the sideboard, `furnishGrandmaDecor`).
  const armchair = zone.placeAt(armchairIn(0xa0583a), { floor: PLAN.armchair.at, rotationY: PLAN.armchair.yaw });
  zone.placeAt(armchairIn(0x8a7a5a), { floor: PLAN.visitorChair.at, rotationY: PLAN.visitorChair.yaw });
  // The dining table and its chairs, the album on it.
  const table = zone.placeAt(new KitchenTable({ width: PLAN.table.width, depth: PLAN.table.depth, breakfast: false, wood: 0x7a5232, paint: 0x5a3a24 }), PLAN.table.at);
  for (const at of PLAN.chairs) zone.placeAt(new Chair(), at);
  // Her things: the window on Linden Avenue, the clock, the cabinet, the kitchenette, the photos, the set, the canary.
  const dressing = furnishGrandmaDecor(zone, ctx, { room, armchair, table });

  // Mémé, in her day by the hour (the armchair's hers), and her hello on the way in (`meme.ts`).
  const { walker: meme, reseat: seat } = placeMeme(zone, ctx);
  armchair.guest = GRANDMA.name;

  // Her rug under the player's feet (the footsteps go soft on it).
  const handle: ZoneHandle = { room, surfaceAt: rugsUnderfoot(zone) };
  const visits = ctx.grandma;
  if (!visits) return handle;

  // The album on the table: her memories played as films, or her album's pages to pick one (`albumWiring`).
  const memories = ctx.memories;
  if (!memories) return handle;
  // What 1995 did not have is put aside while a memory is filmed here; the album lies on the tablecloth.
  memories.markModern(zone, dressing.modern);
  placeAlbum(zone, { host: dressing.table, at: PLAN.album.at, yaw: PLAN.album.yaw }, { memories, visits, meme, reseat: seat });
  return handle;
}

/** An armchair in `fabric`, its cushion thrown on. */
function armchairIn(fabric: number): Seat {
  const seat = new Seat({ fabric });
  seat.mountCushion(new Cushion({ color: 0xd8c7a0, tilt: 0.15 }));
  return seat;
}
