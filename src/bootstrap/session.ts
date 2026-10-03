import { Session } from '@/game/Session';
import { ProgramRunner } from '@/onscreen';
import { registerHomebrew } from '@/emulator';
import { registerPrototype } from '@/story';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { shelfRoomNote } from '@/ui/market/shelfRoom';
import { bookcasesIn } from '@/world/build/bookcases';
import { labelMaker } from '@/world/labels/labelMaker';
import { LabelPanel } from '@/ui/LabelPanel';
import { inFlat } from '@/world/worldPlan';
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
  // Games that run on the TV instead of a longplay (docs/media.md "Programs on the screen"): the emulator's homebrew carts.
  const programs = new ProgramRunner(input);
  services.engine.addUpdatable(programs);
  // A games night's match on the TV runs through it too (`visitors/gathering/GamesNight`).
  built.programs.set(programs);
  registerHomebrew();
  // ...and the lost prototype's cart (src/story): MOONPOST's demo, whose end closes the trail.
  registerPrototype(services.story, services.reviews);
  // K at home: the label maker (bought at SECOND HOME) prints a label for the shelf edge aimed at (docs/furnishing.md "Shelf labels").
  const labels = labelMaker({
    labels: services.shelfLabels,
    panel: new LabelPanel(services.container),
    shelves: built.shelves,
    camera: services.engine.camera,
    blocked: (from, to) => interaction.interactor.blocked(from, to),
    upgrades,
    atHome: () => inFlat(built.zones.current.id) && built.zones.current.id !== 'stairwell',
    notices: ui.notices,
  });
  const session = new Session({
    programs,
    labelMaker: labels,
    player,
    inspector: interaction.inspector,
    interactor: interaction.interactor,
    overlay: ui.overlay,
    panel: ui.panel,
    videos,
    notices: ui.notices,
    noticeDismiss: ui.notices,
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
    furniture: interaction.furniture,
    shelfPlacing: interaction.shelfPlacing,
    planView: interaction.planView,
    journalPanel: ui.journalPanel,
    shelfRoom: () => {
      // Past the collection room's walls: the bedroom's bookcase, then Mrs Roux's rooms once they are the flat's.
      const elsewhere = bookcasesIn(upgrades.count('bookcase'));
      return shelfRoomNote(overflow.games.length, elsewhere.bedroom + elsewhere.annex, !upgrades.canBuy('bookcase'));
    },
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
