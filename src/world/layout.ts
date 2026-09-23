import * as THREE from 'three';
import type { CssLayer } from '@/core/CssLayer';
import type { Input } from '@/core/Input';
import type { MarketStock } from '@/economy/MarketStock';
import type { ArcadeScores } from '@/economy/ArcadeScores';
import type { GameSource } from '@/collection/GameSource';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { Zone } from './zone/Zone';
import type { Sky } from './Sky';
import type { SoundOcclusion } from './acoustics/SoundOcclusion';
import type { Room } from './Room';
import { Television } from './Television';
import { Projector } from './Projector';
import { Seat } from './Seat';
import { Shelving } from './shelving/Shelving';
import { ROOM_PLAN } from './roomPlan';
import type { ZoneKind } from './worldPlan';
import { furnishShell } from './shell';
import { furnishHallway } from './hallway/furnishHallway';
import { furnishBathroom } from './bathroom/furnishBathroom';
import { furnishBedroom } from './bedroom/furnishBedroom';
import { furnishKitchen } from './kitchen/furnishKitchen';
import { furnishArcade } from './arcade/furnishArcade';
import { furnishMarket } from './market/furnishMarket';
import { RoomWindow } from './props/Window';
import { Poster } from './props/Poster';
import { ConsoleStand } from './props/ConsoleStand';
import { Console, type PlatformSelectHandler } from './props/Console';
import { PendantLamp } from './props/PendantLamp';
import { WallSwitch } from './props/WallSwitch';
import { WallClock } from './props/WallClock';
import { Cushion } from './props/Cushion';
import { placeDecor } from './props/decor';

/** The shared services every zone builder may draw on; `main.ts` assembles it once. */
export interface BuildContext {
  cssLayer: CssLayer;
  /** Object whose distance to a screen drives its volume (the camera). */
  listener: THREE.Object3D;
  /** Counts the walls between the listener and a screen, so a longplay is muffled from the next room. */
  acoustics: SoundOcclusion;
  /** The collection; the shelving, the consoles and the posters follow it live. */
  games: GameSource;
  covers: BoxArtLoader;
  /** The one sky: clock + view outside the windows. */
  sky: Sky;
  /** Clicking a console on the TV stand reports its platform. */
  onSelectPlatform?: PlatformSelectHandler;
  /** The keys, read directly by the arcade cabinets while a game runs. */
  input: Input;
  /** What the flea market has on its stalls today. */
  market: MarketStock;
  /** Best arcade scores, shown on the cabinets' attract screens. */
  scores: ArcadeScores;
}

/** What every zone builder returns at least: its `Room`. */
export interface ZoneHandle {
  room: Room;
}

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
export function furnishRoom(zone: Zone, { cssLayer, listener, acoustics, games, covers, sky, onSelectPlatform }: BuildContext): RoomHandle {
  const plan = ROOM_PLAN;
  const { width } = plan.room;

  // 0. The shell: floor, walls (cut by the doorways), ceiling, base lighting following the sky, and
  //    the door to the hallway hung in its doorway (the leaf moves its own collider through the zone's scoped set).
  const room = furnishShell(zone, sky, plan.room);

  // 1. Shelving sized to the collection; the right wall keeps clear of the projector picture.
  const pictureHalf = plan.projectorPicture.width / 2 + plan.projectorPicture.margin;
  const shelving = new Shelving(zone, covers, games, { room: plan.room, ...plan.shelving, rightWallKeepClear: { minZ: -pictureHalf, maxZ: pictureHalf } });
  zone.onUnload(() => shelving.dispose());

  // 2. Screens and seats.
  const tv = zone.placeAt(new Television(cssLayer, { listener, occlusion: acoustics }), plan.tv);
  const projector = zone.placeAt(new Projector(cssLayer, { pictureWidth: plan.projectorPicture.width, listener, occlusion: acoustics }), plan.projector);
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
  const onCurtainsChange = (): void => room.setSkylight(windows.reduce((sum, w) => sum + w.curtainOpenness, 0) / windows.length);
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
  //    around the room's ceiling light (click = switch it).
  const door = plan.room.doorways?.[0];
  const clockAt = door ? { wall: door.wall, along: door.along, y: door.height + plan.clock.aboveDoor } : plan.clock.fallback;
  zone.placeAt(new WallClock(sky.dayNight), clockAt);
  const pendant = zone.placeAt(new PendantLamp({ onSwitch: (on) => room.setLampOn(on) }), plan.pendant);
  // The switch by the door drives the same lamp, so either works.
  zone.placeAt(new WallSwitch({ lamp: pendant }), plan.lightSwitch);

  // 6. Decoration: plants, rug, pictures, lamps, tables, straight from the plan.
  placeDecor(zone, plan.decor);

  return { room, shelving, tv, seats, windows };
}

/**
 * One builder per zone kind of `WORLD_PLAN`; `main.ts` binds them to the `BuildContext`. The
 * collection room is built here; every other room has its own folder (`src/world/<kind>/`) with
 * its plan and its builder.
 */
export const ZONE_BUILDERS: { [K in ZoneKind]: (zone: Zone, ctx: BuildContext) => ZoneHandle } = {
  collectionRoom: furnishRoom,
  hallway: furnishHallway,
  bathroom: furnishBathroom,
  bedroom: furnishBedroom,
  kitchen: furnishKitchen,
  arcade: furnishArcade,
  market: furnishMarket,
};
