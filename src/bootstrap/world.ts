import type { Engine } from '@/core/Engine';
import type { Session } from '@/game/Session';
import { PlayerActivity } from '@/game/PlayerActivity';
import { setupGraphics, type Graphics } from '@/graphics';
import { Inspector } from '@/interaction/Inspector';
import { FirstPersonController } from '@/player/FirstPersonController';
import { World } from '@/world/World';
import type { GameBox } from '@/world/GameBox';
import { airlockLink } from '@/world/airlock';
import { holdPowerCutsWhile } from '@/building/blackout';
import { isConversing } from '@/notices';
import { panelOpen } from '@/ui/menu/MenuNav';
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
import { MemoryProjector } from '@/memories/MemoryFilm';
import { setBodyCompiler } from '@/world/people/bodyQueue';
import { zonePlan } from '@/world/worldPlan';
import { DreamFlat } from '@/intro/DreamFlat';
import { stagedPieces } from '@/world/build/owned';
import { SEED_GAMES } from '@/catalog';
import { seededRng, shuffled } from '@/random';
import { late, type Late } from './late';
import type { Loading } from './loading';
import type { Services } from './services';
import type { PlayerMoves } from './player';
import { installBuildingDebug, installStats, installZFight } from './debug';
import { makeBuildContext, makeBuilding, type FlatPanels } from './worldContext';
import { wireHearing, wireStreetSound } from './worldSound';
import { declareZones, streamZones, wirePlayerGround } from './worldZones';
import { makeCat, wireBuildingLife, wireGatherings, wireVisitors } from './worldLife';
import { watchForTheEnd } from '@/world/grandma/closingWiring';
import { ReadingLight } from '@/world/box/ReadingLight';
import { PaperReader } from '@/world/box/papers/PaperReader';

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
  /** The box's papers read in front of the eye (its booklet, a card, a leaflet, a poster). */
  papers: PaperReader;
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
 * one. The order is the order things need each other; nothing here decides a rule. Each room of the flat, the life
 * and the shaders are a step of the loading bar (`loading`), the page painting between them.
 */
