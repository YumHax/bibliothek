import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { CollectionStore } from '@/collection/CollectionStore';
import type { JobLot, MarketStock } from '@/economy/MarketStock';
import { lotOffer } from '@/economy/JobLot';
import type { Transactions } from '@/economy/Transactions';
import { ARM_ABOVE, describeCondition } from '@/economy/pricing';
import { playCoins } from '@/audio/coins';
import { unit01 } from '@/random';
import type { Expression } from '../social/face';
import { Arming } from '../confirmTwice';
import { MarketPanel } from './MarketPanel';
import { html, paint } from '../panel/html';
import { Speaker } from '../panel/speaker';
import { coverImg, emptyState, gameRow, priceHtml } from '../panel/widgets';
import { formatCount, plural } from '@/text/count';
import { formatCoins } from '@/text/money';

/** What Bernard says over the crate (`{n}` games, `{best}` the best known of them). */
const PITCH = [
  '{n} games, straight out of a loft. There’s {best} in there, and that alone is worth the trip.',
  'I don’t sort them, I sell them. {n} in the crate, {best} on top. Take the lot or leave the lot.',
  'Cleared a flat on Tuesday. {n} games, and {best}. Someone loved these once.',
  'Look at that: {best}! And {n} games in all. Cheaper than buying them one by one, I promise you.',
];
const PITCH_SHORT = ['Short? It’ll be here till I pack up. Have a wander and come back.', 'Not enough on you? Sell me something at the desk and come back for it.'];

/**
 * The day's job lot at Bernard's (the house-clearance man's) end of the market, a stall scene (`MarketPanel` `scene`):
 * Bernard himself at the top, pitching it in his balloon (what is in it, what it would all come to one by one, the
 * games the player has already crossed off), the crate's slats behind the packing list clipped to it (each game, its
 * state, a game already home struck through and taken out of the price), the count and the price chalked on the end
 * of the crate, one button. Bought, the rest goes to the parcel and the crate reads SOLD for the day (`onBought`).
 * A lot dearer than `ARM_ABOVE` is pressed twice; one out of reach stays pressable and Bernard says why.
 */
export class JobLotPanel extends MarketPanel {
  private lot: JobLot | null = null;
  private readonly arming: Arming<string> = new Arming<string>(() => {
    // The "shake on it?" lapsed: back to his pitch.
    if (!this.arming.isArmed('lot')) this.aside = null;
    this.refresh();
  });
  private readonly bernard = new Speaker({ name: 'Bernard' }, { className: 'joblot__bernard' });
  /** What Bernard last said (a repaint does not pop the same line again). */
  private said = '';
  /** A line he says over what the crate would have him say (a sale, a refusal) until the next press. */
  private aside: { line: string; face: Expression } | null = null;
  /** Called once the lot is bought (the crate in the hall empties). */
  onBought?: () => void;

  constructor(
    container: HTMLElement,
    private readonly deps: { wallet: { readonly coins: number; subscribe(cb: () => void): () => void }; collection: CollectionStore; market: MarketStock; tx: Transactions },
    private readonly coverUrl?: (game: Game) => string | undefined,
  ) {
    super(container, deps.wallet, { title: 'Bernard’s crate', className: 'joblot', scene: true });
    this.bernard.mountAbove(this.body);
  }

  protected render(): void {
    const { market } = this.deps;
    if (!this.lot) {
      this.speak('Hang on, hang on. Let me see what’s in this one…');
      paint(this.body, emptyState('Bernard is rummaging through the crate.', { pictogram: 'box', title: 'Counting…', className: 'joblot__waiting' }));
      void market.lot.today().then((lot) => {
        this.lot = lot;
        if (this.isOpen) this.refresh();
      }, () => {
        this.speak('Nothing today, I’m afraid. Next market day, I’ll have cleared another loft.');
        paint(this.body, emptyState('Nothing in the crate today.', { pictogram: 'box', title: 'Empty', className: 'joblot__waiting' }));
      });
      return;
    }
    const lot = this.lot;
    const sold = market.lot.sold;
    const owns = (id: string) => this.deps.collection.owns(id);
    const rows = lot.games.map((game) =>
      gameRow({
        cover: coverImg(this.coverUrl?.(game), game),
        title: game.title,
        className: owns(game.id) ? 'joblot__row--yours' : undefined,
        metas: [owns(game.id) && html`<span class="joblot__yours">yours already</span>`, describeCondition(game.condition), getPlatform(game.platform).shortName],
      }),
    );
    const offer = lotOffer(lot, owns);
    const affordable = this.deps.wallet.coins >= offer.price;
    const none = offer.games.length === 0;
    const armed = this.arming.isArmed('lot');
    const label = sold ? 'Sold' : none ? 'All yours already' : !affordable ? `${formatCoins(offer.price - this.deps.wallet.coins)} short` : armed ? `Pay ${formatCoins(offer.price)}?` : 'Buy the lot';
    if (this.aside) this.speak(this.aside.line, this.aside.face);
    else this.speak(sold ? 'That’s the lot gone. Another crate next market day.' : this.pitch(offer, lot.worth, lot.games.length - offer.games.length, affordable));
    paint(
      this.body,
      html`<div class="joblot__list">${rows}</div>
      <div class="joblot__total${sold ? ' joblot__total--sold' : ''}">
        <span class="joblot__count">${formatCount(offer.games.length, 'game')}</span>
        ${priceHtml(offer.price)}
        <button type="button" class="ui-btn ui-btn--primary${armed ? ' ui-btn--armed' : ''}" data-action="buy" data-autofocus aria-disabled="${sold || none || !affordable}">${label}</button>
        ${sold ? html`<span class="joblot__sold" aria-hidden="true">SOLD</span>` : ''}
      </div>`,
    );
  }

