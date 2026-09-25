import type * as THREE from 'three';
import type { Game, PlatformId } from '@/catalog/types';
import { Vector3 } from 'three';
import { Engine } from '@/core/Engine';
import { Input } from '@/core/Input';
import { CssLayer } from '@/core/CssLayer';
import { FirstPersonController } from '@/player/FirstPersonController';
import { PointerLockFlow } from '@/player/PointerLockFlow';
import { World } from '@/world/World';
import { Sky } from '@/world/Sky';
import { parseHoliday, parseSeason } from '@/world/props/outdoors/season';
import { RetroShopLure } from '@/world/props/outdoors/RetroShopLure';
import { parseLatitude } from '@/world/props/solar';
import { parseWeather } from '@/world/weather/Weather';
import { StreetAmbience } from '@/audio/StreetAmbience';
import { getPlatform } from '@/catalog/platforms';
import { SoundOcclusion } from '@/world/acoustics/SoundOcclusion';
import { ZoneManager, PortalCuller } from '@/world/zone';
import { FLAT, KITCHEN_WING, SUN_ROTATION_Y, WORLD_PLAN } from '@/world/worldPlan';
import { ZONE_BUILDERS, type BuildContext, type RoomHandle, type ZoneHandle } from '@/world/layout';
import { setupGraphics } from '@/graphics';
import { startPerfLog } from '@/core/PerfLog';
import { furnishCat, CatSettingsStore } from '@/world/cat';
import { Overlay } from '@/ui/Overlay';
import { GamePanel } from '@/ui/GamePanel';
import { Toast } from '@/ui/Toast';
import { SearchBar } from '@/ui/SearchBar';
import { CollectionEditor } from '@/ui/CollectionEditor';
import { CatSettingsForm } from '@/ui/CatSettings';
import { CataloguePanel } from '@/ui/CataloguePanel';
import { SellPanel } from '@/ui/SellPanel';
import { HagglePanel } from '@/ui/market/HagglePanel';
import { TradePanel } from '@/ui/market/TradePanel';
import { NoticeBoardPanel } from '@/ui/market/NoticeBoardPanel';
import { JobLotPanel } from '@/ui/market/JobLotPanel';
import { shelfRoomNote } from '@/ui/market/shelfRoom';
import { TravelMenu } from '@/ui/TravelMenu';
import { WalletHud } from '@/ui/WalletHud';
import { Fader } from '@/ui/Fader';
import { QualityPicker } from '@/ui/QualityPicker';
import { Interactor } from '@/interaction/Interactor';
import { Inspector } from '@/interaction/Inspector';
import { Session } from '@/game/Session';
import { Sleep } from '@/game/Sleep';
import { Highlighter } from '@/game/Highlighter';
import { SEED_GAMES } from '@/catalog';
import { CollectionStore } from '@/collection/CollectionStore';
import { Deliveries } from '@/collection/Deliveries';
import { GameList } from '@/collection/GameList';
import { HomeUpgrades } from '@/economy/HomeUpgrades';
import { ShelvingGroup } from '@/world/shelving/ShelvingGroup';
import { StrayGames } from '@/world/strays/StrayGames';
import type { BedroomHandle } from '@/world/bedroom/furnishBedroom';
import { LibretroIndex } from '@/collection/LibretroIndex';
import { CoverArtResolver } from '@/covers/CoverArtProvider';
import { LibretroCoverProvider } from '@/covers/LibretroCoverProvider';
import { BoxArtLoader } from '@/covers/BoxArtLoader';
import { YouTubeSearchProvider } from '@/video/YouTubeSearchProvider';
import { GamepadInput, TouchControls, SyntheticMouse } from '@/input';
import { ArcadeDaily, ArcadeLeague, ArcadeMedals, ArcadeScores, Fame, MarketCalendar, MarketLedger, MarketNotices, MarketStanding, MarketStock, PayoutStats, PrizeStore, STARTING_COINS, Wallet } from '@/economy';
import { TICKET_GAMES } from '@/world/arcade/arcadePlan';
import { PrizePanel } from '@/ui/PrizePanel';
import { ArcadeScreenPanel } from '@/ui/ArcadeScreenPanel';
import { PayoutOverlay } from '@/ui/PayoutOverlay';
import { simulatePayouts } from '@/world/arcade/payoutSim';
import { unlockAudioOnFirstGesture } from '@/audio/audioContext';
import { Travel, type TravelStop } from '@/world/travel';

