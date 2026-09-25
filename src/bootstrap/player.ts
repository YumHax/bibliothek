import { Sleep } from '@/game/Sleep';
import { PositionMemory } from '@/player/PositionMemory';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { Footsteps } from '@/audio/Footsteps';
import type { Fader } from '@/ui/Fader';
import { Travel, travelStops } from '@/world/travel';
import { isZoneId } from '@/world/worldPlan';
import { surfaceUnderfoot } from '@/world/zoneHandle';
import { airlockLink } from '@/world/airlock';
import type { Services } from './services';
import type { BuiltWorld, GameWorld } from './world';

export type PlayerMoves = ReturnType<typeof createPlayerMoves>;

/**
 * What moves the player without walking, and what follows them: the trips between the zones that
 * declare a `travel` arrival (behind the curtain; the destination's module is fetched as it falls),
 * a night's sleep, the spot remembered across reloads (restored here), and the footsteps.
 */
export function createPlayerMoves(services: Services, parts: { world: GameWorld; built: BuiltWorld; player: FirstPersonController; fader: Fader }) {
  const { engine, sky } = services;
  const { world, built, player, fader } = parts;
  const { zones } = built;

  // Going out: the front door (and the arcade's and market's exits) teleport between the zones that
  // declare a `travel` arrival spot in WORLD_PLAN, behind a fade; the ZoneManager loads the destination.
  const travel = new Travel({
    stops: travelStops(world),
    player,
    curtain: fader,
    here: () => zones.current.id,
    load: (id) => world.load(id),
    prepare: () => world.primeAsync(),
  });
  // The building's sas: crossing between the hall's twin and the street's moves the player with no curtain
  // (docs/zones.md "The sas"); the far zone is built and compiled out of sight while the door release buzzes.
  airlockLink.connect({ camera: engine.camera, player, prepare: (id) => world.prepareZone(id), settle: () => world.primeAsync() });
  // A night in the bedroom's bed: the same curtain, the shared clock wound on to the next morning.
  const sleep = new Sleep(sky.dayNight, fader);
  // Back where the player last stood (zone, spot, look) after a reload; `?fresh` starts in the living room.
  // The ZoneManager notices on the first frame and loads that zone.
  const positionMemory = new PositionMemory({
    camera: engine.camera,
    player,
    currentZone: () => zones.current.id,
    // Not on the stairs: a floor plan cannot say which flight the player stood on (they wake up at home instead).
    floorOf: (id) => (id !== 'stairwell' && isZoneId(id) ? world.zone(id).floorBounds : null),
    busy: () => travel.isTravelling || sleep.isAsleep || airlockLink.isCrossing,
  });
  positionMemory.restore();
  engine.addUpdatable(positionMemory);
  // The player's footsteps: what is underfoot is the zone's to say (the street), else its room's floor finish.
  engine.addUpdatable(new Footsteps({
    camera: engine.camera,
    player,
    surfaceAt: (at) => surfaceUnderfoot(zones.current, at),
    ground: () => sky.dayNight.state,
    suspended: () => travel.isTravelling || sleep.isAsleep || airlockLink.isCrossing,
  }));

  return { travel, sleep };
}
