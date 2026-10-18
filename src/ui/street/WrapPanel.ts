import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { compareTitles, matchesSearch } from '@/text/strings';
import { formatCoins } from '@/text/money';
import { reduceMotion } from '@/settings/motion';
import { playPaperRustle } from '@/audio/householdSounds';
import { SheetPanel } from '../panel/SheetPanel';
import { html, paint, type Html } from '../panel/html';
import { coverImg, emptyState } from '../panel/widgets';
import { Speaker } from '../panel/speaker';
import { rememberFocus } from '../rememberFocus';
import './WrapPanel.css';

/** What the stall's wrapping is dealt before the Session opens it. */
interface WrapDeal {
  /** The games of the collection that may be given (owned, not a keepsake). */
  games(): readonly Game[];
  /** Whether `id` is wrapped already. */
  isWrapped(id: string): boolean;
  /** The paper's price. */
  price: number;
  /** Wraps `game`: null when done, else why not (the wallet short, the paper all used). */
  wrap(game: Game): string | null;
  coverUrl?: (game: Game) => string | undefined;
  /** The stall's keeper: the look their walker wears (`ui/social/strangerFace`). */
  keeper?: { name: string; seed: number };
}

/** How long the paper takes to fold round a box before the row settles as wrapped (ms). */
const WRAP_MS = 700;
/** What the keeper says as a game goes into paper, in turn. */
const WRAPPED_LINES = ['There. Bow on top. Whoever gets that is lucky.', 'Corners tucked, ribbon curled. Lovely.', 'That’ll look a treat under a tree.'];

/**
 * The Christmas stall's gift wrapping on Front Street (`street/events/ChristmasStall`, `holidays/giftWrap`): the
 * keeper at the top in a balloon, the player's games laid out on the stall's paper as boxes, the price once. A press
 * folds the paper round the box (a rustle, the ribbon and its bow), and a wrapped box stays wrapped on the stall,
 * ready to give (a conversation's "A game…", where it means more). A filter finds a box in a big collection.
 */
export class WrapPanel extends SheetPanel {
  private deal: WrapDeal | null = null;
  private readonly keeper = new Speaker({ name: 'The stallholder' }, { face: 52, className: 'wrap-panel__keeper' });
  /** The game whose paper is folding now (its row plays the wrap), so the repaint after shows it already wrapped. */
  private folding: string | null = null;
  private said = 0;
  private foldTimer = 0;

  constructor(container: HTMLElement) {
    super(container, {
      title: 'Gift wrapping',
      blurb: 'Which of your games goes into paper and ribbon, to give to someone?',
      className: 'wrap-panel',
      search: { placeholder: 'Find a game of yours…' },
    });
    this.keeper.mountAbove(this.body);
  }

  /** Deals the games (call before the Session opens the panel). */
  show(deal: WrapDeal): void {
    this.deal = deal;
    this.folding = null;
    this.setTitle('Gift wrapping', `${formatCoins(deal.price)} a game, paper and ribbon. Which one is it to be?`);
    this.keeper.setWho({ name: deal.keeper?.name ?? 'The stallholder', ...(deal.keeper ? { seed: deal.keeper.seed } : {}), backdrop: '#e9d9b4' });
    this.keeper.say('Pick one out and I’ll do it up while you wait.', 'smile');
    if (this.isOpen) this.render();
  }

  protected override onSearch(): void {
    this.render();
  }

  protected override onClosed(): void {
    window.clearTimeout(this.foldTimer);
    this.folding = null;
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const deal = this.deal;
    if (action !== 'wrap' || !deal || !el.dataset.id || this.folding) return;
    const game = deal.games().find((g) => g.id === el.dataset.id);
    if (!game) return;
    if (deal.isWrapped(game.id)) {
      this.keeper.say(`${game.title}’s done already. It’s ready to give.`);
      return;
    }
    const why = deal.wrap(game);
    if (why) {
      // The stall's own refusals are in their words (the paper all used); the wallet's are a plain line.
      if (why.startsWith('“')) this.keeper.say(why.replace(/^“|”$/g, ''), 'frown');
      else this.setStatus(why, 'error');
      return;
    }
    this.setStatus('');
    playPaperRustle();
    this.keeper.say(WRAPPED_LINES[this.said++ % WRAPPED_LINES.length]!, 'smile');
    this.folding = game.id;
    this.render();
    this.foldTimer = window.setTimeout(
      () => {
        this.folding = null;
        if (this.isOpen) this.render();
      },
      reduceMotion() ? 0 : WRAP_MS,
    );
  }

  protected render(): void {
    const deal = this.deal;
    const query = this.query;
    const games = (deal?.games() ?? []).filter((g) => matchesSearch(g.title, query)).sort((a, b) => compareTitles(a.title, b.title));
    if (!deal || !games.length) {
      paint(
        this.body,
        query
          ? emptyState(`Nothing called “${query}” in your collection.`, { pictogram: 'magnifier', title: 'Not on the stall' })
          : emptyState('Bring a game of yours and it goes into paper and ribbon, to give.', { pictogram: 'gift', title: 'Nothing to wrap yet' }),
      );
      return;
    }
    const restoreFocus = rememberFocus(this.body);
    paint(this.body, html`<ul class="wrap-panel__grid">${games.map((game) => this.tile(deal, game))}</ul>`);
    restoreFocus();
  }

  /** A box on the stall: its cover (or a plain box with its title), and once wrapped the paper, ribbon and bow over it. */
  private tile(deal: WrapDeal, game: Game): Html {
    const wrapped = deal.isWrapped(game.id);
    const folding = this.folding === game.id;
    const src = deal.coverUrl?.(game);
    const cover = src ? coverImg(src, game, 'wrap-panel__cover') : html`<span class="wrap-panel__cover wrap-panel__cover--plain">${game.title}</span>`;
    const platform = getPlatform(game.platform).shortName;
    return html`<li><button type="button" class="wrap-panel__tile${wrapped ? ' is-wrapped' : ''}${folding ? ' is-folding' : ''}" data-action="wrap" data-id="${game.id}" aria-label="${wrapped ? `${game.title}, wrapped, ready to give` : `Wrap ${game.title}`}">
        <span class="wrap-panel__box">${cover}<span class="wrap-panel__paper" aria-hidden="true"><span class="wrap-panel__ribbon"></span><span class="wrap-panel__bow"></span></span></span>
        <span class="wrap-panel__title">${game.title}</span>
        <span class="wrap-panel__state">${wrapped ? 'Wrapped · ready to give' : `${platform} · Wrap it`}</span>
      </button></li>`;
  }
}
