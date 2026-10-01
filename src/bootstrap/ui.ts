import { SEED_GAMES } from '@/catalog';
import { MarketNotices } from '@/economy';
import { shopPrice } from '@/economy/pricing';
import type { Session } from '@/game/Session';
import type { FirstPersonController } from '@/player/FirstPersonController';
import { PointerLockFlow } from '@/player/PointerLockFlow';
import { primaryCode } from '@/input';
import { unlockAudioOnFirstGesture } from '@/audio/audioContext';
import { eraseProgress, hasProgress } from '@/settings';
import type { MarketHallServices } from '@/world/buildContext';
import { inFlat } from '@/world/worldPlan';
import type { ZoneId } from '@/world/zoneIds';
import type { ZoneManager } from '@/world/zone';
import { Overlay } from '@/ui/Overlay';
import { GamePanel } from '@/ui/GamePanel';
import { Notices } from '@/notices';
import { SearchBar } from '@/ui/SearchBar';
import { CollectionEditor } from '@/ui/CollectionEditor';
import { CatSettingsForm } from '@/ui/CatSettings';
import { CataloguePanel } from '@/ui/CataloguePanel';
import { SellPanel } from '@/ui/SellPanel';
import { HagglePanel } from '@/ui/market/HagglePanel';
import { TradePanel } from '@/ui/market/TradePanel';
import { NoticeBoardPanel } from '@/ui/market/NoticeBoardPanel';
import { JobLotPanel } from '@/ui/market/JobLotPanel';
import { PrizePanel } from '@/ui/PrizePanel';
import { CollectorBookPanel } from '@/ui/collector/CollectorBookPanel';
import { JournalPanel } from '@/ui/JournalPanel';
import { NeighbourTradePanel } from '@/ui/NeighbourTradePanel';
import { PhonePanel } from '@/ui/household/PhonePanel';
import { WardrobePanel } from '@/ui/household/WardrobePanel';
import { DreamCard } from '@/ui/household/DreamCard';
import { HOUSEHOLD } from '@/household';
import { SHOP_HOURS, clockTime } from '@/world/street/shops/shopHours';
import { upcomingMarketDays } from '@/journal';
import { TravelMenu } from '@/ui/TravelMenu';
import { WalletHud } from '@/ui/WalletHud';
import { formatCount } from '@/ui/money';
import { installCoverPlaceholders } from '@/ui/coverPlaceholder';
import { onWorldLoad } from '@/ui/worldLoad';
import { Fader } from '@/ui/Fader';
import { QualityPicker } from '@/ui/QualityPicker';
import { addGameSettings } from '@/ui/settings/GameSettingsForm';
import { controlsGroupOf, zoneName } from '@/ui/menu/zoneNames';
import { version } from '../../package.json';
import { late as lateBound, type Late } from './late';
import type { Services } from './services';
import { installPayoutTable } from './debug';
import { installMoneyCheat } from '@/cheats/moneyCheat';
import { NewsPanel } from '@/ui/NewsPanel';
import { ScratchCardPanel } from '@/ui/ScratchCardPanel';
import { HomeShopPanel } from '@/ui/HomeShopPanel';
import { ToDoNotePanel } from '@/ui/ToDoNotePanel';
import { StoragePanel } from '@/ui/StoragePanel';
import type { WorldPanels } from '@/world/buildContext';

export type Ui = ReturnType<typeof createUi>;

/** Where the wallet chip stays up: the places money changes hands. */
const MONEY_ZONES: ReadonlySet<ZoneId> = new Set<ZoneId>(['arcade', 'market', 'furnitureShop', 'tvShop', 'petShop', 'flowerShop']);

/** What the menus read of things made after them: where the player is, the rules. */
export interface UiLate {
  zones: Late<ZoneManager<ZoneId>>;
  session: Late<Session>;
}

/**
 * The start card and pause menu with the pointer lock flow, the HUD, and every DOM panel: made
 * before the world, in the order they stack in the page, so the market's hall is handed its panels
 * when its builder is bound. What they ask of the world and the Session is read on use (`late`).
 */