const container = document.getElementById('app');
if (!container) throw new Error('#app container not found');

// --- Engine and data sources ------------------------------------------------------------------
const params = new URLSearchParams(location.search);
/** `?debug`: the built-in seed collection and the editor's "add a game" pane, instead of earning every game. */
const debug = params.has('debug');
const engine = new Engine(container);
const input = new Input();
const cssLayer = new CssLayer(container);
engine.addLayer(cssLayer);

// The collection starts empty: games are bought at the market with coins won at the arcade. Whatever
// the player owns is persisted in localStorage; an exported collection can still be imported (Tab).
const collection = new CollectionStore(debug ? SEED_GAMES : []);
// Games bought while out wait in a parcel in the hallway until unpacked; the shelves show the rest.
const deliveries = new Deliveries(collection);
// A game or two left lying about the flat each day (the kitchen table, a nightstand): off their shelves until picked up.
const strays = new StrayGames(deliveries.shelved);
// Furniture bought for the flat: the bedroom's bookcases, which take what the collection room cannot hold.
const upgrades = new HomeUpgrades();
const overflow = new GameList();
const wallet = new Wallet(STARTING_COINS);
// The arcade: its hall of fame, the day's challenge and change machine, the prizes taken home.
const scores = new ArcadeScores();
const arcadeDaily = new ArcadeDaily({ games: TICKET_GAMES });
const prizes = new PrizeStore();
// Medals per machine, the weekly league and the day streak, the balance table (`?payout`), and the big frame LexiPunk plays in.
const medals = new ArcadeMedals();
const league = new ArcadeLeague();
const payoutStats = new PayoutStats();
const arcadeScreen = new ArcadeScreenPanel(container);
const index = new LibretroIndex();
const fame = new Fame();

// Box art: chain of providers, first URL per face wins; missing faces are generated. Add IGDB/ScreenScraper here later.
// Art goes through `/api/art` (disk cache in dev, serverless function in production).
const libretroCovers = new LibretroCoverProvider({ proxy: '/api/art' });
const coverResolver = new CoverArtResolver([libretroCovers]);
/** A front cover for the DOM panels' thumbnails (the catalogue, the WE BUY desk). */
const coverUrl = (game: Game) => libretroCovers.getBoxArt(game).front;
const covers = new BoxArtLoader(coverResolver, engine.renderer.capabilities.getMaxAnisotropy());
const videos = new YouTubeSearchProvider();

