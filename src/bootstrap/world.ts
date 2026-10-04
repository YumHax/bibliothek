import type { Engine } from '@/core/Engine';
import type { Session } from '@/game/Session';
import { PlayerActivity } from '@/game/PlayerActivity';
import { setupGraphics, type Graphics } from '@/graphics';
import { Inspector } from '@/interaction/Inspector';
import { FirstPersonController } from '@/player/FirstPersonController';
import { World } from '@/world/World';
import type { GameBox } from '@/world/GameBox';
import { airlockLink } from '@/world/airlock';
import { FLAT } from '@/world/zoneIds';
import type { ZoneId } from '@/world/zoneIds';
import type { ZoneHandleById } from '@/world/layout';
import type { MarketHallServices } from '@/world/buildContext';
import type { ZoneManager } from '@/world/zone';
import type { ProgramRunner } from '@/onscreen';
import { Pastimes } from '@/household';
import type { Cat } from '@/world/cat';
import { lightLevelOf } from '@/world/zoneHandle';
import { ShelvingGroup } from '@/world/shelving/ShelvingGroup';
import { trackWorldLoad } from '@/ui/worldLoad';
import { late, type Late } from './late';
import type { Services } from './services';
import type { PlayerMoves } from './player';
import { installBuildingDebug, installStats, installZFight } from './debug';
import { makeBuildContext, makeBuilding, type FlatPanels } from './worldContext';
import { wireHearing, wireStreetSound } from './worldSound';
import { declareZones, streamZones, wirePlayerGround } from './worldZones';
import { makeCat, wireBuildingLife, wireGatherings, wireVisitors } from './worldLife';

/** The world of zones, every zone id typed with what its builder returns. */
export type GameWorld = World<ZoneHandleById>;

/**
 * The world (nothing built yet) and the player walking it: made before the UI, whose pointer lock
 * flow drives the player. The player is ticked from `buildWorld` on, after the collection room.
 */
export function createWorld(services: Services): { world: GameWorld; player: FirstPersonController } {
  const { engine, input } = services;
  const world: GameWorld = new World<ZoneHandleById>(engine);
  const player = new FirstPersonController(engine.camera, engine.renderer.domElement, input, world.collisions);
  player.setPosition(0, 1.5);
  return { world, player };
}

/** What `buildWorld` hands the later steps (the player's moves, the interaction, the Session). */
export interface BuiltWorld {
  zones: ZoneManager<ZoneId>;
  graphics: Graphics;
  /** The box in hand, ticked with the interaction. */
  inspector: Inspector<GameBox>;
  cat: Cat;
  /** The shelves of every zone of the flat as one. */
  shelves: ShelvingGroup;
  /** The household's beats told in a fade. */
  pastimes: Pastimes;
  /** The program runner, made with the Session (`session.ts` sets it). */
  programs: Late<ProgramRunner>;
  /** Where the player is and whether they are free, the one definition. */
  activity: PlayerActivity;
}

/** What `buildWorld` is handed besides the services: the world and the player, the UI's panels, and the holders of what comes later. */
interface WorldParts {
  world: GameWorld;
  player: FirstPersonController;
  /** The market hall's panels (made with the UI). */
  marketHall: MarketHallServices;
  /** The flat's panels (made with the UI). */
  flat: FlatPanels;
  /** The Session, made last: only asked on a console click. */
  session: Late<Session>;
  /** Travel and sleep, made after the world: read by the activity on use. */
  moves: Late<PlayerMoves>;
  /** The zone manager's holder (the menus read it): set here once the zones stream. */
  zones: Late<ZoneManager<ZoneId>>;
}

/**
 * Builds the world, step by step (each in its own module beside this one): the street heard through the windows
 * (`worldSound`), the graphics, the building's life and the context every builder reads (`worldContext`), the zones
 * from `WORLD_PLAN` (the flat at once, the rest on demand) and their streaming (`worldZones`), the cat roaming the
 * flat, the friends and the gatherings (`worldLife`), the shaders compiled up front, and the shelves of every zone as
 * one. The order is the order things need each other; nothing here decides a rule.
 */
