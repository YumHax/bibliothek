import { SEED_GAMES } from '@/catalog';
import { MarketNotices } from '@/economy';
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
import { PrizePanel } from '@/ui/PrizePanel';
import { CollectorBookPanel } from '@/ui/collector/CollectorBookPanel';
import { JournalPanel } from '@/ui/JournalPanel';
import { NeighbourTradePanel } from '@/ui/NeighbourTradePanel';
import { upcomingMarketDays } from '@/journal';
import { TravelMenu } from '@/ui/TravelMenu';
import { WalletHud } from '@/ui/WalletHud';
import { Fader } from '@/ui/Fader';
import { QualityPicker } from '@/ui/QualityPicker';
import { addGameSettings } from '@/ui/settings/GameSettingsForm';
import { controlsGroupOf, zoneName } from '@/ui/menu/zoneNames';
import { version } from '../../package.json';
import { late as lateBound, type Late } from './late';
import type { Services } from './services';
import { installPayoutTable } from './debug';

export type Ui = ReturnType<typeof createUi>;

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
  const { container, engine, input, settings, params, debug, wallet, collection, index, fame, tx, market, ledger, standing, prizes, coverUrl, catSettings, payoutStats, arcadeDaily, milestones, valueHistory, collectorWatch, neighbourTrades, journal } = services;
  const here = (): ZoneId => late.zones.get().current.id;
  // The start card's button enters the room through the lock flow, which needs the card first.
  const lockFlowRef = lateBound<PointerLockFlow>('the pointer lock flow');

  // The pause menu's Collection button presses Tab (virtual presses skip the key bindings), which the Session toggles the editor on.
  // Out of the flat it offers Go home; its summary reads the wallet, the collection and the zone.
  const overlay = new Overlay(container, input, () => void lockFlowRef.get().enter(), {
    onCollection: () => input.pressVirtual(primaryCode('collection')),
    status: () => [
      ['Coins', String(wallet.coins)],
      ['Tickets', String(wallet.tickets)],
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
  });
  const lockFlow = lockFlowRef.set(new PointerLockFlow(player, overlay, engine.renderer.domElement, input));
  overlay.addSetting('display', 'Graphics', new QualityPicker((options) => overlay.confirm(options)).element, QualityPicker.NOTE);
  addGameSettings(overlay, settings, { onEraseProgress: eraseProgress, version });
  overlay.addSetting('game', 'Cat', new CatSettingsForm(catSettings).element);

  const panel = new GamePanel(container);
  const toast = new Toast(container);
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
  const prizeCounter = new PrizePanel(container, wallet, prizes, tx, { collection, games: SEED_GAMES });
  // The flat's own panels: the collector's book on the sideboard, the journal on the hall console (and in the pause menu),
  // the swap a neighbour's door opens.
  const collectorBook = new CollectorBookPanel(container, { wallet, collection, standing, milestones, history: valueHistory, watch: collectorWatch, coverUrl });
  const journalPanel = new JournalPanel(container, journal, {
    challenge: () => arcadeDaily.challenge(),
    upcoming: () => upcomingMarketDays(market.day),
  });
  overlay.addPauseButton('journal', 'Journal', () => late.session.get().openPanel(journalPanel));
  const neighbourTradePanel = new NeighbourTradePanel(container, wallet, { trades: neighbourTrades, tx, collection }, coverUrl);
  // A milestone reached anywhere (a purchase, a medal, a sale): one toast, the book on the sideboard has the rest.
  collectorWatch.onReached = (reached) => {
    const first = reached[0]!;
    toast.show(reached.length === 1 ? `Milestone reached: ${first.title}\nThe collector’s book on the sideboard has your reward` : `${reached.length} milestones reached\nSee the collector’s book on the sideboard`, 4000);
  };
  if (params.has('payout')) installPayoutTable(container, payoutStats);
  const walletHud = new WalletHud(container, wallet);
  // Sounds nobody clicked for (the arcade's machines and hum) wait for the first gesture to start the audio.
  unlockAudioOnFirstGesture();
  player.controls.addEventListener('lock', () => walletHud.setVisible(true));
  player.controls.addEventListener('unlock', () => walletHud.setVisible(false));
  // The curtain every trip and every night falls behind, and the "Where to?" a door opens.
  const fader = new Fader(container);
  const travelMenu = new TravelMenu<ZoneId>(container, input);

  return { overlay, lockFlow, panel, toast, search, editor, catalogue, sellDesk, haggle, trade, marketHall, prizeCounter, walletHud, fader, travelMenu, collectorBook, journalPanel, neighbourTradePanel };
}
