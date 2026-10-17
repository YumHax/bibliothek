import { KEYS, PersistedStore } from '@/persistence';
import { findPerson } from './people';
import { gameFit, type GameGift } from './gifts';
import { TRAITS, type NewsTag } from './socialPlan';
import type { Fit, PersonId } from './types';

/*
 * The player's news (docs/social.md "Your news"): what the player did lately that people can be told, as the
 * player's own line ("I found Chrono Trigger at the market!"), each told once to each person. The features that make
 * news add it (`addNews`: a game bought or found, a high score, a visit to Mémé, the cat come home); a person takes it
 * by their tastes (a game: `gifts.gameFit`) and their traits' likes (`TRAITS[t].news`). Saved under `KEYS.socialNews`.
 */

/** One piece of news. */
export interface PlayerNews {
  /** Stable for the event (`game:<id>`, `medal:<machine>:<day>`): the same news is never added twice. */
  id: string;
  /** What the player says: "I found Chrono Trigger at the market!" */
  say: string;
  /** What it is about, for who cares (`NewsTag`). */
  tags: readonly NewsTag[];
  /** A game it is about: its tastes decide, and the menu shows its cover. */
  game?: GameGift & { id: string };
  /** The icon of the row (`ui/social/icons`). */
  icon: string;
  day: number;
}

interface NewsSave {
  news: PlayerNews[];
  /** By person, the news ids they were told. */
  told: Record<PersonId, string[]>;
}

/** News stays fresh this many game days, and this many are kept. */
const FRESH_DAYS = 4;
const KEEP = 16;

let store: PersistedStore<NewsSave> | null = null;
let state: NewsSave | null = null;

function loaded(): NewsSave {
  if (state) return state;
  store = new PersistedStore<NewsSave>({ key: KEYS.socialNews, version: 1, defaults: () => ({ news: [], told: {} }), read: readSave });
  state = store.load();
  return state;
}

function readSave(data: unknown): NewsSave | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<NewsSave>;
  const news = Array.isArray(d.news) ? d.news.filter((n): n is PlayerNews => !!n && typeof n.id === 'string' && typeof n.say === 'string' && typeof n.day === 'number' && Array.isArray(n.tags) && typeof n.icon === 'string') : [];
  const told: Record<PersonId, string[]> = {};
  for (const [id, ids] of Object.entries(d.told ?? {})) if (Array.isArray(ids)) told[id] = ids.filter((x): x is string => typeof x === 'string');
  return { news, told };
}

/** A piece of news the player can tell from now on (once per id). */
export function addNews(news: PlayerNews): void {
  const s = loaded();
  if (s.news.some((n) => n.id === news.id)) return;
  s.news.unshift(news);
  s.news.length = Math.min(s.news.length, KEEP);
  store?.save(s);
}

/** The fresh news not yet told to `id`, newest first. */
export function newsFor(id: PersonId, day: number): PlayerNews[] {
  const s = loaded();
  const told = new Set(s.told[id] ?? []);
  return s.news.filter((n) => day - n.day <= FRESH_DAYS && !told.has(n.id));
}

/** `id` was told `news` (it is not offered to them again). */
export function told(id: PersonId, news: string): void {
  const s = loaded();
  const list = (s.told[id] ??= []);
  if (list.includes(news)) return;
  list.push(news);
  if (list.length > 40) list.splice(0, list.length - 40);
  store?.save(s);
}

/** How `id` takes `news`: a game by their tastes, the rest by what their traits like or mind. */
export function newsFit(id: PersonId, news: PlayerNews): Fit {
  const card = findPerson(id);
  if (!card) return 'meh';
  if (news.game && card.tastes) {
    const fit = gameFit(id, news.game);
    if (fit >= 0.7) return 'loves';
    if (fit >= 0.4) return 'likes';
  }
  let likes = 0;
  let minds = 0;
  for (const t of card.traits) {
    const n = TRAITS[t].news;
    likes += news.tags.filter((tag) => n?.likes?.includes(tag)).length;
    minds += news.tags.filter((tag) => n?.minds?.includes(tag)).length;
  }
  if (minds > likes) return 'dislikes';
  if (likes >= 2) return 'loves';
  if (likes === 1) return 'likes';
  return 'meh';
}
