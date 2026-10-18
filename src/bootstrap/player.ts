import { Sleep } from '@/game/Sleep';
import { PositionMemory } from '@/player/PositionMemory';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { Footsteps } from '@/audio/Footsteps';
import type { Fader } from '@/ui/Fader';
import { Travel, travelStops, travelTint } from '@/world/travel';
import { takeRideVia } from '@/world/travel/rideVia';
import { isZoneId, zonePlan } from '@/world/worldPlan';
import { surfaceUnderfoot } from '@/world/zoneHandle';
import { airlockLink } from '@/world/airlock';
import { outsideIfShut } from '@/world/shop/ClosingTime';
import * as THREE from 'three';
import { reduceMotion } from '@/settings/motion';
import { playTaxiRide } from '@/ui/taxiRide/TaxiRide';
import { playRide } from '@/ui/busRide/BusRide';
import { ridersFor } from '@/ui/busRide/busRiders';
import { STREET_PLAN } from '@/world/street/streetPlan';
import type { Services } from './services';
import type { BuiltWorld, GameWorld } from './world';
import { streetGround } from './worldZones';

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
    // Behind the curtain: the destination's look, air, reflections and eye settled first, so the frame
    // primed (and the fade-in) shows them where they are going, not easing there for seconds after.
    prepare: () => {
      built.graphics.settle();
      return world.primeAsync();
    },
    // The curtain falls in the light of where the player goes: a shop's warm lamps, the street's sky.
    tint: (id) => travelTint(zonePlan(id).kind, sky.dayNight.state.daylight),
    // The place left, drawn once more and read at once (the canvas keeps no drawing buffer): the photo on its travel card.
    snapshot: () => {
      engine.renderFrame();
      return engine.renderer.domElement;
    },
    // Line 38 to Mémé's and back (docs/story.md "Mémé"): the ride from a seat by the window over the curtain, with the
    // line's regulars of the hour, and some mornings Mémé herself on her way back from the market (docs/grandma.md).
    interlude: (from, to) => {
      // By taxi (`traffic/TaxiRank`): the back seat over the curtain, the meter running up, the driver's word.
      const via = takeRideVia();
      if (via?.by === 'taxi') return () => playTaxiRide(services.container, { to: via.to, fare: via.fare, chat: via.chat, night: sky.dayNight.state.daylight < 0.35 });
      const line = STREET_PLAN.busRide.destinations.find((d) => (from === 'street' && to === d.to) || (from === d.to && to === 'street'));
      if (!line) return null;
      const { daylight, hours } = sky.dayNight.state;
      const home = to === 'street';
      const day = services.today.gameDay;
      // Decided whether the ride is shown or not: she gets off at Linden Avenue with the player all the same.
      const meme = !home && to === 'lindenAvenue' && services.sharedRide.board(day, hours);
      if (reduceMotion()) return null;
      const riders = ridersFor(day, hours, meme);
      // After nine the night bus runs the line (her "the last bus is at nine": the N38, near empty); the town past the
      // window is the day's own, a ride there and back never the same street.
      const night = hours % 24 >= 21 || hours % 24 < 5;
      const board = `${night ? 'N' : ''}${STREET_PLAN.bus.line} ${home ? 'FRONT STREET' : line.board}`;
      return () => playRide(services.container, { board, daylight, hours, seed: (home ? 83 : 38) + day * 101, riders });
    },
  });
  // The building's sas: crossing between the hall's twin and the street's moves the player with no curtain
  // (docs/zones.md "The sas"); the far zone is built and compiled out of sight while the door release buzzes.
  airlockLink.connect({ camera: engine.camera, player, prepare: (id) => world.prepareZone(id), settle: () => world.primeAsync() });
  // A night in the bedroom's bed: the same curtain, the shared clock wound on to the next morning.
  // The bedside alarm sets the hour the night ends at (docs/household.md).
  const sleep = new Sleep(sky.dayNight, fader, () => services.household.wakeHour);
  // The morning fades in to the bedside alarm clock's ring (once it stands on its nightstand).
  sleep.onWake(() => {
    services.household.wokeUp();
    services.homeLife.ringAlarm();
  });
  // Back where the player last stood (zone, spot, look) after a reload; `?fresh` starts in the living room.
  // The ZoneManager notices on the first frame and loads that zone.
  const onStreet = streetGround(world, () => services.today.gameDay);
  const positionMemory = new PositionMemory({
    camera: engine.camera,
    player,
    currentZone: () => zones.current.id,
    // Not on the stairs: a floor plan cannot say which flight the player stood on (they wake up at home instead).
    // Not onto the stairs (which flight?), nor up in the attic or on the roof (the restore sets the feet at 0: the flat under them).
    floorOf: (id) => (id !== 'stairwell' && id !== 'attic' && id !== 'roof' && isZoneId(id) ? world.zone(id).floorBounds : null),
    busy: () => built.activity.held,
    // The park's gardens and the stretch the works opened lie past the street's box: still the street, kept as they are.
    walked: (zone, x, z) => zone === 'street' && onStreet(x, z),
    // Left in a shop or the flea market that has shut since: out on Front Street in front of its door.
    instead: (saved) => {
      const spot = outsideIfShut(saved.zone, sky.dayNight.state.hours);
      if (!spot) return null;
      const street = world.zone('street');
      street.group.updateWorldMatrix(true, false);
      const at = street.toWorld(new THREE.Vector3(spot.at[0], 0, spot.at[1]));
      return { zone: 'street', x: at.x, z: at.z, yaw: spot.yaw, pitch: 0 };
    },
  });
  positionMemory.restore();
  engine.addUpdatable(positionMemory);
  // The player's footsteps: what is underfoot is the zone's to say (the street), else its room's floor finish.
  engine.addUpdatable(new Footsteps({
    camera: engine.camera,
    player,
    surfaceAt: (at) => surfaceUnderfoot(zones.current, at),
    ground: () => sky.dayNight.state,
    suspended: () => built.activity.held,
  }));

  return { travel, sleep };
}
