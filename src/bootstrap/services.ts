import type { Game } from '@/catalog/types';
import { Engine } from '@/core/Engine';
import { loadCanvasFaces } from '@/graphics/fontReady';
import { Input } from '@/core/Input';
import { CssLayer } from '@/core/CssLayer';
import { SEED_GAMES, STARTER_GAMES } from '@/catalog';
import { HOMEBREW_CARTS } from '@/emulator/homebrew';
import { CollectionStore } from '@/collection/CollectionStore';
import { Deliveries } from '@/collection/Deliveries';
import { movedOut } from '@/building/rouxMove';
import { GameList } from '@/collection/GameList';
import { LibretroIndex } from '@/collection/LibretroIndex';
import { LibretroCoverProvider } from '@/covers/LibretroCoverProvider';
import { createBoxArtLoader } from '@/covers/createBoxArtLoader';
import { YouTubeSearchProvider } from '@/video/YouTubeSearchProvider';
import { Today } from '@/time/Today';
import { MarketDay } from '@/economy/MarketDay';
import { ArcadeDaily, ArcadeLeague, ArcadeMedals, ArcadeScores, CollectorWatch, Fame, MarketCalendar, MarketLedger, MarketStanding, MarketStock, Milestones, PayoutStats, PrizeStore, STARTING_COINS, Transactions, ValueHistory, Wallet } from '@/economy';
import { HALL_REGULAR_INITIALS } from '@/economy/hallRegulars';
import { PrizeGoal } from '@/economy/PrizeGoal';
import { PrizeSets } from '@/economy/PrizeSets';
import { ArcadeTournament } from '@/economy/ArcadeTournament';
import { ArcadeHabits } from '@/economy/ArcadeHabits';
import { Jackpot } from '@/economy/Jackpot';
import type { ArcadeFacts } from '@/economy/milestoneList';
import { ReplayStore } from '@/world/arcade/replay/ReplayStore';
import { HomeScores } from '@/world/homeArcade/HomeScores';
import { VisitBook } from '@/world/visitors/VisitBook';
import { GatheringBook } from '@/world/visitors/gathering/GatheringBook';
import { NeighbourTrades } from '@/economy/NeighbourTrades';
import { AuctionHouse } from '@/economy/AuctionHouse';
import { SealedLots } from '@/economy/SealedLots';
import { RivalCollector } from '@/economy/rivalCollector';
import { Honours } from '@/economy/Honours';
import { FirstDay } from '@/onboarding';
import { Journal, watchForJournal } from '@/journal';
import { HomeLife, Household, Perks } from '@/household';
import { Classifieds, SellerLots } from '@/classifieds';
import { Workshop } from '@/repair';
import { isShopOpen } from '@/world/street/shops/shopHours';
import { stairwellResidents } from '@/world/stairwell/building';
import { HomeUpgrades } from '@/economy/HomeUpgrades';
import { ARCADE_PLAN, TICKET_GAMES } from '@/world/arcade/arcadePlan';
import { StrayGames } from '@/world/strays/StrayGames';
import { Showcases } from '@/world/showcase/Showcases';
import { ShelfLabels } from '@/world/labels/ShelfLabels';
import { ShelfArrangement } from '@/world/shelving/arrangement';
import { BoxPool } from '@/world/shelving/BoxPool';
import { ROOM_PLAN } from '@/world/roomPlan';
import { FurnitureLayout } from '@/furnishing/FurnitureLayout';
import { Furnishings } from '@/furnishing/Furnishings';
import { Sky } from '@/world/Sky';
import { HEAVY_RAIN } from '@/world/weather/Weather';
import { KITCHEN_WING } from '@/world/worldPlan';
import { SUN_ROTATION_Y } from '@/world/measures/street';
import { parseHoliday, parseNewYear, parseSeason } from '@/time/season';
import { parseLatitude } from '@/world/props/solar';
import { parseWeather } from '@/world/weather/Weather';
import { CatSettingsStore } from '@/world/cat';
import { ArcadeScreenPanel } from '@/ui/ArcadeScreenPanel';
import { SettingsStore, hasProgress } from '@/settings';
import { flag } from '@/settings/flags';
import { initKeyLabels } from '@/ui/keys';
import { initPanelNav } from '@/ui/menu/MenuNav';
import { ReviewSource } from '@/reviews/Reviews';
import { PrototypeStory } from '@/story';
import { FelixNotebook } from '@/story/FelixNotebook';
import { GrandmaVisits } from '@/grandma/GrandmaVisits';
import { GrandmaRituals } from '@/grandma/GrandmaRituals';
import { Keepsakes } from '@/grandma/Keepsakes';
import { followFelixLots } from '@/story/felixLotsTrail';
import { marketPrice } from '@/economy/pricing';
import { FamilyStory } from '@/family/FamilyStory';
import { AlbumFinds } from '@/grandma/AlbumFinds';
import { AlbumPrints } from '@/grandma/albumPrints';
import { PhotoRoll } from '@/photo/photoRoll';
import { tier as socialTier } from '@/social/standing';
import { tierRank } from '@/social/tiers';
import { seasonOf } from '@/time/season';
import { GrandmaHints } from '@/grandma/GrandmaHints';
import { GrandmaPresence } from '@/grandma/GrandmaPresence';
import { BreadErrand } from '@/grandma/breadErrand';
import { SharedRide } from '@/grandma/sharedRide';
import { COLLECTOR_SETS, setProgress } from '@/economy/collectorSets';
import { effect as socialEffect } from '@/social/perks';
import { MEME_ID } from '@/social/people/family';
import { pocket } from '@/errands/pocket';
import { followStreetDays } from '@/time/streetDay';
import { PlayerInitials, RECORD_OF_2003, recordOf2003 } from '@/memories/playerInitials';
import { debugWants, unlockDebugProgress } from '@/cheats/progress/debugProgress';
import { debugSubjects } from './debug';

