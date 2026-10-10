import { MILESTONES, milestoneReward, type CollectorFacts, type Milestone, type MilestoneProgress } from '@/economy/milestoneList';
import { formatDay } from '@/text/clock';
import { formatNumber } from '@/text/count';
import { html, type Html } from '../panel/html';
import type { BookData, BookPage } from './bookTypes';

/** A run of stamps on a page: its heading and the milestones it holds (by id prefix). */
interface StampGroup {
  id: string;
  title: string;
  holds: (id: string) => boolean;
}

/** The album's two pages: the collection itself on the left, what was done around it on the right. */
const LEFT: readonly StampGroup[] = [
  { id: 'shelves', title: 'The shelves', holds: (id) => id.startsWith('games-') },
  { id: 'depth', title: 'One console, then many', holds: (id) => id.startsWith('platform') },
  { id: 'character', title: 'Its character', holds: (id) => ['complete-1', 'sealed-1', 'genre-5', 'publisher-8', 'decades-3'].includes(id) },
];
const RIGHT: readonly StampGroup[] = [
  { id: 'club', title: 'The club', holds: (id) => id.startsWith('set') },
  { id: 'arcade', title: 'At the arcade', holds: (id) => id.startsWith('medal') || id.startsWith('league') },
  { id: 'market', title: 'At the market', holds: (id) => id.startsWith('deal') || id.startsWith('sale') },
  { id: 'worth', title: 'Worth', holds: (id) => id.startsWith('value') || id.startsWith('grail') },
  // A milestone added later and given no group of its own still has a mount.
  { id: 'more', title: 'And more', holds: (id) => ![...LEFT, ...RIGHT].some((g) => g.id !== 'more' && g.holds(id)) },
];

/**
 * THE STAMPS: the milestones as a stamp album's two pages. A milestone reached is a stamp stuck in its mount, in
 * its group's colour, cancelled with the day it was reached; one still ahead is an empty glassine mount with its
 * name pencilled in and how far along it is. A stamp an older save left with its reward unpaid has an envelope
 * tucked behind it. The page's foot is a caption the pointer or the focus fills (`data-caption`, the panel).
 */
export function stampPages(data: BookData): BookPage[] {
  const facts = data.watch.facts();
  const page = (groups: readonly StampGroup[]): BookPage => {
    const stamps = groups.map((g) => ({ group: g, milestones: MILESTONES.filter((m) => g.holds(m.id)) })).filter((s) => s.milestones.length);
    const all = stamps.flatMap((s) => s.milestones);
    return {
      section: 'stamps',
      body: html`${stamps.map(({ group, milestones }) => html`<h3 class="book-hand-heading">${group.title}</h3>
          <div class="book-stamps">${milestones.map((m) => stampHtml(data, m, m.progress(facts), group.id))}</div>`)}
        <p class="book-caption">${defaultCaption(data, all, facts)}</p>`,
    };
  };
  return [page(LEFT), page(RIGHT)];
}

function stampHtml(data: BookData, m: Milestone, progress: MilestoneProgress, group: string): Html {
  const { milestones } = data;
  const on = milestones.reachedOn(m.id);
  const done = milestones.has(m.id);
  const owed = done && !milestones.isClaimed(m.id) && hasPayment(m.id);
  const caption = captionOf(data, m, progress);
  const face = done
    ? html`<span class="book-stamp__face"><span class="book-stamp__title">${m.title}</span></span>${on ? html`<span class="book-stamp__postmark">${postmark(on)}</span>` : ''}`
    : html`<span class="book-stamp__pencil">${m.title}</span><span class="book-stamp__tally">${tally(progress)}</span>`;
  return html`<div class="book-stamp-cell">
      <button type="button" class="book-stamp book-stamp--${done ? 'stuck' : 'empty'}" data-group="${group}" data-caption="${caption}" aria-label="${caption}">${face}</button>
      ${owed ? html`<button type="button" class="book-envelope" data-action="claim" data-id="${m.id}">Take the envelope</button>` : ''}
    </div>`;
}

/** "18 of 25", the figures pencilled under an empty mount. */
function tally(p: MilestoneProgress): string {
  return `${formatNumber(Math.min(p.have, p.need))} of ${formatNumber(p.need)}`;
}

/** The cancellation's words: "12 OCT 26". */
function postmark(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).toUpperCase();
}

/** What the caption says about a stamp: its name, what it asks, and when it was stuck in or how far along it is. */
function captionOf(data: BookData, m: Milestone, p: MilestoneProgress): string {
  const on = data.milestones.reachedOn(m.id);
  if (data.milestones.has(m.id)) return `${m.title}. ${m.blurb} Stuck in on ${on ? formatDay(on) : 'a day long ago'}.`;
  return `${m.title}. ${m.blurb} ${tally(p)} so far${p.note ? ` (${p.note})` : ''}.`;
}

/** What a page's caption says before anything is pointed at: its latest stamp, or the mount nearest to filling. */
function defaultCaption(data: BookData, all: readonly Milestone[], facts: CollectorFacts): string {
  const { milestones } = data;
  const stuck = all.filter((m) => milestones.has(m.id)).sort((a, b) => (milestones.reachedOn(b.id) ?? '').localeCompare(milestones.reachedOn(a.id) ?? ''));
  const latest = stuck[0];
  if (latest) return captionOf(data, latest, latest.progress(facts));
  const nearest = [...all].sort((a, b) => share(b.progress(facts)) - share(a.progress(facts)))[0];
  return nearest ? captionOf(data, nearest, nearest.progress(facts)) : '';
}

const share = (p: MilestoneProgress): number => Math.min(1, p.have / p.need);

function hasPayment(id: string): boolean {
  const { coins, tickets } = milestoneReward(id);
  return !!coins || !!tickets;
}
