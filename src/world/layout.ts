import * as THREE from 'three';
import type { PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { Zone } from './zone/Zone';
import { Television } from './Television';
import { Projector } from './Projector';
import { Seat } from './Seat';
import { Shelving } from './shelving/Shelving';
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
import { furnishDecor, placeClock, placeRoomLight } from './build/roomParts';
import { heardBy } from './build/hearing';
import { curtainsToSkylight, showWhenUpgraded } from './build/follow';
import { furnishCollectorCorner } from './collector/furnishCollector';

// The builders' shared types live in `buildContext.ts`; re-exported for the code that imported them from here.
export type { BuildContext, ZoneHandle, MarketHallServices, CollectionContext, HomeContext, MoneyContext, ArcadeContext, MarketContext } from './buildContext';

/** What the collection room built that other features (the cat, the session) need to know about. */
export interface RoomHandle extends ZoneHandle {
  shelving: Shelving;
  tv: Television;
  seats: Seat[];
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
  const { cssLayer, covers, sky, collection: { games, shelved, overflow }, home: { onSelectPlatform, upgrades, callCat, collector }, arcade: { prizes } } = ctx;
  const plan = ROOM_PLAN;
  const { width } = plan.room;

  // 0. The shell: floor, walls (cut by the doorways), ceiling, base lighting following the sky, and
  //    the door to the hallway hung in its doorway (the leaf moves its own collider through the zone's scoped set).
  const room = furnishShell(zone, sky, plan.room);

  // 1. Shelving sized to the collection; the right wall keeps clear of the projector picture.
  const pictureHalf = plan.projectorPicture.width / 2 + plan.projectorPicture.margin;
  //    What does not fit goes to `overflow`, for the bedroom's bookcases.
  const shelving = new Shelving(zone, covers, shelved ?? games, { room: plan.room, ...plan.shelving, rightWallKeepClear: { minZ: -pictureHalf, maxZ: pictureHalf }, overflow });
  zone.onUnload(() => shelving.dispose());

  // 2. Screens and seats.
  const tv = zone.placeAt(new Television(cssLayer, heardBy(ctx)), plan.tv);
  const projector = zone.placeAt(new Projector(cssLayer, { pictureWidth: plan.projectorPicture.width, ...heardBy(ctx) }), plan.projector);
  projector.aimAt(projector.worldToLocal(zone.toWorld(new THREE.Vector3(width / 2 - 0.005, plan.projectorPicture.centreY, 0))));
  const seats = plan.seats.map(({ at, cushion }) => {
    const seat = new Seat();
    seat.mountCushion(new Cushion(cushion));
    return zone.placeAt(seat, at);
  });

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
  const consoles = stand.slotAnchors().map((anchor) => zone.place(new Console(stand.slotWidth, onSelectPlatform), zone.toLocal(stand.localToWorld(anchor)), tv.rotation.y));
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

  // 6. Decoration: plants, rug, pictures, lamps, tables, straight from the plan; the radiator ticks
  //    (and the cat naps in its cradle).
  const radiators = furnishDecor(zone, ctx, plan.decor);

  // 7. Home goods bought at the market: the lava lamp on the side table. No light of its own, so it may come and go.
  if (upgrades) {
    const lamp = zone.placeAt(new LavaLamp(), plan.homeGoods.lamp.at);
    lamp.position.y += plan.homeGoods.lamp.y;
    showWhenUpgraded(zone, upgrades, 'lamp', lamp);
  }

  // 8. The arcade's feather wand, once won: on the projector rug, waved for the cat.
  if (prizes) zone.placeAt(new FeatherWand({ prizes, ...(callCat ? { callCat } : {}) }), plan.featherWand.at).position.y += plan.featherWand.lift;
  // 9. The collector's book on the sideboard, and what its milestones bring home: the brass plaque, the display cabinet.
  if (collector) furnishCollectorCorner(zone, collector, { covers, shelved: shelved ?? games });

  return { room, shelving, tv, seats, windows, catPerches: radiators };
}

/** A zone builder, as `ZONE_BUILDERS` lists it: bound to the `BuildContext` by `bindBuilder`. */
export type ContextBuilder<H extends ZoneHandle = ZoneHandle> = (zone: Zone, ctx: BuildContext) => H;

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
  arcade: lazy(() => import('./arcade/furnishArcade').then((m) => m.furnishArcade)),
  market: lazy(() => import('./market/furnishMarket').then((m) => m.furnishMarket)),
  street: lazy(() => import('./street/furnishStreet').then((m) => m.furnishStreet)),
} satisfies { [K in ZoneKind]: ContextBuilder | LazyContextBuilder };

/** What a `ZONE_BUILDERS` entry builds. */
type BuiltBy<B> = B extends ContextBuilder<infer H> ? H : B extends LazyContextBuilder<infer H> ? H : never;

/** What each zone kind's builder returns. */
export type ZoneHandles = { [K in ZoneKind]: BuiltBy<(typeof ZONE_BUILDERS)[K]> };

/** What each zone's builder returns, by zone id (`World<ZoneHandleById>`: `world.handle('bedroom')` is a `BedroomHandle`). */
export type ZoneHandleById = { [Id in ZoneId]: ZoneHandles[ZoneKindOf<Id>] };

/** `ZONE_BUILDERS[kind]` bound to `ctx`, as the `World` takes a zone's builder (a lazy one stays lazy). */
export function bindBuilder(kind: ZoneKind, ctx: BuildContext): ((zone: Zone) => ZoneHandle) | { load(): Promise<(zone: Zone) => ZoneHandle> } {
  const entry: ContextBuilder | LazyContextBuilder = ZONE_BUILDERS[kind];
  if (typeof entry === 'function') return (zone) => entry(zone, ctx);
  return { load: () => entry.load().then((build) => (zone: Zone) => build(zone, ctx)) };
}
