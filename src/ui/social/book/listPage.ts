import { lookGrew, pageLook, seenOf } from '@/social/bookSeen';
import { knowsBirthday } from '@/social/life/birthdays';
import { daysToBirthday, isBirthday } from '@/social/mood';
import { everyone } from '@/social/people';
import { standing } from '@/social/standing';
import { threadsOf, type Thread } from '@/social/threads';
import { atLeast, tierInfo, tierOf } from '@/social/tiers';
import type { PersonCard, PersonId, PersonState, SocialGroup } from '@/social/types';
import { whereNow, whereWords } from '@/social/whereNow';
import { html, type Html } from '../../panel/html';
import { badge, pageItems } from './bookParts';
import { icon, type IconName } from '../icons';

/*
 * The People book's first page (docs/social.md "The People book"): a "Today" strip of who has something for the
 * player now (a word or a need, a promise due, a birthday), then everyone met as a card, warmest first: their face in
 * their tier's ring, name, badge, and one useful line (their open thread, else where they are now). A card shows
 * "new" when their page has something the player has not seen yet.
 */

export type Filter = SocialGroup | 'all';

/** Each tab's icon. */
const GROUP_ICON: Record<Filter, IconName> = { all: 'people', friends: 'heart', building: 'door', street: 'pin', market: 'tag', arcade: 'pad', rivals: 'trophy' };

/** The book's tabs, in order: everyone, then by group. */
const FILTERS: readonly { id: Filter; name: string }[] = [
  { id: 'all', name: 'Everyone' },
  { id: 'friends', name: 'Friends' },
  { id: 'building', name: 'Building' },
  { id: 'street', name: 'Street' },
  { id: 'market', name: 'Market' },
  { id: 'arcade', name: 'Arcade' },
  { id: 'rivals', name: 'Rivals' },
];

/** The most people the "Today" strip holds. */
const TODAY_MAX = 4;

/** Whether the book lists `card` now: met, or listed from the start. */
function listed(card: PersonCard, s: Readonly<PersonState>): boolean {
  return s.met !== null || card.listed === 'always';
}

/** The tabs with anyone in them (everyone always). */
export function tabsShown(): typeof FILTERS {
  const shown = everyone().filter((p) => listed(p, standing(p.id)));
  return FILTERS.filter((f) => f.id === 'all' || shown.some((p) => p.group === f.id));
}

/** Whether `id`'s page has something not seen yet (a fact, a memory, a need, a new look): nothing before it was ever opened. */
function hasNew(id: PersonId, day: number): boolean {
  const seen = seenOf(id);
  if (!seen) return false;
  const s = standing(id);
  if (lookGrew(seen.look, pageLook(tierOf(s.warmth, s.trust)))) return true;
  const before = new Set(seen.items);
  return pageItems(id, day).some((k) => !before.has(k));
}

/** What `id` has for the player today, in words, and how much it counts for the strip; null when nothing. */
function todayOf(id: PersonId, day: number): { text: string; hand: boolean; weight: number } | null {
  if (isBirthday(id, day) && knowsBirthday(id)) return { text: 'Birthday today!', hand: false, weight: 3 };
  const threads = threadsOf(id, day);
  const word = threads.find((t) => t.kind !== 'promise');
  if (word) return { text: word.text, hand: true, weight: 2 };
  const promise = threads.find((t) => t.kind === 'promise');
  if (promise) return { text: promiseLine(promise), hand: false, weight: 1.5 };
  if (knowsBirthday(id) && daysToBirthday(id, day) === 1) return { text: 'Birthday tomorrow', hand: false, weight: 1 };
  return null;
}

function promiseLine(t: Thread): string {
  return `You promised: ${t.text}${t.due ? ` (${t.due})` : ''}`;
}

