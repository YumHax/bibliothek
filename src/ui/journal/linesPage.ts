import { getPrize } from '@/economy/Prizes';
import { gameDayOf, type JournalDay, type JournalEntry } from '@/journal/Journal';
import { everyone, findPerson } from '@/social/people';
import { plural } from '@/text/count';
import { formatCoins } from '@/text/money';
import { coverImg } from '../panel/widgets';
import { attr, html, raw, type Html } from '../panel/html';
import { longDate, weekdayName } from './journalDates';
import { icon } from './journalSprite';
import type { PageContext } from './journalTypes';

/** Days on the strip along the top of the page; a face's size in CSS pixels. */
const STRIP_DAYS = 14;
const FACE_SIZE = 26;
/** The lines whose `data.id` names a game whose cover is pasted beside them (a stall's haul has its own row). */
const WITH_COVER = new Set(['bought', 'gift', 'visit']);

/** A page's lines as they are set: an entry on its own, a stall's purchases together, or where the reading stopped. */
type Block = { kind: 'entry'; entry: JournalEntry } | { kind: 'bought'; where: string; entries: JournalEntry[] } | { kind: 'mark' };

/**
 * THE STRIP along the top of the right page: the last fortnight of days as little squares, shaded by how much was
 * written that day, a star on a day with a headline, the open one ringed. Each turns the book to its day.
 */
export function stripHtml(pages: readonly JournalDay[], spread: number): Html {
  const from = Math.max(0, Math.min(spread - Math.floor(STRIP_DAYS / 2), pages.length - STRIP_DAYS));
  const days = pages.slice(from, from + STRIP_DAYS);
  return html`<ol class="journal-strip" aria-label="The last days">${days.map((d, i) => {
    const index = from + i;
    const lines = d.entries.filter((e) => e.weight !== 'note').length;
    const level = lines === 0 ? 0 : lines <= 2 ? 1 : lines <= 5 ? 2 : 3;
    const star = d.entries.some((e) => e.weight === 'headline');
    const n = gameDayOf(d.day);
    const weekday = weekdayName(d.day);
    return html`<li><button type="button" class="journal-strip__day" data-nav data-action="day" data-index="${index}" data-level="${level}"${attr('data-star', star)}${index === spread ? raw(' aria-current="page"') : ''} aria-label="${longDate(d.day)}, ${lines} ${plural(lines, 'line')}"><small>${weekday ? weekday[0] : '·'}</small>${n ?? '·'}</button></li>`;
  })}</ol>`;
}

/**
 * THE RIGHT PAGE, the day's lines: a headline in the hand, the ordinary lines in the serif with the time in the
 * margin, a stall's purchases as a row of covers with their prices, a cover pasted beside a game's line, the face of
 * whoever a line is about, a sticker for a prize; and a dashed rule where the last reading stopped (`markCount`:
 * how many lines were read, null when the mark has nothing to say).
 */
export function linesHtml(day: JournalDay, today: boolean, ctx: PageContext, markCount: number | null): Html {
  const written = day.entries.some((e) => e.weight !== 'note');
  if (!written) return html`<p class="journal-page__empty">${today ? 'Nothing written yet.' : 'Nothing worth a line that day.'}</p>`;
  return html`<ul class="journal-lines">${blocksOf(day, markCount).map((b) => blockHtml(b, ctx))}</ul>`;
}

/** The page's lines in order: headlines and lines as they are, a stall's purchases together, the reading mark where it fell. */
function blocksOf(day: JournalDay, mark: number | null): Block[] {
  const blocks: Block[] = [];
  let marked = mark === null;
  for (const [index, entry] of day.entries.entries()) {
    if (entry.weight === 'note') continue;
    if (mark !== null && !marked && index >= mark) {
      blocks.push({ kind: 'mark' });
      marked = true;
    }
    // A stall's purchases go together; a headline (a grail) keeps its own large line.
    const where = entry.kind === 'bought' && entry.weight !== 'headline' && typeof entry.data?.where === 'string' ? entry.data.where : null;
    const last = blocks[blocks.length - 1];
    if (where !== null && last?.kind === 'bought' && last.where === where) last.entries.push(entry);
    else if (where !== null) blocks.push({ kind: 'bought', where, entries: [entry] });
    else blocks.push({ kind: 'entry', entry });
  }
  if (!marked) blocks.push({ kind: 'mark' });
  return blocks;
}