// --- World and player -------------------------------------------------------------------------
// One sky for every zone; the world is a set of zones built on demand from WORLD_PLAN (see docs/zones.md).
// `?season=winter` (or `autumn:0.9`) and `?weather=rain` override the calendar and the forecast, `?lat=48.85` the
// latitude the sun rises and sets for (see docs/outdoors.md).
const sky = new Sky({ sunRotationY: SUN_ROTATION_Y, nearWall: KITCHEN_WING, season: parseSeason(params.get('season')), holiday: parseHoliday(params.get('holiday')), weather: parseWeather(params.get('weather')), latitude: parseLatitude(params.get('lat')) });
// The market restocks every morning of the game's clock; haggles, holds, orders and games sold to it are
// remembered, and so is how well it knows the player (reputation, regulars at each stall).
const ledger = new MarketLedger();
const standing = new MarketStanding();
const market = new MarketStock({ index, collection, fame, calendar: new MarketCalendar(sky.dayNight), ledger, standing, raining: () => sky.weather.state.rain >= 0.45 });
engine.addUpdatable(sky);
const world = new World(engine);
// The street heard through the nearest window; the retro games shop across it shows the market's stock once drawn.
const streetWalls = new SoundOcclusion(() => world.occluders);
engine.addUpdatable(new StreetAmbience({ listener: engine.camera, panes: () => sky.outdoors.panesIn(engine.scene), sky: () => sky.dayNight.state, wallsBetween: (a, b) => streetWalls.wallsBetween(a, b), life: () => sky.outdoors.life.events }));
// The retro games shop shows the day's stock; on a new market day, until the player has been, a banner and a queue.
new RetroShopLure(sky.outdoors, market, {
  colorOf: (platform) => `#${getPlatform(platform as PlatformId).accentColor.toString(16).padStart(6, '0')}`,
  here: () => zones.current.id,
});
// Post-processing, reflections and haze (see docs/graphics.md), set up before anything compiles; the
// grade and the air follow the player's zone. The callbacks are only read once the loop runs.
const graphics = setupGraphics(engine, {
  focus: () => inspector.focusDistance,
  lightLevel: () => {
    const handle = zones.current.handle as ZoneHandle | null;
    return handle?.lightLevel?.() ?? handle?.room?.lightLevel ?? 1;
  },
});
const lookOf = (id: string) => WORLD_PLAN.zones.find((plan) => plan.id === id)?.look;
const context: BuildContext = {
  cssLayer,
  listener: engine.camera,
  acoustics: new SoundOcclusion(() => world.occluders),
  games: collection,
  shelved: strays,
  strays,
  deliveries,
  overflow,
  upgrades,
  covers,
  sky,
  onSelectPlatform: (id) => session.focusPlatform(id),
  input,
  market,
  wallet,
  scores,
  arcadeDaily,
  prizes,
  arcadeMedals: medals,
  arcadeLeague: league,
  arcadeScreen,
  // The feather wand (an arcade prize) calls the cat over; `cat` exists by the time anyone can click it.
  callCat: () => {
    const name = catSettings.settings.name;
    return { coming: `${name} comes running for the feathers!`, ignored: `${name} watches the feathers swish, and decides against it.`, asleep: `${name} is asleep. The feathers can wait.` }[cat.call()];
  },
};
for (const plan of WORLD_PLAN.zones) world.addZone(plan, (zone) => ZONE_BUILDERS[plan.kind](zone, context));
const home = world.zone(WORLD_PLAN.start).activate() as RoomHandle; // built by ZONE_BUILDERS.collectionRoom

const player = new FirstPersonController(engine.camera, engine.renderer.domElement, input, world.collisions);
player.setPosition(0, 1.5);
engine.addUpdatable(player);
// Streams zones around the player: current + neighbours active, the rest dormant (and unloaded unless persistent).
// Only the zone the player stands in runs its sky ambient and re-renders its shadow maps every frame (see `OccupancyAware`).
const zones = new ZoneManager(world.zones, engine.camera, { start: WORLD_PLAN.start });
engine.addUpdatable(zones);
zones.current.setOccupied(true);
graphics.setLook(lookOf(zones.current.id), true);
zones.events.onZoneChange = (zone, previous) => {
  previous.setOccupied(false);
  zone.setOccupied(true);
  graphics.setLook(lookOf(zone.id));
};
// Of the active zones, only draw the player's and those seen through an open doorway in view.
engine.addUpdatable(new PortalCuller(world.zones, zones, engine.camera));
if (params.has('stats')) {
  const perf = startPerfLog(engine, {
    drawCurrentZoneOnly: () => world.zones.forEach((zone) => zone !== zones.current && zone.setDrawn(false)),
    drawAllZones: () => world.zones.forEach((zone) => zone.isActive && zone.setDrawn(true)),
    shadowLightsOutsideCurrentZone: () => {
      const lights: THREE.Light[] = [];
      for (const zone of world.zones) {
        if (zone === zones.current) continue;
        zone.group.traverse((obj) => {
          const light = obj as THREE.Light;
          if (light.isLight && light.castShadow) lights.push(light);
        });
      }
      return lights;
    },
  });
  // Console handle for profiling: `bibliothek.bisect()` runs the F9 bisection, `bibliothek.player.setPosition(x, z)` teleports.
  Object.assign(globalThis, { bibliothek: { engine, world, player, zones, graphics, bisect: perf.bisect } });
}

