import { ChoicePanel } from '@/ui/street/ChoicePanel';
import { WrapPanel } from '@/ui/street/WrapPanel';
import { SEED_GAMES } from '@/catalog';
import { MarketNotices } from '@/economy';
import { COLLECTOR_SETS } from '@/economy/collectorSets';
import { mostValuable } from '@/economy/collectionValue';
import { shopPrice } from '@/economy/pricing';
import { milestoneReward } from '@/economy/milestoneList';
import type { ModalLike } from '@/game/SessionParts';
import type { FirstPersonController } from '@/player/FirstPersonController';
import type { MarketHallServices, WorldPanels } from '@/world/buildContext';
import type { ZoneId } from '@/world/zoneIds';
import { GamePanel } from '@/ui/GamePanel';
import type { Notices } from '@/notices';
import { SearchBar } from '@/ui/SearchBar';
import { CollectionEditor } from '@/ui/CollectionEditor';
import { CataloguePanel } from '@/ui/CataloguePanel';
import { SellPanel } from '@/ui/SellPanel';
import { ScreeningPanel } from '@/ui/ScreeningPanel';
import { createPastimePanels } from '@/ui/grandma/pastimePanels';
import { KidSwapPanel } from '@/ui/yard/KidSwapPanel';
import { HandheldPanel } from '@/ui/yard/HandheldPanel';
import { partyBuyer } from '@/building/neighboursParty';
import { consignBuyer } from '@/economy/consignments';
import { AUCTION } from '@/economy/pricing';
import { HagglePanel } from '@/ui/market/HagglePanel';
import { TradePanel } from '@/ui/market/TradePanel';
import { NoticeBoardPanel } from '@/ui/market/NoticeBoardPanel';
import { JobLotPanel } from '@/ui/market/JobLotPanel';
import { PrizePanel } from '@/ui/PrizePanel';
import { CollectorBookPanel } from '@/ui/collector/CollectorBookPanel';
import { JournalPanel } from '@/ui/journal/JournalPanel';
import { NeighbourTradePanel } from '@/ui/NeighbourTradePanel';
import { CoproPanel } from '@/ui/CoproPanel';
import { PhonePanel } from '@/ui/household/PhonePanel';
import { phoneAds } from '@/ui/household/phoneAds';
import { ConsoleDeskPanel, RepairPanel } from '@/ui/repair';
import { WardrobePanel } from '@/ui/household/WardrobePanel';
import { DreamCard } from '@/ui/household/DreamCard';
import { HOUSEHOLD } from '@/household';
import { SHOP_HOURS } from '@/world/street/shops/shopHours';
import { hallCabinets } from '@/world/arcade/hallCabinets';
import { upcomingMarketDays, upcomingWorld } from '@/journal';
import { upcomingSocial } from '@/social/life/startLife';
import { upcomingGrandma } from '@/social/grandmaSocial';
import { upcomingGrandmaRituals } from '@/social/grandmaRitualsSocial';
import { upcomingFamily } from '@/family/upcomingFamily';
import { TravelMenu } from '@/ui/TravelMenu';
import { WalletHud } from '@/ui/WalletHud';
import { prizePhoto } from '@/thumbnails/prizePhotos';
import { PrizeGoalChip } from '@/ui/PrizeGoalChip';
import { clockShort } from '@/text/clock';
import { gameDateLabel } from '@/time/gameDateLabel';
import { onWorldLoad } from '@/ui/worldLoad';
import { Fader } from '@/ui/Fader';
import { repairHint } from '@/social/building/student';
import { priced, spendTalkedDown, tillFactor } from '@/social/street/streetPerks';
import { installMoneyCheat } from '@/cheats/moneyCheat';
import { unlockAudioOnFirstGesture } from '@/audio/audioContext';
import { NewsPanel } from '@/ui/NewsPanel';
import { ScratchCardPanel } from '@/ui/ScratchCardPanel';
import { CounterPanel } from '@/ui/streetShops/CounterPanel';
import { PubQuizPanel } from '@/ui/streetShops/PubQuizPanel';
import { DartsPanel } from '@/ui/streetShops/DartsPanel';
import { HomeShopPanel } from '@/ui/HomeShopPanel';
import { ToDoNotePanel } from '@/ui/ToDoNotePanel';
import { huntFile } from '@/building/hunt/BuildingHunt';
import type { Late } from './late';
import type { Services } from './services';
import { installPayoutTable } from './debug';
import { createSocial } from './social';
import type { Menus, UiLate } from './uiMenus';

