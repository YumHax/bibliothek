import { MEMORIES } from '@/grandma/memories';
import { PROGRESSIONS } from '../progress/progressions';

/**
 * Where `?debug`'s save can be started again from (docs/checks.md "Debug mode"), along the story's acts
 * (docs/story.md "The acts"): the debug save wiped, the progressions in `done` done and every other one switched off,
 * the dials (`cheats/dials` ids) set to their levels once the page is back, the coins held. A new start point is one entry.
 */
export interface StartPoint {
  id: string;
  label: string;
  /** What the save is then, in a line. */
  blurb: string;
  /** The opening cutscene, the first day's list and the welcome play, as in a new game. */
  opening: boolean;
  /** The built-in seed collection (and the homebrew carts), or the starter game alone. */
  collection: 'seed' | 'starter';
  /** `PROGRESSIONS` ids done. */
  done: readonly string[];
  /** Dials set once the page is back, by id: the level's index. */
  levels?: Readonly<Record<string, number>>;
  /** The wallet's coins (default: a new game's). */
  coins?: number;
}

export const START_POINTS: readonly StartPoint[] = [
  {
    id: 'new',
    label: 'A new game',
    blurb: 'Nothing done: the opening plays, then the first day, the starter game alone in a bare flat.',
    opening: true,
    collection: 'starter',
    done: [],
  },
  {
    id: 'bare',
    label: 'The bare flat',
    blurb: 'As after the first day: the starter game, one bookcase, the TV and a mattress, nobody met.',
    opening: false,
    collection: 'starter',
    done: [],
  },
  {
    id: 'street',
    label: 'Act 2: the street',
    blurb: 'Félix’s notebook found, a few pieces bought, a regular at the market, the first memory seen, the clipping on the mat.',
    opening: false,
    collection: 'starter',
    done: ['felix'],
    levels: { 'home.armchair': 1, 'home.sideTable': 1, 'home.lamp': 1, 'home.bed': 1, 'market.reputation': 1, 'meme.memories': 1, 'story.trail': 1 },
    coins: 600,
  },
  {
    id: 'building',
    label: 'Act 3: the building',
    blurb: 'The flat furnished, the concierge’s cellar key, the attic’s code, three memories seen, the trail at the radio.',
    opening: false,
    collection: 'seed',
    done: ['flat', 'felix', 'concierge', 'attic.found'],
    levels: { 'market.reputation': 2, 'meme.memories': 3, 'story.trail': 3 },
    coins: 1500,
  },
  {
    id: 'trail',
    label: 'Act 4: the trail',
    blurb: 'The building done, gold at the arcade, five memories seen, the trail at the trader’s: the cart and the club are next.',
    opening: false,
    collection: 'seed',
    done: ['flat', 'felix', 'concierge', 'attic.found', 'attic.prize', 'attic.chest', 'aerial', 'hunt', 'medals'],
    levels: { 'market.reputation': 3, 'meme.memories': 5, 'story.trail': 5 },
    coins: 3000,
  },
  {
    id: 'end',
    label: 'Everything done',
    blurb: 'Every progression done, every memory seen, the demo played, the seed collection on the shelves.',
    opening: false,
    collection: 'seed',
    done: PROGRESSIONS.map((p) => p.id),
    levels: { 'meme.memories': MEMORIES.length, 'story.trail': 7 },
    coins: 5000,
  },
];
