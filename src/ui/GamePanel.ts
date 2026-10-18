import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { formatReleaseDate } from '@/catalog/format';
import { describeEdition } from '@/economy/pricing';
import { describeVariant } from '@/economy/copyTraits';
import { CONVERTER_OF } from '@/economy/regionLock';
import { html, paint, raw } from './panel/html';
import { actionCap } from './verb';
import { capitalise } from '@/text/strings';
import { fadeIn, fadeOut } from './fade';
import type { ReviewSource } from '@/reviews/Reviews';
import { reviewCardHtml } from '@/reviews/reviewCard';
import { formatCoins } from '@/text/money';
import { daysAgoWords } from '@/time/dayWords';

/** What the panel adds for a copy that is not the player's yet (a market box): rows on top, a line of text, and its own key hints. */
interface PanelExtra {
  rows?: Array<[string, string]>;
  /** Plain text, shown highlighted under the rows. */
  note?: string;
  /** HTML (trusted, built from constants): the copy's own keys (a box of the player's has none here: the prompt line says them, `Session`). */
  hints?: string;
}

/**
 * The card beside the game in hand: a collector's index card. The title and the line under it (console, year, region),
 * the copy's state as stamps (complete, no manual, first print, sealed, Félix's…), the few facts worth a line, what
 * was found inside, the receipt in pen ("40 coins, the NES stall, three weeks ago"), the blurb (a few lines; turned
 * over, `setBackShown`, the whole of it, as the back of the box prints it), then the press at the time, whose place is
 * kept from the start so nothing jumps when it comes in.
 */
