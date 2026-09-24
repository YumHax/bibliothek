import type * as THREE from 'three';
import { Vector3 } from 'three';
import { Engine } from '@/core/Engine';
import { Input } from '@/core/Input';
import { CssLayer } from '@/core/CssLayer';
import { FirstPersonController } from '@/player/FirstPersonController';
import { PointerLockFlow } from '@/player/PointerLockFlow';
import { World } from '@/world/World';
import { Sky } from '@/world/Sky';
import { SoundOcclusion } from '@/world/acoustics/SoundOcclusion';
import { ZoneManager, PortalCuller } from '@/world/zone';
import { KITCHEN_WING, SUN_ROTATION_Y, WORLD_PLAN } from '@/world/worldPlan';
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
import { TravelMenu } from '@/ui/TravelMenu';
import { WalletHud } from '@/ui/WalletHud';
import { Fader } from '@/ui/Fader';
import { QualityPicker } from '@/ui/QualityPicker';
import { Interactor } from '@/interaction/Interactor';
import { Inspector } from '@/interaction/Inspector';
import { Session } from '@/game/Session';
import { Highlighter } from '@/game/Highlighter';
import { SEED_GAMES } from '@/catalog';
import { CollectionStore } from '@/collection/CollectionStore';
import { LibretroIndex } from '@/collection/LibretroIndex';
import { CoverArtResolver } from '@/covers/CoverArtProvider';
import { LibretroCoverProvider } from '@/covers/LibretroCoverProvider';
import { BoxArtLoader } from '@/covers/BoxArtLoader';
import { YouTubeSearchProvider } from '@/video/YouTubeSearchProvider';
import { GamepadInput, TouchControls, SyntheticMouse } from '@/input';
import { ArcadeScores, Fame, MarketStock, STARTING_COINS, Wallet } from '@/economy';
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
const wallet = new Wallet(STARTING_COINS);
const scores = new ArcadeScores();
const index = new LibretroIndex();
const fame = new Fame();
const market = new MarketStock(index, collection, fame);

// Box art: chain of providers, first URL per face wins; missing faces are generated. Add IGDB/ScreenScraper here later.
// Art goes through `/api/art` (disk cache in dev, serverless function in production).
const coverResolver = new CoverArtResolver([new LibretroCoverProvider({ proxy: '/api/art' })]);
const covers = new BoxArtLoader(coverResolver, engine.renderer.capabilities.getMaxAnisotropy());
const videos = new YouTubeSearchProvider();

// --- World and player -------------------------------------------------------------------------
// One sky for every zone; the world is a set of zones built on demand from WORLD_PLAN (see docs/zones.md).
const sky = new Sky({ sunRotationY: SUN_ROTATION_Y, nearWall: KITCHEN_WING });
engine.addUpdatable(sky);
const world = new World(engine);
// Post-processing, reflections and haze (see docs/graphics.md), set up before anything compiles; the
// grade and the air follow the player's zone. The callbacks are only read once the loop runs.
const graphics = setupGraphics(engine, {
  focus: () => inspector.focusDistance,
  lightLevel: () => (zones.current.handle as ZoneHandle | null)?.room.lightLevel ?? 1,
});
const lookOf = (id: string) => WORLD_PLAN.zones.find((plan) => plan.id === id)?.look;
const context: BuildContext = {
  cssLayer,
  listener: engine.camera,
  acoustics: new SoundOcclusion(() => world.occluders),
  games: collection,
  covers,
  sky,
  onSelectPlatform: (id) => session.focusPlatform(id),
  input,
  market,
  scores,
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
const cat = furnishCat(world.zone(WORLD_PLAN.start), { settings: catSettings, player, clock: sky.dayNight, seats: home.seats, windows: home.windows, tv: home.tv });
// The whole flat is active (every room neighbours the others) and furnished: compiled and drawn once
// now, so crossing a doorway costs nothing.
world.prime();
// Covers nearest to the player download first.
setInterval(() => covers.setPriorityOrigin(engine.camera.position), 1000);

// --- Interaction and UI -----------------------------------------------------------------------
const overlay = new Overlay(container, input, () => void lockFlow.enter());
const lockFlow = new PointerLockFlow(player, overlay, engine.renderer.domElement, input);
overlay.addCardSection(new QualityPicker().element);
const panel = new GamePanel(container);
const toast = new Toast(container);
const search = new SearchBar(container);
const editor = new CollectionEditor(container, collection, index, { canAdd: debug });
editor.addPanel('Cat', new CatSettingsForm(catSettings).element);
const catalogue = new CataloguePanel(container, collection, index, wallet, fame);
const walletHud = new WalletHud(container, wallet);
player.controls.addEventListener('lock', () => walletHud.setVisible(true));
player.controls.addEventListener('unlock', () => walletHud.setVisible(false));

// Going out: the front door (and the arcade's and market's exits) teleport between the zones that
// declare a `travel` arrival spot in WORLD_PLAN, behind a fade; the ZoneManager loads the destination.
const stops: TravelStop[] = WORLD_PLAN.zones.flatMap((plan) => {
  if (!plan.travel) return [];
  const zone = world.zone(plan.id);
  const [x, z] = plan.travel.arrival;
  return [{ id: plan.id, label: plan.travel.label, position: zone.toWorld(new Vector3(x, 0, z)), yaw: plan.travel.yaw }];
});
const travel = new Travel(stops, player, new Fader(container), () => zones.current.id);
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
engine.addUpdatable(new GamepadInput(input, player, syntheticMouse, { keyAliases: { GamepadX: 'KeyE', GamepadY: 'KeyO', GamepadSelect: 'Tab' } }));
new TouchControls(container, engine.renderer.domElement, input, player, syntheticMouse);

const session = new Session({
  player, inspector, interactor, overlay, panel, videos,
  toast, search, highlighter,
  gameSource: collection,
  shelving: home.shelving,
  dayNight: sky.dayNight,
  collectionEditor: editor,
  cat,
  enterRoom: () => void lockFlow.enter(),
  wallet,
  collection,
  scores,
  travel,
  travelMenu,
  catalogue,
});
session.bindInput(input);

engine.start();