function blockHtml(block: Block, ctx: PageContext): Html {
  if (block.kind === 'mark') return html`<li class="journal-mark" aria-label="You read up to here"><span>you read up to here</span></li>`;
  if (block.kind === 'bought') {
    return html`<li class="journal-bought" data-kind="bought">
        <span class="journal-lines__at">${block.entries[0]!.at}</span>
        <div>
          <h3 class="journal-bought__where">${icon('bought')} Bought · ${block.where}</h3>
          <ul class="journal-haul">${block.entries.map((e) => haulHtml(e, ctx))}</ul>
        </div>
      </li>`;
  }
  const { entry } = block;
  const cutting = cuttingHtml(entry, ctx);
  const face = faceHtml(entry);
  const sticker = entry.kind === 'prize' ? stickerHtml(entry) : '';
  return html`<li class="journal-line${entry.weight === 'headline' ? ' journal-line--headline' : ''}" data-kind="${entry.kind}">
      <span class="journal-lines__at">${entry.at}</span>
      <span class="journal-line__text">${cutting}${sticker || face || icon(entry.kind)}${face && sticker ? face : ''} ${entry.text}</span>
    </li>`;
}

/** One of a stall's purchases: the cover in its pocket, the title with its platform, the price in the hand. */
function haulHtml(e: JournalEntry, ctx: PageContext): Html {
  const game = gameBehind(e, ctx);
  const platform = typeof e.data?.platform === 'string' ? e.data.platform : '';
  const price = typeof e.data?.price === 'number' ? formatCoins(e.data.price) : '';
  return html`<li class="journal-haul__item">
      <span class="journal-haul__pocket">${game ? coverImg(ctx.options.coverUrl?.(game), game, 'journal-haul__cover') : ''}</span>
      <span class="journal-haul__name">${e.text}${platform ? html` <small>${platform}</small>` : ''}</span>
      ${price ? html`<span class="journal-haul__price">${price}</span>` : ''}
    </li>`;
}

/** A game's cover pasted beside its line, like a cutting; nothing when the game is gone or has no art. */
function cuttingHtml(e: JournalEntry, ctx: PageContext): Html | '' {
  if (!WITH_COVER.has(e.kind)) return '';
  const game = gameBehind(e, ctx);
  const src = game && ctx.options.coverUrl?.(game);
  return game && src ? html`<span class="journal-cutting">${coverImg(src, game, 'journal-cutting__cover')}</span>` : '';
}

/** The face of whoever the line is about (`data.who`: a person's id, or their name as a gift's receipt has it). */
function faceHtml(e: JournalEntry): Html | '' {
  const who = typeof e.data?.who === 'string' ? personId(e.data.who) : null;
  return who ? html`<span class="journal-face" data-portrait="${who}" data-size="${FACE_SIZE}"></span>` : '';
}

/** A prize's round sticker in its own colour (the line names it). */
function stickerHtml(e: JournalEntry): Html {
  const prize = typeof e.data?.id === 'string' ? getPrize(e.data.id) : undefined;
  const colour = (prize?.color ?? 0xd6a321) & 0xffffff;
  return html`<span class="journal-sticker" style="--prize:#${colour.toString(16).padStart(6, '0')}"></span>`;
}

function gameBehind(e: JournalEntry, ctx: PageContext) {
  return typeof e.data?.id === 'string' ? ctx.gameOf(e.data.id) : undefined;
}

/** The person `ref` names: their id, or the name a line kept ("Sam"). */
function personId(ref: string): string | null {
  if (findPerson(ref)) return ref;
  const low = ref.toLowerCase();
  return everyone().find((p) => p.name.toLowerCase() === low || p.short?.toLowerCase() === low)?.id ?? null;
}

/** Small things before "and N more". */
const SMALL_SHOWN = 8;

/** The small things at the page's foot, a run-on line in pencil: the first eight, the rest counted. */
export function smallHtml(day: JournalDay): Html | '' {
  const small = day.entries.filter((e) => e.weight === 'note');
  if (!small.length) return '';
  const shown = small.slice(0, SMALL_SHOWN).map((e) => e.text.replace(/\.$/, ''));
  const more = small.length - shown.length;
  return html`<h3 class="journal-page__heading journal-page__heading--small">The small things</h3><p class="journal-small">${shown.join(', ')}${more ? `, and ${more} more` : ''}.</p>`;
}