/** Where the wallet chip stays up: the places money changes hands. */
const MONEY_ZONES: ReadonlySet<ZoneId> = new Set<ZoneId>(['arcade', 'market', 'furnitureShop', 'tvShop', 'petShop', 'flowerShop', 'sellerFlat']);

/**
 * The collection's own panels: the game in hand's card (with the press at the time and the trail's finds), the search,
 * the collection editor (adding a game only under `?debug`), the market's catalogue and the WE BUY desk.
 */
export function createCollectionPanels(services: Services, notices: Notices) {
  const { container, debug, wallet, collection, index, fame, tx, market, standing, coverUrl } = services;
  const panel = new GamePanel(container);
  // The press at the time (Wikipedia), under the details of the game in hand; the lost prototype's trail tells the player its finds.
  panel.setReviews(services.reviews);
  panel.setToday(() => services.today.gameDay);
  services.story.setNotices(notices);
  const search = new SearchBar(container, { coverUrl });
  // "Show on shelf" finds the box as the quick search does (`Browse`: the glow, the player turned towards it).
  const editor = new CollectionEditor(container, collection, index, {
    canAdd: debug,
    coverUrl,
    onShow: (game) => search.pick(game),
    worth: (game) => mostValuable([game], (g) => fame.peek(g), 1)[0]?.value ?? 0,
    today: () => services.today.gameDay,
    market,
  });
  const catalogue = new CataloguePanel(container, collection, index, wallet, fame, tx, { market, coverUrl });
  const sellDesk = new SellPanel(container, collection, wallet, fame, tx, { coverUrl, standing });
  return { panel, search, editor, catalogue, sellDesk };
}

/**
 * The market's other panels: haggling and swapping over the copy in hand, the notice board, the job lot (the hall's
 * `MarketHallServices`), and the arcade's prize counter (the mystery game: a seed game the collection lacks, never a
 * grail nor a very dear one; the lamp and the wand say what they need at home).
 */
export function createMarketPanels(services: Services, notices: Notices) {
  const { container, debug, wallet, collection, fame, tx, market, ledger, standing, prizes, coverUrl } = services;
  const haggle = new HagglePanel(container, wallet);
  const trade = new TradePanel(container, wallet, collection, fame, coverUrl);
  const noticeBoard = new NoticeBoardPanel(container, { wallet, collection, market, ledger, standing, notices: new MarketNotices({ fame, ledger }), tx, coverUrl });
  const jobLot = new JobLotPanel(container, { wallet, collection, market, tx }, coverUrl);
  const marketHall: MarketHallServices = { standing, notices: noticeBoard, lot: jobLot };
  // The back room: this week's offers by the game day, a plate for any of the hall's cabinets with the last initials signed.
  const backRoom = { today: () => services.today.gameDay, cabinets: hallCabinets, initials: () => services.scores.initials };
  const prizeCounter = new PrizePanel(container, wallet, prizes, tx, { collection, games: SEED_GAMES, more: () => market.randomGames(`mystery:${services.today.gameDay}`, 30), worth: (game) => shopPrice(game, fame.peek(game)) }, debug ? null : { has: (what) => services.upgrades.has(what) }, notices, backRoom, services.prizeGoal);
  return { haggle, trade, marketHall, prizeCounter };
}

/**
 * The books of the flat: the collector's book on the sideboard, and the journal on the hall console (and in the pause
 * menu), which turns its page with the game's days and stamps lines with the game clock; its People button opens the
 * book made with the social panels, later.
 */