/** The engine and every store and data source: nothing in the world, no panel but the arcade's big frame. */
export type Services = ReturnType<typeof createServices>;

/**
 * The engine, the input, the player's settings, the collection and its parcel, the money and the
 * arcade's and market's stores, the art and the longplays, the one sky. Made first: the world, the
 * UI and the Session all read them.
 */
export function createServices(container: HTMLElement) {
  const params = new URLSearchParams(location.search);
  /** `?debug`: the built-in seed collection, the editor's "add a game" pane, every progression done (its panel: docs/checks.md "Debug mode"). */
  const debug = flag('debug');
  // Read before any store writes: a save from before the guided first day never sees it.
  const returningPlayer = hasProgress();
  // The faces the signs, tags and arcade screens are painted in, fetched now so later zones letter in them at once.
  loadCanvasFaces();
  const engine = new Engine(container);
  const input = new Input();
  // The player's settings (look, audio, HUD, keys): applied once the camera, the devices and the HUD exist (`bootstrap/input`).
  const settings = new SettingsStore();
  // Key names follow the bindings and the keyboard layout; every DOM panel is walkable with the arrows / D-pad.
  initKeyLabels(input);
  initPanelNav(input);
  const cssLayer = new CssLayer(container);
  engine.addLayer(cssLayer);

  // The collection starts with one game (`STARTER_GAMES`, its console under the TV): the rest are bought at the market
  // with coins won at the arcade. Whatever the player owns is persisted in localStorage; an exported collection can
  // still be imported (Tab).
  // `?debug` has the homebrew carts too (they really play on the TV, docs/media.md "Homebrew carts").
  const collection = new CollectionStore(debug ? [...SEED_GAMES, ...HOMEBREW_CARTS.map((c) => c.game)] : STARTER_GAMES);
  // Games bought while out wait in a parcel in the hallway until unpacked; the shelves show the rest.
  const deliveries = new Deliveries(collection);
  // A game or two left lying about the flat each day (the kitchen table, a nightstand): off their shelves until picked up.
  // What the player put on show in the flat's displays (the display case, the pedestal): off its shelf meanwhile.
  const showcases = new Showcases(deliveries.shelved);
  const strays = new StrayGames(showcases);
  // The labels printed with the label maker, stuck on the shelves' edges.
  const shelfLabels = new ShelfLabels();
  // What has been bought for the flat (it starts bare: a bookcase, the TV, a mattress; `?debug` has it all). A save from
  // before the bare flat is given the bookcases its games need, once.
  const upgrades = new HomeUpgrades(undefined, undefined, { furnished: debug && debugWants('flat') });
  if (collection.isPersisted) upgrades.shelveCollection(collection.games.length);
  const overflow = new GameList();
  // The sort the shelves stand in (T) and the boxes as the player arranged them by hand, kept across reloads.
  const arrangement = new ShelfArrangement(undefined, undefined, ROOM_PLAN.shelving.sort);
  // The furniture bought for the flat, where the player moved it (M): each builder registers what it places.
  const furnishings = new Furnishings(new FurnitureLayout(), upgrades);
  const wallet = new Wallet(STARTING_COINS);
  // The arcade: its hall of fame, the day's challenge and change machine, the prizes taken home.
  const scores = new ArcadeScores();
  // The initials typed in Mémé's memory "Three letters" (docs/grandma.md "In the films"): the record of 2003 on the
  // spaceships cabinet's table, and the first letters of the arcade's initials screens while none were signed there.
  const initials = new PlayerInitials(() => (scores.initials === 'YOU' ? null : scores.initials));
  const recordOnTable = (letters: string | null): void => scores.setPast(RECORD_OF_2003.game, letters ? recordOf2003(letters) : []);
  recordOnTable(initials.value);
  if (initials.value) scores.offerInitials(initials.value);
  initials.subscribe((letters) => {
    recordOnTable(letters);
    scores.offerInitials(letters);
  });
  const prizes = new PrizeStore();
  // The prize pinned as the goal (its picture fills by the wallet chip), and the prize sets already paid for.
  const prizeGoal = new PrizeGoal();
  const prizeSets = new PrizeSets();
  // The balance table (`?payout`) and the big frame LexiPunk plays in.
  const payoutStats = new PayoutStats();
  const arcadeScreen = new ArcadeScreenPanel(container);
  const index = new LibretroIndex();
  const fame = new Fame();

  // Box art: the baked files, then libretro fronts through `/api/art` and LaunchBox scans through `/api/launchbox`
  // (disk caches in dev, serverless functions in production); missing faces are generated (see `createBoxArtLoader`).
  const libretroCovers = new LibretroCoverProvider({ proxy: '/api/art' });
  /** A front cover for the DOM panels' thumbnails (the catalogue, the WE BUY desk). */
  const coverUrl = (game: Game) => libretroCovers.getBoxArt(game).front;
  const covers = createBoxArtLoader(libretroCovers, engine.renderer.capabilities.getMaxAnisotropy());
  const videos = new YouTubeSearchProvider();

  // One sky for every zone (see docs/zones.md). `?season=winter` (or `autumn:0.9`) and `?weather=rain` override the
  // calendar and the forecast, `?lat=48.85` the latitude the sun rises and sets for (see docs/outdoors.md).
  // The clock starts where it was left (a reload the same real day), else in the morning (`MarketCalendar.savedHours`).
  const sky = new Sky({ hours: MarketCalendar.savedHours() ?? undefined, sunRotationY: SUN_ROTATION_Y, nearWall: KITCHEN_WING, viewer: engine.camera, season: parseSeason(params.get('season')), holiday: parseHoliday(params.get('holiday')), newYear: parseNewYear(params.get('holiday')), weather: parseWeather(params.get('weather')), latitude: parseLatitude(params.get('lat')) });
  // The market restocks every morning of the game's clock; haggles, holds, orders and games sold to it are
  // remembered, and so is how well it knows the player (reputation, regulars at each stall).
  const ledger = new MarketLedger();
  const standing = new MarketStanding();
  // The one "today" (the game day and the real date, see `time/Today`), and what kind of market day it is.
  const today = new Today(new MarketCalendar(sky.dayNight));
  today.setHoursSource(() => sky.dayNight.state.hours);
  // Front Street's counters sell so many a game day, like the market's own day (`errands/pocket`).
  pocket.followGameDay(() => today.gameDay);
  // So does everything else along it: the garage sale, the free box, the busker, the coins, the cards (`time/streetDay`).
  followStreetDays(() => today.gameDay);
  const marketDay = new MarketDay(today, (id) => collection.owns(id));
  const market = new MarketStock({ index, collection, fame, today, ledger, standing, raining: () => sky.weather.state.rain >= HEAVY_RAIN });
  engine.addUpdatable(sky);
  // Every exchange of money for games the panels make: checked first, then its saves written as one.
  const tx = new Transactions({ wallet, collection, market, ledger, standing, prizes });
  // The saleroom behind the flea market, the sealed cartons, and the rival collector who turns up at all three of
  // Front Street, the hall and the saleroom (docs/economy.md "The saleroom, sealed cartons, the rival collector").
  const lots = {
    auction: new AuctionHouse({ randomGames: (seed, count) => market.randomGames(seed, count), fame }),
    sealed: new SealedLots(),
    rival: new RivalCollector(),
    tx,
  };
  // The cat's name and coat, kept next to the collection (the Settings' Cat tab edits them).
  const catSettings = new CatSettingsStore();
  // The Saturday tournament at the arcade: the hall shows its bracket, the Session's arcade play settles its rounds.
  const tournament = new ArcadeTournament({ games: ARCADE_PLAN.tournament.games, names: HALL_REGULAR_INITIALS, gameDay: () => today.gameDay });
  // The arcade's game days (like the tournament's and the market's): the day's challenge, the change machine and the
  // machine out of order; the medals per machine (platinum, the hall's tour); the weekly league and the regular's card.
  const medals = new ArcadeMedals(undefined, undefined, { games: TICKET_GAMES, bestOf: (id) => scores.bestOf(id) });
  const arcadeDaily = new ArcadeDaily({ games: TICKET_GAMES, today: () => `g${today.gameDay}`, gold: (id) => medals.earned(id).includes('gold'), bestOf: (id) => scores.bestOf(id) });
  const league = new ArcadeLeague({ clock: today.clock, names: HALL_REGULAR_INITIALS });
  // The ticket wheel's progressive pot and the player's best run per cabinet, kept across the hall's loads; the plays per
  // machine (how long the HUD explains the keys, the claw's luck); the home cabinet's own table of scores.
  const jackpot = new Jackpot();
  const replays = new ReplayStore();
  const arcadeHabits = new ArcadeHabits();
  const homeScores = new HomeScores();
  // The collector's book: milestones reached (the plaque, the display cabinet, rewards to claim) and the collection's value day by day.
  const milestones = new Milestones();
  const valueHistory = new ValueHistory();
  // The arcade's feats the book counts beside medals and pennants: cups, golds, the jackpot, a plush, a table topped.
  const arcadeFacts = (): ArcadeFacts => ({
    cups: tournament.titles,
    golds: medals.golds,
    tour: medals.tourDone,
    jackpots: jackpot.hits,
    plush: prizes.owned.filter((p) => p.id.startsWith('plush-')).length,
    records: TICKET_GAMES.filter((id) => scores.topOf(id).you).length,
  });
  const collectorWatch = new CollectorWatch({ collection, fame, medals, standing, league, arcade: { facts: arcadeFacts, sources: [tournament, jackpot, prizes, scores] }, milestones, history: valueHistory });
  // The sets and consoles completed for good: a neon each over the living room's bookcases, the club's visit (docs/visitors.md "Gatherings").
  const honours = new Honours(collection, () => today.gameDay);
  // The neighbours' swaps, slipped under the door some market days (the post and the doorstep are the world's: `bootstrap/world`).
  const neighbourTrades = new NeighbourTrades({ collection, today, market, fame, residents: stairwellResidents(), present: (door) => !movedOut(door) });
  // The guided first day (a new game only) and the daily journal, which fills itself from the stores.
  const firstDay = new FirstDay({ returningPlayer, enabled: !debug });
  const journal = new Journal();
  // Who came round, lent what, when (the visitors' book), and the gatherings planned (games nights, open houses).
  const visitBook = new VisitBook();
  const gatheringBook = new GatheringBook();
  // Uncle Félix's notebook, at the back of a drawer from the second day: his games onto the wishlist, ticked as they come home (docs/story.md).
  const felix = new FelixNotebook(collection);
  // Mémé's across town, by bus: the visits, the Sunday envelope, the memories of her album seen (docs/story.md "Mémé").
  // What she has heard of and what the memories' unlocking reads, live; what the player can bring her (her gifts).
  // Her ways (docs/grandma.md "Sunday lunch, recipes and favours"): lunch at her table, her recipes, her favours, her occasions.
  const grandmaRituals = new GrandmaRituals(() => today.gameDay);
  const grandma = new GrandmaVisits({
    facts: () => {
      const games = collection.games.filter((g) => g.status !== 'wishlist');
      return {
        gamesOwned: games.length,
        arcadeMedals: medals.total,
        notebookFound: felix.found,
        clubSet: COLLECTOR_SETS.some((set) => setProgress(set, games).every((p) => p.have)),
        prototypeFound: story.stage === 'found' || story.stage === 'ended',
        trailStarted: story.stage !== 'waiting',
        craneBeaten: lots.rival.view().beaten,
      };
    },
    cakeOut: () => household.cakeOut,
    flowers: { carried: () => pocket.count('bunch') > 0, take: () => pocket.take('bunch') === 'bunch' },
    latestFind: () => {
      const owned = collection.games.filter((g) => (g.status ?? 'owned') === 'owned');
      const latest = owned.reduce<(typeof owned)[number] | undefined>((a, g) => (!a || (g.addedAt ?? '') > (a.addedAt ?? '') ? g : a), undefined);
      return latest ? { id: latest.id, title: latest.title } : null;
    },
  });
  felix.onTicked(() => grandma.felixGameHome());
  // The end of the family's story (docs/grandma.md): Gaspard at her table, the Christmas Game Boy, her visits to the flat.
  const family = new FamilyStory({ seen: (id) => grandma.hasSeen(id), note: (text, weight) => journal.note('note', text, { weight }) });
  // Her album's other photos (docs/grandma.md "The album's other photos"): the snapshots she finds, the player's
  // prints glued in after Félix's pages, and the photo mode's last shots kept small to give her.
  const albumFinds = new AlbumFinds(grandma, {
    closeness: () => Math.max(0, tierRank(socialTier(MEME_ID)) - tierRank('acquaintance')),
    season: () => seasonOf(today.realDate()).name,
  });
  const albumPrints = new AlbumPrints();
  const photoRoll = new PhotoRoll();
  // What points the player at her album's next photo: her hints, her ring on the flat's phone, her letter (docs/grandma.md).
  const grandmaHints = new GrandmaHints(grandma, () => today.gameDay);
  // Her own memory of the player (docs/grandma.md "Her presence"): the stories told, the news heard from the journal.
  const grandmaPresence = new GrandmaPresence({ days: () => journal.history });
  // Linden Avenue round her flat (docs/grandma.md "Around her flat"): the baguette she asks for, her mornings on the 38.
  const grandmaBread = new BreadErrand();
  const sharedRide = new SharedRide();
  // `?debug`: every progression done that its panel did not switch off (before the trail reads whether its cart is home).
  if (debug) unlockDebugProgress(debugSubjects({ today, collection, felix, upgrades, standing, medals, prizes }));
  // The lost prototype's trail, followed through the mail, the market, the radio, the arcade and the friends (src/story).
  const story = new PrototypeStory({ today, collection, journal });
  // The press at the time, from each game's Wikipedia article: the game panel's clipping (src/reviews).
  const reviews = new ReviewSource();
  watchForJournal(journal, { wallet, collection, deliveries, prizes, medals, home: upgrades, league });
  // What the kitchen, the bathroom and the bedroom are for (docs/household.md): what was done at home, its rules,
  // and what it sends the player out with (the market's haggles, the arcade's tickets).
  const hours = () => sky.dayNight.state.hours;
  const household = new Household(() => today.gameDay);
  const homeLife = new HomeLife({
    household, collection, shelved: strays, purse: wallet, hours,
    marketOpen: () => isShopOpen('retro', hours() % 24),
    todays: () => market.todays(),
    journal,
    notebook: felix,
  });
  const perks = new Perks({
    household,
    hours,
    facts: () => ({ ownsPrize: (id) => prizes.owns(id), reputationLevel: standing.reputation.level, gamesOwned: collection.games.filter((g) => g.status !== 'wishlist').length, knitted: grandma.scarfKnitted(socialEffect(MEME_ID, 'knitsScarf') === true) }),
  });

  // The paper's small ads, the sellers' lots, and the consoles bought broken to mend at home (docs/economy.md "Small ads
  // and the seller's flat", docs/household.md "Repairing a console").
  const classifieds = new Classifieds({ day: () => today.gameDay, hours });
  // The prototype's trail puts Hana's landlady's ad in the paper and hears when the player goes round.
  story.linkAds(classifieds);
  // What Mémé gives to take home after the memories, and Félix's lots: his copies (his sticker on the back) turn up in
  // Crane's suitcase and a dealer's small ad too, and one bought back counts for her album (docs/grandma.md).
  const keepsakes = new Keepsakes();
  followFelixLots({
    today, collection, rival: lots.rival, classifieds, grandma,
    catalogue: { given: () => keepsakes.has('catalogue'), subscribe: (cb) => keepsakes.subscribe(cb) },
    price: (game) => fame.lookup(game).then((views) => marketPrice(game, views, 'complete', 1)),
  });
  const sellerLots = new SellerLots({ book: classifieds, releases: (platform) => market.releases(platform), fame, owns: (id) => collection.owns(id) });
  const workshop = new Workshop();

  return {
    container, params, debug, returningPlayer, engine, input, settings, cssLayer,
    collection, deliveries, strays, showcases, shelfLabels, upgrades, overflow, arrangement, boxPool: new BoxPool(covers), furnishings, wallet,
    scores, arcadeDaily, prizes, prizeGoal, prizeSets, medals, league, payoutStats, arcadeScreen,
    index, fame, coverUrl, covers, videos,
    sky, today, marketDay, ledger, standing, market, tx, lots, catSettings,
    tournament, jackpot, replays, arcadeHabits, homeScores, milestones, valueHistory, collectorWatch, honours, neighbourTrades, firstDay, journal, visitBook, gatheringBook,
    household, homeLife, perks, story, felix, grandma, grandmaRituals, keepsakes, family, initials, grandmaHints, grandmaPresence, grandmaBread, sharedRide,albumFinds, albumPrints, photoRoll, reviews,
    classifieds, sellerLots, workshop,
  };
}
