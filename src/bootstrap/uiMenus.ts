import type { Session } from '@/game/Session';
import type { ModalLike } from '@/game/SessionParts';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { PointerLockFlow } from '@/player/PointerLockFlow';
import { primaryCode } from '@/input';
import { eraseProgress, hasProgress } from '@/settings';
import { inFlat } from '@/world/worldPlan';
import type { ZoneId } from '@/world/zoneIds';
import type { ZoneManager } from '@/world/zone';
import { Overlay } from '@/ui/Overlay';
import { Notices } from '@/notices';
import { CatSettingsForm } from '@/ui/CatSettings';
import { QualityPicker } from '@/ui/QualityPicker';
import { StoragePanel } from '@/ui/StoragePanel';
import { addGameSettings } from '@/ui/settings/GameSettingsForm';
import { addSaveFileSettings } from '@/ui/settings/SaveFileSettings';
import { summarise } from '@/share/collectionSummary';
import { LibretroCoverProvider } from '@/covers/LibretroCoverProvider';
import { isPrototype } from '@/story';
import { controlsGroupOf, zoneName } from '@/ui/menu/zoneNames';
import { formatNumber } from '@/text/count';
import { version } from '../../package.json';
import { late, type Late } from './late';
import type { Services } from './services';

/** What the menus read of things made after them: where the player is, the rules. */
export interface UiLate {
  zones: Late<ZoneManager<ZoneId>>;
  session: Late<Session>;
}

/** The start card and pause menu, what the game tells the player, and the way into the room. */
export interface Menus {
  overlay: Overlay;
  notices: Notices;
  lockFlow: PointerLockFlow;
}

/**
 * The start card and pause menu with the pointer lock flow (the card's button enters the room through the flow, which
 * needs the card first), the notices (their clocks stop under the pause menu), and the Settings tabs: graphics, the
 * game, the cat, the save as a file and the collection to share.
 */
export function createMenus(services: Services, player: FirstPersonController, holders: UiLate): Menus {
  const { container, engine, input, settings, wallet, collection, fame, coverUrl, catSettings } = services;
  const here = (): ZoneId => holders.zones.get().current.id;
  const lockFlowRef = late<PointerLockFlow>('the pointer lock flow');
  // The pause menu's Collection button presses Tab (virtual presses skip the key bindings), which the Session toggles the editor on.
  // Out of the flat it offers Go home; its summary reads the wallet, the collection and the zone.
  const overlay = new Overlay(container, input, () => void lockFlowRef.get().enter(), {
    onCollection: () => input.pressVirtual(primaryCode('collection')),
    status: () => [
      ['Coins', formatNumber(wallet.coins)],
      ['Tickets', formatNumber(wallet.tickets)],
      ['Games', String(collection.games.length)],
      ['Where', zoneName(here())],
    ],
    goHome: {
      available: () => !inFlat(here()),
      go: () => {
        void lockFlowRef.get().resume();
        holders.session.get().travel('hallway');
      },
    },
    controlsGroup: () => controlsGroupOf(here()),
    hasProgress: hasProgress(),
    onNewGame: eraseProgress,
    version,
    textSize: { get: () => settings.settings.uiScale, set: (uiScale) => settings.update({ uiScale }) },
  });
  // What the game tells the player, each kind in its place (src/notices): its clocks stop under the pause menu.
  const notices = new Notices(container, { camera: engine.camera, attending: () => !document.hidden && (overlay.isPlaying || overlay.isModal) });
  engine.addUpdatable(notices);
  const lockFlow = lockFlowRef.set(new PointerLockFlow(player, overlay, engine.renderer.domElement, input, notices));
  overlay.addSetting('display', 'Graphics', new QualityPicker((options) => overlay.confirm(options)).element, QualityPicker.NOTE);
  addGameSettings(overlay, settings, { onEraseProgress: eraseProgress, version });
  overlay.addSetting('game', 'Cat', new CatSettingsForm(catSettings).element);
  // The save as a file and back, and the collection to share (a picture, a page with covers straight from GitHub).
  const githubCovers = new LibretroCoverProvider({ proxy: null });
  addSaveFileSettings(overlay, {
    version,
    summary: () => summarise(collection.games, (game) => fame.peek(game)),
    coverUrl,
    publicCoverUrl: (game) => (isPrototype(game) ? undefined : githubCovers.getBoxArt(game).front),
  });
  return { overlay, notices, lockFlow };
}