export function createBookPanels(services: Services, late: UiLate, peopleBook: Late<ModalLike>) {
  const { container, wallet, collection, standing, milestones, valueHistory, collectorWatch, coverUrl, journal, arcadeDaily, market } = services;
  const collectorBook = new CollectorBookPanel(container, { wallet, collection, standing, milestones, history: valueHistory, watch: collectorWatch, coverUrl });
  journal.setClock({ day: () => services.today.gameDay, hours: () => services.sky.dayNight.state.hours });
  const journalPanel = new JournalPanel(container, journal, {
    challenge: () => arcadeDaily.challenge(),
    upcoming: () => [
      ...upcomingWorld({
        day: services.today.gameDay,
        date: services.today.realDate(),
        tournament: services.tournament,
        league: services.league,
        jackpot: services.jackpot,
        booking: services.classifieds.booking,
        held: services.ledger.heldCopies(market.day),
        orders: services.ledger.orders,
        parcel: services.deliveries.count,
        cartons: services.lots.sealed.waiting.length,
        broken: services.workshop.consoles.filter((c) => !c.fixed && c.atShop === undefined).length,
        unclaimed: services.milestones.unclaimed,
        games: collection.games,
      }),
      ...upcomingMarketDays(market.day),
      ...upcomingSocial(services.today.gameDay),
      ...upcomingGrandma({ day: services.today.gameDay, photos: services.grandma.due !== null, hint: services.grandmaHints.journal() }),
      ...upcomingGrandmaRituals({ date: services.today.realDate(), favour: services.grandmaRituals.favour?.id ?? null, ateToday: services.grandmaRituals.ateOn(services.today.gameDay) }),
      ...upcomingFamily(services.family, services.today.gameDay),
    ],
    balance: () => ({ coins: wallet.coins, tickets: wallet.tickets, games: collection.games.filter((g) => g.status !== 'wishlist').length }),
    file: () => services.story.file(),
    files: [huntFile, () => services.felix.file()],
    people: () => late.session.get().openPanel(peopleBook.get()),
    games: () => collection.games,
    coverUrl,
  });
  return { collectorBook, journalPanel };
}

/**
 * The rest of the flat's panels: the people the player talks to (`createSocial`), a neighbour's swap, the co-owners'
 * postal vote, what the street's shops and the hall console open (`BuildContext.panels`), the bedroom's phone and
 * wardrobe, the kitchen table's console repair and TV REPAIR's counter, and the dream on waking.
 */
