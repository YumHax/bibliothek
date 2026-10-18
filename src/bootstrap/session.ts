import { Session } from '@/game/Session';
import { ProgramRunner } from '@/onscreen';
import { registerHomebrew } from '@/emulator';
import { registerPrototype } from '@/story';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { shelfRoomNote } from '@/ui/market/shelfRoom';
import { bookcasesIn } from '@/world/build/bookcases';
import { labelMaker } from '@/world/labels/labelMaker';
import { LabelPanel } from '@/ui/LabelPanel';
import { refundLapsedHoldsDaily } from '@/economy/lapsedHolds';
import { settleConsignmentsDaily } from '@/economy/consignments';
import { scheduleEstateAds } from '@/classifieds/estates';
import type { Services } from './services';
import type { Ui } from './ui';
import type { BuiltWorld } from './world';
import type { PlayerMoves } from './player';
import type { Interaction } from './input';
import { HudIdle } from '@/ui/HudIdle';
import { MachineHud } from '@/ui/MachineHud';
import { KeysCard } from '@/ui/KeysCard';
import { roomDreamOf } from '@/household/dreams';
import { exposeRoomUse, installDebugPanel } from './debug';
import { loanOf } from '@/collection/loans';
import { ANNEX_OVERFLOW, STUDY_LEFTOVER } from '@/world/annex/annexShelves';

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
    // From the crosshair, or the bookcase view's cursor.
    aim: interaction.interactor.aim,
    upgrades,
    atHome: () => built.activity.atHome,
    notices: ui.notices,
  });
  const session = new Session({
    programs,
    labelMaker: labels,
    player,
    inspector: interaction.inspector,
    papers: built.papers,
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
    // Where a game no shelf shows is: lent, in the parcel, left out on a table, on display, in the pile of boxes.
    whereabouts: (game) => {
      const loan = loanOf(game.id);
      if (loan) return `with ${loan.who}, back ${loan.back}`;
      if (deliveries.isPending(game.id)) return 'still in the parcel in the hall';
      const slot = services.strays.slotOf(game.id);
      if (slot) return `out on ${strayPlace(slot)}`;
      const stand = services.showcases.standOf(game.id);
      if (stand) return `in the ${stand}`;
      if ([...ANNEX_OVERFLOW.games, ...STUDY_LEFTOVER.games].some((g) => g.id === game.id)) return 'in the pile of boxes waiting for a bookcase';
      return null;
    },
    // N jumps the clock to night or day: a viewer's switch from before shops, Mémé and the cat kept hours, so `?debug` only.
    dayNight: services.debug ? sky.dayNight : undefined,
    collectionEditor: ui.editor,
    cat: built.cat,
    // A household beat (cleaning, baking, a soak) is dark like a night: the keys wait for it too (the deaf route).
    sleep: { get isAsleep() { return built.activity.isAsleep; }, get sleepy() { return moves.sleep.sleepy; }, untilMorning: () => moves.sleep.untilMorning() },
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
    arcadeHabits: services.arcadeHabits,
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
    shelfView: interaction.shelfView,
    secondHand: interaction.secondHand,
    armful: interaction.armful,
    planView: interaction.planView,
    journalPanel: ui.journalPanel,
    peopleBook: ui.peopleBook,
    shelfRoom: () => {
      // Past the collection room's walls: the bedroom's bookcase, then Mrs Roux's rooms once they are the flat's.
      const elsewhere = bookcasesIn(upgrades.count('bookcase'));
      return shelfRoomNote(overflow.games.length, elsewhere.bedroom + elsewhere.annex, !upgrades.canBuy('bookcase'));
    },
    // What the flat sends the player out with, and a night's dream on waking (docs/household.md).
    perks: services.perks,
    // Which machines' controls were spelled out once, kept with the first day's notes.
    arcadeHints: services.firstDay,
    // The first day ends once a longplay is on (or, its last tip read, on the way out again).
    onScreenPlaying: () => services.firstDay.screenPlayed(),
    dreams: {
      afterSleep: () =>
        services.homeLife.dream().then((dream) => {
          if (!dream) return false;
          // Some dreaming nights are of Félix's room instead, what is back lit up (docs/story.md "The goal").
          const room = roomDreamOf(services.today.gameDay, services.felix.found, (piece) => services.upgrades.count(piece));
          if (room) ui.dreamCard.showRoom(room);
          else ui.dreamCard.show(dream);
          return true;
        }),
    },
  });
  session.bindInput(input);
  // A trip whose destination would not load: back where the player stood, told so (not only in the console); a second
  // failure in a row is the game's own trouble, an alert with a Retry that tries the same trip again.
  let lastFailed = -Infinity;
  moves.travel.onFailed = (id) => {
    const again = performance.now() - lastFailed < 120_000; // convention-ok: real time between two failed trips
    lastFailed = performance.now(); // convention-ok: the same measure
    if (!again) ui.notices.refuse('The door sticks. Give it another go.');
    else ui.notices.alert('That place would not load: the connection may have dropped.', undefined, { label: 'Retry', run: () => void moves.travel.go(id) });
  };
  moves.travel.onDepart = () => ui.notices.speech.clearAll();
  // The day stands still while the player is out of the room (the pause menu, the start card, the opening) or in a panel.
  sky.holdClock(() => player.isLocked && !session.modalOpen);
  // Watching from a seat with nothing pressed, the crosshair, its caption and the prompt line step back.
  // Holding H in the room: the keys for what the player is doing now.
  services.engine.addUpdatable(new KeysCard(services.container, input, () => (player.isLocked && !session.modalOpen && !interaction.photo?.isActive ? cardContext(session.handsContext) : null)));
  // A box in hand in the armchair keeps its keys line: only an empty-handed watcher's HUD steps back.
  services.engine.addUpdatable(new HudIdle(() => session.seatedIn !== null && !session.held && player.isLocked && !session.modalOpen, input, services.engine.camera));
  // At an arcade machine the middle of the view is the game's: the crosshair and the notices step aside.
  services.engine.addUpdatable(new MachineHud(() => session.atMachine, ui.notices.speech));
  // The touch bar shows the buttons that work where the hands are (a box, a market copy, a machine, a seat).
  interaction.touch.setContext(() => cardContext(session.handsContext), () => programs.isHolding);
  // A hold lasts its market day: one never collected gives its deposit back the next (`economy/lapsedHolds`).
  refundLapsedHoldsDaily(services.tx, services.today, ui.notices);
  // A copy entered at the saleroom whose sale the player missed: the house settles it and posts the cheque (`economy/consignments`).
  settleConsignmentsDaily({ house: services.lots.auction, tx: services.tx, today: services.today, notices: ui.notices, rival: services.lots.rival });
  // After Mr Lambert's sale, other families clear a late relative's games through the small ads (`classifieds/estates`).
  scheduleEstateAds(services.classifieds, services.today);
  // `?debug`: the debug panel on its key (every progression's switch, the votes, events now, a trip anywhere).
  if (services.debug) installDebugPanel(services, { input, openPanel: (panel) => session.openPanel(panel), modalOpen: () => session.modalOpen, travel: moves.travel, cat: built.cat, menu: ui.overlay });
  // `?debug`: what a click at the crosshair does, for a browser driven by a script (`bibliothek.room.use()`).
  if (services.debug) exposeRoomUse(() => interaction.interactor.select());
  return session;
}

/**
 * The keys card and the touch bar know no bookcase view yet: facing one is shown as sitting (E steps back, as it gets up),
 * the nearest of their contexts.
 */
function cardContext<C extends string>(context: C | 'shelves'): Exclude<C, 'shelves'> | 'seated' {
  return context === 'shelves' ? 'seated' : (context as Exclude<C, 'shelves'>);
}

/** Where a game left out on a table spot lies, as a sentence says it (a pile's upper boxes are the same spot's: `kitchenTable+2`). */
function strayPlace(slot: string): string {
  const spot = slot.split('+')[0];
  return spot === 'kitchenTable' ? 'the kitchen table' : spot === 'tvStand' ? 'the TV stand' : 'the nightstand';
}
