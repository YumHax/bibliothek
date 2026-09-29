import { Vector3, type Object3D } from 'three';
import type { PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { Engine } from '@/core/Engine';
import type { Session } from '@/game/Session';
import { callCat, callCatFor } from '@/game/CatCare';
import { setupGraphics } from '@/graphics';
import { Inspector } from '@/interaction/Inspector';
import { FirstPersonController } from '@/player/FirstPersonController';
import { StreetAmbience } from '@/audio/StreetAmbience';
import { World } from '@/world/World';
import type { GameBox } from '@/world/GameBox';
import { SoundOcclusion } from '@/world/acoustics/SoundOcclusion';
import { setEars } from '@/audio/spatial';
import { RetroShopLure } from '@/world/props/outdoors/RetroShopLure';
import { ZoneManager, PortalCuller } from '@/world/zone';
import { StreetAhead } from '@/world/airlock/StreetAhead';
import { groundHeight } from '@/world/street/relief/ground';
import { FLAT, WORLD_PLAN, inFlat, zonePlan } from '@/world/worldPlan';
import type { ZoneId } from '@/world/zoneIds';
import { bindBuilder, type ZoneHandleById } from '@/world/layout';
import type { BuildContext, MarketHallServices, WorldPanels } from '@/world/buildContext';
import type { ModalLike } from '@/game/SessionParts';
import { MailPost } from '@/collection/MailPost';
import { Doorstep } from '@/world/hallway/Doorstep';
import type { BuildingServices, TradePanelLike } from '@/world/stairwell/building';
import { furnishVisitors } from '@/world/visitors';
import type { PhoneFriends } from '@/ui/household/PhonePanel';
import { HOUSEHOLD, Pastimes, type PastimeCurtain } from '@/household';
import type { DoorLike } from '@/world/visitors/Visit';
import { SEED_GAMES } from '@/catalog';
import type { PlayerMoves } from './player';
import type { Notices } from '@/notices';
import { lightLevelOf, surfaceUnderfoot } from '@/world/zoneHandle';
import { catPlacers, followAdoption, furnishCat, type Cat } from '@/world/cat';
import { ShelvingGroup } from '@/world/shelving/ShelvingGroup';
import { late, type Late } from './late';
import type { Services } from './services';
import { installStats, installZFight } from './debug';
import { trackWorldLoad } from '@/ui/worldLoad';
import { BalconyDoor } from '@/world/balcony/BalconyDoor';

/** Where the TV a seated friend watches stands (read every frame, copied by the visit). */
const tvAt = new Vector3();

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
  notices: Notices;
  /** The bedroom's phone (it reaches the friends once they exist, here) and wardrobe (docs/household.md). */
  phone: ModalLike & { setFriends(friends: PhoneFriends): void };
  wardrobe: ModalLike;
  /** What the street's shops and the hall console open (`BuildContext.panels`). */
  panels: WorldPanels;
  /** The teleport's curtain: the household's long jobs fade to black behind it (`household/pastime.ts`). */
  fader: PastimeCurtain;
}

