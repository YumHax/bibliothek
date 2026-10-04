import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { formatReleaseDate } from '@/catalog/format';
import { describeEdition } from '@/economy/pricing';
import { describeVariant } from '@/economy/copyTraits';
import { CONVERTER_OF } from '@/economy/regionLock';
import { CONTROLS } from './controls';
import { escapeHtml } from './html';
import { capitalise } from '@/text/strings';
import { renderKeys } from './keys';
import { fadeIn, fadeOut } from './fade';
import { lastDevice } from '@/input/lastDevice';
import type { ReviewSource } from '@/reviews/Reviews';
import { reviewCardHtml } from '@/reviews/reviewCard';
import { formatCoins } from '@/text/money';

/** Built on each show, for the device last used (the controller's buttons, the touch bar's, or the keys as bound and printed). */
const holdingHints = (): string => {
  const device = lastDevice();
  return CONTROLS.filter((c) => c.whileHolding)
    .flatMap((c) => {
      const keys = device === 'gamepad' ? c.pad : device === 'touch' ? c.touch : c.keys;
      return keys === undefined ? [] : [`${renderKeys(keys)} ${escapeHtml(c.action.toLowerCase())}`];
    })
    .join(' · ');
};

/** What the panel adds for a copy that is not the player's yet (a market box): rows on top, a line of text, and its own key hints. */
interface PanelExtra {
  rows?: Array<[string, string]>;
  /** Plain text, shown highlighted under the rows. */
  note?: string;
  /** HTML (trusted, built from constants) replacing the usual holding hints. */
  hints?: string;
}

/** Side panel with the details of the game currently held by the Inspector. */
export class GamePanel {
  private readonly root: HTMLElement;
  /** The press at the time (`reviews/`): its card is added under the details once the game's reviews come in. */
  private reviews: ReviewSource | null = null;
  /** The game shown, so reviews arriving for the one put down are dropped. */
  private shown: string | null = null;

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

  show(game: Game, extra: PanelExtra = {}): void {
    const platform = getPlatform(game.platform);
    // A copy of the player's own (no market rows): its edition, its receipt, and the truth about a fake.
    const own = !extra.rows;
    const edition = own ? describeEdition(game.edition, game.platform) : '';
    const bought = own && game.acquired ? `${formatCoins(game.acquired.price)}, ${game.acquired.where} (market day ${game.acquired.day})` : undefined;
    const note = extra.note ?? (own && game.repro ? 'A reproduction, sadly: the label is a print. Worth next to nothing.' : undefined);
    const rows: Array<[string, string | undefined]> = [
      ...(extra.rows ?? []),
      ['Edition', edition ? capitalise(edition) : undefined],
      // What sets this copy apart (sealed, a misprint, a crushed box), shown on a stall's copy too; what was found inside it.
      ['Copy', describeVariant(game)],
      ['Bootleg', game.bootleg ? 'An unlicensed cartridge: a curiosity, never a fake' : undefined],
      ['Inside', game.past?.found ? game.past.text : undefined],
      // What the flat can do for it (docs/household.md): a worn box cleaned at the kitchen table, a sticker lifted with warm air.
      ['State', own ? ownState(game) : undefined],
      ['Sticker', own && game.sticker ? 'An old shop’s price sticker on the cover (warm air lifts it off)' : undefined],
      ['Bought for', bought],
      ['Platform', platform.name],
      ['Released', formatReleaseDate(game.releaseDate)],
      ['Developer', game.developer],
      ['Publisher', game.publisher],
      ['Genre', game.genre],
      ['Region', game.region === 'Japan' && CONVERTER_OF[game.platform] ? 'Japan (a western console needs a converter: TV REPAIR)' : game.region],
    ];
    this.root.innerHTML = `
      <h2>${escapeHtml(game.title)}</h2>
      <dl>
        ${rows
          .filter(([, v]) => v)
          .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v!)}</dd>`)
          .join('')}
      </dl>
      ${note ? `<p class="game-panel__note">${escapeHtml(note)}</p>` : ''}
      ${game.description ? `<p>${escapeHtml(game.description)}</p>` : ''}
      <section class="review-card" hidden></section>
      <footer>${extra.hints ?? holdingHints()}</footer>`;
    fadeIn(this.root, 'game-panel--closing');
    this.shown = game.id;
    this.showReviews(game);
  }

  /** The reviews' card, at once when known, else when the lookup answers (if the game is still the one shown). */
  private showReviews(game: Game): void {
    const reviews = this.reviews;
    if (!reviews) return;
    const fill = (found: Parameters<typeof reviewCardHtml>[0] | null | undefined): void => {
      const card = this.root.querySelector<HTMLElement>('.review-card');
      if (!found || !card || this.shown !== game.id) return;
      const html = reviewCardHtml(found);
      if (!html) return;
      card.innerHTML = html;
      card.hidden = false;
    };
    const known = reviews.peek(game);
    if (known) fill(known);
    else void reviews.lookup(game).then(fill);
  }

  /** Put down: a short fade, then hidden. */
  hide(): void {
    this.shown = null;
    fadeOut(this.root, 'game-panel--closing', 150);
  }
}

/** A copy of the player's own, as it stands: undefined when it is complete (nothing to say). */
function ownState(game: Game): string | undefined {
  if (game.condition === 'worn') return 'Worn, no manual (a good clean would brighten it up)';
  if (game.condition === 'noManual') return game.restored ? 'Cleaned up, no manual' : 'No manual';
  return undefined;
}
