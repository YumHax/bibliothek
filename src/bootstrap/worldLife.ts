import { Vector3 } from 'three';
import type { Engine } from '@/core/Engine';
import type { FirstPersonController } from '@/player/FirstPersonController';
import type { PlayerActivity } from '@/game/PlayerActivity';
import { SEED_GAMES } from '@/catalog';
import { isGrail } from '@/economy/grails';
import type { Pastimes } from '@/household';
import type { ProgramRunner } from '@/onscreen';
import { wireBuildingPerks } from '@/social/building/wire';
import type { BuildContext, ZoneHandle } from '@/world/buildContext';
import type { BuildingServices } from '@/world/stairwell/building';
import { catPlacers, followAdoption, furnishCat, placeCatEscapes, type Cat } from '@/world/cat';
import { placeHunt } from '@/world/hunt/placeHunt';
import type { ZoneHandleById } from '@/world/layout';
import type { ShelvingGroup } from '@/world/shelving/ShelvingGroup';
import { furnishVisitors } from '@/world/visitors';
import type { Visitors } from '@/world/visitors/Visitors';
import type { DoorLike } from '@/world/visitors/Visit';
import { furnishGatherings } from '@/world/visitors/gathering';
import { phoneFriends } from '@/world/visitors/phoneInvite';
import { WORLD_PLAN, inFlat } from '@/world/worldPlan';
import type { Zone } from '@/world/zone';
import type { ZoneManager } from '@/world/zone';
import type { ZoneId } from '@/world/zoneIds';
import { surfaceUnderfoot } from '@/world/zoneHandle';
import type { Late } from './late';
import type { Services } from './services';
import type { GameWorld } from './world';
import type { FlatPanels } from './worldContext';

/** Where the TV a seated friend watches stands (read every frame, copied by the visit). */
const tvAt = new Vector3();
/** Monthly Wikipedia views from which an open house's guest gasps at a copy (a household name). */
const RARE_VIEWS = 40_000;

/** What the collection room's builder returned: the cat's home, its shelves and screens. */
type HomeRoom = ZoneHandleById['living'];

/** The flat as built: its zones and what their builders returned (the cat's spots, perches and bowls among it). */
interface BuiltFlat {
  zones: Zone[];
  handles: ZoneHandle[];
}

/**
 * The cat: it needs the player (to watch and flee) and the clock (to nap). It roams the whole flat through the open
 * doors, each room grown a little to reach over its doorways, with the spots its builder named and the bedroom's bed
 * to nap on. Until it is adopted at the pet shop, the cat and its things wait unseen (`catPlacers`).
 */
export function makeCat(services: Services, world: GameWorld, parts: { home: HomeRoom; player: FirstPersonController; context: Pick<BuildContext, 'listener' | 'acoustics'>; flat: BuiltFlat }): Cat {
  const { sky, upgrades } = services;
  const { home, player, context, flat } = parts;
  const start = world.zone(WORLD_PLAN.start);
  const cat = furnishCat(start, {
    settings: services.catSettings, player, clock: sky.dayNight, seats: home.armchairs, windows: home.windows, tv: home.tv,
    placers: catPlacers(start, upgrades),
    furnishings: services.furnishings,
    listener: context.listener,
    acoustics: context.acoustics,
    flat: {
      rooms: flat.zones.filter((zone) => zone.id !== 'stairwell').map((zone) => zone.floorBounds.expandByScalar(0.1)),
      visits: flat.handles.flatMap((handle) => handle.catVisits ?? []),
      perches: [world.build('bedroom').bed, ...flat.handles.flatMap((handle) => handle.catPerches ?? [])],
      waters: flat.handles.flatMap((handle) => handle.catWaters ?? []),
    },
  });
  followAdoption(cat, upgrades);
  return cat;
}

/** The door of `zone` that leads to `to`, as the visits take a door. */
function doorTo(zone: Zone, to: ZoneId): DoorLike | null {
  return (zone.portals.find((p) => p.to === to)?.door as DoorLike | undefined) ?? null;
}

/** What the building's life is wired to. */
interface BuildingLifeParts {
  cat: Cat;
  building: BuildingServices;
  flat: FlatPanels;
  pastimes: Pastimes;
  manager: ZoneManager<ZoneId>;
}

/**
 * The building's life around the flat: the cat slipping out onto the stairs when the front door is left open
 * (docs/cat.md), the treasure hunt's clues round the building (docs/zones.md "The sixth floor"), and what the
 * neighbours give a friend (docs/social.md "The building's perks").
 */
export function wireBuildingLife(services: Services, engine: Engine, world: GameWorld, parts: BuildingLifeParts): void {
  const { collection, wallet, sky } = services;
  const { cat, building, flat, pastimes, manager } = parts;
  const hallway = world.zone('hallway');
  placeCatEscapes(world.zone('stairwell'), { cat, stairs: world.build('stairwell'), door: doorTo(hallway, 'stairwell'), eye: engine.camera, day: () => services.today.gameDay, doorstep: building.doorstep, notices: flat.notices });
  placeHunt({ today: services.today, journal: services.journal, notices: flat.notices, slipNote: (piece) => building.doorstep.slipNote(piece), stairwell: world.zone('stairwell') });
  wireBuildingPerks({
    collection, wallet, notices: flat.notices, pool: SEED_GAMES,
    day: () => services.today.gameDay, hour: () => sky.dayNight.state.hours,
    slipNote: (note) => building.doorstep.slipNote(note),
    story: services.story, beats: pastimes, post: building.post,
    onNewGameDay: (cb) => services.today.onNewGameDay(cb),
    camera: engine.camera, addUpdatable: (u) => engine.addUpdatable(u),
    cat: { bowl: cat.bowl, adopted: () => cat.adopted, catName: () => services.catSettings.settings.name },
    onFlat: (cb) => manager.onZoneChange((zone) => cb(inFlat(zone.id))),
  });
}

