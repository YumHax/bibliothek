import type { PlatformId } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { Negotiation } from '@/economy/haggle';
import type { StockItem } from '@/economy/StockItem';
import type { Household } from './Household';
import { HOUSEHOLD } from './rules';
import { ARCADE_TEE_BONUS, HUNTER_JACKET_FLOOR, outfitById, type Outfit, type OutfitFacts } from './outfits';

export interface PerkDeps {
  household: Household;
  /** The game's clock, hours. */
  hours: () => number;
  /** What the outfits' unlocks are judged on, right now. */
  facts: () => OutfitFacts;
}

/** How far the player's know-how of a platform goes: 'eye' spots a fake's print, 'respect' also eases the haggles. */
export type KnowHow = 'none' | 'eye' | 'respect';

export function knowHowOf(manualsRead: number): KnowHow {
  if (manualsRead >= HOUSEHOLD.knowHow.respect) return 'respect';
  return manualsRead >= HOUSEHOLD.knowHow.eye ? 'eye' : 'none';
}

/**
 * What the flat sends the player out with, as the market and the arcade ask for it: a bath's calm,
 * the morning's first sale, a platform's know-how (manuals read), what they wear. Only ever a plus;
 * the Session's counter and arcade play apply what it returns.
 */
export class Perks {
  constructor(private readonly deps: PerkDeps) {}

  /** What the outfits' unlocks are judged on, right now (the wardrobe's panel shows them). */
  get facts(): OutfitFacts {
    return this.deps.facts();
  }

  /** What is worn, if its unlock still holds (else the everyday clothes). */
  get outfit(): Outfit {
    const worn = outfitById(this.deps.household.outfit);
    return worn.unlocked(this.deps.facts()) ? worn : outfitById('everyday');
  }

  /** The Sunday best: the glass case's stallholder hands its copies over, whatever the player's reputation. */
  get mayHandleGlass(): boolean {
    return this.outfit.id === 'sundayBest';
  }

  knowHow(platform: PlatformId): KnowHow {
    return knowHowOf(this.deps.household.manualsRead(platform));
  }

  /** Whether a purchase of `item` now would be the morning's first sale. */
  firstSale(item: StockItem): boolean {
    return item.source !== 'bin' && this.deps.hours() < HOUSEHOLD.firstSale.before && !this.deps.household.doneToday('firstSale');
  }

  /**
   * A haggle over `item` just opened: eases it with what the player brings along (the bath's calm is
   * used up by it), and says why, one line each, for the toast.
   */
  ease(item: StockItem, negotiation: Negotiation): string[] {
    const { household } = this.deps;
    const lines: string[] = [];
    let floor = 0;
    let patience = 0;
    if (household.soaked) {
      patience += HOUSEHOLD.soak.patience;
      household.useSoak();
      lines.push('Still calm from your bath: the stallholder will hear one more offer.');
    }
    if (this.firstSale(item)) {
      floor += HOUSEHOLD.firstSale.floor;
      lines.push('“First sale of the day brings luck.” They want it to happen.');
    }
    if (this.knowHow(item.game.platform) === 'respect') {
      floor += HOUSEHOLD.knowHow.respectFloor;
      lines.push(`You talk ${getPlatform(item.game.platform).shortName} like someone who read the manuals. They respect that.`);
    }
    if (this.outfit.id === 'hunterJacket') {
      floor += HUNTER_JACKET_FLOOR;
      lines.push('The jacket says dealer: they open lower.');
    }
    if (floor || patience) negotiation.ease({ floor, patience });
    return lines;
  }

  /** A word the player's know-how has on the copy in hand (a fake's print, before the box is opened), or null. */
  tell(item: StockItem): string | null {
    if (!item.repro || item.exposed || this.knowHow(item.game.platform) === 'none') return null;
    return 'The label’s print looks too glossy for its age. Open the box to be sure.';
  }

  /** A line for the copy's panel: the morning's first sale on offer. */
  note(item: StockItem): string | null {
    return this.firstSale(item) ? 'First sale of the morning: stallholders say it brings luck. Haggle!' : null;
  }

  /** A copy was bought at a stall: the morning's first sale is used. True when this purchase used it. */
  bought(item: StockItem): boolean {
    return this.firstSale(item) && this.deps.household.once('firstSale');
  }

  /** The purchase that used the morning's first sale was handed back: the luck is the player's again. */
  unbought(): void {
    this.deps.household.forgetToday('firstSale');
  }

  /** Tickets on top of `tickets` a play just paid (the arcade tee), 0 for none. */
  arcadeBonus(tickets: number): number {
    if (this.outfit.id !== 'arcadeTee' || tickets <= 0) return 0;
    return Math.max(1, Math.round(tickets * ARCADE_TEE_BONUS));
  }
}
