import type { Game, PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { COLLECTOR_SETS, setProgress } from './collectorSets';
import { isGrail } from './grails';
import { streetMarkCount, streetMarked } from '@/social/street/streetMarks';
import { MILESTONE_REWARD } from './pricing';

/** Something the collector's book brings home besides coins: the brass plaque, the glass display cabinet. */
export type HomeReward = 'plaque' | 'vitrine';

/** What the milestones are judged on: a snapshot of the stores, taken by `MilestoneWatcher`. */
export interface CollectorFacts {
  /** The collection (the wishlist is left out here). */
  games: readonly Game[];
  /** Medals held at the arcade, all machines. */
  medals: number;
  /** Deals struck by haggling at the market. */
  deals: number;
  /** Games sold (the WE BUY desk, a wanted card). */
  sales: number;
  /** Weekly leagues won (the pennants). */
  pennants: number;
  /** The arcade's other feats, when the arcade is wired. */
  arcade?: ArcadeFacts;
  /** The collection's estimated value (`collectionValue`'s market estimate). */
  value: number;
}

/** The arcade's feats beyond medals and pennants, as the book counts them. */
export interface ArcadeFacts {
  /** Saturday tournaments won. */
  cups: number;
  /** Machines the player holds the gold of, and whether that is every one (the hall's tour). */
  golds: number;
  tour: boolean;
  /** The wheel's jackpot hit, plushes won at the claw, tables the player tops. */
  jackpots: number;
  plush: number;
  records: number;
}

/** How far along a milestone is: `have` of `need`, and a word on it for the book ("best: NES"). */
export interface MilestoneProgress {
  have: number;
  need: number;
  note?: string;
}

export interface Milestone {
  id: string;
  title: string;
  /** What it asks, as the book prints it. */
  blurb: string;
  /** What it brings home (shown in the flat from the moment it is reached). */
  home?: HomeReward;
  progress(facts: CollectorFacts): MilestoneProgress;
}

/** Coins or tickets a milestone pays once claimed in the book (`pricing.MILESTONE_REWARD`). */
export function milestoneReward(id: string): { coins?: number; tickets?: number } {
  return MILESTONE_REWARD[id] ?? {};
}

const owned = (facts: CollectorFacts) => facts.games.filter((g) => g.status !== 'wishlist');

/** The platform the player has most games on, and how many. */
function biggestPlatform(facts: CollectorFacts): { platform: PlatformId | null; count: number } {
  const counts = new Map<PlatformId, number>();
  for (const game of owned(facts)) counts.set(game.platform, (counts.get(game.platform) ?? 0) + 1);
  let best: { platform: PlatformId | null; count: number } = { platform: null, count: 0 };
  for (const [platform, count] of counts) if (count > best.count) best = { platform, count };
  return best;
}

const games = (need: number, title: string, blurb: string, home?: HomeReward): Milestone => ({
  id: `games-${need}`, title, blurb, ...(home ? { home } : {}),
  progress: (facts) => ({ have: owned(facts).length, need }),
});

const platform = (need: number, title: string, blurb: string): Milestone => ({
  id: `platform-${need}`, title, blurb,
  progress: (facts) => {
    const best = biggestPlatform(facts);
    return { have: best.count, need, ...(best.platform ? { note: `best: ${getPlatform(best.platform).shortName}` } : {}) };
  },
});

const count = (id: string, title: string, blurb: string, need: number, of: (facts: CollectorFacts) => number): Milestone => ({
  id, title, blurb, progress: (facts) => ({ have: of(facts), need }),
});

/** How many games of the collection share the most common value of `key` (a genre, a publisher). */
function mostOf(facts: CollectorFacts, key: (game: Game) => string | undefined): number {
  const counts = new Map<string, number>();
  for (const game of owned(facts)) {
    const k = key(game)?.trim().toLowerCase();
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

/** How many decades the collection's games came out in (from their release dates). */
function decades(facts: CollectorFacts): number {
  return new Set(owned(facts).flatMap((g) => (g.releaseDate ? [g.releaseDate.slice(0, 3)] : []))).size;
}

/** Complete sets of the collectors' club (claimed or not). */
function setsComplete(facts: CollectorFacts): number {
  const mine = owned(facts);
  return COLLECTOR_SETS.filter((set) => setProgress(set, mine).every((p) => p.have)).length;
}

/**
 * The collector's book's milestones, in the order it lists them: the size of the collection (25
 * brings the brass plaque, 50 the glass display cabinet), how deep one platform goes, how many
 * platforms, the collectors' club's sets, the arcade (medals, the league), the market (a deal
 * haggled, a game sold), what the collection is worth, and a grail.
 */
export const MILESTONES: readonly Milestone[] = [
  games(10, 'A shelf of one’s own', 'Own 10 games.'),
  games(25, 'The brass plaque', 'Own 25 games. A plaque for the sideboard comes with it.', 'plaque'),
  games(50, 'Under glass', 'Own 50 games. The best of them go in a glass display cabinet.', 'vitrine'),
  games(75, 'Three quarters', 'Own 75 games.'),
  games(100, 'The century', 'Own 100 games. The plaque is engraved again.'),
  games(150, 'Floor to ceiling', 'Own 150 games.'),
  games(250, 'A proper library', 'Own 250 games.'),
  platform(10, 'Specialist', 'Own 10 games for one console.'),
  platform(25, 'Almost complete', 'Own 25 games for one console.'),
  count('platforms-5', 'Omnivore', 'Own games for 5 different consoles.', 5, (facts) => new Set(owned(facts).map((g) => g.platform)).size),
  // The small moments along the way: the collection's character, not only its size.
  count('complete-1', 'Complete in box', 'Own a game with its box and its manual, as it left the shop.', 1, (facts) => owned(facts).filter((g) => g.condition === 'complete' && !g.repro).length),
  count('sealed-1', 'Never opened', 'Own a copy still in its shrink-wrap.', 1, (facts) => owned(facts).filter((g) => g.variant === 'sealed').length),
  count('genre-5', 'A taste for it', 'Own 5 games of one genre.', 5, (facts) => mostOf(facts, (g) => g.genre)),
  count('publisher-8', 'House style', 'Own 8 games from one publisher.', 8, (facts) => mostOf(facts, (g) => g.publisher)),
  count('decades-3', 'Across the years', 'Own games from 3 different decades.', 3, decades),
  count('set-1', 'Club member', 'Complete a set of the collectors’ club (the notice board at the market).', 1, setsComplete),
  count('sets-3', 'Set collector', 'Complete 3 sets of the collectors’ club.', 3, setsComplete),
  count('medal-1', 'On the podium', 'Win a medal on an arcade machine.', 1, (facts) => facts.medals),
  count('medals-10', 'Medal cabinet', 'Hold 10 arcade medals.', 10, (facts) => facts.medals),
  count('league-1', 'League champion', 'Win a week of the arcade’s league.', 1, (facts) => facts.pennants),
  count('arcade-record-1', 'Top of the table', 'Be first on a table of the arcade’s hall of fame.', 1, (facts) => facts.arcade?.records ?? 0),
  count('arcade-plush-1', 'Claw master', 'Win a plush at the arcade’s claw.', 1, (facts) => facts.arcade?.plush ?? 0),
  count('arcade-jackpot-1', 'Jackpot!', 'Hit the jackpot on the arcade’s ticket wheel.', 1, (facts) => facts.arcade?.jackpots ?? 0),
  count('arcade-cup-1', 'Saturday champion', 'Win the arcade’s Saturday tournament.', 1, (facts) => facts.arcade?.cups ?? 0),
  count('arcade-golds-5', 'Golden touch', 'Hold the gold medal on 5 arcade machines.', 5, (facts) => facts.arcade?.golds ?? 0),
  count('arcade-tour', 'The hall’s tour', 'Gold on every machine of the arcade.', 1, (facts) => (facts.arcade?.tour ? 1 : 0)),
  count('deal-1', 'Haggler', 'Strike a deal by haggling at the market.', 1, (facts) => facts.deals),
  count('sale-1', 'Dealer', 'Sell a game: the WE BUY desk, or a wanted card.', 1, (facts) => facts.sales),
  count('value-1000', 'Worth a bit', 'A collection worth 1,000 coins.', 1000, (facts) => facts.value),
  count('value-5000', 'Worth a fortune', 'A collection worth 5,000 coins.', 5000, (facts) => facts.value),
  count('grail-1', 'Holy grail', 'Own one of the grails: a game so rare it only comes to the market on a day of its own.', 1, (facts) => owned(facts).filter((g) => isGrail(g.id)).length),
  // Front Street's moments (`social/street/streetMarks`): kept once each, read here as they stand.
  count('street-cat', 'Home again', 'Win the stray’s trust all the way, and let him follow you home.', 1, () => (streetMarked('strayHome') ? 1 : 0)),
  count('street-scratch', 'Three sevens', 'Win the top line of a PIXEL SCRATCH card.', 1, () => (streetMarked('scratchBig') ? 1 : 0)),
  count('street-garage', 'Loft find', 'Buy a game off a garage sale’s table.', 1, () => (streetMarked('garageFind') ? 1 : 0)),
  count('street-felix', 'Bought back', 'Buy one of Félix’s copies back from Victor’s suitcase.', 1, () => (streetMarked('felixFromVictor') ? 1 : 0)),
  count('street-favour', 'Good neighbour', 'Do a favour for someone behind the bells of Park Corner Mansions.', 1, () => (streetMarked('mansionFavour') ? 1 : 0)),
  count('street-wager', 'A bet is a bet', 'Win a wager against Victor Crane.', 1, () => (streetMarked('wagerWon') ? 1 : 0)),
  count('street-secrets', 'Street wise', 'Find Front Street’s three secrets.', 3, () => streetMarkCount('secret:')),
];

/** Whether `milestone` is reached by `facts`. */
export function isReached(milestone: Milestone, facts: CollectorFacts): boolean {
  const { have, need } = milestone.progress(facts);
  return have >= need;
}

/** The biggest collection-size milestone reached (`games-N`), as its N: what the plaque is engraved with. */
export function plaqueTier(has: (id: string) => boolean): number {
  return MILESTONES.filter((m) => m.id.startsWith('games-') && has(m.id)).reduce((best, m) => Math.max(best, Number(m.id.slice(6))), 0);
}