/** The list page: the tabs, the masthead, "Today", the cards. */
export function listPage(filter: Filter, day: number, hour: number): Html {
  const all = everyone();
  const shown = all.filter((p) => listed(p, standing(p.id)));
  const unmet = all.length - shown.length;
  const today = shown
    .filter((p) => standing(p.id).met !== null)
    .map((p) => ({ p, t: todayOf(p.id, day) }))
    .filter((x): x is { p: PersonCard; t: NonNullable<ReturnType<typeof todayOf>> } => x.t !== null)
    .sort((a, b) => b.t.weight - a.t.weight)
    .slice(0, TODAY_MAX);
  const cards = shown
    .filter((p) => filter === 'all' || p.group === filter)
    .sort((a, b) => standing(b.id).warmth - standing(a.id).warmth)
    .map((p) => tile(p, day, hour));
  const tabs = tabsShown().map(
    (t) =>
      html`<button type="button" class="people-book__tab people-book__tab--${t.id}${t.id === filter ? ' people-book__tab--on' : ''}" data-action="filter" data-id="${t.id}" aria-pressed="${t.id === filter ? 'true' : 'false'}">${icon(GROUP_ICON[t.id], 1)}<span>${t.name}</span></button>`,
  );
  const friends = shown.filter((p) => atLeast(tierOf(standing(p.id).warmth, standing(p.id).trust), 'friend')).length;
  const strip = today.length
    ? html`<section class="people-book__todaystrip" aria-label="Today">
        <h3>Today</h3>
        <ul>${today.map(({ p, t }) => html`<li><button type="button" class="people-book__note${t.hand ? ' people-book__note--hand' : ''}" data-action="person" data-id="${p.id}">
          <span class="people-book__face" data-portrait="${p.id}" data-size="44" style="--tier:${tierInfo(tierOf(standing(p.id).warmth, standing(p.id).trust)).colour}"></span>
          <span class="people-book__notetext"><b>${p.short ?? p.name}</b><span>${t.hand ? `“${t.text}”` : t.text}</span></span>
        </button></li>`)}</ul>
      </section>`
    : '';
  return html`<div class="people-book__spread">
    <nav class="people-book__tabs" aria-label="Groups">${tabs}</nav>
    <section class="people-book__page">
      <header class="people-book__masthead">
        <h2>${icon('book', 1)} People</h2>
        <p class="people-book__tally"><b>${shown.length}</b> known · <b>${friends}</b> ${friends === 1 ? 'friend' : 'friends'}${unmet > 0 ? html` · <i>${unmet} still to meet</i>` : ''}</p>
      </header>
      ${filter === 'all' ? strip : ''}
      ${cards.length ? html`<ul class="people-book__grid">${cards}</ul>` : html`<p class="people-book__blank">Nobody here yet.</p>`}
    </section>
  </div>`;
}

/** One useful line about `id` now: their open thread, else where they are. */
function usefulLine(card: PersonCard, day: number, hour: number): Html {
  const threads = threadsOf(card.id, day);
  const word = threads.find((t) => t.kind !== 'promise');
  if (word) return html`<span class="people-book__line people-book__line--hand">“${word.text}”</span>`;
  const promise = threads.find((t) => t.kind === 'promise');
  if (promise) return html`<span class="people-book__line">${promiseLine(promise)}</span>`;
  const where = whereNow(card.id, day, hour);
  return html`<span class="people-book__line">${where ? whereWords(where) : card.whereabouts}</span>`;
}

/** A person on the list: their face in their tier's ring, name and role, the badge, one useful line, "new" when there is. */
function tile(card: PersonCard, day: number, hour: number): Html {
  const s = standing(card.id);
  const tier = tierInfo(tierOf(s.warmth, s.trust));
  const met = s.met !== null;
  const fresh = met && hasNew(card.id, day);
  return html`<li><button type="button" class="people-book__tile${met ? '' : ' people-book__tile--unmet'}" data-action="person" data-id="${card.id}" style="--tier:${tier.colour}">
      <span class="people-book__face" data-portrait="${card.id}" data-size="56"></span>
      <span class="people-book__who">
        <b>${card.short ?? card.name}</b>
        <small>${card.role}</small>
      </span>
      <span class="people-book__standing">${met ? badge(card.id) : html`<span class="people-book__unmet">Not met yet</span>`}${fresh ? html`<span class="people-book__ribbon">new</span>` : ''}</span>
      ${met ? usefulLine(card, day, hour) : ''}
    </button></li>`;
}
