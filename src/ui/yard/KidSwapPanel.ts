import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { isKeepsake, type Transactions } from '@/economy/Transactions';
import type { Views } from '@/economy/Fame';
import type { KidSwapDeal } from '@/building/kids/kidDeals';
import { KIDS_LINES, KIDS_RULES } from '@/building/kids/kidsPlan';
import { judgeSwap, type KidVerdict } from '@/building/kids/yardKids';
import { formatCount } from '@/text/count';
import { compareTitles } from '@/text/strings';
import { random } from '@/random';
import { SheetPanel } from '../panel/SheetPanel';
import { html, paint } from '../panel/html';
import { coverImg, emptyState, gameRow } from '../panel/widgets';
import { portrait } from '../social/portrait';
import './KidSwapPanel.css';

/** The player's games shown at once (the search finds the rest). */
const SHOWN = 80;
/** The portrait's size (CSS px) and backdrop. */
const FACE = 72;
const FACE_BACKDROP = '#d8c9a2';

/** What the panel needs of the game: the coins and tickets, the swap itself, the collection, how famous a game is, the covers. */
interface KidSwapDeps {
  wallet: { readonly tickets: number };
  tx: Pick<Transactions, 'swapWithNeighbour'>;
  collection: { readonly games: readonly Game[]; find(id: string): Game | undefined };
  fame: { lookup(game: Pick<Game, 'id' | 'title' | 'platform'>): Promise<Views> };
  /** Spends the tickets a kid asked on top, inside the swap's save. */
  spendTickets(tickets: number): boolean;
  coverUrl?: (game: Game) => string | undefined;
}

/** An offer the kid has answered: what was offered for what, and what they said to it. */
interface Answer {
  mine: Game;
  theirs: Game;
  verdict: KidVerdict;
}

/**
 * A swap of carts with one of the courtyard's kids (`building/kids`): the kid's face and what they just said at the
 * top (in a box that never changes height), their pencil case's carts to pick from, then the player's games, each
 * with Offer. The kid weighs an offer their way (`yardKids.judgeSwap`: how famous a game is, never its price) and
 * answers in the panel and over their head in the yard: a deal (Swap), a deal if tickets are thrown in, or no. They
 * hear a handful of offers before they want to get back to their game. No values, no odds: only what they say.
 */
export class KidSwapPanel extends SheetPanel {
  private deal: KidSwapDeal | null = null;
  private carts: Game[] | null = null;
  private picked: string | null = null;
  private line = '';
  private answer: Answer | null = null;
  private thinking = false;
  /** The offers each kid has heard, by `<kid>:<day>`: they tire of it for the day, however often the panel opens. */
  private readonly heard = new Map<string, number>();
  private done = false;

  constructor(container: HTMLElement, private readonly deps: KidSwapDeps) {
    super(container, { title: 'A swap in the yard', className: 'kid-swap', search: { placeholder: 'Find one of yours…' }, dismiss: 'Done' });
  }

  /** The kid the panel shows next time it opens. */
  prepare(deal: KidSwapDeal): void {
    this.deal = deal;
    this.carts = null;
    this.picked = null;
    this.answer = null;
    this.thinking = false;
    this.done = (this.heard.get(`${deal.kid.id}:${deal.day}`) ?? 0) > KIDS_RULES.offers;
    this.line = pickLine(this.done ? KIDS_LINES.talkedOut : KIDS_LINES.swapOpen);
    this.setTitle(`Swapping with ${deal.kid.name.split(' ')[0]}`);
    void deal.carts.then((carts) => {
      if (this.deal !== deal) return;
      // What the player has already is no use to swap for; what they wish for stays (and says so).
      this.carts = carts.filter((g) => (this.deps.collection.find(g.id)?.status ?? 'wishlist') === 'wishlist');
      this.picked = this.carts[0]?.id ?? null;
      if (this.isOpen) this.refresh();
    });
  }

  protected override onOpened(): void {
    if (this.searchInput) this.searchInput.value = '';
    super.onOpened();
    if (this.deal) this.deal.say(this.line);
  }

  protected override onSearch(): void {
    this.refresh();
  }

  protected render(): void {
    const deal = this.deal;
    if (!deal) {
      paint(this.body, emptyState('Nobody here.'));
      return;
    }
    paint(
      this.body,
      html`<section class="kid-swap__kid">
        <span class="kid-swap__face"></span>
        <p class="kid-swap__line">${this.line ? `“${this.line}”` : ''}</p>
        <div class="kid-swap__deal">${this.dealButtons()}</div>
      </section>
      <h3 class="kid-swap__heading">In ${deal.kid.name.split(' ')[0]}’s pencil case</h3>
      <div class="kid-swap__carts">${this.cartTiles()}</div>
      <h3 class="kid-swap__heading">Yours</h3>
      ${this.mine()}`,
    );
    this.body.querySelector('.kid-swap__face')?.append(portrait(deal.kid.id, FACE, FACE_BACKDROP));
  }

  /** The answer's buttons, in a box of its own height: Swap on a yes, the tickets and Swap on a "more". */
  private dealButtons() {
    const answer = this.answer;
    if (!answer || this.done) return '';
    if (answer.verdict.kind === 'yes') return html`<button type="button" class="ui-btn ui-btn--primary" data-action="swap">Swap</button>`;
    if (answer.verdict.kind === 'more') {
      const tickets = answer.verdict.tickets;
      return html`<button type="button" class="ui-btn ui-btn--primary" data-action="swap" aria-disabled="${this.deps.wallet.tickets < tickets}">Throw in ${formatCount(tickets, 'ticket')} and swap</button>`;
    }
    return '';
  }

