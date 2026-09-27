import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { Household } from './Household';
import { HOUSEHOLD } from './rules';
import { drawCatGift } from './catGift';
import { morningChronicle } from './chronicle';
import { knowHowOf } from './perks';
import { dreamOf, type Dream } from './dreams';
import type { StockItem } from '@/economy/StockItem';

export interface HomeLifeDeps {
  household: Household;
  /** The collection: a copy cleaned, a sticker peeled, a booklet found change it in place. */
  collection: { find(id: string): Game | undefined; update(id: string, patch: Partial<Omit<Game, 'id'>>): void; owns(id: string): boolean };
  /** What is on the shelves (the cat finds the booklet of one of these). */
  shelved: { readonly games: readonly Game[] };
  /** Coins the cat turned up. */
  purse: { earnCoins(coins: number): void };
  /** The game's clock, hours. */
  hours: () => number;
  /** Whether the flea market keeps its doors open right now (RETRO GAMES' hours). */
  marketOpen: () => boolean;
  /** The market's stock today (owned copies left out): what a night's dream is of. */
  todays?: () => Promise<readonly StockItem[]>;
}

/** A thing to do, and what came of it: a line for the toast, and whether anything happened. */
export interface Outcome {
  done: boolean;
  line: string;
}

const no = (line: string): Outcome => ({ done: false, line });
const yes = (line: string): Outcome => ({ done: true, line });

/**
 * What the flat's rooms are for, as rules (docs/household.md): the furniture's clicks call these,
 * which check, change the stores and say what happened. Nothing here ever costs the player
 * anything they had.
 */
export class HomeLife {
  constructor(private readonly deps: HomeLifeDeps) {}

  get household(): Household {
    return this.deps.household;
  }

  /** The copy of `game` in the collection (a box in hand may carry an older Game object). */
  private owned(game: Game): Game | null {
    const copy = this.deps.collection.find(game.id);
    return copy && (copy.status ?? 'owned') !== 'wishlist' ? copy : null;
  }

  // --- the bathroom ------------------------------------------------------------------------------

  /** The cleaning kit taken from the mirror cabinet: it goes to the kitchen table, where the light is good. */
  takeKit(): Outcome {
    if (this.household.hasKit) return no('The kit is on the kitchen table.');
    this.household.takeKit();
    return yes('You take the cleaning kit: cotton buds, isopropyl, a soft cloth.\nIt goes on the kitchen table, where the light is good. Bring a worn box there.');
  }

  /** What the hair dryer would do for `game` in hand, for its caption. */
  stickerLabel(game: Game | null): string {
    if (!game) return 'A hair dryer. Warm air lifts old price stickers';
    return this.owned(game)?.sticker ? `Click to peel the price sticker off ${game.title}` : `No sticker on ${game.title}`;
  }

  /** Warm air on `game`'s old price sticker, peeled off whole. `before` runs just before the copy changes (the box put down). */
  peelSticker(game: Game, before?: () => void): Outcome {
    const copy = this.owned(game);
    if (!copy) return no('Only your own boxes, at home.');
    if (!copy.sticker) return no(`No sticker on ${copy.title}.`);
    before?.();
    this.deps.collection.update(copy.id, { sticker: undefined });
    return yes(`A minute of warm air and the old price sticker lifts off in one piece.\n${copy.title} is worth its full price again.`);
  }

  /** The bath is full: a long soak. */
  soak(): Outcome {
    if (!this.household.soak()) return no('You are as relaxed as you are going to get.');
    return yes('You sink into the hot water and let the day go…\nUnhurried: the next stallholder you haggle with will hear one more offer.');
  }

  // --- the kitchen -------------------------------------------------------------------------------

  /** What the kit on the table would do for `game` in hand, for its caption. */
  cleanLabel(game: Game | null): string {
    if (!game) return 'The cleaning kit: bring a worn box here to clean it up';
    const copy = this.owned(game);
    if (!copy) return 'The cleaning kit';
    if (copy.condition !== 'worn') return `${copy.title} is in good shape`;
    if (this.household.restoresLeft <= 0) return 'One careful job a day: come back tomorrow';
    return `Click to clean up ${copy.title}`;
  }

  /**
   * Cleans a worn copy: the dull cover comes up bright (it reads as a copy without its manual from now on).
   * `before` runs just before the copy changes (the box put down: its shelf rebuilds it).
   */
  cleanBox(game: Game, before?: () => void): Outcome {
    const copy = this.owned(game);
    if (!copy) return no('Only your own boxes, at home.');
    if (copy.condition !== 'worn') return no(`${copy.title} does not need it.`);
    if (this.household.restoresLeft <= 0) return no('That is enough fiddly work for one day. Tomorrow.');
    before?.();
    this.household.markRestored();
    this.deps.collection.update(copy.id, { condition: 'noManual', restored: true });
    return yes(`An hour with cotton buds and isopropyl: the grime comes off and the cover comes up bright.\n${copy.title} is a tidy copy now (still no manual). The collector's book counts it at its new worth.`);
  }

