import type { BallotView } from '@/building/coproMeeting';
import type { ResolutionId } from '@/building/coproPlan';
import { escapeHtml } from './html';
import { ModalPanel } from './ModalPanel';
import './CoproPanel.css';

/** What the ballot box hands the panel: the open ballot, how to post it, the coins in hand, and what to say once posted. */
export interface CoproBallotSource {
  view(): BallotView | null;
  /** Posts the ballot; 'broke' when the bought votes cost more than the player has. */
  cast(votes: Partial<Record<ResolutionId, string>>, bought: Partial<Record<ResolutionId, number>>): 'closed' | 'broke' | 'cast';
  coins(): number;
  /** The ballot is in the box (or the meeting already sat): a line for the player. */
  done(text: string): void;
}

/**
 * The co-ownership meeting's postal vote (`building/coproMeeting`): each resolution on the agenda
 * with its options (who among the residents leans to each), the player's pick, and votes bought by
 * paying towards the works. A `ModalLike` the hall's ballot box opens; "Post my vote" spends the coins
 * and drops the ballot in the box. Votes may be changed until the meeting sits; paid votes stay.
 */
export class CoproPanel extends ModalPanel {
  private source: CoproBallotSource | null = null;
  private view: BallotView | null = null;
  private votes: Partial<Record<ResolutionId, string>> = {};
  private bought: Partial<Record<ResolutionId, number>> = {};
  private readonly card: HTMLElement;

  constructor(container: HTMLElement) {
    super(container, { className: 'ui-modal--centre copro-panel' });
    this.root.innerHTML = `<article class="copro-panel__card ui-card" role="dialog" aria-modal="true" aria-label="Postal vote of the co-owners' meeting"></article>`;
    this.card = this.root.querySelector('.copro-panel__card')!;
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.root || target.closest('button[data-action="close"]')) {
        this.close();
        return;
      }
      const pick = target.closest<HTMLElement>('button[data-pick]');
      if (pick) {
        this.votes[pick.dataset.res as ResolutionId] = pick.dataset.pick!;
        this.paint();
        return;
      }
      const buy = target.closest<HTMLElement>('button[data-buy]');
      if (buy) {
        const id = buy.dataset.buy as ResolutionId;
        const item = this.view?.items.find((i) => i.id === id);
        if (!item || !this.view) return;
        const step = buy.dataset.step === '-1' ? -1 : 1;
        this.bought[id] = Math.max(item.bought, Math.min(this.view.maxBought, (this.bought[id] ?? item.bought) + step));
        this.paint();
        return;
      }
      if (target.closest('button[data-action="post"]')) this.post();
    });
  }

  /** Deals the ballot (call before the Session opens the panel). */
  prepare(source: CoproBallotSource): void {
    this.source = source;
    this.view = source.view();
    this.votes = {};
    this.bought = {};
    for (const item of this.view?.items ?? []) {
      if (item.vote) this.votes[item.id] = item.vote;
      this.bought[item.id] = item.bought;
    }
    this.paint();
  }

  private cost(): number {
    if (!this.view) return 0;
    let extra = 0;
    for (const item of this.view.items) if (this.votes[item.id]) extra += (this.bought[item.id] ?? 0) - item.bought;
    return extra * this.view.contribution;
  }

  private paint(message = ''): void {
    const view = this.view;
    if (!view) {
      this.card.innerHTML = `<header><h2>No meeting coming up</h2></header><p class="copro-panel__dim">The next agenda goes up on the board a few days before.</p><footer><button type="button" class="ui-btn" data-action="close" data-autofocus>Close</button></footer>`;
      return;
    }
    const cost = this.cost();
    const coins = this.source?.coins() ?? 0;
    const items = view.items
      .map((item) => {
        const options = item.options
          .map((o) => {
            const pressed = this.votes[item.id] === o.id;
            const who = o.leaning.length ? `<span class="copro-panel__who">${escapeHtml(o.leaning.join(', '))}</span>` : '';
            const now = o.id === item.current ? ' <span class="copro-panel__now">(now)</span>' : '';
            return `<button type="button" class="ui-btn copro-panel__option" data-res="${item.id}" data-pick="${escapeHtml(o.id)}" aria-pressed="${pressed}">${escapeHtml(o.label)}${now}${who}</button>`;
          })
          .join('');
        const n = this.bought[item.id] ?? 0;
        const canBuy = !!this.votes[item.id];
        const buy = `<div class="copro-panel__buy"><span>Pay towards it: +${n} vote${n === 1 ? '' : 's'}${item.bought ? ` (${item.bought} paid)` : ''}</span>
          <button type="button" class="ui-btn" data-buy="${item.id}" data-step="-1" ${n <= item.bought ? 'disabled' : ''} aria-label="One vote less">−</button>
          <button type="button" class="ui-btn" data-buy="${item.id}" data-step="1" ${!canBuy || n >= view.maxBought ? 'disabled' : ''} aria-label="One more vote, ${view.contribution} coins">+</button></div>`;
        return `<section class="copro-panel__item"><h3>${escapeHtml(item.title)}</h3><p class="copro-panel__dim">${escapeHtml(item.detail)}</p><div class="copro-panel__options">${options}</div>${buy}</section>`;
      })
      .join('');
    const votes = view.playerVotes > 1 ? `You own ${view.playerVotes} flats: ${view.playerVotes} votes each.` : 'One vote a flat.';
    this.card.innerHTML = `
      <header><h2>General meeting · day ${view.day}, ${view.hour}:00</h2><p class="copro-panel__dim">Postal vote. ${votes} Each extra vote is ${view.contribution} coins towards the works; paid, it stays.</p></header>
      ${items}
      <p class="copro-panel__status" role="status">${escapeHtml(message)}</p>
      <footer>
        <button type="button" class="ui-btn ui-btn--primary" data-action="post" data-autofocus ${cost > coins ? 'disabled' : ''}>Post my vote${cost ? ` · ${cost} coins` : ''}</button>
        <button type="button" class="ui-btn" data-action="close">Not now</button>
      </footer>`;
  }

  private post(): void {
    const source = this.source;
    if (!source || !this.view) return;
    const result = source.cast(this.votes, this.bought);
    if (result === 'broke') {
      this.paint('Not enough coins for those votes.');
      return;
    }
    this.close();
    source.done(result === 'cast' ? 'Your ballot drops into the box.' : 'The meeting already sat: the minutes are on the board.');
  }
}