export function buildWorld(services: Services, parts: { world: GameWorld; player: FirstPersonController; marketHall: MarketHallServices; flat: FlatPanels; session: Late<Session>; moves: Late<PlayerMoves> }) {
  const { engine, params, sky, market, cssLayer, input, covers, collection, deliveries, strays, overflow, upgrades, wallet, scores, arcadeDaily, prizes, medals, league, arcadeScreen, tournament, jackpot, replays, milestones, collectorWatch, firstDay, fame, container, coverUrl } = services;
  const { world, player, marketHall, flat, session, moves } = parts;
  const zones = late<ZoneManager<ZoneId>>('the zone manager');
  const cat = late<Cat>('the cat');
  // The household's beats (cleaning, baking, a soak): a fade that holds the player still, like a night (docs/household.md).
  const pastimes = new Pastimes(flat.fader, sky.dayNight, (busy) => session.isSet && session.get().setFrozen(busy));

  // The street heard through the nearest window; the retro games shop across it shows the market's stock once drawn.
  const streetWalls = new SoundOcclusion(() => world.occluders);
  // The flat's one-shots with no listener of their own (a door's latch) are heard from the camera, through the walls.
  setEars(engine.camera, (a, b) => streetWalls.wallsBetween(a, b));
  // Through the shut windows a murmur; at the full level with the balcony door open or out on the balcony.
  engine.addUpdatable(new StreetAmbience({
    listener: engine.camera,
    panes: () => sky.outdoors.panesIn(engine.scene),
    openings: () => balconyDoorsIn(engine.scene),
    outside: () => zones.isSet && zones.get().current.id === 'balcony',
    open: () => zones.isSet && zones.get().current.id === 'street',
    underRoof: () => zones.isSet && zones.get().current.id === 'market',
    sky: () => sky.dayNight.state,
    wallsBetween: (a, b) => streetWalls.wallsBetween(a, b),
    life: () => sky.outdoors.life.events,
  }));
  // The retro games shop shows the day's stock; on a new market day, until the player has been, a banner and a queue.
  new RetroShopLure(sky.outdoors, market, {
    colorOf: (platform) => `#${getPlatform(platform as PlatformId).accentColor.toString(16).padStart(6, '0')}`,
    here: () => (zones.isSet ? zones.get().current.id : ''),
  });
  // The box in hand: the view focuses on it (ticked with the interaction, `bootstrap/interaction`).
  const inspector = new Inspector<GameBox>(engine.camera, engine.scene, () => world.occluders);
  // Post-processing, reflections and haze (see docs/graphics.md), set up before anything compiles; the
  // grade and the air follow the player's zone. The callbacks are only read once the loop runs.
  const graphics = setupGraphics(engine, {
    focus: () => inspector.focusDistance,
    lightLevel: () => lightLevelOf(zones.get().current),
    videoLayer: cssLayer,
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
    collection: { games: collection, owns: (id) => collection.owns(id), isWanted: (id) => collection.isWanted(id), shelved: strays, strays, deliveries, overflow },
    home: {
      upgrades,
      onSelectPlatform: (id) => session.get().focusPlatform(id),
      // The feather wand (an arcade prize) calls the cat over; the cat exists by the time anyone can click it.
      callCat: () => (cat.get().adopted ? callCat(cat.get(), 'feathers') : 'The feathers swish. No cat lives here yet: the pet shop on Front Street has some to adopt.'),
      collector: { book: flat.collectorBook, milestones, watch: collectorWatch },
      firstDay,
      journalPanel: flat.journalPanel,
      // What the kitchen, the bathroom and the bedroom are for (docs/household.md).
      household: {
        life: services.homeLife,
        phone: flat.phone,
        wardrobe: flat.wardrobe,
        notices: flat.notices,
        catName: () => services.catSettings.settings.name,
        callCat: () => callCatFor(cat.get(), 'treats'),
        pastimes,
        boxOf: (gameId) => strays.homeBox?.(gameId),
      },
    },
    money: { wallet, purse: wallet },
    arcade: { scores, daily: arcadeDaily, prizes, medals, league, screen: arcadeScreen, tournament, jackpot, replays },
    market: { stock: market, day: services.marketDay, hall: marketHall },
    today: services.today,
    panels: flat.panels,
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
    // The flea market's stock is priced on the way there (a fame lookup per copy, 15-20 s for a fresh day).
    if (zone.id === 'street') market.warm();
  });
  // A new market day while the player is out: the new stock starts pricing at once.
  services.today.onNewGameDay(() => {
    if (!inFlat(manager.current.id)) market.warm();
  });
  // The first day's tips follow the stores and the player's zone (a new game only; silent otherwise).
  firstDay.connect({ wallet, collection, deliveries, prizes, zone: () => manager.current.id, notices: flat.notices });
  engine.addUpdatable(firstDay);
  // Of the active zones, only draw the player's and those seen through an open doorway in view.
  engine.addUpdatable(new PortalCuller(world.zones, manager, engine.camera));
  // Down in the entrance hall, the street is built and compiled ahead (held loaded there): the sas then crosses at once.
  engine.addUpdatable(new StreetAhead({
    viewer: engine.camera,
    here: () => manager.current.id,
    built: (id) => manager.zone(id)?.status !== 'empty',
    prepare: (id) => world.prepareZone(id),
    hold: (id, held) => manager.hold(id, held),
  }));
  if (params.has('stats')) installStats({ engine, world, zones: manager, player, graphics });
  if (params.has('stats') || params.has('debug')) {
    installZFight({ world, zones: manager });
    world.lights.verbose = true;
  }

  // The cat: it needs the player (to watch and flee) and the clock (to nap). It roams the whole flat through the open doors:
  // every room is built first (nothing is lost, `prime` activates them all next), each room grown a little to reach over
  // its doorways, with the spots its builder named and the bedroom's bed to nap on.
  const flatZones = FLAT.map((id) => world.zone(id));
  const flatHandles = FLAT.map((id) => world.build(id));
  // The stairwell's stairs and lift are the player's ground (flights stack: the one under the feet), and out on Front Street
  // the road a kerb below the pavements (the feet step down off it as the passers-by do); the cat stays in the flat.
  const onStairs = world.build('stairwell').ground;
  const streetGroup = world.zone('street').group;
  const streetLocal = new Vector3();
  player.setGround((x, z, feet) => {
    if (manager.current.id !== 'street') return onStairs(x, z, feet);
    streetGroup.worldToLocal(streetLocal.set(x, feet, z));
    return streetGroup.position.y + groundHeight(streetLocal.x, streetLocal.z);
  });
  // Until it is adopted at the pet shop, the cat and its things wait unseen (`catPlacers`).
  cat.set(furnishCat(world.zone(WORLD_PLAN.start), {
    settings: services.catSettings, player, clock: sky.dayNight, seats: home.armchairs, windows: home.windows, tv: home.tv,
    placers: catPlacers(world.zone(WORLD_PLAN.start), upgrades),
    listener: context.listener,
    acoustics: context.acoustics,
    flat: {
      rooms: flatZones.filter((zone) => zone.id !== 'stairwell').map((zone) => zone.floorBounds.expandByScalar(0.1)),
      visits: flatHandles.flatMap((handle) => handle.catVisits ?? []),
      perches: [world.build('bedroom').bed, ...flatHandles.flatMap((handle) => handle.catPerches ?? [])],
      waters: flatHandles.flatMap((handle) => handle.catWaters ?? []),
    },
  }));
  followAdoption(cat.get(), upgrades);
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
    day: () => services.today.gameDay,
    clock: sky.dayNight,
    atHome: () => zones.get().current.id !== 'stairwell' && inFlat(zones.get().current.id),
    busy: () => pastimes.isBusy || (moves.isSet && (moves.get().travel.isTravelling || moves.get().sleep.isAsleep)),
    seats: home.seats,
    standing: home.armchairs,
    frontDoor: doorTo(hallway, 'stairwell'),
    livingDoor: doorTo(living, 'hallway'),
    container,
    purse: wallet,
    giftPool: SEED_GAMES,
    cat: () => (cat.get().adopted ? { at: cat.get().getWorldPosition(new Vector3()), name: services.catSettings.settings.name } : null),
    notices: flat.notices,
    coverUrl,
    viewsOf: (game) => fame.peek(game),
    acoustics: context.acoustics,
    // A sidestep only goes where no furniture stands.
    collisions: world.collisions,
    journal: services.journal,
    // Their footsteps sound of the floor of the zone they walk (the hallway's, the stairwell's); a game handed back
    // is held out as its box; browsing, they look at a box on the shelves; seated, at the TV if it plays.
    surfaceAt: (at) => surfaceUnderfoot(flatZones.find((zone) => zone.contains(at)) ?? living, at),
    covers,
    shelfBoxes: () => shelves.boxes,
    watch: () => (home.tv.isPlaying ? home.tv.getWorldPosition(tvAt).setY(0.9) : null),
    doorTaken: () => building.doorstep.waiting !== null,
    // `?visit`: a friend rings as soon as the player is home (testing).
    force: params.has('visit'),
    // A cake on the kitchen table: a slice, a longer stay, a thank-you (docs/household.md).
    hosting: { cakeOut: () => services.household.cakeOut, eatCake: () => services.household.eatCake() },
  });
  building.doorstep.also(visitors);
  // The bedroom's phone asks a friend round (once a market day, if nobody came yet), `inHours` from now.
  flat.phone.setFriends({
    list: () => visitors.phoneBook(),
    invite: (id) => {
      const { household } = services;
      const hours = sky.dayNight.state.hours;
      if (household.doneToday('invite')) return 'You have asked someone round today already.';
      if (hours >= HOUSEHOLD.phone.friendsUntil) return 'A bit late to ask anyone round. Tomorrow.';
      const answer = visitors.invite(id, hours + HOUSEHOLD.phone.inHours);
      if (answer.ok) household.once('invite');
      return answer.line;
    },
  });
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

  return { zones: manager, graphics, inspector, cat: cat.get(), shelves, pastimes };
}

/** The balcony doors in the scene (the street is heard through them, full once open). */
function balconyDoorsIn(root: Object3D): BalconyDoor[] {
  const doors: BalconyDoor[] = [];
  root.traverse((object) => void (object instanceof BalconyDoor && doors.push(object)));
  return doors;
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