  get bakeLabel(): string {
    return this.household.cakeOut ? 'A cake is out already' : 'Click to bake a cake (for when friends drop by)';
  }

  bake(): Outcome {
    if (!this.household.bake()) return no('There is still cake on the table.');
    return yes('Flour, eggs, butter, forty minutes in the oven: a sponge cake cools on the table.\nA friend who drops by in the next day or so will stay longer, and be grateful.');
  }

  get treatLabel(): string {
    return this.household.treatedToday ? 'The treats: one a day, or the cat gets round' : 'Click to give the cat a treat';
  }

  /** A treat for the cat (it comes running); tomorrow, perhaps, it leaves something by its bowl. */
  giveTreat(callCat?: () => string): Outcome {
    if (this.household.treatedToday) return no('One a day. Look at that face, though.');
    this.household.giveTreat(drawCatGift(this.household.today, this.deps.shelved.games));
    const call = callCat?.();
    return yes(`You shake the jar.${call ? `\n${call}` : ''}`);
  }

  get giftLabel(): string | null {
    const gift = this.household.gift;
    if (!gift) return null;
    return gift.kind === 'coins' ? 'Click to pick up the coins the cat left' : 'Click to pick up the booklet the cat dragged out';
  }

  /** What the cat left by its bowl, picked up. */
  takeGift(catName: string): Outcome {
    const gift = this.household.takeGift();
    if (!gift) return no('Nothing there.');
    if (gift.kind === 'coins') {
      this.deps.purse.earnCoins(gift.coins);
      return yes(`${gift.coins} coins, fished out from under the sofa cushions by ${catName}. Good cat.`);
    }
    const copy = this.deps.collection.find(gift.gameId);
    if (!copy || copy.condition !== 'noManual') return yes(`An old booklet… for ${gift.title}, which you no longer have. ${catName} looks proud anyway.`);
    this.deps.collection.update(copy.id, { condition: 'complete' });
    return yes(`The manual of ${copy.title}! It was behind the sofa all along. ${catName} looks very pleased.\nThe copy is complete again.`);
  }

  /** The radio switched on: Radio Brocante's chronicle, once a market day in the morning; null otherwise. */
  chronicle(): string[] | null {
    const hours = this.deps.hours();
    if (hours < HOUSEHOLD.radio.from || hours >= HOUSEHOLD.radio.until || !this.household.once('radio')) return null;
    return morningChronicle(this.household.today, (id) => this.deps.collection.owns(id));
  }

  // --- the bedroom -------------------------------------------------------------------------------

  /** What the reading chair would do with `game` in hand, for its caption. */
  readLabel(game: Game): string {
    const copy = this.owned(game);
    if (!copy) return 'Click to sit down';
    if (copy.condition === 'noManual' || copy.condition === 'worn') return `Click to sit down (${copy.title} has no manual)`;
    return this.household.hasRead(copy.platform, copy.id) ? `Click to sit down (you know ${copy.title}'s manual by heart)` : `Click to sit and read ${copy.title}'s manual`;
  }

  /** Reads `game`'s manual in the chair: the platform's know-how grows. */
  readManual(game: Game): Outcome {
    const copy = this.owned(game);
    if (!copy || copy.condition === 'noManual' || copy.condition === 'worn') return no('');
    const platform = getPlatform(copy.platform).shortName;
    if (this.household.hasRead(copy.platform, copy.id)) return no(`You know ${copy.title}'s manual by heart.`);
    const n = this.household.read(copy.platform, copy.id);
    const { eye, respect } = HOUSEHOLD.knowHow;
    const level = knowHowOf(n);
    const next = level === 'none' ? `${eye - n} more and you will spot a fake ${platform} print at a glance.`
      : level === 'eye' ? (n === eye ? `You now spot a fake ${platform} print at a glance. ${respect - n} more and the stallholders will notice.` : `${respect - n} more and the ${platform} stallholders will notice.`)
      : n === respect ? `The ${platform} stallholders will hear it in how you talk: they go easier on you now.` : `You know the ${platform} like few do.`;
    return yes(`You leaf through ${copy.title}'s manual: the controls, the lore, the ads at the back.\n${platform} know-how: ${n} manual${n === 1 ? '' : 's'} read. ${next}`);
  }

  /** On waking: the night's dream, if it brought one (once a market day, of the morning's stock). */
  async dream(): Promise<Dream | null> {
    const { todays } = this.deps;
    if (!todays || !this.household.once('dream')) return null;
    return dreamOf(this.household.today, await todays());
  }

  /** Whether the market answers the phone now. */
  get marketOpen(): boolean {
    return this.deps.marketOpen();
  }
}
