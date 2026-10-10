import type { Game } from '@/catalog/types';
import type { Upcoming } from '@/journal';
import type { JournalDay } from '@/journal/Journal';
import { formatNumber } from '@/text/count';
import { coverImg } from '../panel/widgets';
import { html, type Html } from '../panel/html';
import { longDate, weekdayName } from './journalDates';
import { icon } from './journalSprite';
import type { PageContext, TrailFile } from './journalTypes';
import { weekBarsHtml } from './weekBars';

/** Snapshots pinned on a page, "to watch" lines before the fold. */
const SNAPS = 4;
const AHEAD_SHOWN = 6;
/** The lines whose `data.id` is a game come home: their covers are the page's snapshots. */
const ARRIVALS = new Set(['bought', 'gift']);

/**
 * THE LEFT PAGE, the day at a glance: the day and its weekday in the hand, the counters (today: what is in hand,
 * large, with the day's moves under; an earlier day: its moves), the coins of the last days as bars, the games come
 * home as snapshots taped in, then (today only) what is coming as a short list with the day beside it and the
 * trails followed as dots.
 */
export function glanceHtml(day: JournalDay, today: boolean, ctx: PageContext, pages: readonly JournalDay[], spread: number): Html {
  const weekday = weekdayName(day.day);
  return html`<h2 class="journal-page__day">${longDate(day.day)}</h2>
    ${weekday ? html`<p class="journal-page__weekday">${weekday}${today ? ', today' : ''}</p>` : ''}
    ${sumsHtml(day, today, ctx)}
    ${weekBarsHtml(pages, spread)}
    ${snapsHtml(day, ctx)}
    ${today ? aheadHtml(ctx) : ''}
    ${today ? [ctx.options.file, ...(ctx.options.files ?? [])].map((f) => trailHtml(f?.() ?? null, ctx)) : ''}`;
}

/**
 * The counters: three pictograms in a row. Today, the figure in hand is written large (the purse's coins and tickets,
 * the games on the shelves) with the day's moves small under it; an earlier day has only its moves, in the green and
 * the red; a day nothing moved on says so in pencil.
 */
function sumsHtml(day: JournalDay, today: boolean, ctx: PageContext): Html {
  const t = day.totals;
  const have = today ? ctx.options.balance?.() : undefined;
  const moved = t.coinsIn + t.coinsOut + t.ticketsIn + t.ticketsOut + t.gamesIn + t.gamesOut > 0;
  if (!have && !moved) return html`<p class="journal-pencil">nothing counted that day</p>`;
  const sum = (what: 'coins' | 'tickets' | 'games', held: number | undefined, gain: number, spent: number) =>
    html`<li class="journal-sum" data-what="${what}">
        ${icon(what)}
        ${held !== undefined ? html`<b class="journal-sum__have">${formatNumber(held)}</b>` : ''}
        <span class="journal-sum__name">${what}</span>
        ${gain || spent ? html`<span class="journal-sum__moves">${gain ? html`<span class="journal-sum__in">+${formatNumber(gain)}</span>` : ''}${spent ? html`<span class="journal-sum__out">−${formatNumber(spent)}</span>` : ''}</span>` : ''}
      </li>`;
  return html`<ul class="journal-sums" aria-label="${today ? 'In hand, and the day’s moves' : 'The day’s moves'}">${sum('coins', have?.coins, t.coinsIn, t.coinsOut)}${sum('tickets', have?.tickets, t.ticketsIn, t.ticketsOut)}${sum('games', have?.games, t.gamesIn, t.gamesOut)}</ul>`;
}

/** The games that came home that day, their covers as snapshots taped in at an angle (the first four; the rest counted). */
function snapsHtml(day: JournalDay, ctx: PageContext): Html | '' {
  const seen = new Set<string>();
  const arrivals: { title: string; game?: Game }[] = [];
  for (const e of day.entries) {
    const id = typeof e.data?.id === 'string' ? e.data.id : null;
    if (!ARRIVALS.has(e.kind) || !id || seen.has(id)) continue;
    seen.add(id);
    const game = ctx.gameOf(id);
    arrivals.push({ title: game?.title ?? e.text.split(', from ')[0]!, ...(game ? { game } : {}) });
  }
  if (!arrivals.length) return '';
  const shown = arrivals.slice(0, SNAPS);
  return html`<h3 class="journal-page__heading">Came home</h3>
    <ul class="journal-snaps">${shown.map((a, i) => html`<li class="journal-snap" style="--tilt:${(i % 2 ? 1 : -1) * (1.2 + i * 0.7)}deg">
        <span class="journal-snap__pocket">${a.game ? coverImg(ctx.options.coverUrl?.(a.game), a.game, 'journal-snap__cover') : ''}</span>
        <span class="journal-snap__name">${a.title}</span>
      </li>`)}</ul>
    ${arrivals.length > SNAPS ? html`<p class="journal-pencil">and ${arrivals.length - SNAPS} more</p>` : ''}`;
}