export class GamePanel {
  private readonly root: HTMLElement;
  /** The press at the time (`reviews/`): its card is added under the details once the game's reviews come in. */
  private reviews: ReviewSource | null = null;
  /** The game shown, so reviews arriving for the one put down are dropped. */
  private shown: string | null = null;
  /** Today's game day: the receipt says "three weeks ago", never a day number. */
  private today: () => number = () => 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('aside');
    this.root.className = 'game-panel';
    this.root.hidden = true;
    container.appendChild(this.root);
  }

  /** Shows each game's reviews too, once known (`/api/reviews`). */
  setReviews(reviews: ReviewSource): void {
    this.reviews = reviews;
  }

  /** Where today's game day is read, for the receipt's "three weeks ago". */
  setToday(today: () => number): void {
    this.today = today;
  }

  /** The box turned over in hand (its back cover): the whole blurb, as the back prints it; turned back, a few lines. */
  setBackShown(shown: boolean): void {
    this.root.classList.toggle('game-panel--back', shown);
    this.markOverflow();
  }

  show(game: Game, extra: PanelExtra = {}): void {
    const platform = getPlatform(game.platform);
    // A copy of the player's own (no market rows): its edition, its receipt, and the truth about a fake.
    const own = !extra.rows;
    const note = extra.note ?? (own && game.repro ? 'A reproduction, sadly: the label is a print.' : undefined);
    const year = game.releaseDate ? formatReleaseDate(game.releaseDate).replace(/^.* (\d{4})$/, '$1') : '';
    const region = game.region === 'Japan' && CONVERTER_OF[game.platform] ? 'Japanese copy' : game.region;
    const line = [platform.name, year, region].filter(Boolean).join(' · ');
    const stamps = own ? ownStamps(game) : [];
    const facts: Array<[string, string | undefined]> = [
      ...(extra.rows ?? []),
      ['Developer', game.developer],
      ['Publisher', game.publisher && game.publisher !== game.developer ? game.publisher : undefined],
      ['Genre', game.genre ? capitalise(game.genre) : undefined],
      ['Released', game.releaseDate && !/^\d{4}$/.test(game.releaseDate) ? formatReleaseDate(game.releaseDate) : undefined],
    ];
    // What is written about this very copy: what sets it apart, whose it was, what was found in it.
    const asides = [
      // The card says what the copy is; what it is worth is the market's to say.
      describeVariant(game)?.replace(/\s*\([^)]*\)$/, ''),
      game.felixLot !== undefined ? `Félix’s round F.A. sticker on the back: lot ${game.felixLot} at the sale of his flat.` : undefined,
      game.hisSticker ? 'One of Félix’s round F.A. stickers on the back, from the roll Mémé gave you.' : undefined,
      game.bootleg ? 'An unlicensed cartridge: a curiosity, never a fake.' : undefined,
      game.past?.found ? game.past.text : undefined,
      own && game.sticker ? 'An old shop’s price sticker on the cover.' : undefined,
    ].filter((aside): aside is string => !!aside);
    const paid = own ? game.acquired : undefined;
    const receipt = paid ? `${paid.price ? formatCoins(paid.price) : 'Free'}, ${paid.where}, ${daysAgoWords(paid.day, this.today())}` : '';
    const reviewsWaiting = this.reviews !== null && !this.reviews.peek(game);
    paint(
      this.root,
      html`<div class="game-panel__content">
        <header class="game-panel__head">
          <h2>${game.title}</h2>
          <p class="game-panel__line">${line}</p>
        </header>
        ${stamps.length ? html`<ul class="game-panel__stamps">${stamps.map((s) => html`<li class="game-panel__stamp game-panel__stamp--${s.tone}">${s.text}</li>`)}</ul>` : ''}
        <dl>${facts.filter((f): f is [string, string] => !!f[1]).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>
        ${asides.length ? html`<ul class="game-panel__asides">${asides.map((a) => html`<li>${a}</li>`)}</ul>` : ''}
        ${note ? html`<p class="game-panel__note">${note}</p>` : ''}
        ${receipt ? html`<p class="game-panel__receipt">${receipt}</p>` : ''}
        ${game.description ? html`<div class="game-panel__blurb"><p>${game.description}</p><span class="game-panel__more">Turn it over <kbd>${actionCap('turnBox')}</kbd> for the rest</span></div>` : ''}
        <section class="review-card${reviewsWaiting ? ' review-card--waiting' : ''}"${this.reviews ? '' : raw(' hidden')}></section>
      </div>
      ${extra.hints ? html`<footer>${raw(extra.hints)}</footer>` : ''}`,
    );
    // The same copy shown again (its price came in, a haggle settled): still turned over if it was.
    if (this.shown !== game.id) this.root.classList.remove('game-panel--back');
    this.markClamped();
    fadeIn(this.root, 'game-panel--closing');
    this.shown = game.id;
    this.showReviews(game);
  }

  /**
   * "Turn it over for the rest" only under a blurb the card cuts short; and a card taller than the view (a market
   * box with its rows, the press under it, a short screen) fades out at its foot over the key hints, never cut dead.
   */
  private markClamped(): void {
    requestAnimationFrame(() => {
      const blurb = this.root.querySelector<HTMLElement>('.game-panel__blurb');
      const text = blurb?.querySelector('p');
      if (blurb && text) blurb.classList.toggle('game-panel__blurb--cut', text.scrollHeight > text.clientHeight + 2);
      this.markOverflow();
    });
  }

  private markOverflow(): void {
    const content = this.root.querySelector<HTMLElement>('.game-panel__content');
    if (content) this.root.classList.toggle('game-panel--overflow', content.scrollHeight > content.clientHeight + 2);
  }

  /** The reviews' card, at once when known, else when the lookup answers (if the game is still the one shown); its kept place goes if there are none. */
  private showReviews(game: Game): void {
    const reviews = this.reviews;
    if (!reviews) return;
    const fill = (found: Parameters<typeof reviewCardHtml>[0] | null | undefined): void => {
      const card = this.root.querySelector<HTMLElement>('.review-card');
      if (!card || this.shown !== game.id) return;
      card.classList.remove('review-card--waiting');
      const html = found ? reviewCardHtml(found) : '';
      if (!html) {
        card.hidden = true;
        return;
      }
      card.innerHTML = html; // convention-ok: the review card's own markup, built from escaped parts
      card.hidden = false;
      this.markOverflow();
    };
    const known = reviews.peek(game);
    if (known) fill(known);
    else void reviews.lookup(game).then(fill, () => fill(null));
  }

  /** Put down: a short fade, then hidden. */
  hide(): void {
    this.shown = null;
    fadeOut(this.root, 'game-panel--closing', 150);
  }
}

/** A stamp on the card: a word or two, in the ink of what it says (good news, a flaw, a rarity). */
interface Stamp {
  text: string;
  tone: 'good' | 'flaw' | 'rare';
}

/** A copy of the player's own, as it stands: complete or not, the printing, sealed, a misprint, his. */
function ownStamps(game: Game): Stamp[] {
  const stamps: Stamp[] = [];
  if (game.variant === 'sealed') stamps.push({ text: 'Sealed', tone: 'rare' });
  else if (game.condition === 'worn') stamps.push({ text: 'Worn, no manual', tone: 'flaw' });
  else if (game.condition === 'noManual') stamps.push({ text: game.restored ? 'Cleaned up, no manual' : 'No manual', tone: 'flaw' });
  else stamps.push({ text: 'Complete', tone: 'good' });
  const edition = describeEdition(game.edition, game.platform);
  if (edition) stamps.push({ text: capitalise(edition), tone: game.edition === 'firstPrint' ? 'rare' : 'flaw' });
  if (game.variant === 'misprint') stamps.push({ text: 'Misprint', tone: 'rare' });
  if (game.variant === 'crushed') stamps.push({ text: 'Crushed', tone: 'flaw' });
  if (game.felixLot !== undefined) stamps.push({ text: 'Félix’s', tone: 'rare' });
  else if (game.hisSticker) stamps.push({ text: 'His sticker', tone: 'rare' });
  return stamps;
}
