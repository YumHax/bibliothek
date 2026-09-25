import type { JournalDay, JournalEntry } from '@/journal/Journal';
import { escapeHtml } from './html';
import { ModalPanel } from './ModalPanel';
import './JournalPanel.css';

/** What the panel reads: the journal's pages. `Journal` fits. */
export interface JournalLike {
  readonly today: JournalDay;
  readonly history: readonly JournalDay[];
}

export interface JournalPanelOptions {
  /** Today's arcade challenge, if the arcade is wired: which machine, the score, the bonus, whether it is beaten. */
  challenge?: () => { gameId: string; target: number; reward: number; done: boolean };
  /** A machine's name for the challenge line (default: its id in capitals). */
  titleOf?: (gameId: string) => string;
  /** Lines about what is coming (tomorrow's market day, an event this week): the market and the calendar say. */
  upcoming?: () => readonly string[];
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
};

/**
 * THE JOURNAL, the notebook on the hall console (and the pause menu's Journal): today's page — the
 * day's sums (coins, tickets, games), what happened, the arcade's challenge and what is coming —
 * then the days before, each folded to a line until opened. A `ModalLike` the Session opens through
 * `SessionActions.openPanel`; it repaints on every open (the journal changes while it is shut).
 */
export class JournalPanel extends ModalPanel {
  private readonly book: HTMLElement;

  constructor(container: HTMLElement, private readonly journal: JournalLike, private readonly options: JournalPanelOptions = {}) {
    super(container, { className: 'ui-modal--centre journal-panel' });
    this.root.innerHTML = '<article class="journal-panel__book" role="dialog" aria-modal="true" aria-label="Journal"></article>';
    this.book = this.root.querySelector('.journal-panel__book')!;
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root || target.closest('button[data-action="close"]')) this.close();
    });
  }

  protected override onOpened(): void {
    const today = this.journal.today;
    const past = this.journal.history.filter((d) => d.day !== today.day).slice(0, PAST_DAYS);
    this.book.innerHTML = `
      <header>
        <h2>Journal</h2>
        <p class="journal-panel__date">${escapeHtml(longDate(today.day))}</p>
      </header>
      ${this.totals(today)}
      ${today.entries.length ? `<ul class="journal-panel__lines">${today.entries.map(line).join('')}</ul>` : '<p class="journal-panel__empty">Nothing written yet today.</p>'}
      ${this.ahead()}
      ${past.length ? `<h3>Before</h3>${past.map((d) => this.pastDay(d)).join('')}` : ''}
      <footer><button type="button" data-action="close" data-autofocus aria-label="Close">Close the book</button></footer>`;
  }

  /** The day's sums, left out when there is nothing to add up. */
  private totals(day: JournalDay): string {
    const t = day.totals;
    const bits = [
      t.coinsIn || t.coinsOut ? `Coins <b>+${t.coinsIn}</b> / <b>−${t.coinsOut}</b>` : '',
      t.ticketsIn || t.ticketsOut ? `Tickets <b>+${t.ticketsIn}</b> / <b>−${t.ticketsOut}</b>` : '',
      t.gamesIn || t.gamesOut ? `Games <b>+${t.gamesIn}</b> / <b>−${t.gamesOut}</b>` : '',
    ].filter(Boolean);
    return bits.length ? `<p class="journal-panel__totals">${bits.join(' · ')}</p>` : '';
  }

  /** The challenge and what is coming, under today's lines. */
  private ahead(): string {
    const lines: string[] = [];
    const c = this.options.challenge?.();
    if (c) {
      const title = this.options.titleOf?.(c.gameId) ?? c.gameId.toUpperCase();
      lines.push(c.done ? `Arcade challenge on ${title}: beaten ✓` : `Arcade challenge: ${c.target.toLocaleString('en-US')} on ${title}, for ${c.reward} bonus tickets`);
    }
    lines.push(...(this.options.upcoming?.() ?? []));
    if (!lines.length) return '';
    return `<h3>To do, to watch</h3><ul class="journal-panel__ahead">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`;
  }

  private pastDay(day: JournalDay): string {
    const t = day.totals;
    const summary = [
      t.gamesIn ? `${t.gamesIn} game${t.gamesIn === 1 ? '' : 's'} in` : '',
      t.gamesOut ? `${t.gamesOut} out` : '',
      t.ticketsIn ? `${t.ticketsIn} tickets` : '',
      !t.gamesIn && !t.gamesOut && !t.ticketsIn ? `${day.entries.length} line${day.entries.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(', ');
    return `
      <details class="journal-panel__day">
        <summary data-nav tabindex="0">${escapeHtml(longDate(day.day))} <span>${escapeHtml(summary)}</span></summary>
        ${this.totals(day)}
        ${day.entries.length ? `<ul class="journal-panel__lines">${day.entries.map(line).join('')}</ul>` : ''}
      </details>`;
  }
}

function line(entry: JournalEntry): string {
  return `<li data-kind="${escapeHtml(entry.kind)}"><span class="journal-panel__bullet">${BULLETS[entry.kind] ?? '·'}</span><time>${escapeHtml(entry.at)}</time> ${escapeHtml(entry.text)}</li>`;
}

/** "Friday 25 September" from "2026-09-25" (local, no time zone shift). */
function longDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
