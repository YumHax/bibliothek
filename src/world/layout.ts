import * as THREE from 'three';
import type { CssLayer } from '@/core/CssLayer';
import type { Input } from '@/core/Input';
import type { MarketStock } from '@/economy/MarketStock';
import type { ArcadeScores } from '@/economy/ArcadeScores';
import type { ArcadeDaily } from '@/economy/ArcadeDaily';
import type { PrizeStore } from '@/economy/Prizes';
import type { ArcadeMedals } from '@/economy/ArcadeMedals';
import type { ArcadeLeague } from '@/economy/ArcadeLeague';
import type { RemoteScreen } from './arcade/games';
import type { GameSource } from '@/collection/GameSource';
import type { GameList } from '@/collection/GameList';
import type { ParcelContents } from './props/Parcel';
import type { HomeUpgrades } from '@/economy/HomeUpgrades';
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
import { furnishBalcony } from './balcony/furnishBalcony';
import { furnishArcade } from './arcade/furnishArcade';
import { furnishMarket, type MarketHallServices } from './market/furnishMarket';
import { furnishStreet } from './street/furnishStreet';
import { RoomWindow } from './props/Window';
import { Poster } from './props/Poster';
import { FeatherWand } from './prizes/FeatherWand';
import { ConsoleStand } from './props/ConsoleStand';
import { Console, type PlatformSelectHandler } from './props/Console';
import { PendantLamp } from './props/PendantLamp';
import { WallSwitch } from './props/WallSwitch';
import { WallClock } from './props/WallClock';
import { Cushion } from './props/Cushion';
import { placeDecor } from './props/decor';
import { LavaLamp } from './props/LavaLamp';
import { tickRadiators } from './acoustics/radiatorTicks';
import type { StrayGames } from './strays/StrayGames';
import type { CatPerch } from './cat/spots';
import type { WaterBowlLike } from './cat/types';
import { placeWith } from './zone/attach';
import { PointSound } from './acoustics/PointSound';
import { ClockTick } from '@/audio/ambient';

/** The shared services every zone builder may draw on; `main.ts` assembles it once. */
export interface BuildContext {
  cssLayer: CssLayer;
  /** Object whose distance to a screen drives its volume (the camera). */
  listener: THREE.Object3D;
  /** Counts the walls between the listener and a screen, so a longplay is muffled from the next room. */
  acoustics: SoundOcclusion;
  /** The collection; the consoles and the posters follow it live. */
  games: GameSource;
  /** What the shelves show: the collection less what still waits in the parcel (`Deliveries.shelved`); `games` when absent. */
  shelved?: GameSource;
  /** The parcel in the hallway: games bought while out, waiting to be unpacked. */
  deliveries?: ParcelContents;
  /** Where the collection room's shelving writes the games it has no room for; the bedroom's bought bookcases show them. */
  overflow?: GameList;
  /** Furniture bought for the flat (the bedroom's bookcases, the market's home goods). */
  upgrades?: HomeUpgrades;
  /** The games left lying about the flat (the kitchen table, a nightstand); the shelves read `shelved` through it. */
  strays?: StrayGames;
  covers: BoxArtLoader;
  /** The one sky: clock + view outside the windows. */
  sky: Sky;
  /** Clicking a console on the TV stand reports its platform. */
  onSelectPlatform?: PlatformSelectHandler;
  /** The keys, read directly by the arcade cabinets while a game runs. */
  input: Input;
  /** What the flea market has on its stalls today. */
  market: MarketStock;
  /** The player's coins: the market's price tags read as affordable or not. */
  wallet: { readonly coins: number; readonly tickets: number; subscribe(cb: () => void): () => void };
  /** The arcade's hall of fame: the cabinets' attract screens, the board, the initials. */
  scores: ArcadeScores;
  /** The arcade's day: the challenge, whether the change machine works. */
  arcadeDaily?: ArcadeDaily;
  /** The prizes taken home from the arcade (the bedroom's prize shelf shows them). */
  prizes?: PrizeStore;
  /** The medals per arcade machine: lamps on the cabinets, the next one on their attract screens. */
  arcadeMedals?: ArcadeMedals;
  /** The arcade's weekly league and the player's streak (the league board). */
  arcadeLeague?: ArcadeLeague;
  /** The big frame a web-page cabinet game (LexiPunk) is played in. */
  arcadeScreen?: RemoteScreen;
  /** Calls the cat over (the feather wand won at the arcade), and says how that went. */
  callCat?: () => string;
  /** The flea market's own services: the panels its hall opens (notice board, job lot), how the market knows the player. */
  marketHall?: MarketHallServices;
}

/** What every zone builder returns: its `Room`, or for a zone without one (the street) how lit it is. */
export interface ZoneHandle {
  room?: Room;
  /** How lit the zone is, 0 dark .. 1 full day (reflections and haze follow it); a `Room` says it itself. */
  lightLevel?: () => number;
  /** Floor points (world) the cat comes to have a look at when it wanders out of the collection room. */
  catVisits?: THREE.Vector3[];
  /** Places in the room the cat naps on (a radiator's cradle, the dry bath); see `CatPerch`. */
  catPerches?: CatPerch[];
  /** Water bowls of the cat's put down in the room. */
  catWaters?: WaterBowlLike[];
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
export function furnishRoom(zone: Zone, { cssLayer, listener, acoustics, games, shelved, overflow, covers, sky, onSelectPlatform, upgrades, prizes, callCat }: BuildContext): RoomHandle {
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
  const clock = zone.placeAt(new WallClock(sky.dayNight), clockAt);
  placeWith(zone, clock, new PointSound(new ClockTick(), { listener, occlusion: acoustics, volume: { maxDistance: 5 } }), new THREE.Vector3(0, 0, 0.03));
  const pendant = zone.placeAt(new PendantLamp({ onSwitch: (on) => room.setLampOn(on) }), plan.pendant);
  // The switch by the door drives the same lamp, so either works.
  zone.placeAt(new WallSwitch({ lamp: pendant }), plan.lightSwitch);

  // 6. Decoration: plants, rug, pictures, lamps, tables, straight from the plan; the radiator ticks
  //    (and the cat naps in its cradle).
  const radiators = tickRadiators(zone, placeDecor(zone, plan.decor), { listener, occlusion: acoustics });

  // 7. Home goods bought at the market: the lava lamp on the side table. No light of its own, so it may come and go.
  if (upgrades) {
    const lamp = zone.placeAt(new LavaLamp(), plan.homeGoods.lamp.at);
    lamp.position.y += plan.homeGoods.lamp.y;
    const refresh = (): void => {
      lamp.visible = upgrades.count('lamp') > 0;
    };
    refresh();
    zone.onUnload(upgrades.subscribe(refresh));
  }

  // 8. The arcade's feather wand, once won: on the projector rug, waved for the cat.
  if (prizes) zone.placeAt(new FeatherWand({ prizes, ...(callCat ? { callCat } : {}) }), plan.featherWand);

  return { room, shelving, tv, seats, windows, catPerches: radiators };
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
  balcony: furnishBalcony,
  arcade: furnishArcade,
  market: furnishMarket,
  street: furnishStreet,
};
