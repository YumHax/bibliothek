import { Session } from '@/game/Session';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { shelfRoomNote } from '@/ui/market/shelfRoom';
import { bookcasesIn } from '@/world/build/bookcases';
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
    notices: ui.notices,
    search: ui.search,
    highlighter: interaction.highlighter,
    // Search and the random pick look at the shelves: a game still in its parcel is not there yet.
    gameSource: deliveries.shelved,
    shelving: built.shelves,
    dayNight: sky.dayNight,
    collectionEditor: ui.editor,
    cat: built.cat,
    // A household beat (cleaning, baking, a soak) is dark like a night: the keys wait for it too (the deaf route).
    sleep: { get isAsleep() { return moves.sleep.isAsleep || built.pastimes.isBusy; }, untilMorning: () => moves.sleep.untilMorning() },
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
    shelfRoom: () => shelfRoomNote(overflow.games.length, bookcasesIn(upgrades.count('bookcase')).bedroom, !upgrades.canBuy('bookcase')),
    // What the flat sends the player out with, and a night's dream on waking (docs/household.md).
    perks: services.perks,
    // Which machines' controls were spelled out once, kept with the first day's notes.
    arcadeHints: services.firstDay,
    // The first day ends once a longplay is on (or its last tip has been read).
    onScreenPlaying: () => services.firstDay.screenPlayed(),
    dreams: {
      afterSleep: () =>
        services.homeLife.dream().then((dream) => {
          if (dream) ui.dreamCard.show(dream);
          return dream !== null && dream !== undefined;
        }),
    },
  });
  session.bindInput(input);
  // The touch bar shows the buttons that work where the hands are (a box, a market copy, a machine, a seat).
  interaction.touch.setContext(() => session.handsContext);
  // A hold lasts its market day: one never collected gives its deposit back the next (docs/economy.md "Holds and orders").
  const refundHolds = (): void => {
    const back = services.tx.refundLapsedHolds(services.today.gameDay);
    if (back.ok) ui.notices.reward({ title: 'Deposit back', detail: `The market kept ${back.titles.join(', ')} for you till closing: your deposit is back in your pocket.`, coins: back.coins });
  };
  refundHolds();
  services.today.onNewGameDay(refundHolds);
  return session;
}
