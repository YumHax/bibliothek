import type { Game, PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { HOME_UPGRADES, homeGood, type HomeUpgrade } from '@/economy/homeGoods';
import { LOYALTY, REPUTATION } from '@/economy/pricing';
import { TICKET_GAMES } from '@/world/arcade/arcadePlan';
import { arcadeTitle } from '@/world/street/arcadeTitles';
import { MEMORIES } from '@/grandma/memories';
import { PROTOTYPE_ID, prototypeGame, type StoryStage } from '@/story/prototype';
import { STORY_ORDER } from '@/story/PrototypeStory';
import { everyone } from '@/social/people';
import { TIERS } from '@/social/socialPlan';
import { setStanding, tier } from '@/social/standing';
import type { PersonId, SocialGroup } from '@/social/types';

/*
 * `?debug`'s dials (docs/checks.md "Debug mode"): a progression set to any of its steps, not only done or not (the
 * switches of `cheats/progress`): each piece of the flat, each machine's medals, the market's reputation and each
 * stall's custom, Mémé's memories seen, the prototype's trail, everyone's tier. Each reads its level from the game's
 * store and sets it there outright, quietly (no banner, no journal line). A start point (`cheats/start`) names its
 * dials by id.
 */

interface Dial {
  /** Stable: a start point sets it by this id (`home.armchair`, `person.meme`). */
  id: string;
  /** The debug panel's page it is on. */
  tab: 'progress' | 'people';
  group: string;
  label: string;
  /** The steps, lowest first. */
  levels: readonly string[];
  at(): number;
  set(level: number): void;
  /** What it changes is read as the world is built: the panel offers the reload. */
  reload?: boolean;
  /** A colour per level (a person's tiers). */
  tones?: readonly string[];
  /** Whose standing it is (the panel shows their face). */
  person?: PersonId;
}

/** The stores the dials read and write, by shape (the services' own: the cheats never import the wiring). */
interface DialSubjects {
  day(): number;
  upgrades: { count(upgrade: HomeUpgrade): number; debugSetCount(upgrade: HomeUpgrade, n: number): void };
  medals: { earned(gameId: string): readonly string[]; debugSetMedals(gameId: string, count: number): void };
  standing: { readonly reputation: { readonly level: number; readonly points: number }; buysAt(platform: PlatformId): number; debugSet(points: number, stall?: { platform: PlatformId; buys: number }): void };
  grandma: { readonly seen: readonly unknown[]; debugSeeFirst(count: number): void };
  story: { readonly stage: StoryStage; debugSetStage(stage: StoryStage): void };
  collection: { owns(id: string): boolean; add(game: Game): void; remove(id: string): void };
}

const STAGE_NAMES: Record<StoryStage, string> = {
  waiting: 'Not started',
  clipping: 'The clipping',
  stall: 'The stall',
  radio: 'The radio',
  arcade: 'The arcade',
  trader: 'The trader',
  found: 'The cart found',
  ended: 'The demo played',
};
const GROUP_NAMES: Record<SocialGroup, string> = {
  building: 'The building',
  street: 'Front Street',
  market: 'The flea market',
  arcade: 'The arcade',
  friends: 'Friends and family',
  rivals: 'Rivals',
};
const MEDAL_LEVELS = ['None', 'Bronze', 'Silver', 'Gold'];
/** Copies bought at a stall for each step of its custom (`LOYALTY.tiers`), a stranger first. */
const STALL_BUYS = [0, ...LOYALTY.tiers];

/** Every dial, read live from `s`. */
export function buildDials(s: DialSubjects): Dial[] {
  const home = HOME_UPGRADES.map((upgrade): Dial => {
    const good = homeGood(upgrade);
    return {
      id: `home.${upgrade}`,
      tab: 'progress',
      group: 'The flat, piece by piece',
      label: good.name,
      levels: good.max === 1 ? ['Not bought', 'Bought'] : Array.from({ length: good.max + 1 }, (_, n) => (n ? String(n) : 'None')),
      at: () => s.upgrades.count(upgrade),
      set: (n) => s.upgrades.debugSetCount(upgrade, n),
      reload: true,
    };
  });
  const medals = TICKET_GAMES.map((gameId): Dial => ({
    id: `medals.${gameId}`,
    tab: 'progress',
    group: 'The arcade’s medals',
    label: arcadeTitle(gameId),
    levels: MEDAL_LEVELS,
    at: () => s.medals.earned(gameId).length,
    set: (n) => s.medals.debugSetMedals(gameId, n),
  }));
  const reputation: Dial = {
    id: 'market.reputation',
    tab: 'progress',
    group: 'The flea market',
    label: 'Reputation',
    levels: REPUTATION.levels.map((l) => l.name),
    at: () => s.standing.reputation.level,
    set: (n) => s.standing.debugSet(REPUTATION.levels[n]?.at ?? 0),
  };
  const stalls = PLATFORM_LIST.map((p): Dial => ({
    id: `market.stall.${p.id}`,
    tab: 'progress',
    group: 'The flea market',
    label: `${p.shortName} stall`,
    levels: ['Stranger', ...LOYALTY.names],
    at: () => STALL_BUYS.filter((at) => s.standing.buysAt(p.id) >= at).length - 1,
    set: (n) => s.standing.debugSet(s.standing.reputation.points, { platform: p.id, buys: STALL_BUYS[n] ?? 0 }),
  }));
  const memories: Dial = {
    id: 'meme.memories',
    tab: 'progress',
    group: 'The story',
    label: 'Mémé’s album: memories seen',
    levels: ['None', ...MEMORIES.map((m, i) => `${i + 1}. ${m.title}`)],
    at: () => s.grandma.seen.length,
    set: (n) => s.grandma.debugSeeFirst(n),
  };
  const found = STORY_ORDER.indexOf('found');
  const trail: Dial = {
    id: 'story.trail',
    tab: 'progress',
    group: 'The story',
    label: 'The lost prototype’s trail',
    levels: STORY_ORDER.map((stage) => STAGE_NAMES[stage]),
    at: () => STORY_ORDER.indexOf(s.story.stage),
    set: (n) => {
      const stage = STORY_ORDER[n];
      if (!stage) return;
      // The cart is home from `found` on (the trail reads it so at every start).
      const owns = s.collection.owns(PROTOTYPE_ID);
      if (n >= found && !owns) s.collection.add(prototypeGame(s.day(), 'the debug panel'));
      if (n < found && owns) s.collection.remove(PROTOTYPE_ID);
      s.story.debugSetStage(stage);
    },
  };
  const people = everyone().map((person): Dial => ({
    id: `person.${person.id}`,
    tab: 'people',
    group: GROUP_NAMES[person.group],
    label: person.name,
    levels: TIERS.map((t) => t.name),
    tones: TIERS.map((t) => t.colour),
    person: person.id,
    at: () => TIERS.findIndex((t) => t.id === tier(person.id)),
    // Well inside the tier: its warmth and trust thresholds, and a little.
    set: (n) => {
      const t = TIERS[n];
      if (t) setStanding(person.id, Math.min(100, t.from + 5), Math.min(100, t.trust + 5), s.day(), true);
    },
  }));
  return [memories, trail, reputation, ...stalls, ...medals, ...home, ...people];
}
