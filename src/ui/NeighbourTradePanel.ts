import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { NeighbourTrades, TradeOffer } from '@/economy/NeighbourTrades';
import type { Transactions } from '@/economy/Transactions';
import { loanOf } from '@/collection/loans';
import { personAtDoor } from '@/social/people';
import { playBoxClack } from '@/audio/boxClack';
import { playDoorShut } from '@/audio/doorbell';
import { playHandshake } from '@/audio/dealSounds';
import { Arming } from './confirmTwice';
import { CardPanel, type PanelAction } from './panel/CardPanel';
import { html, type Html } from './panel/html';
import { Speaker } from './panel/speaker';
import { coverImg } from './panel/widgets';
import './NeighbourTradePanel.css';

/** How a swap at the door ended: the game that came home, or none (the player said no and the door shut). */
type Outcome = { kind: 'swapped'; got: Game } | { kind: 'declined' };

/**
 * A neighbour's swap at their door on the stairs: the neighbour at the door (their face and what they say), their
 * box held out and the player's facing it, Swap (pressed twice: the player's game leaves for good) or No thanks.
 * `prepare(offer)` before the Session opens it (`SessionActions.openPanel`). The swap goes through
 * `Transactions.swapWithNeighbour` (the game given leaves the collection, theirs goes into the parcel) and closes
 * the offer in the same save. When it is out of reach the neighbour says which way (the game lent, and to whom;
 * theirs already on the shelves); once done their box slides over to the player's side, or their door shuts.
 */
export class NeighbourTradePanel extends CardPanel {
  private offer: TradeOffer | null = null;
  private outcome: Outcome | null = null;
  private readonly arming = new Arming<string>(() => this.refresh());
  private readonly neighbour = new Speaker({ name: 'A neighbour' });

  constructor(
    container: HTMLElement,
    private readonly deps: { trades: NeighbourTrades; tx: Transactions; collection: { find(id: string): Game | undefined; owns(id: string): boolean } },
    private readonly coverUrl?: (game: Game) => string | undefined,
  ) {
    super(container, { className: 'neighbour-trade', cardClass: 'neighbour-trade__card ui-card', title: 'A swap on the landing', dismiss: 'Back to the stairs' });
    this.neighbour.mountAbove(this.body);
  }

  /** The offer the panel shows next time it opens. */
  prepare(offer: TradeOffer): void {
    this.offer = offer;
    this.outcome = null;
    this.arming.reset();
    this.setTitle(`At ${offer.who}’s door, ${offer.floor}`);
    const person = personAtDoor(offer.door) ?? undefined;
    this.neighbour.setWho({ name: offer.who, person });
    const mine = this.deps.collection.find(offer.wants.id);
    this.neighbour.say(
      this.deps.trades.canSwap(offer) ? `“I’ve had my eye on your ${offer.wants.title}. My ${offer.gives.title} for it? Straight swap.”` : this.why(offer, mine),
      'smile',
    );
  }

  protected render(): Html {
    const offer = this.offer;
    if (!offer) return html`<p class="neighbour-trade__door">Nobody comes to the door.</p>`;
    const mine = this.deps.collection.find(offer.wants.id);
    if (this.outcome?.kind === 'swapped') {
      return html`<div class="neighbour-trade__table neighbour-trade__table--done">
        <div class="neighbour-trade__side neighbour-trade__side--empty"><span class="neighbour-trade__whose">${offer.who} has your</span><span class="neighbour-trade__gone">${offer.wants.title}</span></div>
        <span class="neighbour-trade__for" aria-hidden="true"></span>
        ${this.box(this.outcome.got, 'Yours now', 'neighbour-trade__side--arrived')}
      </div>
      <p class="neighbour-trade__after">It waits in the parcel under the hall console, with anything else new.</p>`;
    }
    if (this.outcome?.kind === 'declined') {
      return html`<div class="neighbour-trade__table neighbour-trade__table--shut">
        <div class="neighbour-trade__shut-door" aria-hidden="true"></div>
        ${mine ? this.box(mine, 'Still yours') : ''}
      </div>`;
    }
    const armed = this.arming.isArmed(offer.id);
    return html`<div class="neighbour-trade__table${armed ? ' neighbour-trade__table--armed' : ''}">
      ${this.box(offer.gives, 'Theirs')}
      <span class="neighbour-trade__for">for</span>
      ${mine ? this.box(mine, 'Yours') : html`<div class="neighbour-trade__side neighbour-trade__side--empty"><span class="neighbour-trade__whose">Yours</span><span class="neighbour-trade__gone">${offer.wants.title}</span><span class="neighbour-trade__note">not on your shelves any more</span></div>`}
    </div>`;
  }