  /** A line in Bernard's balloon; the same line again leaves the balloon be. */
  private speak(line: string, face: Expression = 'rest'): void {
    if (line === this.said) return;
    this.said = line;
    this.bernard.say(line, face);
  }

  /**
   * Bernard's pitch over the crate: the count and the best-known game in it, what it comes to one by one, the games
   * crossed off because they are home already; or what to do when short.
   */
  private pitch(offer: { games: readonly Game[]; prices: readonly number[] }, worth: number, crossed: number, affordable: boolean): string {
    const day = this.deps.market.day;
    const { games, prices } = offer;
    if (!games.length) return 'You’ve got the lot already, have you? Ha. Next week, then.';
    if (!affordable) return PITCH_SHORT[Math.floor(unit01(`${day}:lot-short`) * PITCH_SHORT.length)]!;
    // The dearest one by one is the one he talks up.
    const best = games.reduce((a, b, i) => ((prices[i] ?? 0) > (prices[games.indexOf(a)] ?? 0) ? b : a));
    const line = PITCH[Math.floor(unit01(`${day}:lot-pitch`) * PITCH.length)]!.replace('{n}', `${games.length}`).replace('{best}', best.title);
    const crossedOff = crossed ? ` I’ve crossed off the ${crossed === 1 ? 'one' : crossed} you’ve got.` : '';
    return `${line} One by one, you’d pay about ${formatCoins(worth)}.${crossedOff}`;
  }

  /** The lot shown on the crate's card once known. */
  async sign(): Promise<string> {
    if (this.deps.market.lot.sold) return 'SOLD';
    const lot = await this.deps.market.lot.today();
    this.lot ??= lot;
    const offer = lotOffer(lot, (id) => this.deps.collection.owns(id));
    return `${offer.games.length} games · ${formatCoins(offer.price)}`;
  }

  protected override onAction(action: string): void {
    if (action !== 'buy') return;
    const { market, wallet, tx } = this.deps;
    const lot = this.lot;
    if (!lot) return;
    this.aside = null;
    if (market.lot.sold) {
      this.say('Sold today, friend. I bring another crate next market day.');
      return;
    }
    const offer = lotOffer(lot, (id) => this.deps.collection.owns(id));
    const price = offer.price;
    if (!offer.games.length) {
      this.say('Every one of them is on your shelves already. You don’t need me.', 'smile');
      return;
    }
    if (wallet.coins < price) {
      this.say(`It’s ${formatCoins(price)} the lot, and you’re ${formatCoins(price - wallet.coins)} short. It’ll be here till I pack up.`, 'frown');
      return;
    }
    if (price > ARM_ABOVE && !this.arming.press('lot')) {
      this.say(`${formatCoins(price)}, the whole crate. Shake on it?`, 'smile');
      return;
    }
    const bought = tx.buyLot(lot);
    if (!bought.ok) {
      if (bought.reason === 'short') this.say(`It’s ${formatCoins(price)} the lot, and you have ${formatCoins(wallet.coins)}.`, 'frown');
      return;
    }
    const fresh = bought.games.length;
    playCoins(6);
    this.say(`Pleasure. ${fresh} new ${plural(fresh, 'game')} for you: they’ll be in a parcel in your hallway.`, 'smile');
    this.onBought?.();
  }

  /** Bernard says `line` over the pitch until the next press, the crate repainted under it. */
  private say(line: string, face: Expression = 'rest'): void {
    this.aside = { line, face };
    this.refresh();
  }

  protected override onClosed(): void {
    // Asked afresh next time (the market keeps the day's lot): a new market day brings a new one.
    this.lot = null;
    this.aside = null;
    this.said = '';
    this.arming.reset();
  }
}