/** The challenge and what is coming: a pictogram, a few words, the day beside; a long list folds after six. */
function aheadHtml(ctx: PageContext): Html | '' {
  const lines: Upcoming[] = [];
  const c = ctx.options.challenge?.();
  if (c) {
    const title = ctx.options.titleOf?.(c.gameId) ?? c.gameId.toUpperCase();
    lines.push({ kind: 'arcade', text: c.done ? `Challenge on ${title}: beaten ✓` : `Challenge: ${formatNumber(c.target)} on ${title}, for ${c.reward} bonus tickets`, inDays: 0 });
  }
  lines.push(...(ctx.options.upcoming?.() ?? []));
  if (!lines.length) return '';
  const open = ctx.folds.has('ahead');
  const shown = open ? lines : lines.slice(0, AHEAD_SHOWN);
  return html`<h3 class="journal-page__heading">To do, to watch</h3>
    <ul class="journal-ahead">${shown.map((l) => html`<li class="journal-ahead__item" data-kind="${l.kind}">
        ${icon(l.kind)}<span class="journal-ahead__text">${l.text}</span>
        ${l.inDays !== undefined ? html`<span class="journal-when${l.inDays === 0 ? ' journal-when--today' : ''}">${whenWord(l.inDays)}</span>` : ''}
      </li>`)}</ul>
    ${lines.length > AHEAD_SHOWN ? foldToggle('ahead', open, open ? 'fewer' : `and ${lines.length - AHEAD_SHOWN} more`) : ''}`;
}

/** "today", "tomorrow", "in 3 days". */
function whenWord(inDays: number): string {
  return inDays <= 0 ? 'today' : inDays === 1 ? 'tomorrow' : `in ${inDays} days`;
}

/**
 * A trail's block: its clues as a row of dots (filled as found, the next one a magnifier), the latest clue, where to
 * look next in the hand, the earlier clues folded. A trail over has its dots all filled and a SOLVED stamp.
 */
function trailHtml(file: TrailFile | null, ctx: PageContext): Html | '' {
  if (!file) return '';
  const found = Math.min(file.clues.length, file.total);
  const dots = Array.from({ length: Math.max(file.total, found) }, (_, i) => {
    const state = file.done || i < found ? 'found' : i === found ? 'next' : 'ahead';
    return html`<li class="journal-trail__dot journal-trail__dot--${state}">${state === 'next' ? icon('hunt') : ''}</li>`;
  });
  const latest = file.clues[file.clues.length - 1];
  const earlier = file.clues.slice(0, -1);
  const id = `clues:${file.title}`;
  const open = ctx.folds.has(id);
  return html`<h3 class="journal-page__heading">${file.title}${file.done ? html` <span class="journal-rubber">Solved</span>` : ''}</h3>
    <div class="journal-trail${file.done ? ' journal-trail--done' : ''}">
      <ol class="journal-trail__dots" aria-label="${found} of ${file.total} clues">${dots}</ol>
      ${file.done ? '' : latest ? html`<p class="journal-trail__clue">${latest}</p>` : html`<p class="journal-pencil">nothing found yet</p>`}
      ${file.next && !file.done ? html`<p class="journal-trail__next">Next: ${file.next}</p>` : ''}
      ${earlier.length && !file.done ? html`${foldToggle(id, open, 'earlier clues', `${earlier.length}`)}${open ? html`<ol class="journal-trail__earlier">${earlier.map((c) => html`<li>${c}</li>`)}</ol>` : ''}` : ''}
    </div>`;
}

/** A fold's pen-drawn toggle (`data-fold` names it; the panel keeps the set of open ones). */
function foldToggle(id: string, open: boolean, label: string, count = ''): Html {
  return html`<button type="button" class="journal-fold__toggle" data-nav data-action="fold" data-fold="${id}" aria-expanded="${open ? 'true' : 'false'}">${open ? '▾' : '▸'} ${label}${count ? html` <small>${count}</small>` : ''}</button>`;
}
