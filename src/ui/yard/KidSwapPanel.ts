import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { isKeepsake, type Transactions } from '@/economy/Transactions';
import type { Views } from '@/economy/Fame';
import type { KidSwapDeal } from '@/building/kids/kidDeals';
import { KIDS_LINES, KIDS_RULES } from '@/building/kids/kidsPlan';
import { judgeSwap, type KidVerdict } from '@/building/kids/yardKids';
import { playHandshake } from '@/audio/dealSounds';
import { formatCount } from '@/text/count';
import { compareTitles, matchesSearch } from '@/text/strings';
import { random } from '@/random';
import { SheetPanel } from '../panel/SheetPanel';
import { attr, html, paint, type Html } from '../panel/html';
import { coverImg, emptyState } from '../panel/widgets';
import { Speaker } from '../panel/speaker';
import type { Expression } from '../social/face';
import './KidSwapPanel.css';

/** The player's games shown at once (the search finds the rest). */
const SHOWN = 80;

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
 * A swap of carts with one of the courtyard's kids (`building/kids`), on the yard's asphalt: the kid at the top (their
 * face, name and what they just said in a balloon, `panel/speaker`), the deal they offer under it (a row that keeps
 * its height), their pencil case unzipped with its carts to pick from (a cartridge each, the cover as its label, the
 * one picked lifted and ringed in felt-tip), then the player's own carts, each with "Offer for <theirs>". The kid
 * weighs an offer their way (`yardKids.judgeSwap`: how famous a game is, never its price) and answers in the balloon
 * and over their head in the yard: a deal (Swap), a deal if tickets are thrown in, or no. They hear a handful of offers
 * before they want to get back to their game. A press that cannot go through says why, in the kid's words. No values,
 * no odds: only what they say.
 */
export class KidSwapPanel extends SheetPanel {
  private deal: KidSwapDeal | null = null;
  private carts: Game[] | null = null;
  private picked: string | null = null;
  private answer: Answer | null = null;
  private thinking = false;
  /** The offers each kid has heard, by `<kid>:<day>`: they tire of it for the day, however often the panel opens. */
  private readonly heard = new Map<string, number>();
  private done = false;
  /** The cart that just came over in a swap: its tile drops into the pencil case once. */
  private arrived: string | null = null;
  private readonly speaker: Speaker;
  private opening = '';
  /** What the kid says while their carts come out of the case: drawn once per wait, not per repaint. */
  private waitLine = '';

  constructor(container: HTMLElement, private readonly deps: KidSwapDeps) {
    super(container, { title: 'A swap in the yard', className: 'kid-swap', search: { placeholder: 'Find one of yours…' }, dismiss: 'Done' });
    this.speaker = new Speaker({ name: 'A kid' }, { className: 'kid-swap__speaker', face: 64 });
    this.speaker.mountAbove(this.body);
  }

  /** The kid the panel shows next time it opens. */
  prepare(deal: KidSwapDeal): void {
    this.deal = deal;
    this.carts = null;
    this.picked = null;
    this.answer = null;
    this.thinking = false;
    this.arrived = null;
    this.done = (this.heard.get(`${deal.kid.id}:${deal.day}`) ?? 0) > KIDS_RULES.offers;
    this.opening = pickLine(this.done ? KIDS_LINES.talkedOut : KIDS_LINES.swapOpen);
    this.waitLine = pickLine(KIDS_LINES.thinking);
    this.setTitle(`Swapping with ${firstName(deal)}`);
    this.speaker.setWho({ name: firstName(deal), person: deal.kid.id });
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
    this.speaker.say(this.opening);
    super.onOpened();
    if (this.deal) this.deal.say(this.opening);
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
    const theirs = this.carts?.find((g) => g.id === this.picked);
    paint(
      this.body,
      html`<div class="kid-swap__deal">${this.dealButtons()}</div>
      <section class="kid-swap__case" aria-label="${firstName(deal)}’s pencil case">
        <h3 class="kid-swap__heading">In ${firstName(deal)}’s pencil case</h3>
        <div class="kid-swap__carts">${this.cartTiles()}</div>
      </section>
      <section class="kid-swap__mine" aria-label="Yours">
        <h3 class="kid-swap__heading kid-swap__heading--mine">${theirs ? html`Yours: what would you give for <em>${theirs.title}</em>?` : 'Yours'}</h3>
        ${this.mine(theirs)}
      </section>`,
    );
    this.arrived = null;
  }

  /** The answer's buttons, in a row of its own height: Swap on a yes, the tickets and Swap on a "more". */
  private dealButtons(): Html | string {
    const answer = this.answer;
    if (!answer || this.done) return '';
    if (answer.verdict.kind === 'yes') return html`<button type="button" class="ui-btn ui-btn--primary" data-action="swap" data-autofocus>Swap ${answer.mine.title} for ${answer.theirs.title}</button>`;
    if (answer.verdict.kind === 'more') {
      const tickets = answer.verdict.tickets;
      return html`<button type="button" class="ui-btn ui-btn--primary" data-action="swap" data-autofocus aria-disabled="${this.deps.wallet.tickets < tickets}">Throw in ${formatCount(tickets, 'ticket')} and swap</button>`;
    }
    return '';
  }

