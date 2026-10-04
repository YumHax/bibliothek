import { gameDayOf, type JournalDay, type JournalEntry } from '@/journal/Journal';
import { CardPanel, type PanelAction } from './panel/CardPanel';
import { html, type Html } from './panel/html';
import { formatCount, formatNumber } from '@/text/count';
import { formatTickets } from '@/text/money';
import './JournalPanel.css';

/** What the panel reads: the journal's pages. `Journal` fits. */
interface JournalLike {
  readonly today: JournalDay;
  readonly history: readonly JournalDay[];
}

interface JournalPanelOptions {
  /** Today's arcade challenge, if the arcade is wired: which machine, the score, the bonus, whether it is beaten. */
  challenge?: () => { gameId: string; target: number; reward: number; done: boolean };
  /** A machine's name for the challenge line (default: its id in capitals). */
  titleOf?: (gameId: string) => string;
  /** Lines about what is coming (tomorrow's market day, an event this week): the market and the calendar say. */
  upcoming?: () => readonly string[];
  /** A trail the player follows (the lost prototype, `story/`): its clues so far and the next lead; null before it starts. */
  file?: () => { title: string; clues: readonly string[]; next?: string } | null;
  /** More trails, each its own page after `file`'s (the building's sixth floor, `building/hunt`). */
  files?: readonly (() => { title: string; clues: readonly string[]; next?: string } | null)[];
  /** Opens the People book (docs/social.md): a button by the book's Close. */
  people?: () => void;
}

/** Older days listed under today's page. */
const PAST_DAYS = 14;

const BULLETS: Record<string, string> = {
  bought: '＋',
  sold: '－',
  wished: '☆',
  unpacked: '▣',
  prize: '♦',
  medal: '●',
  visit: '☺',
  gift: '✦',
  home: '⌂',
  story: '✎',
  hunt: '⌕',
  social: '♥',
};

/**
 * THE JOURNAL, the notebook on the hall console (and the pause menu's Journal): today's page — the
 * day's sums (coins, tickets, games), what happened, the arcade's challenge and what is coming —
 * then the days before, each folded to a line until opened. A `ModalLike` the Session opens through
 * `SessionActions.openPanel`; it repaints on every open (the journal changes while it is shut).
 */
export class JournalPanel extends CardPanel {
  constructor(container: HTMLElement, private readonly journal: JournalLike, private readonly options: JournalPanelOptions = {}) {
    super(container, { className: 'journal-panel', cardClass: 'journal-panel__book', title: 'Journal', dismiss: 'Close the book', dismissAutofocus: true, header: false, buttonClass: '' });
  }

  protected render(): Html {
    const today = this.journal.today;
    const past = this.journal.history.filter((d) => d.day !== today.day).slice(0, PAST_DAYS);
    return html`<header>
        <h2>Journal</h2>
        <p class="journal-panel__date">${longDate(today.day)}</p>
      </header>
      ${this.totals(today)}
      ${today.entries.length ? html`<ul class="journal-panel__lines">${today.entries.map(line)}</ul>` : html`<p class="journal-panel__empty">Nothing written yet today.</p>`}
      ${this.ahead()}
      ${[this.options.file, ...(this.options.files ?? [])].map((f) => this.file(f?.() ?? null))}
      ${past.length ? html`<h3>Before</h3>${past.map((d) => this.pastDay(d))}` : ''}`;
  }

  protected override actions(): PanelAction[] {
    return this.options.people ? [{ action: 'people', label: 'People ›' }] : [];
  }

  protected override onAction(action: string): void {
    if (action === 'people') this.options.people?.();
  }

  /** The day's sums, left out when there is nothing to add up. */
  private totals(day: JournalDay): Html | '' {
    const t = day.totals;
    const bits = [
      t.coinsIn || t.coinsOut ? html`Coins <b>+${t.coinsIn}</b> / <b>−${t.coinsOut}</b>` : null,
      t.ticketsIn || t.ticketsOut ? html`Tickets <b>+${t.ticketsIn}</b> / <b>−${t.ticketsOut}</b>` : null,
      t.gamesIn || t.gamesOut ? html`Games <b>+${t.gamesIn}</b> / <b>−${t.gamesOut}</b>` : null,
    ].filter((b): b is Html => b !== null);
    return bits.length ? html`<p class="journal-panel__totals">${bits.map((b, i) => html`${i ? ' · ' : ''}${b}`)}</p>` : '';
  }

  /** The challenge and what is coming, under today's lines. */
  private ahead(): Html | '' {
    const lines: string[] = [];
    const c = this.options.challenge?.();
    if (c) {
      const title = this.options.titleOf?.(c.gameId) ?? c.gameId.toUpperCase();
      lines.push(c.done ? `Arcade challenge on ${title}: beaten ✓` : `Arcade challenge: ${formatNumber(c.target)} on ${title}, for ${c.reward} bonus tickets`);
    }
    lines.push(...(this.options.upcoming?.() ?? []));
    if (!lines.length) return '';
    return html`<h3>To do, to watch</h3><ul class="journal-panel__ahead">${lines.map((l) => html`<li>${l}</li>`)}</ul>`;
  }

  /** A trail's page: what was found, in the player's own words, and where to look next. */
  private file(file: { title: string; clues: readonly string[]; next?: string } | null): Html | '' {
    if (!file) return '';
    return html`<h3>${file.title}</h3><ol class="journal-panel__ahead journal-panel__file">${file.clues.map((c) => html`<li>${c}</li>`)}</ol>${file.next ? html`<p class="journal-panel__empty">Next: ${file.next}</p>` : ''}`;
  }

  private pastDay(day: JournalDay): Html {
    const t = day.totals;
    const summary = [
      t.gamesIn ? `${formatCount(t.gamesIn, 'game')} in` : '',
      t.gamesOut ? `${t.gamesOut} out` : '',
      t.ticketsIn ? `${formatTickets(t.ticketsIn)}` : '',
      !t.gamesIn && !t.gamesOut && !t.ticketsIn ? `${formatCount(day.entries.length, 'line')}` : '',
    ].filter(Boolean).join(', ');
    return html`<details class="journal-panel__day">
        <summary data-nav tabindex="0">${longDate(day.day)} <span>${summary}</span></summary>
        ${this.totals(day)}
        ${day.entries.length ? html`<ul class="journal-panel__lines">${day.entries.map(line)}</ul>` : ''}
      </details>`;
  }
}

function line(entry: JournalEntry): Html {
  return html`<li data-kind="${entry.kind}"><span class="journal-panel__bullet">${BULLETS[entry.kind] ?? '·'}</span><time>${entry.at}</time> ${entry.text}</li>`;
}

/**
 * One way to head a page: "Day 12" from a game day's key; an older page, kept by date ("2026-09-25", local,
 * no time zone shift), reads "Before day 1 · Fri 25 Sep" so it sits with the numbered days.
 */
function longDate(key: string): string {
  const gameDay = gameDayOf(key);
  if (gameDay !== null) return `Day ${gameDay}`;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1); // a stored page's date, not a draw
  return `Before day 1 · ${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Spelled out here: the locale's short forms vary ("Sept" in some). */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