/** What the visitors are wired to. */
interface VisitorParts {
  home: HomeRoom;
  cat: Cat;
  building: BuildingServices;
  flat: FlatPanels;
  context: Pick<BuildContext, 'acoustics'>;
  activity: PlayerActivity;
  /** The flat's zones, for the floor a friend walks. */
  flatZones: Zone[];
  /** The shelves of every zone as one, made after `prime` (asked only when a friend browses). */
  shelves: Late<ShelvingGroup>;
}

/**
 * Friends who drop by some afternoons: the bell, a look at the shelves, a game borrowed and brought back
 * (docs/visitors.md). Made before `prime`, so their fade shaders compile with the flat's.
 */
export function wireVisitors(services: Services, engine: Engine, world: GameWorld, parts: VisitorParts): Visitors {
  const { collection, strays, sky, wallet, container, coverUrl, fame, covers, params } = services;
  const { home, cat, building, flat, context, activity, flatZones, shelves } = parts;
  const living = world.zone(WORLD_PLAN.start);
  const hallway = world.zone('hallway');
  const visitors = furnishVisitors({
    living,
    hallway,
    viewer: engine.camera,
    collection,
    shelved: strays,
    day: () => services.today.gameDay,
    clock: sky.dayNight,
    atHome: () => activity.atHome,
    busy: () => activity.busy,
    seats: home.seats,
    standing: home.armchairs,
    frontDoor: doorTo(hallway, 'stairwell'),
    livingDoor: doorTo(living, 'hallway'),
    container,
    purse: wallet,
    giftPool: SEED_GAMES,
    cat: () => (cat.adopted ? { at: cat.getWorldPosition(new Vector3()), name: services.catSettings.settings.name } : null),
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
    shelfBoxes: () => [...shelves.get().boxes, ...services.showcases.boxes()],
    // What stands in the displays: a friend comes to look, and says so.
    showcases: services.showcases,
    watch: () => (home.tv.isPlaying ? home.tv.getWorldPosition(tvAt).setY(0.9) : null),
    doorTaken: () => building.doorstep.waiting !== null,
    // `?visit`: a friend rings as soon as the player is home (testing).
    force: params.has('visit'),
    // A cake on the kitchen table: a slice, a longer stay, a thank-you (docs/household.md).
    hosting: { cakeOut: () => services.household.cakeOut, eatCake: () => services.household.eatCake() },
    // A click on a friend opens a conversation (docs/social.md "Friends").
    social: flat.social,
    // The lost prototype's trail: a friend chatted to may know where the grey cart is (src/story).
    talk: (friendId) => services.story.atFriend(friendId),
    book: services.visitBook,
  });
  building.doorstep.also(visitors);
  return visitors;
}

/**
 * More than one round at once (docs/visitors.md "Gatherings"): games nights, open houses, the collectors' club's
 * visit; the phone's rows and its invitations. The program runner (a games night's match on the TV) is made with the
 * Session: `session.ts` sets `programs`.
 */
export function wireGatherings(services: Services, world: GameWorld, parts: { visitors: Visitors; home: HomeRoom; flat: FlatPanels; programs: Late<ProgramRunner> }): void {
  const { collection, strays, fame, collectorWatch, params, sky } = services;
  const { visitors, home, flat, programs } = parts;
  const living = world.zone(WORLD_PLAN.start);
  const gatherings = furnishGatherings({
    host: visitors.host,
    hallway: world.zone('hallway'),
    tv: home.tv,
    programs: () => (programs.isSet ? programs.get() : null),
    standing: services.standing,
    honours: services.honours,
    collectionSize: () => collection.games.filter((g) => g.status !== 'wishlist').length,
    isRare: (game) => isGrail(game.id) || game.edition === 'firstPrint' || (fame.peek(game) ?? 0) >= RARE_VIEWS,
    showpiece: () => collectorWatch.showpieces(1, strays.games.filter((g) => g.status !== 'lent'))[0]?.game ?? null,
    // The displays with something in them: an open house's guests stop at them.
    showcases: () => services.showcases.stops(),
    honourAt: (id) => living.group.getObjectByName(`Honour:${id}`)?.getWorldPosition(new Vector3()) ?? null,
    social: flat.social,
    // `?gamesnight`, `?openhouse`, `?clubvisit`: that gathering as soon as the player is home (testing).
    force: params.has('gamesnight') ? 'night' : params.has('openhouse') ? 'house' : params.has('clubvisit') ? 'club' : undefined,
    book: services.gatheringBook,
  });
  flat.phone.setEvents({ list: () => gatherings.phoneRows(), call: (id) => gatherings.call(id as 'gamesNight' | 'openHouse') });
  // The bedroom's phone asks a friend round (`visitors/phoneInvite`: once a market day, if nobody came yet).
  flat.phone.setFriends(phoneFriends(visitors, services.household, () => sky.dayNight.state.hours));
}