export function createHomePanels(services: Services, notices: Notices, late: UiLate, player: FirstPersonController) {
  const { container, wallet, collection, fame, tx, market, standing, coverUrl, neighbourTrades, household, homeLife, perks } = services;
  const { social, peopleBook, contacts, voicemail } = createSocial(services, container, notices, () => late.session.get(), player);
  const neighbourTradePanel = new NeighbourTradePanel(container, { trades: neighbourTrades, tx, collection }, coverUrl);
  // The co-owners' postal vote, opened by the ballot box in the stairwell's hall (`building/coproMeeting`).
  const coproPanel = new CoproPanel(container);
  // What the street's shops and the hall console open: made once here, handed to their builders (`BuildContext.panels`).
  const panels: WorldPanels = {
    news: new NewsPanel(container, { ring: (id) => phoneAds(services.classifieds).ring(id) }),
    scratch: new ScratchCardPanel(container),
    // The clerk's discount or markup at the till, and the one talked out of them today (docs/social.md "Front Street and the arcade").
    homeShop: new HomeShopPanel(container, {
      wallet,
      upgrades: services.upgrades,
      price: (shop, base) => priced(base, tillFactor(shop, services.today.gameDay)),
      onBought: (shop) => spendTalkedDown(shop, services.today.gameDay),
      // Adopted at the pet shop: the counter asks what she will be called; her coat is the one she came with.
      cat: { name: () => services.catSettings.settings.name, coat: () => services.catSettings.settings.coat, rename: (name) => services.catSettings.update({ name }) },
    }),
    toDo: services.firstDay ? new ToDoNotePanel(container, services.firstDay) : undefined,
    // The residents' table at the neighbours' party (`building/neighboursParty`): the WE BUY desk's panel with their buyer.
    partySale: new SellPanel(container, collection, wallet, fame, tx, { coverUrl, buyer: partyBuyer(tx, services.today) }),
    // The saleroom's consignment sheet: a copy of the player's entered for the next sale (`economy/consignments`).
    consign: new SellPanel(container, collection, wallet, fame, tx, { coverUrl, buyer: consignBuyer(services.lots.auction, tx, services.today, AUCTION.consign.min) }),
    // The film night's pick on the courtyard's sheet (`building/yardCinema`).
    screening: new ScreeningPanel(container, collection, services.today, coverUrl),
    // The courtyard's kids (`building/kids`): a swap of carts, a go on their handheld, a cart they are bored of.
    kids: {
      swap: new KidSwapPanel(container, { wallet, tx, collection, fame, spendTickets: (n) => wallet.spendTickets(n), coverUrl }),
      handheld: new HandheldPanel(container),
      give: (cart, where) => {
        if (collection.owns(cart.id)) return false;
        collection.add({ ...cart, status: 'owned', addedAt: new Date().toISOString(), acquired: { price: 0, where, day: market.day } });
        return true;
      },
    },
    // At Mémé's (docs/grandma.md "Things to do with her"): the quiz, the crossword, the cards, the wool.
    memePastimes: createPastimePanels(container),
    // Front Street's counters (docs/economy.md "Front Street's shops and finds"): the bookshops, the kiosk, the pop-up; THE LOCAL's quiz and darts.
    streetShops: { counter: new CounterPanel(container), quiz: new PubQuizPanel(container), darts: new DartsPanel(container) },
    // Front Street's picks (line 38's stops, the pillar box) and the Christmas stall's gift wrapping (docs/zones.md "The street").
    choice: new ChoicePanel(container),
    wrap: new WrapPanel(container),
  };
  // What the bedroom opens (docs/household.md): the phone on the nightstand, the wardrobe's rail; and the dream on waking.
  const retro = SHOP_HOURS.retro!;
  const phone = new PhonePanel(container, {
    hours: () => services.sky.dayNight.state.hours,
    marketOpen: () => homeLife.marketOpen,
    closedLine: () => `Nobody picks up: the market keeps RETRO GAMES’ hours, ${clockShort(retro.open)} to ${clockShort(retro.close)}.`,
    // A stallholder who likes the player counts as a regular's stall too (`social/market`).
    loyalty: (platform) => standing.loyalty(platform),
    loyaltyName: (platform) => standing.loyaltyName(platform),
    regularFrom: HOUSEHOLD.phone.regularFrom,
    todays: () => market.todays(),
    deposit: (item) => market.holdDeposit(item),
    coverUrl,
    hold: (item) => {
      const result = tx.holdCopy(item);
      if (result.ok) return null;
      return result.reason === 'short' ? `“That’s a ${result.needed}-coin deposit, and you’ve got ${result.have}.”` : '“Hm, I can’t put that one by. Come and see.”';
    },
    // The Gaming Weekly's small ads read at the newsstand: a ring agrees a visit (docs/economy.md "Small ads and the seller's flat").
    ads: phoneAds(services.classifieds),
    // Everyone whose number the player has: a ring opens the conversation (docs/social.md "The phone").
    contacts,
    // What friends said when nobody picked up: a light blinks on the phone until it is played (docs/social.md "The phone").
    voicemail,
  });
  // The kitchen table's console repair and TV REPAIR's counter that buys working ones back (docs/household.md "Repairing a console").
  const repairPanel = new RepairPanel(container, { workshop: services.workshop, notices, hint: repairHint });
  const consoleDesk = new ConsoleDeskPanel(container, { workshop: services.workshop, wallet, notices });
  const wardrobe = new WardrobePanel(container, {
    facts: () => perks.facts,
    worn: () => perks.outfit.id,
    wear: (id) => household.wear(id),
  });
  const dreamCard = new DreamCard(container, coverUrl);
  return { social, peopleBook, neighbourTradePanel, coproPanel, panels, phone, repairPanel, consoleDesk, wardrobe, dreamCard };
}