  protected override actions(): PanelAction[] {
    const offer = this.offer;
    if (!offer || this.outcome) return [];
    const can = this.deps.trades.canSwap(offer);
    const armed = this.arming.isArmed(offer.id);
    return [
      { action: 'decline', label: 'No thanks' },
      { action: 'swap', label: armed ? `Give your ${offer.wants.title}?` : 'Swap', primary: true, autofocus: true, className: `${armed ? 'ui-btn--armed' : ''}${can ? '' : ' neighbour-trade__swap--off'}` },
    ];
  }

  /** The dismiss says what leaving means: before an answer it is walking off, after it the stairs. */
  protected override dismissLabel(): string {
    return this.outcome ? 'Back to the stairs' : 'Maybe later';
  }

  protected override onAction(action: string): void {
    const offer = this.offer;
    if (!offer || this.outcome) return;
    const { trades, tx, collection } = this.deps;
    if (action === 'decline') {
      trades.decline(offer);
      this.outcome = { kind: 'declined' };
      this.neighbour.say('“No worries, I’ll ask around.”');
      playDoorShut(0.2);
      this.refresh();
      return;
    }
    if (action !== 'swap') return;
    const mine = collection.find(offer.wants.id);
    if (!trades.canSwap(offer)) {
      this.neighbour.say(this.why(offer, mine), 'frown');
      return;
    }
    if (!mine) return;
    if (!this.arming.press(offer.id)) {
      this.neighbour.say(`“Your ${offer.wants.title} for good, mind. Still on?”`);
      return;
    }
    const done = tx.swapWithNeighbour(mine, offer.gives, `${offer.who}, ${offer.floor}`, () => trades.complete(offer));
    if (!done.ok) {
      this.neighbour.say(done.reason === 'owned' ? `“Oh, you’ve got ${offer.gives.title} already!”` : `“Ah, you don’t have ${offer.wants.title} any more?”`, 'surprise');
      return;
    }
    this.outcome = { kind: 'swapped', got: offer.gives };
    this.neighbour.say('“Deal! Mind it, it’s a good one.”', 'smile');
    playHandshake(0.18);
    window.setTimeout(() => playBoxClack(false, 0.1, true), 260);
    this.refresh();
  }

  /** Why the swap is out of reach, in the neighbour's words. */
  private why(offer: TradeOffer, mine: Game | undefined): string {
    if (!mine || mine.status === 'wishlist') return `“Oh, you don’t have ${offer.wants.title} any more? Another time.”`;
    if (mine.status === 'lent') {
      const loan = loanOf(mine.id);
      return loan ? `“${loan.who} has your ${offer.wants.title} till ${loan.back}? Come back when it’s home.”` : `“Your ${offer.wants.title} is lent out? Come back when it’s home.”`;
    }
    if (this.deps.collection.owns(offer.gives.id)) return `“You’ve got ${offer.gives.title} already? Never mind, then.”`;
    return '“Not today, I’m afraid. Another time.”';
  }

  /** A box held out: its cover, title and console, under whose it is. */
  private box(game: Game, whose: string, className = ''): Html {
    return html`<figure class="neighbour-trade__side ${className}">
      <span class="neighbour-trade__whose">${whose}</span>
      <span class="neighbour-trade__cover">${coverImg(this.coverUrl?.(game), game, 'neighbour-trade__img')}</span>
      <figcaption><span class="neighbour-trade__title">${game.title}</span><span class="neighbour-trade__note">${getPlatform(game.platform).shortName}${game.releaseDate ? `, ${game.releaseDate.slice(0, 4)}` : ''}</span></figcaption>
    </figure>`;
  }
}