export async function buildWorld(services: Services, parts: WorldParts, loading: Loading): Promise<BuiltWorld> {
  const { engine, params, sky, market, cssLayer, covers, arrangement, strays } = services;
  const { world, player, marketHall, flat, session, moves, zones } = parts;
  await loading.step('world');
  const cat = late<Cat>('the cat');
  // The household's beats (cleaning, baking, a soak): a fade that holds the player still, like a night (docs/household.md).
  const pastimes = new Pastimes(flat.fader, sky.dayNight, (busy) => session.isSet && session.get().setFrozen(busy));
  // Where the player is and whether they are free, asked the same way by everyone (`game/PlayerActivity`); a memory's
  // film counts as away (its projector is made below, with the graphics).
  const film = { playing: (): boolean => false };
  const activity: PlayerActivity = new PlayerActivity({
    zone: () => zones.get().current.id,
    travelling: () => moves.isSet && moves.get().travel.isTravelling,
    asleep: () => moves.isSet && moves.get().sleep.isAsleep,
    pastime: () => pastimes.isBusy,
    crossing: () => airlockLink.isCrossing,
    filming: () => film.playing(),
  });

  // A storm's power cut never lands mid-scene: in a fade, a night, a memory, a conversation, a panel, the opening film.
  holdPowerCutsWhile(() => activity.busy || isConversing() || panelOpen() || document.body.classList.contains('intro-playing'));

  const acoustics = wireHearing(engine, world);
  wireStreetSound(engine, sky, acoustics, zones, market);
  // The box in hand: the view focuses on it (ticked with the interaction, `bootstrap/interaction`).
  const inspector = new Inspector<GameBox>(engine.camera, engine.scene, () => world.occluders);
  // Its booklet and papers taken out of the open box and read in front of the eye (docs/media.md "The papers in the box").
  const papers = new PaperReader(engine.camera, engine.scene, inspector, () => world.occluders);
  engine.addUpdatable(papers);
  // Examined up close (or a paper of it read), the box reads as if under a lamp and the room goes into shade round it (docs/media.md).
  engine.addUpdatable(new ReadingLight(inspector, engine.camera, papers));
  // Post-processing, reflections and haze (see docs/graphics.md), set up before anything compiles; the
  // grade and the air follow the player's zone. The callbacks are only read once the loop runs.
  const graphics = setupGraphics(engine, {
    focus: () => papers.focusDistance ?? inspector.focusDistance,
    lightLevel: () => lightLevelOf(zones.get().current),
    daylight: () => sky.dayNight.state.daylight,
    videoLayer: cssLayer,
  });
  // People's bodies, built over idle moments, link their programs before they show (`world/people/bodyQueue`).
  setBodyCompiler((root) => engine.renderer.compileAsync(root, engine.camera, engine.scene).then(() => undefined));

  // The memories filmed in a zone (Mémé's album, docs/story.md "Mémé"): the opening's screen, the camera and the grade;
  // the zones a film cuts to built ahead and held, the weather of the past, Félix's flat as the opening shows it.
  const memories = new MemoryProjector({
    camera: engine.camera,
    player,
    container: services.container,
    setLook: (look, snap) => graphics.setLook(look, snap),
    zoneLook: (id) => graphics.setLook(zonePlan(id).look, true),
    lens: graphics.postFx,
    engine,
    zones: {
      zone: (id) => world.zone(id),
      here: () => zones.get().current.id,
      prepare: (id) => world.prepareZone(id),
      hold: (id, held) => zones.get().hold(id, held),
    },
    holdWeather: (kind) => {
      const release = sky.weather.hold(kind);
      sky.dayNight.setWeather(sky.weather.state);
      return () => {
        release();
        sky.dayNight.setWeather(sky.weather.state);
      };
    },
    dream: () => dreamOfFelix(world),
    initials: services.initials,
    frame: () => {
      engine.renderFrame();
      return engine.renderer.domElement;
    },
  });
  film.playing = () => memories.filming;
  const building = makeBuilding(services, flat, activity);
  const context = makeBuildContext(services, { flat, marketHall, listener: engine.camera, acoustics, building, pastimes, session, cat, memories });
  declareZones(world, context, services.furnishings);
  // The collection room: the cat's home, its shelves and screens.
  await loading.step('living', 'Furnishing the flat');
  const home = world.build('living');
  engine.addUpdatable(player);

  // Streaming fills `zones` the moment the manager exists: the first look settles through it right away.
  const manager = streamZones(services, engine, world, { graphics, notices: flat.notices, session, activity, zones });
  if (params.has('stats')) installStats({ engine, world, zones: manager, player, graphics });
  if (params.has('stats') || params.has('debug')) {
    installZFight({ world, zones: manager, auto: params.has('zfight') });
    installBuildingDebug();
    world.lights.verbose = true;
  }

  // Every room of the flat is built first (nothing is lost, `prime` activates them all next): the cat roams them all.
  // One room per step of the loading bar; `build` hands back the room already built below.
  for (const id of FLAT) {
    if (id === 'living') continue;
    await loading.step(id);
    world.build(id);
  }
  await loading.step('life', 'Waking the building');
  const flatZones = FLAT.map((id) => world.zone(id));
  const flatHandles = FLAT.map((id) => world.build(id));
  wirePlayerGround(player, world, manager);
  cat.set(makeCat(services, world, { home, player, context, flat: { zones: flatZones, handles: flatHandles } }));
  wireBuildingLife(services, engine, world, { cat: cat.get(), building, flat, pastimes, manager });
  // The shelves of every zone as one are made after `prime`; a browsing friend asks for them later.
  const shelves = late<ShelvingGroup>('the shelves');
  const visitors = wireVisitors(services, engine, world, { home, cat: cat.get(), building, flat, context, activity, flatZones, shelves });
  const programs = late<ProgramRunner>('the program runner');
  const gatherings = wireGatherings(services, world, { visitors, home, flat, programs });
  // The end of the story (docs/story.md "The end"): once Mémé's photo is in her album, the closing reel at home.
  engine.addUpdatable(
    watchForTheEnd({
      memories,
      session: () => (session.isSet ? session.get() : null),
      family: services.family,
      facts: () => ({ prototype: services.story.stage === 'ended' }),
      quiet: () => (FLAT as readonly string[]).includes(manager.current.id) && !visitors.host.visiting && !gatherings.underWay,
    }),
  );

  // The whole flat is active (every room neighbours the others) and furnished: compiled and drawn once
  // now, so crossing a doorway costs nothing. The driver links the programs while the bar moves on.
  await loading.step('prime', 'Letting the light in');
  await world.prime();
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

  return { zones: manager, graphics, inspector, papers, cat: cat.get(), shelves: shelves.get(), pastimes, programs, activity };
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

/**
 * Félix's flat as the opening shows it (`intro/DreamFlat`), for a memory filmed there: every piece staged shown, every
 * bookcase slot of the collection room stood and full of the built-in games' covers. Null before the flat is built.
 */
function dreamOfFelix(world: GameWorld): DreamFlat | null {
  const living = world.handle('living');
  if (!living) return null;
  return new DreamFlat({
    living: {
      get bookcaseCount() {
        return living.shelving.bookcases.length;
      },
      standEveryBookcase: (every) => living.standEveryBookcase(every),
    },
    staged: stagedPieces,
    filmedZone: 'living',
    games: shuffled(seededRng('intro-covers'), SEED_GAMES.filter((game) => game.externalIds?.libretroName)),
    onGoing: () => {},
  });
}