export function createUi(services: Services, player: FirstPersonController, late: UiLate) {
  const { container, engine, input, settings, params, debug, wallet, collection, index, fame, tx, market, ledger, standing, prizes, coverUrl, catSettings, payoutStats, arcadeDaily, milestones, valueHistory, collectorWatch, neighbourTrades, journal, household, homeLife, perks } = services;
  const here = (): ZoneId => late.zones.get().current.id;
  // The start card's button enters the room through the lock flow, which needs the card first.
  const lockFlowRef = lateBound<PointerLockFlow>('the pointer lock flow');

  // The pause menu's Collection button presses Tab (virtual presses skip the key bindings), which the Session toggles the editor on.
  // Out of the flat it offers Go home; its summary reads the wallet, the collection and the zone.
  const overlay = new Overlay(container, input, () => void lockFlowRef.get().enter(), {
    onCollection: () => input.pressVirtual(primaryCode('collection')),
    status: () => [
      ['Coins', formatCount(wallet.coins)],
      ['Tickets', formatCount(wallet.tickets)],
      ['Games', String(collection.games.length)],
      ['Where', zoneName(here())],
    ],
    goHome: {
      available: () => !inFlat(here()),
      go: () => {
        void lockFlowRef.get().resume();
        late.session.get().travel('hallway');
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

  // A thumbnail whose art does not load becomes a made-up box (platform colour, title) in every panel.
  installCoverPlaceholders(container);
  const panel = new GamePanel(container);
  const search = new SearchBar(container);
  const editor = new CollectionEditor(container, collection, index, { canAdd: debug });
  const catalogue = new CataloguePanel(container, collection, index, wallet, fame, tx, { market, coverUrl });
  const sellDesk = new SellPanel(container, collection, wallet, fame, tx, { coverUrl, standing });
  // The market's other panels: haggling and swapping over the copy in hand, the notice board, the job lot.
  const haggle = new HagglePanel(container, wallet);
  const trade = new TradePanel(container, wallet, collection, fame, coverUrl);
  const noticeBoard = new NoticeBoardPanel(container, { wallet, collection, market, ledger, standing, notices: new MarketNotices({ fame, ledger }), tx });
  const jobLot = new JobLotPanel(container, { wallet, collection, market, tx }, coverUrl);
  const marketHall: MarketHallServices = { standing, notices: noticeBoard, lot: jobLot };
  // The mystery game: a seed game the collection lacks, never a grail nor a very dear one; the lamp and the wand say what they need at home.
  const prizeCounter = new PrizePanel(container, wallet, prizes, tx, { collection, games: SEED_GAMES, worth: (game) => shopPrice(game, fame.peek(game)) }, debug ? null : { has: (what) => services.upgrades.has(what) }, notices);
  // The flat's own panels: the collector's book on the sideboard, the journal on the hall console (and in the pause menu),
  // the swap a neighbour's door opens.
  const collectorBook = new CollectorBookPanel(container, { wallet, collection, standing, milestones, history: valueHistory, watch: collectorWatch, coverUrl });
  // The journal turns its page with the game's days (a night's sleep) and stamps lines with the game clock.
  journal.setClock({ day: () => services.today.gameDay, hours: () => services.sky.dayNight.state.hours });
  const journalPanel = new JournalPanel(container, journal, {
    challenge: () => arcadeDaily.challenge(),
    upcoming: () => upcomingMarketDays(market.day),
  });
  overlay.addPauseButton('journal', 'Journal', () => late.session.get().openPanel(journalPanel));
  // Photo mode and the search from the pause menu (a controller or a touchscreen has no P or F): back in the room, then the key.
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
    void lockFlowRef.get().resume();
  };
  overlay.addPauseButton('photo', 'Photo mode', () => inRoomThen(primaryCode('photoMode')));
  overlay.addPauseButton('search', 'Search a game', () => inRoomThen(primaryCode('search')));
  // The room from above, for a controller or a touchscreen (L on the keyboard): at home only.
  overlay.addPauseButton('plan-room', 'Plan the room', () => inRoomThen(primaryCode('planView')), () => late.zones.isSet && inFlat(here()) && here() !== 'stairwell');
  // The room's furniture back where it came (docs/furnishing.md): only once something in it was moved, after a yes.
  const movedHere = () => (late.zones.isSet ? services.furnishings.piecesIn(late.zones.get().current).filter((piece) => services.furnishings.moved(piece)) : []);
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
          if (piece) inRoomThenRun(() => late.session.get().takeOutStored(piece));
        },
      );
      late.session.get().openPanel(storagePanel);
    },
    () => services.furnishings.storedPieces().length > 0,
  );
  const neighbourTradePanel = new NeighbourTradePanel(container, wallet, { trades: neighbourTrades, tx, collection }, coverUrl);
  // What the street's shops and the hall console open: made once here, handed to their builders (`BuildContext.panels`).
  const panels: WorldPanels = {
    news: new NewsPanel(container),
    scratch: new ScratchCardPanel(container),
    homeShop: new HomeShopPanel(container, { wallet, upgrades: services.upgrades }),
    toDo: services.firstDay ? new ToDoNotePanel(container, services.firstDay) : undefined,
  };
  // What the bedroom opens (docs/household.md): the phone on the nightstand, the wardrobe's rail; and the dream on waking.
  const retro = SHOP_HOURS.retro!;
  const phone = new PhonePanel(container, {
    marketOpen: () => homeLife.marketOpen,
    closedLine: () => `Nobody picks up: the market keeps RETRO GAMES’ hours, ${clockTime(retro.open)} to ${clockTime(retro.close)}.`,
    loyalty: (platform) => standing.loyalty(platform),
    loyaltyName: (platform) => standing.loyaltyName(platform),
    regularFrom: HOUSEHOLD.phone.regularFrom,
    todays: () => market.todays(),
    deposit: (item) => market.holdDeposit(item),
    hold: (item) => {
      const result = tx.holdCopy(item);
      if (result.ok) return null;
      return result.reason === 'short' ? `“That’s a ${result.needed}-coin deposit, and you’ve got ${result.have}.”` : '“Hm, I can’t put that one by. Come and see.”';
    },
  });
  const wardrobe = new WardrobePanel(container, {
    facts: () => perks.facts,
    worn: () => perks.outfit.id,
    wear: (id) => household.wear(id),
  });
  const dreamCard = new DreamCard(container, coverUrl);
  // A milestone reached anywhere (a purchase, a medal, a sale): a big reward, the book on the sideboard has the rest.
  collectorWatch.onReached = (reached) => {
    const first = reached[0]!;
    notices.reward({
      title: reached.length === 1 ? 'Milestone reached!' : `${reached.length} milestones reached!`,
      detail: reached.length === 1 ? `${first.title}\nThe collector’s book in the living room has your reward.` : 'The collector’s book in the living room has your rewards.',
      big: true,
    });
  };
  if (params.has('payout')) installPayoutTable(container, payoutStats);
  // The wallet chip: up where money is the point, under the pause menu, and a few seconds after money moves elsewhere.
  const walletHud = new WalletHud(container, wallet, { moneyHere: () => late.zones.isSet && MONEY_ZONES.has(here()) });
  engine.addUpdatable(walletHud);
  // Typing 5000 (or `bibliothek.coins()` in the console): 5000 coins.
  installMoneyCheat(input, wallet, notices);
  // Sounds nobody clicked for (the arcade's machines and hum) wait for the first gesture to start the audio.
  unlockAudioOnFirstGesture();
  let entered = false;
  player.controls.addEventListener('lock', () => {
    entered = true;
    walletHud.setPaused(false);
    walletHud.setVisible(true);
  });
  // Out of the room: the chip stays over a panel (money is often its point); under the pause menu its status says it instead.
  player.controls.addEventListener('unlock', () => {
    walletHud.setVisible(false);
    walletHud.setPaused(entered && overlay.isModal);
  });
  // The world would not load: say so, with a Retry, instead of a start button that leads nowhere.
  onWorldLoad((state, retry) => {
    if (state === 'failed' && retry) notices.alert('The room could not be loaded. Check the connection, then try again.', undefined, { label: 'Retry', run: retry });
  });
  // The curtain every trip and every night falls behind, and the "Where to?" a door opens.
  const fader = new Fader(container);
  const travelMenu = new TravelMenu<ZoneId>(container, input);

  return { overlay, lockFlow, panel, notices, search, editor, catalogue, sellDesk, haggle, trade, marketHall, prizeCounter, walletHud, fader, travelMenu, collectorBook, journalPanel, neighbourTradePanel, phone, wardrobe, dreamCard, panels };
}