  private cartTiles(): Html | Html[] {
    if (!this.carts) return html`<p class="kid-swap__wait">${this.waitLine}</p>`;
    if (!this.carts.length) return html`<p class="kid-swap__wait">Nothing in there you haven’t got.</p>`;
    return this.carts.map((game) => {
      const picked = game.id === this.picked;
      const wished = this.deps.collection.find(game.id)?.status === 'wishlist';
      return html`<button type="button" class="kid-swap__cart${game.id === this.arrived ? ' kid-swap__cart--arrived' : ''}" data-action="pick" data-id="${game.id}" aria-pressed="${picked ? 'true' : 'false'}"${attr('data-autofocus', picked && !this.answer)}>
        <span class="kid-swap__shell">${coverImg(this.deps.coverUrl?.(game), game, 'catalogue__cover kid-swap__label')}</span>
        <span class="kid-swap__cart-title">${game.title}</span>
        <span class="kid-swap__meta">${getPlatform(game.platform).shortName}</span>
        ${wished ? html`<span class="kid-swap__sticker">on your wishlist</span>` : ''}
      </button>`;
    });
  }

  /** The player's carts that can be swapped: owned, not lent, not a keepsake; the search's, first by title. */
  private mine(theirs: Game | undefined): Html | Html[] {
    const query = this.query;
    const games = this.deps.collection.games
      .filter((g) => (g.status ?? 'owned') === 'owned' && !isKeepsake(g) && (!query || matchesSearch(g.title, query)))
      .sort((a, b) => compareTitles(a.title, b.title));
    if (!games.length) return emptyState(query ? 'None of yours by that name.' : 'You have nothing to swap.');
    const busy = this.thinking || this.done || !theirs;
    const verb = theirs ? `Offer for ${theirs.title}` : 'Offer';
    const tiles = games.slice(0, SHOWN).map(
      (game) => html`<li class="kid-swap__own">
        ${coverImg(this.deps.coverUrl?.(game), game, 'catalogue__cover kid-swap__own-cover')}
        <span class="kid-swap__own-title">${game.title}<small>${getPlatform(game.platform).shortName}</small></span>
        <button type="button" class="ui-btn kid-swap__offer" data-action="offer" data-id="${game.id}" aria-disabled="${busy}" aria-label="Offer ${game.title}${theirs ? ` for ${theirs.title}` : ''}">${verb}</button>
      </li>`,
    );
    const more = games.length - SHOWN;
    return html`<ul class="kid-swap__own-list">${tiles}</ul>${more > 0 ? html`<p class="kid-swap__more">And ${formatCount(more, 'other')}: type a name to find them.</p>` : ''}`;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const deal = this.deal;
    if (!deal) return;
    if (action === 'pick' && el.dataset.id) {
      // Another cart picked while they weighed the last offer: that offer is off, and so is their "Hmm…".
      if (this.thinking && el.dataset.id !== this.picked) this.speaker.say(this.opening);
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
    // A press that cannot go through still gets an answer, in the kid's words.
    if (this.done) return this.speak(deal, pickLine(KIDS_LINES.talkedOut), 'frown');
    if (this.thinking) return this.speak(deal, pickLine(KIDS_LINES.busy));
    const mine = this.deps.collection.find(id);
    const theirs = this.carts?.find((g) => g.id === this.picked);
    if (!theirs) return this.speak(deal, pickLine(KIDS_LINES.pickFirst));
    if (!mine) return;
    const key = `${deal.kid.id}:${deal.day}`;
    const heard = (this.heard.get(key) ?? 0) + 1;
    this.heard.set(key, heard);
    if (heard > KIDS_RULES.offers) {
      this.done = true;
      this.speak(deal, pickLine(KIDS_LINES.talkedOut), 'frown');
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
    this.speak(deal, lineFor(verdict), verdict.kind === 'yes' ? 'smile' : verdict.kind === 'more' ? 'rest' : 'frown');
    // A deal on the table: the walk (keys, controller) goes straight to it.
    if (verdict.kind !== 'no' && this.root.contains(document.activeElement)) this.body.querySelector<HTMLElement>('[data-action="swap"]')?.focus();
  }

  /** The deal they agreed to, made: the cart comes into the parcel, the player's goes into their pencil case. */
  private swap(deal: KidSwapDeal): void {
    const answer = this.answer;
    if (!answer || this.done) return;
    const tickets = answer.verdict.kind === 'more' ? answer.verdict.tickets : 0;
    if (tickets > this.deps.wallet.tickets) {
      this.speak(deal, `You haven’t even got ${formatCount(tickets, 'ticket')}!`, 'frown');
      return;
    }
    const { mine, theirs } = answer;
    const where = `${firstName(deal)}, in the courtyard`;
    const done = this.deps.tx.swapWithNeighbour(mine, theirs, where, () => {
      if (tickets) this.deps.spendTickets(tickets);
      deal.swapped(theirs, mine);
    });
    if (!done.ok) {
      this.setStatus(done.reason === 'owned' ? `You have ${theirs.title} already.` : `You no longer have ${mine.title} to give.`, 'error');
      return;
    }
    playHandshake();
    this.carts = [...(this.carts ?? []).filter((g) => g.id !== theirs.id), mine];
    this.picked = this.carts[0]?.id ?? null;
    this.arrived = mine.id;
    this.answer = null;
    this.setStatus(`${theirs.title} is yours: it waits in the parcel under the hall console.`, 'ok');
    this.speak(deal, pickLine((mine.condition ?? 'complete') === 'complete' ? KIDS_LINES.boxToo : KIDS_LINES.yes), 'smile');
  }

  /** The kid says `line`: in the balloon and over their head in the yard. */
  private speak(deal: KidSwapDeal, line: string, expression: Expression = 'rest'): void {
    this.speaker.say(line, expression);
    deal.say(line);
    this.refresh();
  }
}

function firstName(deal: KidSwapDeal): string {
  return deal.kid.name.split(' ')[0]!;
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
