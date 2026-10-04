import type { BallotView } from '@/building/coproMeeting';
import type { ResolutionId } from '@/building/coproPlan';
import { CardPanel, type PanelAction } from './panel/CardPanel';
import { attr, html, type Html } from './panel/html';
import { formatCount } from '@/text/count';
import { formatCoins } from '@/text/money';
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

/** How the residents stand to the player's ballot, from how the player stands with them (docs/social.md). */
const STANCE = { with: 'with you', lobbied: 'brought round by a friend', against: 'against you' } as const;

/**
 * The co-ownership meeting's postal vote (`building/coproMeeting`): each resolution on the agenda
 * with its options (who among the residents leans to each), the player's pick, and votes bought by
 * paying towards the works. A `ModalLike` the hall's ballot box opens; "Post my vote" spends the coins
 * and drops the ballot in the box. Votes may be changed until the meeting sits; paid votes stay.
 */
export class CoproPanel extends CardPanel {
  private source: CoproBallotSource | null = null;
  private view: BallotView | null = null;
  private votes: Partial<Record<ResolutionId, string>> = {};
  private bought: Partial<Record<ResolutionId, number>> = {};

  constructor(container: HTMLElement) {
    super(container, { className: 'copro-panel', cardClass: 'copro-panel__card ui-card', title: "Postal vote of the co-owners' meeting", dismiss: 'Not now', header: false });
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
    if (this.isOpen) this.refresh();
  }

  private cost(): number {
    if (!this.view) return 0;
    let extra = 0;
    for (const item of this.view.items) if (this.votes[item.id]) extra += (this.bought[item.id] ?? 0) - item.bought;
    return extra * this.view.contribution;
  }

  protected render(): Html {
    const view = this.view;
    if (!view) return html`<header><h2>No meeting coming up</h2></header><p class="copro-panel__dim">The next agenda goes up on the board a few days before.</p>`;
    const items = view.items.map((item) => {
      const options = item.options.map((o) => {
        const pressed = this.votes[item.id] === o.id;
        const who = o.leaning.length ? html`<span class="copro-panel__who">${o.leaning.join(', ')}</span>` : '';
        const now = o.id === item.current ? html` <span class="copro-panel__now">(now)</span>` : '';
        return html`<button type="button" class="ui-btn copro-panel__option" data-action="pick" data-res="${item.id}" data-option="${o.id}" aria-pressed="${pressed ? 'true' : 'false'}">${o.label}${now}${who}</button>`;
      });
      const n = this.bought[item.id] ?? 0;
      const canBuy = !!this.votes[item.id];
      return html`<section class="copro-panel__item"><h3>${item.title}</h3><p class="copro-panel__dim">${item.detail}</p><div class="copro-panel__options">${options}</div>
        <div class="copro-panel__buy"><span>Pay towards it: +${formatCount(n, 'vote')}${item.bought ? ` (${item.bought} paid)` : ''}</span>
          <button type="button" class="ui-btn" data-action="buy" data-res="${item.id}" data-step="-1"${attr('disabled', n <= item.bought)} aria-label="One vote less">−</button>
          <button type="button" class="ui-btn" data-action="buy" data-res="${item.id}" data-step="1"${attr('disabled', !canBuy || n >= view.maxBought)} aria-label="One more vote, ${formatCoins(view.contribution)}">+</button></div>
        </section>`;
    });
    const votes = view.playerVotes > 1 ? `You own ${view.playerVotes} flats: ${view.playerVotes} votes each.` : 'One vote a flat.';
    const sway = view.sway.length
      ? html`<p class="copro-panel__sway">${view.sway.map((s, i) => html`${i ? ' · ' : ''}<span class="copro-panel__stance copro-panel__stance--${s.stance}">${s.who}: ${STANCE[s.stance]}</span>`)}</p>`
      : '';
    return html`<header><h2>General meeting · day ${view.day}, ${view.hour}:00</h2><p class="copro-panel__dim">Postal vote. ${votes} Each extra vote is ${formatCoins(view.contribution)} towards the works; paid, it stays.</p>${sway}</header>
      ${items}`;
  }

  protected override actions(): PanelAction[] {
    if (!this.view) return [];
    const cost = this.cost();
    const coins = this.source?.coins() ?? 0;
    return [{ action: 'post', label: `Post my vote${cost ? ` · ${formatCoins(cost)}` : ''}`, primary: true, autofocus: true, disabled: cost > coins }];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const id = el.dataset.res as ResolutionId | undefined;
    if (action === 'pick' && id && el.dataset.option) {
      this.votes[id] = el.dataset.option;
      this.refresh();
    } else if (action === 'buy' && id) {
      const item = this.view?.items.find((i) => i.id === id);
      if (!item || !this.view) return;
      const step = el.dataset.step === '-1' ? -1 : 1;
      this.bought[id] = Math.max(item.bought, Math.min(this.view.maxBought, (this.bought[id] ?? item.bought) + step));
      this.refresh();
    } else if (action === 'post') this.post();
  }

  private post(): void {
    const source = this.source;
    if (!source || !this.view) return;
    const result = source.cast(this.votes, this.bought);
    if (result === 'broke') {
      this.setStatus('Not enough coins for those votes.', 'error');
      return;
    }
    this.close();
    source.done(result === 'cast' ? 'Your ballot drops into the box.' : 'The meeting already sat: the minutes are on the board.');
  }
}