// The cat: name and coat persist next to the collection; it needs the player (to watch and flee) and the clock (to nap).
const catSettings = new CatSettingsStore();
// It roams the whole flat through the open doors: every room is built first (nothing is lost, `prime` activates them all
// next), each room grown a little to reach over its doorways, with the spots its builder named and the bedroom's bed to nap on.
const flatZones = FLAT.map((id) => world.zone(id));
const flatHandles = flatZones.map((zone) => zone.build() as ZoneHandle);
const cat = furnishCat(world.zone(WORLD_PLAN.start), {
  settings: catSettings, player, clock: sky.dayNight, seats: home.seats, windows: home.windows, tv: home.tv,
  flat: {
    rooms: flatZones.map((zone) => zone.floorBounds.expandByScalar(0.1)),
    visits: flatHandles.flatMap((handle) => handle.catVisits ?? []),
    perches: [(world.zone('bedroom').handle as BedroomHandle).bed, ...flatHandles.flatMap((handle) => handle.catPerches ?? [])],
    waters: flatHandles.flatMap((handle) => handle.catWaters ?? []),
  },
});
// The whole flat is active (every room neighbours the others) and furnished: compiled and drawn once
// now, so crossing a doorway costs nothing.
world.prime();
// Covers nearest to the player download first.
setInterval(() => covers.setPriorityOrigin(engine.camera.position), 1000);

// --- Interaction and UI -----------------------------------------------------------------------
// The pause menu's Collection button presses Tab, which the Session toggles the editor on.
const overlay = new Overlay(container, input, () => void lockFlow.enter(), { onCollection: () => input.pressVirtual('Tab') });
const lockFlow = new PointerLockFlow(player, overlay, engine.renderer.domElement, input);
overlay.addSetting('Graphics', new QualityPicker().element, QualityPicker.NOTE);
overlay.addSetting('Cat', new CatSettingsForm(catSettings).element);
const panel = new GamePanel(container);
const toast = new Toast(container);
const search = new SearchBar(container);
const editor = new CollectionEditor(container, collection, index, { canAdd: debug });
const catalogue = new CataloguePanel(container, collection, index, wallet, fame, { market, coverUrl });
const sellDesk = new SellPanel(container, collection, wallet, fame, market, { coverUrl, standing });
// The market's other panels: haggling and swapping over the copy in hand, the notice board, the job lot.
const haggle = new HagglePanel(container, wallet);
const trade = new TradePanel(container, wallet, collection, fame, coverUrl);
const noticeBoard = new NoticeBoardPanel(container, { wallet, collection, market, ledger, standing, notices: new MarketNotices({ fame, ledger }) });
const jobLot = new JobLotPanel(container, { wallet, collection, market }, coverUrl);
context.marketHall = { standing, notices: noticeBoard, lot: jobLot };
const prizeCounter = new PrizePanel(container, wallet, prizes, { collection, games: SEED_GAMES });
// `?payout`: the arcade's balance table, and `simulatePayouts()` in the console (the cabinet games on autopilot).
if (params.has('payout')) {
  new PayoutOverlay(container, payoutStats);
  Object.assign(globalThis, { simulatePayouts });
}
const walletHud = new WalletHud(container, wallet);
// Sounds nobody clicked for (the arcade's machines and hum) wait for the first gesture to start the audio.
unlockAudioOnFirstGesture();
player.controls.addEventListener('lock', () => walletHud.setVisible(true));
player.controls.addEventListener('unlock', () => walletHud.setVisible(false));

