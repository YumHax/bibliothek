import { daysToBirthday } from '@/social/mood';
import { standing } from '@/social/standing';
import { threadsOf, type Thread } from '@/social/threads';
import { promiseCounts } from '@/social/promises';
import { capitalise } from '@/text/strings';
import { stampsOf, tierOf } from '@/social/tiers';
import type { Fit, PersonId } from '@/social/types';
import { html, type Html } from '../../panel/html';
import { tierBadge } from '../badge';

/*
 * What the People book's pages share (docs/social.md "The People book"): the tier's badge, the stamps of trust, the
 * keys of what a page shows (for its "new" ribbons, `social/bookSeen`), and the words for a fit, a tie, a birthday.
 */

/** The tier as the one badge (`../badge`), on the book's cream paper. */
export function badge(id: PersonId, size: 'small' | 'big' = 'small'): Html {
  const s = standing(id);
  return html`<span class="people-book__badge people-book__badge--${size}">${tierBadge(tierOf(s.warmth, s.trust), id, { paper: true, small: size === 'small' })}</span>`;
}

/**
 * The stamps of trust (each a promise kept's worth): a row of ink rings, then a crossed-out one for each promise
 * broken (`promises.promiseCounts`), none when there are none.
 */
export function stamps(id: PersonId): Html {
  const n = Math.min(6, stampsOf(standing(id).trust));
  const broken = Math.min(3, promiseCounts(id).broken);
  if (!n && !broken) return html``;
  const kept = n === 0 ? '' : n === 1 ? 'Kept your word once' : `Kept your word ${n} times`;
  const went = broken === 0 ? '' : broken === 1 ? 'went back on it once' : `went back on it ${broken} times`;
  const label = [kept, went].filter(Boolean).join(', ');
  return html`<span class="people-book__stamprow" role="img" aria-label="${capitalise(label)}">${Array.from({ length: n }, () => html`<i class="people-book__inkstamp"></i>`)}${Array.from({ length: broken }, () => html`<i class="people-book__inkstamp people-book__inkstamp--broken"></i>`)}</span>`;
}

/** A thread's key, for what is new since the page was last shown. */
export function threadKey(t: Thread): string {
  return `thread:${t.kind}:${t.text}`;
}

/** What `id`'s page shows now, as keys: facts, topics' fits and gift tastes learned, memories, threads. */
export function pageItems(id: PersonId, day: number): string[] {
  const s = standing(id);
  return [...s.known.map((k) => `known:${k}`), ...s.traitsKnown.map((t) => `known:trait:${t}`), ...s.memories.map((m) => `memory:${m.day}:${m.text}`), ...threadsOf(id, day).map(threadKey)];
}

/** How a topic's fit is written once found out. */
export const FIT_WORDS: Record<Fit, string> = { loves: 'loves it', likes: 'likes it', meh: 'not much', dislikes: 'to avoid' };

/** How a gift taste found out is written: "Loves flowers", "Doesn’t want a butcher’s scrap", "Glad of a croissant". */
export const TASTE_WORDS: Record<'loves' | 'dislikes' | 'fine', string> = { loves: 'Loves', dislikes: 'Doesn’t want', fine: 'Glad of' };

export function birthdayLine(id: PersonId, day: number): string {
  const days = daysToBirthday(id, day);
  if (days === 0) return 'Today!';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export function tieName(tie: number): string {
  return tie >= 0.6 ? 'close' : tie > 0.2 ? 'friends' : tie > -0.2 ? 'neighbours' : tie > -0.5 ? 'don’t get on' : 'can’t stand each other';
}

