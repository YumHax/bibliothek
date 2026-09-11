import { Engine } from '@/core/Engine';
import { Input } from '@/core/Input';
import { CssLayer } from '@/core/CssLayer';
import { FirstPersonController } from '@/player/FirstPersonController';
import { PointerLockFlow } from '@/player/PointerLockFlow';
import { World } from '@/world/World';
import { furnishRoom } from '@/world/layout';
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
const world = new World(engine, covers);
const props = furnishRoom(world, {
  cssLayer,
  listener: engine.camera,
  games: collection,
  onSelectPlatform: (id) => session.focusPlatform(id),
});

const player = new FirstPersonController(engine.camera, engine.renderer.domElement, input, world.collisions, {
  bounds: world.room.bounds,
});
player.setPosition(0, 1.5);
engine.addUpdatable(player);

// The cat: name and coat persist next to the collection; it needs the player (to watch and flee) and the clock (to nap).
const catSettings = new CatSettingsStore();
const cat = furnishCat(world, { settings: catSettings, player, clock: props.dayNight, seats: props.seats, windows: props.windows, tv: props.tv });
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
  shelving: world.shelving,
  dayNight: props.dayNight,
  collectionEditor: editor,
  cat,
  enterRoom: () => void lockFlow.enter(),
});
session.bindInput(input);

engine.start();