  private cartTiles() {
    if (!this.carts) return html`<p class="kid-swap__wait">${pickLine(KIDS_LINES.thinking)}</p>`;
    if (!this.carts.length) return emptyState('Nothing in there you haven’t got.');
    return this.carts.map(
      (game) => html`<button type="button" class="kid-swap__cart" data-action="pick" data-id="${game.id}" aria-pressed="${game.id === this.picked ? 'true' : 'false'}">
        ${coverImg(this.deps.coverUrl?.(game), game, 'catalogue__cover kid-swap__cover')}
        <span class="kid-swap__cart-title">${game.title}</span>
        <span class="catalogue__meta">${getPlatform(game.platform).shortName}</span>
        ${this.deps.collection.find(game.id)?.status === 'wishlist' ? html`<span class="ui-badge">on your wishlist</span>` : ''}
      </button>`,
    );
  }

  /** The player's games that can be swapped: owned, not lent, not a keepsake; the search's, first by title. */
  private mine() {
    const query = this.query.toLowerCase();
    const games = this.deps.collection.games
      .filter((g) => (g.status ?? 'owned') === 'owned' && !isKeepsake(g) && (!query || g.title.toLowerCase().includes(query)))
      .sort((a, b) => compareTitles(a.title, b.title));
    if (!games.length) return emptyState(query ? 'None of yours by that name.' : 'You have nothing to swap.');
    const busy = this.thinking || this.done || !this.picked;
    return games.slice(0, SHOWN).map((game) =>
      gameRow({
        id: game.id,
        cover: coverImg(this.deps.coverUrl?.(game), game),
        title: game.title,
        metas: [getPlatform(game.platform).shortName],
        tail: html`<button type="button" class="ui-btn" data-action="offer" data-id="${game.id}" aria-disabled="${busy}">Offer</button>`,
      }),
    );
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const deal = this.deal;
    if (!deal) return;
    if (action === 'pick' && el.dataset.id) {
      this.picked = el.dataset.id;
      this.answer = null;
      this.refresh();
    } else if (action === 'offer' && el.dataset.id) {
      void this.offer(deal, el.dataset.id);
    } else if (action === 'swap') {
      this.swap(deal);
    }
  }

  /** The player offers `id` for the picked cart: the kid thinks it over (how famous each is), then answers. */
  private async offer(deal: KidSwapDeal, id: string): Promise<void> {
    if (this.thinking || this.done) return;
    const mine = this.deps.collection.find(id);
    const theirs = this.carts?.find((g) => g.id === this.picked);
    if (!mine || !theirs) return;
    const key = `${deal.kid.id}:${deal.day}`;
    const heard = (this.heard.get(key) ?? 0) + 1;
    this.heard.set(key, heard);
    if (heard > KIDS_RULES.offers) {
      this.done = true;
      this.speak(deal, pickLine(KIDS_LINES.talkedOut));
      deal.react('no');
      return;
    }
    this.thinking = true;
    this.answer = null;
    this.speak(deal, pickLine(KIDS_LINES.thinking));
    const [mineViews, theirViews] = await Promise.all([this.deps.fame.lookup(mine), this.deps.fame.lookup(theirs)]);
    if (this.deal !== deal) return;
    this.thinking = false;
    // Another of their carts picked meanwhile: the answer was to an offer no longer on the table.
    if (this.picked !== theirs.id) {
      this.refresh();
      return;
    }
    const verdict = judgeSwap(deal.kid, { game: mine, views: mineViews }, { game: theirs, views: theirViews });
    this.answer = { mine, theirs, verdict };
    deal.react(verdict.kind);
    this.speak(deal, lineFor(verdict));
  }

  /** The deal they agreed to, made: the cart comes into the parcel, the player's goes into their pencil case. */
  private swap(deal: KidSwapDeal): void {
    const answer = this.answer;
    if (!answer || this.done) return;
    const tickets = answer.verdict.kind === 'more' ? answer.verdict.tickets : 0;
    if (tickets > this.deps.wallet.tickets) {
      this.speak(deal, `You haven’t even got ${formatCount(tickets, 'ticket')}!`);
      return;
    }
    const { mine, theirs } = answer;
    const where = `${deal.kid.name.split(' ')[0]}, in the courtyard`;
    const done = this.deps.tx.swapWithNeighbour(mine, theirs, where, () => {
      if (tickets) this.deps.spendTickets(tickets);
      deal.swapped(theirs, mine);
    });
    if (!done.ok) {
      this.setStatus(done.reason === 'owned' ? `You have ${theirs.title} already.` : `You no longer have ${mine.title} to give.`, 'error');
      return;
    }
    this.carts = [...(this.carts ?? []).filter((g) => g.id !== theirs.id), mine];
    this.picked = this.carts[0]?.id ?? null;
    this.answer = null;
    this.speak(deal, pickLine((mine.condition ?? 'complete') === 'complete' ? KIDS_LINES.boxToo : KIDS_LINES.yes));
    this.setStatus(`${theirs.title} is yours: it waits in the parcel under the hall console.`, 'ok');
  }

  /** The kid says `line`: in the panel and over their head in the yard. */
  private speak(deal: KidSwapDeal, line: string): void {
    this.line = line;
    deal.say(line);
    this.refresh();
  }
}

function pickLine(lines: readonly string[]): string {
  return lines[Math.floor(random() * lines.length)]!;
}

/** What a kid says to an offer. */
function lineFor(verdict: KidVerdict): string {
  if (verdict.kind === 'yes') return pickLine(KIDS_LINES.yes);
  if (verdict.kind === 'more') return pickLine(KIDS_LINES.more).replace('{n}', String(verdict.tickets));
  return pickLine(verdict.why === 'unheard' ? KIDS_LINES.unheard : verdict.why === 'otherMachine' ? KIDS_LINES.otherMachine : KIDS_LINES.no);
}
