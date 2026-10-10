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
import { ArcadeTournament } from '@/economy/ArcadeTournament';
import { ArcadeHabits } from '@/economy/ArcadeHabits';
import { Jackpot } from '@/economy/Jackpot';
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
import { COLLECTOR_SETS, setProgress } from '@/economy/collectorSets';
import { effect as socialEffect } from '@/social/perks';
import { MEME_ID } from '@/social/people/family';
import { pocket } from '@/errands/pocket';
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
  const arcadeDaily = new ArcadeDaily({ games: TICKET_GAMES });
  const prizes = new PrizeStore();
  // Medals per machine, the weekly league and the day streak, the balance table (`?payout`), and the big frame LexiPunk plays in.
  const medals = new ArcadeMedals();
  const league = new ArcadeLeague();
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
  const tournament = new ArcadeTournament({ games: ARCADE_PLAN.tournament.games, names: ARCADE_PLAN.crowd.regulars.names, gameDay: () => today.gameDay });
  // The ticket wheel's progressive pot and the player's best run per cabinet, kept across the hall's loads; the plays per
  // machine (how long the HUD explains the keys, the claw's luck); the home cabinet's own table of scores.
  const jackpot = new Jackpot();
  const replays = new ReplayStore();
  const arcadeHabits = new ArcadeHabits();
  const homeScores = new HomeScores();
  // The collector's book: milestones reached (the plaque, the display cabinet, rewards to claim) and the collection's value day by day.
  const milestones = new Milestones();
  const valueHistory = new ValueHistory();
  const collectorWatch = new CollectorWatch({ collection, fame, medals, standing, league, milestones, history: valueHistory });
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
  const sellerLots = new SellerLots({ book: classifieds, releases: (platform) => market.releases(platform), fame, owns: (id) => collection.owns(id) });
  const workshop = new Workshop();

  return {
    container, params, debug, returningPlayer, engine, input, settings, cssLayer,
    collection, deliveries, strays, showcases, shelfLabels, upgrades, overflow, arrangement, boxPool: new BoxPool(covers), furnishings, wallet,
    scores, arcadeDaily, prizes, medals, league, payoutStats, arcadeScreen,
    index, fame, coverUrl, covers, videos,
    sky, today, marketDay, ledger, standing, market, tx, lots, catSettings,
    tournament, jackpot, replays, arcadeHabits, homeScores, milestones, valueHistory, collectorWatch, honours, neighbourTrades, firstDay, journal, visitBook, gatheringBook,
    household, homeLife, perks, story, felix, grandma, reviews,
    classifieds, sellerLots, workshop,
  };
}
