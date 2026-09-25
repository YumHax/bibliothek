import type { Game } from '@/catalog/types';
import { Engine } from '@/core/Engine';
import { Input } from '@/core/Input';
import { CssLayer } from '@/core/CssLayer';
import { SEED_GAMES } from '@/catalog';
import { CollectionStore } from '@/collection/CollectionStore';
import { Deliveries } from '@/collection/Deliveries';
import { GameList } from '@/collection/GameList';
import { LibretroIndex } from '@/collection/LibretroIndex';
import { CoverArtResolver } from '@/covers/CoverArtProvider';
import { LibretroCoverProvider } from '@/covers/LibretroCoverProvider';
import { BoxArtLoader } from '@/covers/BoxArtLoader';
import { YouTubeSearchProvider } from '@/video/YouTubeSearchProvider';
import { ArcadeDaily, ArcadeLeague, ArcadeMedals, ArcadeScores, CollectorWatch, Fame, MarketCalendar, MarketLedger, MarketStanding, MarketStock, Milestones, PayoutStats, PrizeStore, STARTING_COINS, Transactions, ValueHistory, Wallet } from '@/economy';
import { ArcadeTournament } from '@/economy/ArcadeTournament';
import { NeighbourTrades } from '@/economy/NeighbourTrades';
import { FirstDay } from '@/onboarding';
import { Journal, watchForJournal } from '@/journal';
import { stairwellResidents } from '@/world/stairwell/building';
import { HomeUpgrades } from '@/economy/HomeUpgrades';
import { ARCADE_PLAN, TICKET_GAMES } from '@/world/arcade/arcadePlan';
import { StrayGames } from '@/world/strays/StrayGames';
import { Sky } from '@/world/Sky';
import { KITCHEN_WING, SUN_ROTATION_Y } from '@/world/worldPlan';
import { parseHoliday, parseNewYear, parseSeason } from '@/world/props/outdoors/season';
import { parseLatitude } from '@/world/props/solar';
import { parseWeather } from '@/world/weather/Weather';
import { CatSettingsStore } from '@/world/cat';
import { ArcadeScreenPanel } from '@/ui/ArcadeScreenPanel';
import { SettingsStore, hasProgress } from '@/settings';
import { initKeyLabels } from '@/ui/keys';
import { initPanelNav } from '@/ui/menu/MenuNav';

/** The engine and every store and data source: nothing in the world, no panel but the arcade's big frame. */
export type Services = ReturnType<typeof createServices>;

/**
 * The engine, the input, the player's settings, the collection and its parcel, the money and the
 * arcade's and market's stores, the art and the longplays, the one sky. Made first: the world, the
 * UI and the Session all read them.
 */
export function createServices(container: HTMLElement) {
  const params = new URLSearchParams(location.search);
  /** `?debug`: the built-in seed collection and the editor's "add a game" pane, instead of earning every game. */
  const debug = params.has('debug');
  // Read before any store writes: a save from before the guided first day never sees it.
  const returningPlayer = hasProgress();
  const engine = new Engine(container);
  const input = new Input();
  // The player's settings (look, audio, HUD, keys): applied once the camera, the devices and the HUD exist (`bootstrap/input`).
  const settings = new SettingsStore();
  // Key names follow the bindings and the keyboard layout; every DOM panel is walkable with the arrows / D-pad.
  initKeyLabels(input);
  initPanelNav(input);
  const cssLayer = new CssLayer(container);
  engine.addLayer(cssLayer);

  // The collection starts empty: games are bought at the market with coins won at the arcade. Whatever
  // the player owns is persisted in localStorage; an exported collection can still be imported (Tab).
  const collection = new CollectionStore(debug ? SEED_GAMES : []);
  // Games bought while out wait in a parcel in the hallway until unpacked; the shelves show the rest.
  const deliveries = new Deliveries(collection);
  // A game or two left lying about the flat each day (the kitchen table, a nightstand): off their shelves until picked up.
  const strays = new StrayGames(deliveries.shelved);
  // Furniture bought for the flat: the bedroom's bookcases, which take what the collection room cannot hold.
  const upgrades = new HomeUpgrades();
  const overflow = new GameList();
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

  // Box art: chain of providers, first URL per face wins; missing faces are generated. Add IGDB/ScreenScraper here later.
  // Art goes through `/api/art` (disk cache in dev, serverless function in production).
  const libretroCovers = new LibretroCoverProvider({ proxy: '/api/art' });
  const coverResolver = new CoverArtResolver([libretroCovers]);
  /** A front cover for the DOM panels' thumbnails (the catalogue, the WE BUY desk). */
  const coverUrl = (game: Game) => libretroCovers.getBoxArt(game).front;
  const covers = new BoxArtLoader(coverResolver, engine.renderer.capabilities.getMaxAnisotropy());
  const videos = new YouTubeSearchProvider();

  // One sky for every zone (see docs/zones.md). `?season=winter` (or `autumn:0.9`) and `?weather=rain` override the
  // calendar and the forecast, `?lat=48.85` the latitude the sun rises and sets for (see docs/outdoors.md).
  const sky = new Sky({ sunRotationY: SUN_ROTATION_Y, nearWall: KITCHEN_WING, season: parseSeason(params.get('season')), holiday: parseHoliday(params.get('holiday')), newYear: parseNewYear(params.get('holiday')), weather: parseWeather(params.get('weather')), latitude: parseLatitude(params.get('lat')) });
  // The market restocks every morning of the game's clock; haggles, holds, orders and games sold to it are
  // remembered, and so is how well it knows the player (reputation, regulars at each stall).
  const ledger = new MarketLedger();
  const standing = new MarketStanding();
  const market = new MarketStock({ index, collection, fame, calendar: new MarketCalendar(sky.dayNight), ledger, standing, raining: () => sky.weather.state.rain >= 0.45 });
  engine.addUpdatable(sky);
  // Every exchange of money for games the panels make: checked first, then its saves written as one.
  const tx = new Transactions({ wallet, collection, market, ledger, standing, prizes });
  // The cat's name and coat, kept next to the collection (the Settings' Cat tab edits them).
  const catSettings = new CatSettingsStore();
  // The Saturday tournament at the arcade: the hall shows its bracket, the Session's arcade play settles its rounds.
  const tournament = new ArcadeTournament({ games: ARCADE_PLAN.tournament.games, names: ARCADE_PLAN.crowd.regulars.names });
  // The collector's book: milestones reached (the plaque, the display cabinet, rewards to claim) and the collection's value day by day.
  const milestones = new Milestones();
  const valueHistory = new ValueHistory();
  const collectorWatch = new CollectorWatch({ collection, fame, medals, standing, league, milestones, history: valueHistory });
  // The neighbours' swaps, slipped under the door some market days (the post and the doorstep are the world's: `bootstrap/world`).
  const neighbourTrades = new NeighbourTrades({ collection, market, fame, residents: stairwellResidents() });
  // The guided first day (a new game only) and the daily journal, which fills itself from the stores.
  const firstDay = new FirstDay({ returningPlayer, enabled: !debug });
  const journal = new Journal();
  watchForJournal(journal, { wallet, collection, deliveries, prizes, medals });

  return {
    container, params, debug, engine, input, settings, cssLayer,
    collection, deliveries, strays, upgrades, overflow, wallet,
    scores, arcadeDaily, prizes, medals, league, payoutStats, arcadeScreen,
    index, fame, coverUrl, covers, videos,
    sky, ledger, standing, market, tx, catSettings,
    tournament, milestones, valueHistory, collectorWatch, neighbourTrades, firstDay, journal,
  };
}
