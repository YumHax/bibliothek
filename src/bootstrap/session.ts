import { Session } from '@/game/Session';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { shelfRoomNote } from '@/ui/market/shelfRoom';
import type { Services } from './services';
import type { Ui } from './ui';
import type { BuiltWorld } from './world';
import type { PlayerMoves } from './player';
import type { Interaction } from './input';

/**
 * The rules: the Session is handed every part it routes to (see `SessionParts`), then hears every
 * click and key press. Made last: nothing it is handed may still be missing.
 */
export function createSession(services: Services, parts: { player: FirstPersonController; ui: Ui; built: BuiltWorld; moves: PlayerMoves; interaction: Interaction }): Session {
  const { input, videos, deliveries, sky, wallet, collection, prizes, arcadeDaily, arcadeScreen, medals, league, payoutStats, market, standing, overflow, upgrades, tournament } = services;
  const { player, ui, built, moves, interaction } = parts;
  const session = new Session({
    player,
    inspector: interaction.inspector,
    interactor: interaction.interactor,
    overlay: ui.overlay,
    panel: ui.panel,
    videos,
    toast: ui.toast,
    search: ui.search,
    highlighter: interaction.highlighter,
    // Search and the random pick look at the shelves: a game still in its parcel is not there yet.
    gameSource: deliveries.shelved,
    shelving: built.shelves,
    dayNight: sky.dayNight,
    collectionEditor: ui.editor,
    cat: built.cat,
    sleep: moves.sleep,
    // Back the way the player was in (a controller player gets the virtual lock again).
    enterRoom: () => void ui.lockFlow.resume(),
    wallet,
    collection,
    prizes,
    arcadeDaily,
    prizeCounter: ui.prizeCounter,
    arcadeScreen,
    medals,
    league,
    payoutStats,
    tournament,
    travel: moves.travel,
    travelMenu: ui.travelMenu,
    catalogue: ui.catalogue,
    market,
    sellDesk: ui.sellDesk,
    standing,
    haggle: ui.haggle,
    trade: ui.trade,
    photo: interaction.photo,
    journalPanel: ui.journalPanel,
    shelfRoom: () => shelfRoomNote(overflow.games.length, upgrades.count('bookcase')),
  });
  session.bindInput(input);
  return session;
}