export function buildWorld(services: Services, parts: WorldParts): BuiltWorld {
  const { engine, params, sky, market, cssLayer, covers, arrangement, strays } = services;
  const { world, player, marketHall, flat, session, moves, zones } = parts;
  const cat = late<Cat>('the cat');
  // The household's beats (cleaning, baking, a soak): a fade that holds the player still, like a night (docs/household.md).
  const pastimes = new Pastimes(flat.fader, sky.dayNight, (busy) => session.isSet && session.get().setFrozen(busy));
  // Where the player is and whether they are free, asked the same way by everyone (`game/PlayerActivity`).
  const activity: PlayerActivity = new PlayerActivity({
    zone: () => zones.get().current.id,
    travelling: () => moves.isSet && moves.get().travel.isTravelling,
    asleep: () => moves.isSet && moves.get().sleep.isAsleep,
    pastime: () => pastimes.isBusy,
    crossing: () => airlockLink.isCrossing,
  });

  const acoustics = wireHearing(engine, world);
  wireStreetSound(engine, sky, acoustics, zones, market);
  // The box in hand: the view focuses on it (ticked with the interaction, `bootstrap/interaction`).
  const inspector = new Inspector<GameBox>(engine.camera, engine.scene, () => world.occluders);
  // Post-processing, reflections and haze (see docs/graphics.md), set up before anything compiles; the
  // grade and the air follow the player's zone. The callbacks are only read once the loop runs.
  const graphics = setupGraphics(engine, {
    focus: () => inspector.focusDistance,
    lightLevel: () => lightLevelOf(zones.get().current),
    videoLayer: cssLayer,
  });

  const building = makeBuilding(services, flat, activity);
  const context = makeBuildContext(services, { flat, marketHall, listener: engine.camera, acoustics, building, pastimes, session, cat });
  declareZones(world, context, services.furnishings);
  // The collection room: the cat's home, its shelves and screens.
  const home = world.build('living');
  engine.addUpdatable(player);

  // Streaming fills `zones` the moment the manager exists: the first look settles through it right away.
  const manager = streamZones(services, engine, world, { graphics, notices: flat.notices, session, activity, zones });
  if (params.has('stats')) installStats({ engine, world, zones: manager, player, graphics });
  if (params.has('stats') || params.has('debug')) {
    installZFight({ world, zones: manager });
    installBuildingDebug();
    world.lights.verbose = true;
  }

  // Every room of the flat is built first (nothing is lost, `prime` activates them all next): the cat roams them all.
  const flatZones = FLAT.map((id) => world.zone(id));
  const flatHandles = FLAT.map((id) => world.build(id));
  wirePlayerGround(player, world, manager);
  cat.set(makeCat(services, world, { home, player, context, flat: { zones: flatZones, handles: flatHandles } }));
  wireBuildingLife(services, engine, world, { cat: cat.get(), building, flat, pastimes, manager });
  // The shelves of every zone as one are made after `prime`; a browsing friend asks for them later.
  const shelves = late<ShelvingGroup>('the shelves');
  const visitors = wireVisitors(services, engine, world, { home, cat: cat.get(), building, flat, context, activity, flatZones, shelves });
  const programs = late<ProgramRunner>('the program runner');
  wireGatherings(services, world, { visitors, home, flat, programs });

  // The whole flat is active (every room neighbours the others) and furnished: compiled and drawn once
  // now, so crossing a doorway costs nothing.
  world.prime();
  // Covers nearest to the player download first.
  setInterval(() => covers.setPriorityOrigin(engine.camera.position), 1000);

  // The shelves of every zone of the flat (the collection room's, the bedroom's bought bookcases), searched and sorted as one.
  shelves.set(new ShelvingGroup(flatHandles.map((handle) => handle.shelving), arrangement));
  // A box on display is found there too (search, the random pick, the box in hand aimed at a shelf).
  shelves.get().alsoIn((gameId) => services.showcases.findBox(gameId));
  // A stray game picked up becomes its shelf's own box (shown even if its room is out of view), which goes home when put down.
  strays.homeBox = (gameId) => {
    const box = shelves.get().findBox(gameId);
    if (box) for (const zone of flatZones) zone.unhide(box);
    return box;
  };

  return { zones: manager, graphics, inspector, cat: cat.get(), shelves: shelves.get(), pastimes, programs, activity };
}

/**
 * Starts the loop once the zone the player woke up in can be built (a saved position in the street
 * waits for its module), then fetches the other zones' modules while the browser is idle, so a
 * first trip rarely waits for one behind the curtain.
 */
export function startWhenReady(engine: Engine, world: GameWorld): void {
  const here = world.zones.find((zone) => zone.contains(engine.camera.position));
  // The start card's button waits for this; a failure is told with a Retry (`ui/worldLoad`, `bootstrap/ui`).
  const ready = trackWorldLoad(() => (here ? here.load() : Promise.resolve()));
  void ready.then(() => {
    engine.start();
    const idle = (run: () => void): void => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 5000 });
      else setTimeout(run, 2000);
    };
    idle(() => void world.loadAll().catch((error: unknown) => console.error('[world] a zone module failed to preload', error)));
  });
}