/**
 * The pause menu's buttons besides the fixed ones: the journal and the People book (panels), photo mode and the
 * search (a controller or a touchscreen has no P or F: back in the room, then the key), the room from above (at home
 * only), the room's furniture put back (once something was moved, after a yes), and the furniture put away, taken
 * out in front of the player. Returns the storage panel it made for the last.
 */
export function addPauseButtons(services: Services, player: FirstPersonController, holders: UiLate, menus: Menus, panels: { journalPanel: ModalLike; peopleBook: Late<ModalLike> }): StoragePanel {
  const { container, input } = services;
  const { overlay, lockFlow } = menus;
  const here = (): ZoneId => holders.zones.get().current.id;
  overlay.addPauseButton('journal', 'Journal', () => holders.session.get().openPanel(panels.journalPanel));
  overlay.addPauseButton('people', 'People', () => holders.session.get().openPanel(panels.peopleBook.get()));
  const inRoomThen = (code: string) => inRoomThenRun(() => input.pressVirtual(code));
  const inRoomThenRun = (run: () => void) => {
    const press = () => {
      window.clearTimeout(giveUp);
      player.controls.removeEventListener('lock', press);
      run();
    };
    // Once the room is entered; a lock that never comes (the return card) forgets the press rather than firing it later.
    const giveUp = window.setTimeout(() => player.controls.removeEventListener('lock', press), 4000);
    player.controls.addEventListener('lock', press);
    void lockFlow.resume();
  };
  overlay.addPauseButton('photo', 'Photo mode', () => inRoomThen(primaryCode('photoMode')));
  overlay.addPauseButton('search', 'Search a game', () => inRoomThen(primaryCode('search')));
  overlay.addPauseButton('plan-room', 'Plan the room', () => inRoomThen(primaryCode('planView')), () => holders.zones.isSet && inFlat(here()) && here() !== 'stairwell');
  // The room's furniture back where it came (docs/furnishing.md): only once something in it was moved, after a yes.
  const movedHere = () => (holders.zones.isSet ? services.furnishings.piecesIn(holders.zones.get().current).filter((piece) => services.furnishings.moved(piece)) : []);
  overlay.addPauseButton(
    'reset-furniture',
    'Put the furniture back',
    () => {
      const moved = movedHere();
      overlay.confirm({
        title: 'Put this room back as it was?',
        message: `${moved.length === 1 ? `The ${moved[0]!.name.toLowerCase()} goes` : `The ${moved.length} pieces you moved go`} back where they stood when they came. The shelves are not touched.`,
        yes: 'Put it back',
        onYes: () => services.furnishings.sendAllHome(movedHere()),
      });
    },
    () => movedHere().length > 0,
  );
  // The furniture put away (X while carrying), taken out in front of the player in the room they are in.
  const storagePanel = new StoragePanel(container);
  overlay.addPauseButton(
    'stored-furniture',
    'Stored furniture',
    () => {
      const stored = services.furnishings.storedPieces();
      storagePanel.show(
        stored.map((piece) => ({ name: piece.name, room: zoneName(piece.zone.id as ZoneId) })),
        (index) => {
          const piece = stored[index];
          if (piece) inRoomThenRun(() => holders.session.get().takeOutStored(piece));
        },
      );
      holders.session.get().openPanel(storagePanel);
    },
    () => services.furnishings.storedPieces().length > 0,
  );
  return storagePanel;
}
