import { Vector3 } from 'three';
import type { PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { Engine } from '@/core/Engine';
import type { Session } from '@/game/Session';
import { callCat } from '@/game/CatCare';
import { setupGraphics } from '@/graphics';
import { Inspector } from '@/interaction/Inspector';
import { FirstPersonController } from '@/player/FirstPersonController';
import { StreetAmbience } from '@/audio/StreetAmbience';
import { World } from '@/world/World';
import type { GameBox } from '@/world/GameBox';
import { SoundOcclusion } from '@/world/acoustics/SoundOcclusion';
import { RetroShopLure } from '@/world/props/outdoors/RetroShopLure';
import { ZoneManager, PortalCuller } from '@/world/zone';
import { FLAT, WORLD_PLAN, inFlat, zonePlan } from '@/world/worldPlan';
import type { ZoneId } from '@/world/zoneIds';
import { bindBuilder, type ZoneHandleById } from '@/world/layout';
import type { BuildContext, MarketHallServices } from '@/world/buildContext';
import type { ModalLike } from '@/game/SessionParts';
import { MailPost } from '@/collection/MailPost';
import { Doorstep } from '@/world/hallway/Doorstep';
import type { BuildingServices, TradePanelLike } from '@/world/stairwell/building';
import { furnishVisitors } from '@/world/visitors';
import type { DoorLike } from '@/world/visitors/Visit';
import { SEED_GAMES } from '@/catalog';
import type { PlayerMoves } from './player';
import type { Toast } from '@/ui/Toast';
import { lightLevelOf } from '@/world/zoneHandle';
import { furnishCat, type Cat } from '@/world/cat';
import { ShelvingGroup } from '@/world/shelving/ShelvingGroup';
import { late, type Late } from './late';
import type { Services } from './services';
import { installStats } from './debug';

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

export type BuiltWorld = ReturnType<typeof buildWorld>;

/**
 * Builds the world: the street heard through the windows, the graphics, the zones from `WORLD_PLAN`
 * (the flat at once, the rest on demand), the zone streaming and culling, the cat roaming the flat,
 * the shaders compiled up front, and the shelves of every zone as one. `marketHall` is the market
 * hall's panels (made with the UI); the Session, made last, is only asked on a console click.
 */
/** The flat's panels (made with the UI) its builders hand out: the book on the sideboard, the journal, a neighbour's swap. */
export interface FlatPanels {
  collectorBook: ModalLike;
  journalPanel: ModalLike;
  neighbourTradePanel: TradePanelLike;
  toast: Toast;
}

export function buildWorld(services: Services, parts: { world: GameWorld; player: FirstPersonController; marketHall: MarketHallServices; flat: FlatPanels; session: Late<Session>; moves: Late<PlayerMoves> }) {
  const { engine, params, sky, market, cssLayer, input, covers, collection, deliveries, strays, overflow, upgrades, wallet, scores, arcadeDaily, prizes, medals, league, arcadeScreen, tournament, milestones, collectorWatch, firstDay, fame, container, coverUrl } = services;
  const { world, player, marketHall, flat, session, moves } = parts;
  const zones = late<ZoneManager<ZoneId>>('the zone manager');
  const cat = late<Cat>('the cat');

  // The street heard through the nearest window; the retro games shop across it shows the market's stock once drawn.
  const streetWalls = new SoundOcclusion(() => world.occluders);
  engine.addUpdatable(new StreetAmbience({ listener: engine.camera, panes: () => sky.outdoors.panesIn(engine.scene), sky: () => sky.dayNight.state, wallsBetween: (a, b) => streetWalls.wallsBetween(a, b), life: () => sky.outdoors.life.events }));
  // The retro games shop shows the day's stock; on a new market day, until the player has been, a banner and a queue.
  new RetroShopLure(sky.outdoors, market, {
    colorOf: (platform) => `#${getPlatform(platform as PlatformId).accentColor.toString(16).padStart(6, '0')}`,
    here: () => zones.get().current.id,
  });
  // The box in hand: the view focuses on it (ticked with the interaction, `bootstrap/interaction`).
  const inspector = new Inspector<GameBox>(engine.camera, engine.scene);
  // Post-processing, reflections and haze (see docs/graphics.md), set up before anything compiles; the
  // grade and the air follow the player's zone. The callbacks are only read once the loop runs.
  const graphics = setupGraphics(engine, {
    focus: () => inspector.focusDistance,
    lightLevel: () => lightLevelOf(zones.get().current),
  });

  // The building's life the hallway and the stairs share (docs/zones.md "The stairwell"): who rings at the door,
  // the mail orders in the post (made after the parcel, whose changes it hears second), the neighbours' swaps.
  const building: BuildingServices = {
    doorstep: new Doorstep(),
    post: new MailPost({ collection, deliveries, calendar: market, hours: () => sky.dayNight.state.hours, home: () => inFlat(zones.get().current.id) }),
    trades: services.neighbourTrades,
    tradePanel: flat.neighbourTradePanel,
  };

  // Every zone is declared now and built from its plan on first activation (see docs/zones.md).
  const context: BuildContext = {
    cssLayer,
    listener: engine.camera,
    acoustics: new SoundOcclusion(() => world.occluders),
    input,
    sky,
    covers,
    collection: { games: collection, shelved: strays, strays, deliveries, overflow },
    home: {
      upgrades,
      onSelectPlatform: (id) => session.get().focusPlatform(id),
      // The feather wand (an arcade prize) calls the cat over; the cat exists by the time anyone can click it.
      callCat: () => callCat(cat.get(), 'feathers'),
      collector: { book: flat.collectorBook, milestones, watch: collectorWatch },
      firstDay,
      journalPanel: flat.journalPanel,
    },
    money: { wallet, purse: wallet },
    arcade: { scores, daily: arcadeDaily, prizes, medals, league, screen: arcadeScreen, tournament },
    market: { stock: market, hall: marketHall },
    building,
  };
  for (const plan of WORLD_PLAN.zones) world.addZone(plan, bindBuilder(plan.kind, context));
  world.zone(WORLD_PLAN.start).activate();
  // The collection room: the cat's home, its shelves and screens.
  const home = world.build('living');
  engine.addUpdatable(player);

  // Streams zones around the player: current + neighbours active, the rest dormant (and unloaded unless persistent).
  // Only the zone the player stands in runs its sky ambient and re-renders its shadow maps every frame (see `OccupancyAware`).
  const manager = zones.set(new ZoneManager<ZoneId>(world.zones, engine.camera, { start: WORLD_PLAN.start }));
  engine.addUpdatable(manager);
  manager.current.setOccupied(true);
  graphics.setLook(zonePlan(manager.current.id).look, true);
  manager.onZoneChange((zone, previous) => {
    previous.setOccupied(false);
    zone.setOccupied(true);
    graphics.setLook(zonePlan(zone.id).look);
  });
  // The first day's tips follow the stores and the player's zone (a new game only; silent otherwise).
  firstDay.connect({ wallet, collection, deliveries, prizes, zone: () => manager.current.id, say: (text, ms) => flat.toast.show(text, ms) });
  engine.addUpdatable(firstDay);
  // Of the active zones, only draw the player's and those seen through an open doorway in view.
  engine.addUpdatable(new PortalCuller(world.zones, manager, engine.camera));
  if (params.has('stats')) installStats({ engine, world, zones: manager, player, graphics });

  // The cat: it needs the player (to watch and flee) and the clock (to nap). It roams the whole flat through the open doors:
  // every room is built first (nothing is lost, `prime` activates them all next), each room grown a little to reach over
  // its doorways, with the spots its builder named and the bedroom's bed to nap on.
  const flatZones = FLAT.map((id) => world.zone(id));
  const flatHandles = FLAT.map((id) => world.build(id));
  // The stairwell's stairs and lift are the player's ground (flights stack: the one under the feet); the cat stays in the flat.
  player.setGround(world.build('stairwell').ground);
  cat.set(furnishCat(world.zone(WORLD_PLAN.start), {
    settings: services.catSettings, player, clock: sky.dayNight, seats: home.seats, windows: home.windows, tv: home.tv,
    flat: {
      rooms: flatZones.filter((zone) => zone.id !== 'stairwell').map((zone) => zone.floorBounds.expandByScalar(0.1)),
      visits: flatHandles.flatMap((handle) => handle.catVisits ?? []),
      perches: [world.build('bedroom').bed, ...flatHandles.flatMap((handle) => handle.catPerches ?? [])],
      waters: flatHandles.flatMap((handle) => handle.catWaters ?? []),
    },
  }));
  // Friends who drop by some afternoons: the bell, a look at the shelves, a game borrowed and brought back (docs/visitors.md).
  // Made before `prime`, so their fade shaders compile with the flat's.
  const living = world.zone(WORLD_PLAN.start);
  const hallway = world.zone('hallway');
  const doorTo = (zone: typeof living, to: ZoneId) => (zone.portals.find((p) => p.to === to)?.door as DoorLike | undefined) ?? null;
  const visitors = furnishVisitors({
    living,
    hallway,
    viewer: engine.camera,
    collection,
    shelved: strays,
    day: () => market.day,
    clock: sky.dayNight,
    atHome: () => zones.get().current.id !== 'stairwell' && inFlat(zones.get().current.id),
    busy: () => moves.isSet && (moves.get().travel.isTravelling || moves.get().sleep.isAsleep),
    seats: home.seats,
    frontDoor: doorTo(hallway, 'stairwell'),
    livingDoor: doorTo(living, 'hallway'),
    container,
    purse: wallet,
    giftPool: SEED_GAMES,
    cat: () => ({ at: cat.get().getWorldPosition(new Vector3()), name: services.catSettings.settings.name }),
    notice: (text) => flat.toast.show(text, 4500),
    coverUrl,
    viewsOf: (game) => fame.peek(game),
    acoustics: context.acoustics,
    doorTaken: () => building.doorstep.waiting !== null,
    // `?visit`: a friend rings as soon as the player is home (testing).
    force: params.has('visit'),
  });
  building.doorstep.also(visitors);
  // The whole flat is active (every room neighbours the others) and furnished: compiled and drawn once
  // now, so crossing a doorway costs nothing.
  world.prime();
  // Covers nearest to the player download first.
  setInterval(() => covers.setPriorityOrigin(engine.camera.position), 1000);

  // The shelves of every zone of the flat (the collection room's, the bedroom's bought bookcases), searched and sorted as one.
  const shelves = new ShelvingGroup(flatHandles.map((handle) => handle.shelving));
  // A stray game picked up becomes its shelf's own box (shown even if its room is out of view), which goes home when put down.
  strays.homeBox = (gameId) => {
    const box = shelves.findBox(gameId);
    if (box) for (const zone of flatZones) zone.unhide(box);
    return box;
  };

  return { zones: manager, graphics, inspector, cat: cat.get(), shelves };
}

/**
 * Starts the loop once the zone the player woke up in can be built (a saved position in the street
 * waits for its module), then fetches the other zones' modules while the browser is idle, so a
 * first trip rarely waits for one behind the curtain.
 */
export function startWhenReady(engine: Engine, world: GameWorld): void {
  const here = world.zones.find((zone) => zone.contains(engine.camera.position));
  const ready = here ? here.load().catch((error: unknown) => console.error(`[world] ${here.id} failed to load`, error)) : Promise.resolve();
  void ready.then(() => {
    engine.start();
    const idle = (run: () => void): void => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 5000 });
      else setTimeout(run, 2000);
    };
    idle(() => void world.loadAll().catch((error: unknown) => console.error('[world] a zone module failed to preload', error)));
  });
}
