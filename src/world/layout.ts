import * as THREE from 'three';
import type { PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { LazyZoneBuilder, Zone, ZoneBuilder } from './zone/Zone';
import { Television } from './Television';
import { Projector } from './Projector';
import { Seat } from './Seat';
import { Shelving, slotCount } from './shelving/Shelving';
import { ROOM_PLAN } from './roomPlan';
import type { ZoneKind, ZoneKindOf } from './worldPlan';
import type { ZoneId } from './zoneIds';
import type { BuildContext, ZoneHandle } from './buildContext';
import { furnishShell } from './shell';
import { furnishHallway } from './hallway/furnishHallway';
import { furnishBathroom } from './bathroom/furnishBathroom';
import { furnishBedroom } from './bedroom/furnishBedroom';
import { furnishKitchen } from './kitchen/furnishKitchen';
import { furnishBalcony } from './balcony/furnishBalcony';
import { furnishStairwell } from './stairwell/furnishStairwell';
import { RoomWindow } from './props/Window';
import { Poster } from './props/Poster';
import { FeatherWand } from './prizes/FeatherWand';
import { ConsoleStand } from './props/ConsoleStand';
import { Console } from './props/Console';
import { Cushion } from './props/Cushion';
import { LavaLamp } from './props/LavaLamp';
import { placeClock, placeRoomLight } from './build/roomParts';
import { placeDecor } from './props/decor';
import { SideTable } from './props/SideTable';
import { Sideboard } from './props/Sideboard';
import { tickRadiators } from './acoustics/radiatorTicks';
import { ownedKey } from '@/furnishing/Furnishings';
import { heardBy } from './build/hearing';
import { curtainsToSkylight } from './build/follow';
import { placerFor } from './build/owned';
import { bookcasesIn, livingShelvingOptions, movableBookcases } from './build/bookcases';
import { labelledBookcases } from './labels/labelledBookcases';
import { furnishShowcases } from './showcase/furnishShowcases';
import { resolvePlacement } from './Placement';
import { furnishCollectorCorner, placeCollectorsBook } from './collector/furnishCollector';
import { rugsUnderfoot } from './build/rugsUnderfoot';
import { ChannelDial } from './roof/ChannelDial';
import { RecordPlayer } from './vinyl/RecordPlayer';
import { placeAnnexOpening } from './annex/AnnexOpening';
import { furnishAnnex } from './annex/furnishAnnex';
import { furnishStudy } from './annex/furnishStudy';
import { onRouxPhase } from '@/building/rouxMove';
import { regionLockFor } from '@/economy/regionLock';

// The builders' shared types live in `buildContext.ts`; re-exported for the code that imported them from here.
export type { BuildContext, ZoneHandle, MarketHallServices, CollectionContext, HomeContext, MoneyContext, ArcadeContext, MarketContext } from './buildContext';

/** What the collection room built that other features (the cat, the session) need to know about. */
export interface RoomHandle extends ZoneHandle {
  shelving: Shelving;
  tv: Television;
  /** Every armchair of the plan, bought or not (`ROOM_PLAN.seats` order). */
  seats: Seat[];
  /** The armchairs that stand (bought), in plan order; filled as they are bought. */
  armchairs: Seat[];
  /** The loft windows (the cat looks out of them and naps in their sun patch). */
  windows: RoomWindow[];
}

/**
 * Builds the collection room into its zone from `ROOM_PLAN`: shell, shelving, screens and seats, the
 * door, the windows, posters, the console stand, the clock, the pendant, then every `decor` entry.
 * Everything goes through `zone.place()` (zone-local coordinates) so it collides, ticks and is
 * clickable as its class says. Lights are switched by clicking them; playing a video never touches them.
 */
export function furnishRoom(zone: Zone, ctx: BuildContext): RoomHandle {
  const { cssLayer, covers, sky, collection: { games, shelved, overflow, arrangement, boxes }, home: { onSelectPlatform, upgrades, furnishings, callCat, collector }, arcade: { prizes } } = ctx;
  const plan = ROOM_PLAN;
  const { width } = plan.room;

  // 0. The shell: floor, walls (cut by the doorways), ceiling, base lighting following the sky, and
  //    the door to the hallway hung in its doorway (the leaf moves its own collider through the zone's scoped set).
  const room = furnishShell(zone, sky, plan.room);
  // The opening in the right wall to Mrs Roux's rooms (walled up till they are the flat's); first, so the shelving
  // below knows whether its front-right slot is still there (`bookcasesIn`).
  placeAnnexOpening(zone, ctx);

  // 1. Shelving along the back wall then the right one (clear of the projector picture): the one bookcase the flat
  //    starts with and those bought (`bookcasesIn`); what does not fit goes to `overflow`, for the bedroom's bookcases.
  const standing = (): number => (upgrades ? bookcasesIn(upgrades.count('bookcase')).living : slotCount(livingShelvingOptions()));
  const shelving = new Shelving(zone, covers, shelved ?? games, { ...livingShelvingOptions(), id: 'living', overflow, ...labelledBookcases(movableBookcases(zone, furnishings), ctx.home.shelfLabels, 'living'), ...(arrangement ? { arrangement } : {}), ...(boxes ? { pool: boxes } : {}), ...(upgrades ? { capacity: standing(), minBookcases: standing() } : {}) });
  zone.onUnload(() => shelving.dispose());
  if (upgrades) zone.onUnload(upgrades.subscribe(() => shelving.setCapacity(standing())));
  // The wall knocked through: the front-right slot is the opening's now, its bookcase goes next door.
  if (upgrades) zone.onUnload(onRouxPhase(() => shelving.setCapacity(standing())));
  // The display case and the pedestal, once bought: what the player puts on show stands there, off its shelf.
  furnishShowcases(zone, ctx);

  // 2. Screens and seats: the TV from the start; the projector and the armchairs once bought (staged till then, see
  //    `build/owned.ts`). `armchairs` lists the seats that stand, as they come (the cat's laps).
  const tv = zone.placeAt(new Television(cssLayer, heardBy(ctx)), plan.tv);
  const projector = placerFor(zone, upgrades, plan.projectorUpgrade).placeAt(new Projector(cssLayer, { pictureWidth: plan.projectorPicture.width, ...heardBy(ctx) }), plan.projector);
  // A Japanese copy plays only with its platform's converter bought (`economy/regionLock`).
  const regionLock = regionLockFor(upgrades);
  tv.regionLock = regionLock;
  projector.regionLock = regionLock;
  projector.aimAt(projector.worldToLocal(zone.toWorld(new THREE.Vector3(width / 2 - 0.005, plan.projectorPicture.centreY, 0))));
  const armchairs: Seat[] = [];
  const seatKeys = new Map<string, number>();
  const placed = plan.seats.map(({ at, cushion, upgrade }) => {
    const seat = new Seat();
    seat.mountCushion(new Cushion(cushion));
    const placer = placerFor(zone, upgrades, upgrade);
    placer.placeAt(seat, at);
    // Moved by the player (M) once bought.
    if (upgrade) furnishings?.register(zone, seat, { key: ownedKey(upgrade, seatKeys), at, owned: upgrade });
    return { seat, placer };
  });
  const seats = placed.map(({ seat }) => seat);
  // After `seats` exists: `onOwned` runs at once for an armchair already bought.
  for (const { seat, placer } of placed) {
    placer.onOwned(() => {
      armchairs.push(seat);
      armchairs.sort((a, b) => seats.indexOf(a) - seats.indexOf(b));
    });
  }

  // 3. Windows. Every window throws the sun (one shadow map each) while the sun is on its side; all
  //    panes show the sky's `Outdoors`. Clicking a window draws its curtains; the skylight follows how many are open.
  const { size: windowSize, list: windowPlans } = plan.windows;
  const mountY = RoomWindow.mountY(windowSize.height);
  const windows: RoomWindow[] = [];
  const onCurtainsChange = curtainsToSkylight(room, windows);
  for (const w of windowPlans) {
    windows.push(zone.placeAt(new RoomWindow(sky.outdoors, { ...windowSize, onCurtainsChange }), { wall: w.wall, along: w.along, y: mountY }));
  }

  // 4. Console stand under the TV with one console per platform, and the two posters; both follow the collection.
  const stand = zone.place(new ConsoleStand(), tv.position.clone(), tv.rotation.y);
  tv.mountOn(stand.topHeight);
  // The old tuner beside the set, once the roof's aerial (or the fibre) brought a channel in (`roof/channels`).
  zone.place(new ChannelDial({ tv, day: () => ctx.today.gameDay, hours: () => sky.dayNight.state.hours }), zone.toLocal(stand.localToWorld(new THREE.Vector3(0.53, stand.topHeight, 0.08))), tv.rotation.y);
  const consoles = stand.slotAnchors().map((anchor) => zone.place(new Console(stand.slotWidth, onSelectPlatform), zone.toLocal(stand.localToWorld(anchor)), tv.rotation.y));
  for (const deck of consoles) deck.regionLock = regionLock;
  // The consoles feed the TV: a game goes into its console, which plays it on the set.
  for (const deck of consoles) deck.setScreen(tv);
  tv.setDecks({
    forPlatform: (id) => consoles.find((c) => c.platformId === id) ?? null,
    lastLoaded: () => consoles.reduce<Console | null>((last, c) => (c.loaded && (!last || c.loadedAt > last.loadedAt) ? c : last), null),
  });
  const { width: pw, height: ph } = plan.posters.size;
  const platformsOf = (): PlatformId[] => [...new Set(games.games.map((g) => g.platform))];
  const collectionPoster = zone.placeAt(new Poster(pw, ph, Poster.bibliothek(games.games.length, platformsOf().map(getPlatform))), plan.posters.collection);
  const first = platformsOf()[0];
  const platformPoster = first ? zone.placeAt(new Poster(pw, ph, Poster.platform(getPlatform(first))), plan.posters.platform) : null;
  const refresh = (): void => {
    const ids = platformsOf();
    if (ids.length > consoles.length) console.warn(`[layout] ${ids.length - consoles.length} console(s) do not fit on the stand`);
    consoles.forEach((slot, i) => slot.setPlatform(i < ids.length ? getPlatform(ids[i]!) : null));
    collectionPoster.repaint(Poster.bibliothek(games.games.length, ids.map(getPlatform)));
    if (platformPoster && ids[0]) platformPoster.repaint(Poster.platform(getPlatform(ids[0])));
  };
  refresh();
  zone.onUnload(games.subscribe(refresh));

  // 5. Wall clock over the door (reads the room's time; click = toggle night) and the pendant fixture
  //    around the room's ceiling light (click = switch it; the switch by the door drives the same lamp).
  const door = plan.room.doorways?.[0];
  const clockAt = door ? { wall: door.wall, along: door.along, y: door.height + plan.clock.aboveDoor } : plan.clock.fallback;
  placeClock(zone, ctx, clockAt);
  placeRoomLight(zone, room, 'pendant', plan.pendant, plan.lightSwitch);

  // 6. Decoration: plants, rug, pictures, lamps, tables, straight from the plan (what is bought, movable: M); the
  //    radiator ticks (and the cat naps in its cradle).
  const decor = placeDecor(zone, plan.decor, upgrades, furnishings);
  const radiators = tickRadiators(zone, decor, heardBy(ctx));
  const sideTable = decor.find((item): item is SideTable => item instanceof SideTable);
  const sideboard = decor.find((item): item is Sideboard => item instanceof Sideboard);

  // 7. Home goods bought at the market: the lava lamp on the side table (once both are bought), riding it when it is moved.
  const lampAt = resolvePlacement(plan.room, plan.homeGoods.lamp.at);
  lampAt.position.y += plan.homeGoods.lamp.y;
  const lamp = new LavaLamp();
  const lampPlacer = placerFor(zone, upgrades, plan.homeGoods.lamp.upgrade);
  if (sideTable) {
    sideTable.updateWorldMatrix(true, false);
    lamp.position.copy(sideTable.worldToLocal(zone.toWorld(lampAt.position.clone())));
    lamp.rotation.y = lampAt.rotationY - sideTable.rotation.y;
    lampPlacer.placeWith(sideTable, lamp);
  } else {
    lampPlacer.place(lamp, lampAt.position, lampAt.rotationY);
  }

  // 7b. The sideboard's turntable plays the soundtrack LPs bought at the flea market (`world/vinyl`), riding the sideboard.
  if (sideboard?.turntable && upgrades) {
    const turntable = new RecordPlayer({ turntable: sideboard.turntable, owned: () => upgrades.count('record'), ...heardBy(ctx) });
    placerFor(zone, upgrades, 'sideboard').placeWith(sideboard, turntable, new THREE.Vector3());
  }

  // 8. The arcade's feather wand, once won: on the projector rug (on its pile once the rug is bought), waved for the cat.
  if (prizes) {
    const wand = zone.placeAt(new FeatherWand({ prizes, ...(callCat ? { callCat } : {}) }), plan.featherWand.at);
    placerFor(zone, upgrades, plan.featherWand.rug).onOwned(() => void (wand.position.y += plan.featherWand.lift));
  }
  // 9. The collector's book (on the sideboard once it is bought), and what its milestones bring home: the
  //    brass plaque, the display cabinet.
  //    The binder is there from the start (a milestone's reward waits in it), on the floor until the sideboard stands.
  if (collector) {
    const bought = placerFor(zone, upgrades, plan.collector.upgrade);
    // Up there, the binder and the plaque ride the sideboard when it is moved.
    const book = placeCollectorsBook(zone, collector, bought.owned, sideboard);
    bought.onOwned(() => {
      book.moveToSideboard();
      furnishCollectorCorner(zone, collector, { covers, shelved: shelved ?? games, ...(sideboard ? { sideboard } : {}) });
    });
  }

  return { room, shelving, tv, seats, armchairs, windows, catPerches: radiators, surfaceAt: rugsUnderfoot(zone) };
}

/**
 * A zone builder, as `ZONE_BUILDERS` lists it: bound to the `BuildContext` by `bindBuilder`. `sliced`, if it has one, is
 * the same build as steps, run over several idle moments when the zone is got ready ahead (`Zone.buildSliced`).
 */
export type ContextBuilder<H extends ZoneHandle = ZoneHandle> = ((zone: Zone, ctx: BuildContext) => H) & {
  readonly sliced?: (zone: Zone, ctx: BuildContext) => Iterator<void, H, void>;
};

/** A builder in a chunk of its own, fetched on demand (`import()`): the zones reached by travel, far from the flat. */
export interface LazyContextBuilder<H extends ZoneHandle = ZoneHandle> {
  load(): Promise<ContextBuilder<H>>;
}

/** `load` fetches the module once (and again after a failure), then hands back its builder. */
function lazy<H extends ZoneHandle>(load: () => Promise<ContextBuilder<H>>): LazyContextBuilder<H> {
  return { load };
}

/**
 * One builder per zone kind of `WORLD_PLAN`; `bootstrap/world.ts` binds them to the `BuildContext`
 * (`bindBuilder`). The collection room is built here; every other room has its own folder
 * (`src/world/<kind>/`) with its plan and its builder. The flat's rooms are built at start-up and
 * bundled with it; the zones reached by travel (arcade, market, street: not persistent, no
 * neighbours) are `lazy`, each in a chunk of its own that the `ZoneManager`, a travel or the idle
 * preload at start-up fetches before the zone is built.
 */
export const ZONE_BUILDERS = {
  collectionRoom: furnishRoom,
  hallway: furnishHallway,
  bathroom: furnishBathroom,
  bedroom: furnishBedroom,
  kitchen: furnishKitchen,
  balcony: furnishBalcony,
  stairwell: furnishStairwell,
  annex: furnishAnnex,
  annexStudy: furnishStudy,
  arcade: lazy(() => import('./arcade/furnishArcade').then((m) => m.furnishArcade)),
  market: lazy(() => import('./market/furnishMarket').then((m) => m.furnishMarket)),
  street: lazy(() => import('./street/furnishStreet').then((m) => m.furnishStreet)),
  shop: lazy(() => import('./shop/furnishShop').then((m) => m.furnishShop)),
  neighbourFlat: lazy(() => import('./neighbourFlat/furnishNeighbourFlat').then((m) => m.furnishNeighbourFlat)),
  courtyard: lazy(() => import('./courtyard/furnishCourtyard').then((m) => m.furnishCourtyard)),
  saleroom: lazy(() => import('./saleroom/furnishSaleroom').then((m) => m.furnishSaleroom)),
  sellerFlat: lazy(() => import('./sellerFlat/furnishSellerFlat').then((m) => m.furnishSellerFlat)),
  cellar: lazy(() => import('./cellar/furnishCellar').then((m) => m.furnishCellar)),
  attic: lazy(() => import('./attic/furnishAttic').then((m) => m.furnishAttic)),
  roof: lazy(() => import('./roof/furnishRoof').then((m) => m.furnishRoof)),
} satisfies { [K in ZoneKind]: ContextBuilder | LazyContextBuilder };

/** What a `ZONE_BUILDERS` entry builds. */
type BuiltBy<B> = B extends ContextBuilder<infer H> ? H : B extends LazyContextBuilder<infer H> ? H : never;

/** What each zone kind's builder returns. */
export type ZoneHandles = { [K in ZoneKind]: BuiltBy<(typeof ZONE_BUILDERS)[K]> };

/** What each zone's builder returns, by zone id (`World<ZoneHandleById>`: `world.handle('bedroom')` is a `BedroomHandle`). */
export type ZoneHandleById = { [Id in ZoneId]: ZoneHandles[ZoneKindOf<Id>] };

/** `ZONE_BUILDERS[kind]` bound to `ctx`, as the `World` takes a zone's builder (a lazy one stays lazy). */
export function bindBuilder(kind: ZoneKind, ctx: BuildContext): ZoneBuilder | LazyZoneBuilder {
  const entry: ContextBuilder | LazyContextBuilder = ZONE_BUILDERS[kind];
  const bind = (build: ContextBuilder): ZoneBuilder => {
    const { sliced } = build;
    return Object.assign((zone: Zone) => build(zone, ctx), sliced ? { sliced: (zone: Zone) => sliced(zone, ctx) } : {});
  };
  if (typeof entry === 'function') return bind(entry);
  return { load: () => entry.load().then(bind) };
}
