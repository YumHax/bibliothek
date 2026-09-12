import { Engine } from '@/core/Engine';
import { Input } from '@/core/Input';
import { CssLayer } from '@/core/CssLayer';
import { FirstPersonController } from '@/player/FirstPersonController';
import { PointerLockFlow } from '@/player/PointerLockFlow';
import { World } from '@/world/World';
import { Sky } from '@/world/Sky';
import { ZoneManager } from '@/world/zone';
import { SUN_ROTATION_Y, WORLD_PLAN } from '@/world/worldPlan';
import { ZONE_BUILDERS, type BuildContext, type RoomHandle } from '@/world/layout';
import { furnishCat, CatSettingsStore } from '@/world/cat';
import { Overlay } from '@/ui/Overlay';
import { GamePanel } from '@/ui/GamePanel';
import { Toast } from '@/ui/Toast';
import { SearchBar } from '@/ui/SearchBar';
import { CollectionEditor } from '@/ui/CollectionEditor';
import { CatSettingsForm } from '@/ui/CatSettings';
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

const container = document.getElementById('app');
if (!container) throw new Error('#app container not found');

// --- Engine and data sources ------------------------------------------------------------------
const engine = new Engine(container);
const input = new Input();
const cssLayer = new CssLayer(container);
engine.addLayer(cssLayer);

// The collection: built-in seed, then whatever the user changed (persisted in localStorage).
const collection = new CollectionStore(SEED_GAMES);

// Box art: chain of providers, first URL per face wins; missing faces are generated. Add IGDB/ScreenScraper here later.
// Art goes through `/api/art` (disk cache in dev, serverless function in production).
const coverResolver = new CoverArtResolver([new LibretroCoverProvider({ proxy: '/api/art' })]);
const covers = new BoxArtLoader(coverResolver, engine.renderer.capabilities.getMaxAnisotropy());
const videos = new YouTubeSearchProvider();

// --- World and player -------------------------------------------------------------------------
// One sky for every zone; the world is a set of zones built on demand from WORLD_PLAN (see docs/zones.md).
const sky = new Sky({ sunRotationY: SUN_ROTATION_Y });
engine.addUpdatable(sky);
const world = new World(engine);
const context: BuildContext = {
  cssLayer,
  listener: engine.camera,
  games: collection,
  covers,
  sky,
  onSelectPlatform: (id) => session.focusPlatform(id),
};
for (const plan of WORLD_PLAN.zones) world.addZone(plan, (zone) => ZONE_BUILDERS[plan.kind](zone, context));
const home = world.zone(WORLD_PLAN.start).activate() as RoomHandle; // built by ZONE_BUILDERS.collectionRoom

const player = new FirstPersonController(engine.camera, engine.renderer.domElement, input, world.collisions);
player.setPosition(0, 1.5);
engine.addUpdatable(player);
// Streams zones around the player: current + neighbours active, the rest dormant then unloaded.
engine.addUpdatable(new ZoneManager(world.zones, engine.camera, { start: WORLD_PLAN.start }));

// The cat: name and coat persist next to the collection; it needs the player (to watch and flee) and the clock (to nap).
const catSettings = new CatSettingsStore();
const cat = furnishCat(world.zone(WORLD_PLAN.start), { settings: catSettings, player, clock: sky.dayNight, seats: home.seats, windows: home.windows, tv: home.tv });
// Covers nearest to the player download first.
setInterval(() => covers.setPriorityOrigin(engine.camera.position), 1000);

// --- Interaction and UI -----------------------------------------------------------------------
const overlay = new Overlay(container, input, () => void lockFlow.enter());
const lockFlow = new PointerLockFlow(player, overlay, engine.renderer.domElement, input);
const panel = new GamePanel(container);
const toast = new Toast(container);
const search = new SearchBar(container);
const editor = new CollectionEditor(container, collection, new LibretroIndex());
editor.addPanel('Cat', new CatSettingsForm(catSettings).element);

const inspector = new Inspector(engine.camera, engine.scene);
engine.addUpdatable(inspector);

const highlighter = new Highlighter();
engine.addUpdatable(highlighter);

const interactor = new Interactor(engine.camera);
interactor.add(...world.interactables);
world.events.onInteractableAdded = (item) => interactor.add(item);
world.events.onInteractableRemoved = (item) => interactor.remove(item);
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
});
session.bindInput(input);

engine.start();
