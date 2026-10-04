import type { Game } from '@/catalog/types';
import { pastTitle } from '@/economy/copyTraits';
import { CONFIRM_MS, VARIANT } from '@/economy/pricing';
import { isAction } from '@/input/actions';
import { actionKeyLabel } from '@/ui/keys';
import type { ForSaleLike } from './SessionActions';
import type { CollectionLike, CoreParts } from './SessionParts';
import type { KeyRoute } from './SessionHost';

type CopyOpeningParts = Pick<CoreParts, 'inspector' | 'notices'> & { collection?: CollectionLike };

/**
 * O on a box in hand, before it opens (docs/economy.md "Copies"): a sealed copy at a stall stays shut (the stallholder
 * will not have the wrap broken); a sealed copy of the player's own asks first (O again within `CONFIRM_MS`), then the
 * seal is broken for good (its premium gone) and the box opens; a copy with a past shows it on a card the first time
 * it is opened (kept as found on the player's own copy, on the market's copy in hand, bought with it).
 */
export class CopyOpening implements KeyRoute {
  /** The copy whose seal the next O breaks, until when. */
  private armed: { id: string; until: number } | null = null;

  constructor(private readonly parts: CopyOpeningParts, private readonly marketCopy: () => ForSaleLike | null) {}

  onKey(code: string): boolean {
    if (!isAction(code, 'openBox') && !isAction(code, 'lookInside')) return false;
    const box = this.parts.inspector.current;
    if (!box || box.isOpen) return false;
    const sale = this.marketCopy();
    if (sale && sale.box === box) return this.openForSale(sale);
    const copy = this.parts.collection?.find?.(box.game.id);
    if (!copy || (copy.status ?? 'owned') !== 'owned') return false;
    if (copy.variant === 'sealed') {
      if (!this.breakSeal(copy)) return true;
      box.unseal();
      // The box keeps its game across the change (`BoxPool`'s live keys): it learns of it here.
      Object.assign(box.game, { variant: undefined });
    }
    this.findPast(copy, box.game);
    return false;
  }

  /** A market copy: sealed, it stays shut; else what is inside shows the first time. */
  private openForSale(sale: ForSaleLike): boolean {
    if (sale.item.sealed) {
      sale.react?.('locked');
      sale.speak?.('Not that one, it’s sealed. You open it once it’s yours.');
      this.parts.notices.refuse('Factory sealed: no opening it at the stall');
      return true;
    }
    const past = sale.item.game.past;
    if (past && !past.found) {
      past.found = true; // the copy in hand is the one bought: it goes home found
      this.parts.notices.read({ title: pastTitle(past), text: past.text, look: 'note' });
    }
    return false;
  }

  /** The first O arms, the second (in time) breaks the seal; true once it is broken. */
  private breakSeal(copy: Game): boolean {
    const now = performance.now();
    if (this.armed?.id !== copy.id || now > this.armed.until) {
      this.armed = { id: copy.id, until: now + CONFIRM_MS };
      this.parts.notices.react(`Still sealed: ${actionKeyLabel('openBox')} again to break the seal (it is worth ${VARIANT.sealed.factor}× unopened)`);
      return false;
    }
    this.armed = null;
    this.parts.collection?.update?.(copy.id, { variant: undefined });
    this.parts.notices.react(`You slit the shrink-wrap: ${copy.title} is an ordinary copy now, and yours to read.`);
    return true;
  }

  /** The copy's past, the first time it is opened: a card, and found from now on. */
  private findPast(copy: Game, shown: Game): void {
    const past = copy.past;
    if (!past || past.found) return;
    const found = { ...past, found: true };
    this.parts.collection?.update?.(copy.id, { past: found });
    Object.assign(shown, { past: found });
    this.parts.notices.read({ title: pastTitle(past), text: past.text, look: 'note' });
  }
}