/**
 * The HUD and the last of the chrome: the milestone banner (the book on the sideboard has the rest), the balance
 * table under `?payout`, the wallet chip (up where money is the point, under the pause menu, and a few seconds after
 * money moves elsewhere), the money cheat, the audio unlock on the first gesture, a Retry when the world would not
 * load, the curtain every trip and every night falls behind, and the "Where to?" a door opens.
 */
export function wireHud(services: Services, player: FirstPersonController, menus: Menus, late: UiLate) {
  const { container, engine, input, params, wallet, payoutStats, collectorWatch, debug } = services;
  const { overlay, notices } = menus;
  const here = (): ZoneId => late.zones.get().current.id;
  // A milestone reached anywhere (a purchase, a medal, a sale): a big reward, paid on the spot (the book on the
  // sideboard keeps the record and the trophies).
  collectorWatch.onReached = (reached) => {
    const first = reached[0]!;
    const paid = { coins: 0, tickets: 0 };
    for (const milestone of reached) {
      const { coins, tickets } = milestoneReward(milestone.id);
      if (!services.milestones.claim(milestone.id, wallet)) continue;
      paid.coins += coins ?? 0;
      paid.tickets += tickets ?? 0;
    }
    notices.reward({
      title: reached.length === 1 ? 'Milestone reached!' : `${reached.length} milestones reached!`,
      detail: reached.length === 1 ? `${first.title}.` : reached.map((m) => m.title).join(' · '),
      ...(paid.coins ? { coins: paid.coins } : {}),
      ...(paid.tickets ? { tickets: paid.tickets } : {}),
      big: true,
    });
  };
  // A collectors' club set completed: its bounty paid there and then (the notice board and the book keep the list).
  const paySets = () => {
    for (const set of COLLECTOR_SETS) {
      const paid = services.tx.claimSet(set);
      if (paid.ok) notices.reward({ title: 'A set complete!', detail: `${set.name}: the collectors’ club sends its bounty.`, coins: paid.reward, big: true });
    }
  };
  services.collection.subscribe(paySets);
  paySets();
  // One of uncle Félix's games home again: his line about it, in his hand (the journal's notebook page keeps them all).
  services.felix.onTicked(({ title, line, last }) => {
    notices.reward({ title: last ? 'Every one of Félix’s games is home' : `${title}, back on Félix’s shelf`, detail: `“${line}”`, big: last });
    services.journal.note('story', `${title}: back on uncle Félix’s shelf`, { weight: 'headline' });
  });
  if (params.has('payout')) installPayoutTable(container, payoutStats);
  const walletHud = new WalletHud(container, wallet, {
    moneyHere: () => late.zones.isSet && MONEY_ZONES.has(here()),
    clockHere: () => late.zones.isSet && here() === 'street',
    clock: () => gameDateLabel(services.today.gameDay, services.today.hours),
  });
  engine.addUpdatable(walletHud);
  // The prize pinned at the counter rides the chip, its picture filling as the tickets come in.
  walletHud.addItem(new PrizeGoalChip(wallet, services.prizeGoal, prizePhoto).element);
  // A set of prizes all at home (every claw bunny, the whole glass case, every limited edition): its bonus there and then.
  const payPrizeSets = (): void => {
    for (const set of services.prizeSets.claim(services.prizes, wallet)) notices.reward({ title: 'A prize set complete!', detail: `${set.name}: the arcade adds a bonus.`, tickets: set.tickets, big: true });
  };
  services.prizes.subscribe(payPrizeSets);
  payPrizeSets();
  // Typing 5000 (or `bibliothek.coins()` in the console): 5000 coins, only under `?debug` (a player earns them).
  if (debug) installMoneyCheat(input, wallet, notices);
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
  const fader = new Fader(container);
  const travelMenu = new TravelMenu<ZoneId>(container, input);
  return { walletHud, fader, travelMenu };
}
