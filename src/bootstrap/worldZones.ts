import { Vector3 } from 'three';
import type { Engine } from '@/core/Engine';
import type { FirstPersonController } from '@/player/FirstPersonController';
import type { Session } from '@/game/Session';
import type { PlayerActivity } from '@/game/PlayerActivity';
import type { Graphics } from '@/graphics';
import { warmMarketOnTheWay } from '@/economy/marketWarmup';
import type { Furnishings } from '@/furnishing/Furnishings';
import type { Notices } from '@/notices';
import { ZoneManager, PortalCuller } from '@/world/zone';
import { StreetAhead } from '@/world/airlock/StreetAhead';
import { ClosingTime } from '@/world/shop/ClosingTime';
import { groundHeight } from '@/world/street/relief/ground';
import { WORLD_PLAN, inFlat, zonePlan } from '@/world/worldPlan';
import type { ZoneId } from '@/world/zoneIds';
import { bindBuilder } from '@/world/layout';
import type { BuildContext } from '@/world/buildContext';
import type { Late } from './late';
import type { Services } from './services';
import type { GameWorld } from './world';

/**
 * Every zone of `WORLD_PLAN` declared, each built from its plan on first activation (docs/zones.md), the furniture
 * registry told where the zones are (a piece carried to another room is put back there on load, before the first
 * builder runs), and the start zone activated.
 */
export function declareZones(world: GameWorld, context: BuildContext, furnishings: Furnishings): void {
  for (const plan of WORLD_PLAN.zones) world.addZone(plan, bindBuilder(plan.kind, context));
  furnishings.setZones((id) => world.zones.find((zone) => zone.id === id));
  world.zone(WORLD_PLAN.start).activate();
}

/** What the streaming reads and tells. */
interface StreamingParts {
  graphics: Graphics;
  notices: Notices;
  session: Late<Session>;
  activity: PlayerActivity;
  /** The holder everyone else reads the manager through: filled the moment it exists, before the first look settles (it reads the zone's light level through it). */
  zones: Late<ZoneManager<ZoneId>>;
}

/**
 * Streams zones around the player: current + neighbours active, the rest dormant (and unloaded unless persistent);
 * only the zone the player stands in runs its sky ambient and re-renders its shadow maps every frame (see
 * `OccupancyAware`), and the grade and the air follow it. The market's stock is priced on the way out; the first
 * day's tips follow the stores and the zone; of the active zones only the player's and those seen through an open
 * doorway are drawn; down in the entrance hall the street is built ahead; closing time sees the player out of a shop.
 */
export function streamZones(services: Services, engine: Engine, world: GameWorld, parts: StreamingParts): ZoneManager<ZoneId> {
  const { sky, market, wallet, collection, deliveries, prizes, firstDay } = services;
  const { graphics, notices, session, activity, zones } = parts;
  const manager = zones.set(new ZoneManager<ZoneId>(world.zones, engine.camera, { start: WORLD_PLAN.start }));
  engine.addUpdatable(manager);
  manager.current.setOccupied(true);
  graphics.setLook(zonePlan(manager.current.id).look, true);
  manager.onZoneChange((zone, previous) => {
    previous.setOccupied(false);
    zone.setOccupied(true);
    graphics.setLook(zonePlan(zone.id).look);
  });
  warmMarketOnTheWay(market, {
    here: () => manager.current.id,
    onZoneChange: (cb) => manager.onZoneChange((zone) => cb(zone.id)),
    onNewGameDay: (cb) => services.today.onNewGameDay(cb),
    inFlat,
  });
  // The first day's tips follow the stores and the player's zone (a new game only; silent otherwise).
  firstDay.connect({ wallet, collection, deliveries, prizes, zone: () => manager.current.id, notices });
  engine.addUpdatable(firstDay);
  engine.addUpdatable(new PortalCuller(world.zones, manager, engine.camera));
  engine.addUpdatable(new StreetAhead({
    viewer: engine.camera,
    here: () => manager.current.id,
    built: (id) => manager.zone(id)?.status !== 'empty',
    prepare: (id, between) => world.prepareZone(id, between),
    hold: (id, held) => manager.hold(id, held),
  }));
  // Closing time in the walk-in shops and the flea market: the clerk says so, then sees the player out onto Front Street.
  engine.addUpdatable(new ClosingTime({
    here: () => manager.current.id,
    hours: () => sky.dayNight.state.hours,
    busy: () => !session.isSet || activity.busy,
    say: (line, who) => notices.say(line, who),
    putOut: () => session.get().travel('street'),
  }));
  return manager;
}

/**
 * The player's ground: the stairwell's stairs and lift are its floor (flights stack: the one under the feet; the attic
 * and the roof stand over its shaft, Mrs Roux's rooms over its entrance hall, whose tiles would drop the feet 16 m), out
 * on Front Street the road a kerb below the pavements (the feet step down off it as the passers-by do); everywhere else
 * the feet stay put. The endless stairs of some nights move the player up a storey on the same tread (`stairwell/endless`).
 */
export function wirePlayerGround(player: FirstPersonController, world: GameWorld, manager: ZoneManager<ZoneId>): void {
  const onStairs = world.build('stairwell').ground;
  world.build('stairwell').connectPlayer((dy) => player.shiftVertically(dy));
  const streetGroup = world.zone('street').group;
  const streetLocal = new Vector3();
  const streetFloor = world.zone('street').floorBounds;
  player.setGround((x, z, feet) => {
    const here = manager.current.id;
    if (here === 'stairwell') return onStairs(x, z, feet);
    // On Front Street (not the frame the sas's twin crossing has just set them down in, before the zone switches).
    if (here !== 'street' || x < streetFloor.min.x || x > streetFloor.max.x || z < streetFloor.min.y || z > streetFloor.max.y) return feet;
    streetGroup.worldToLocal(streetLocal.set(x, feet, z));
    return streetGroup.position.y + groundHeight(streetLocal.x, streetLocal.z);
  });
}