// Going out: the front door (and the arcade's and market's exits) teleport between the zones that
// declare a `travel` arrival spot in WORLD_PLAN, behind a fade; the ZoneManager loads the destination.
const stops: TravelStop[] = WORLD_PLAN.zones.flatMap((plan) => {
  if (!plan.travel) return [];
  const zone = world.zone(plan.id);
  const [x, z] = plan.travel.arrival;
  // The street sets the player down in front of the door they came out of (keyed by the zone left).
  const from = Object.fromEntries(Object.entries(plan.travel.arrivals ?? {}).map(([id, { at, yaw }]) => [id, { position: zone.toWorld(new Vector3(at[0], 0, at[1])), yaw }]));
  return [{ id: plan.id, label: plan.travel.label, position: zone.toWorld(new Vector3(x, 0, z)), yaw: plan.travel.yaw, from }];
});
const fader = new Fader(container);
const travel = new Travel(stops, player, fader, () => zones.current.id);
// A night in the bedroom's bed: the same curtain, the shared clock wound on to the next morning.
const sleep = new Sleep(sky.dayNight, fader);
const travelMenu = new TravelMenu(container, input);

const inspector = new Inspector(engine.camera, engine.scene);
engine.addUpdatable(inspector);

const highlighter = new Highlighter();
engine.addUpdatable(highlighter);

const interactor = new Interactor(engine.camera);
interactor.add(...world.interactables);
world.events.onInteractableAdded = (item) => interactor.add(item);
world.events.onInteractableRemoved = (item) => interactor.remove(item);
// The walls cut the crosshair ray: nothing is clickable through them.
interactor.addOccluders(...world.occluders);
world.events.onOccluderAdded = (object) => interactor.addOccluders(object);
world.events.onOccluderRemoved = (object) => interactor.removeOccluders(object);
engine.addUpdatable(interactor);

// Controller and touch feed the same key / mouse channels the session already listens to.
const syntheticMouse = new SyntheticMouse(engine.renderer.domElement);
engine.addUpdatable(new GamepadInput(input, player, syntheticMouse, { keyAliases: { GamepadX: 'KeyE', GamepadY: 'KeyO', GamepadSelect: 'Tab', GamepadB: 'KeyB', GamepadRight: 'KeyH' } }));
new TouchControls(container, engine.renderer.domElement, input, player, syntheticMouse);

// The collection room's shelves and the bedroom's bought bookcases, searched and sorted as one.
const shelves = new ShelvingGroup(home.shelving, (world.zone('bedroom').handle as BedroomHandle | null)?.shelving ?? null);
// A stray game picked up becomes its shelf's own box (shown even if its room is out of view), which goes home when put down.
strays.homeBox = (gameId) => {
  const box = shelves.findBox(gameId);
  if (box) for (const zone of flatZones) zone.unhide(box);
  return box;
};

const session = new Session({
  player, inspector, interactor, overlay, panel, videos,
  toast, search, highlighter,
  // Search and the random pick look at the shelves: a game still in its parcel is not there yet.
  gameSource: deliveries.shelved,
  shelving: shelves,
  dayNight: sky.dayNight,
  collectionEditor: editor,
  cat,
  sleep,
  enterRoom: () => void lockFlow.enter(),
  wallet,
  collection,
  prizes,
  arcadeDaily,
  prizeCounter,
  arcadeScreen,
  medals,
  league,
  payoutStats,
  travel,
  travelMenu,
  catalogue,
  market,
  sellDesk,
  standing,
  haggle,
  trade,
  shelfRoom: () => shelfRoomNote(overflow.games.length, upgrades.count('bookcase')),
});
session.bindInput(input);

engine.start();
