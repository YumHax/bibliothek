import type { Game } from '@/catalog/types';
import { inHours } from '@/time/clock';
import { getPlatform } from '@/catalog/platforms';
import type { Household } from './Household';
import { HOUSEHOLD } from './rules';
import { drawCatGift } from './catGift';
import { drawDailyFind, drawLeftover, type LaidFind } from './rummage';
import { FELIX_NOTEBOOK, FIND_TITLES, TENANT_NOTE, holdsPaper } from './rummageLines';
import { morningChronicle } from './chronicle';
import { knowHowOf } from './perks';
import { dreamOf, type Dream } from './dreams';
import type { StockItem } from '@/economy/StockItem';
import { formatCount } from '@/text/count';
import { formatCoins } from '@/text/money';

interface HomeLifeDeps {
  household: Household;
  /** The collection: a copy cleaned, a sticker peeled, a booklet found change it in place. */
  collection: { find(id: string): Game | undefined; update(id: string, patch: Partial<Omit<Game, 'id'>>): void; owns(id: string): boolean };
  /** What is on the shelves (the cat finds the booklet of one of these). */
  shelved: { readonly games: readonly Game[] };
  /** Coins the cat turned up; coins and tickets found in a cupboard. */
  purse: { earnCoins(coins: number): void; addTickets(tickets: number): void };
  /** The game's clock, hours. */
  hours: () => number;
  /** Whether the flea market keeps its doors open right now (RETRO GAMES' hours). */
  marketOpen: () => boolean;
  /** The market's stock today (owned copies left out): what a night's dream is of. */
  todays?: () => Promise<readonly StockItem[]>;
  /** The day's journal: what got done at home (a box cleaned, a cake baked, what the cat turned up), as small things. */
  journal?: { note(kind: string, text: string, options?: { weight?: 'note' }): void };
  /** Uncle Félix's notebook (`story/FelixNotebook`): it lies at the back of the first drawer opened from `NOTEBOOK_FROM_DAY`. */
  notebook?: { readonly found: boolean; find(day: number): void };
}

/** Uncle Félix's notebook waits in the flat's drawers from this market day (the first day has its own list to follow). */
const NOTEBOOK_FROM_DAY = 2;

/** A thing to do, and what came of it: a line for the toast, and whether anything happened. */
export interface Outcome {
  done: boolean;
  line: string;
}

/** What was picked up from a door or drawer, pocketed already: the slip's lines and chips, whether it was paper, and the last tenant's note with their first leftover. */
interface Find {
  title: string;
  detail?: string;
  coins?: number;
  tickets?: number;
  paper: boolean;
  /** Worth a banner (a manual that completes a copy); else a slip under the crosshair. */
  notable?: boolean;
  note?: { title: string; text: string };
}

/** A door or drawer of the flat (`world/build/rummage`): its key in the save, what it is called, and what kind it is. */
interface RummageSpot {
  key: string;
  noun: string;
  /** One of the flat's own fittings (it held what the last tenant left), not bought furniture. */
  fitted: boolean;
  /** A drawer: where a lost booklet may turn up. */
  drawer: boolean;
}

const no = (line: string): Outcome => ({ done: false, line });
const yes = (line: string): Outcome => ({ done: true, line });

/**
 * What the flat's rooms are for, as rules (docs/household.md): the furniture's clicks call these,
 * which check, change the stores and say what happened. Nothing here ever costs the player
 * anything they had.
 */
export class HomeLife {
  /** The bedside alarm clock's ring, set by the bedroom's builder once the clock stands (`setAlarmRinger`). */
  private alarmRinger: (() => void) | null = null;
  /** Whether the kitchen has its table (where the kit is used and a cake cools), set by the kitchen's builder; yes until then. */
  private kitchenTable: () => boolean = () => true;

  constructor(private readonly deps: HomeLifeDeps) {}

  /** The kitchen's builder says whether its table is bought (`isOwned`, readable with the kitchen unloaded). */
  setKitchenTable(owned: () => boolean): void {
    this.kitchenTable = owned;
  }

  get household(): Household {
    return this.deps.household;
  }

  /** A line in the day's journal (kind `home`): a chore done, one of the small things of the day. */
  private log(text: string): void {
    this.deps.journal?.note('home', text, { weight: 'note' });
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
    if (!this.kitchenTable()) return no('The kit stays in the cabinet for now: it wants a table in good light.\nSECOND HOME, on Front Street, sells a kitchen table.');
    this.household.takeKit();
    return yes('You take the cleaning kit: cotton buds, isopropyl, a soft cloth.\nIt goes on the kitchen table, where the light is good. Bring a worn box there.');
  }

  /** What the hair dryer would do for `game` in hand, for its caption. */
  stickerLabel(game: Game | null): string {
    if (!game) return 'Hair dryer · warm air lifts old price stickers';
    return this.owned(game)?.sticker ? `Hair dryer · peel the sticker off ${game.title}` : `Hair dryer · no sticker on ${game.title}`;
  }

  /** Why the hair dryer cannot help with `game` (a refusal), or null when it can. */
  mayPeel(game: Game): Outcome | null {
    const copy = this.owned(game);
    if (!copy) return no('Only your own boxes, at home.');
    if (!copy.sticker) return no(`No sticker on ${copy.title}.`);
    return null;
  }

  /** Warm air on `game`'s old price sticker, peeled off whole. `before` runs just before the copy changes (the box put down). */
  peelSticker(game: Game, before?: () => void): Outcome {
    const refusal = this.mayPeel(game);
    if (refusal) return refusal;
    const copy = this.owned(game)!;
    before?.();
    this.deps.collection.update(copy.id, { sticker: undefined });
    this.log(`Peeled the old price sticker off ${copy.title}`);
    return yes(`A minute of warm air and the old price sticker lifts off in one piece.\n${copy.title} is worth its full price again.`);
  }

  /** The bath is full: a long soak. */
  soak(): Outcome {
    if (!this.household.soak()) return no('You are as relaxed as you are going to get.');
    this.log('A long hot soak in the bath');
    return yes('You sink into the hot water and let the day go…\nUnhurried: the next stallholder you haggle with will hear one more offer.');
  }

  // --- the kitchen -------------------------------------------------------------------------------

  /** What the kit on the table would do for `game` in hand, for its caption. */
  cleanLabel(game: Game | null): string {
    if (!game) return 'Cleaning kit · bring a worn box here to clean it up';
    const copy = this.owned(game);
    if (!copy) return 'Cleaning kit';
    if (copy.condition !== 'worn') return `Cleaning kit · ${copy.title} is in good shape`;
    if (this.household.restoresLeft <= 0) return 'Cleaning kit · one careful job, then sleep on it';
    return `Cleaning kit · clean up ${copy.title}`;
  }

  /** Why the kit cannot clean `game` (a refusal), or null when it can. */
  mayClean(game: Game): Outcome | null {
    const copy = this.owned(game);
    if (!copy) return no('Only your own boxes, at home.');
    if (copy.condition !== 'worn') return no(`${copy.title} does not need it.`);
    if (this.household.restoresLeft <= 0) return no('That is enough fiddly work for now. After a good night’s sleep.');
    return null;
  }

  /**
   * Cleans a worn copy: the dull cover comes up bright (it reads as a copy without its manual from now on).
   * `before` runs just before the copy changes (the box put down: its shelf rebuilds it).
   */
  cleanBox(game: Game, before?: () => void): Outcome {
    const refusal = this.mayClean(game);
    if (refusal) return refusal;
    const copy = this.owned(game)!;
    before?.();
    this.household.markRestored();
    this.deps.collection.update(copy.id, { condition: 'noManual', restored: true });
    this.log(`Cleaned up ${copy.title}’s box`);
    return yes(`An hour with cotton buds and isopropyl: the grime comes off and the cover comes up bright.\n${copy.title} is a tidy copy now (still no manual). The collector’s book counts it at its new worth.`);
  }

  get bakeLabel(): string {
    if (!this.kitchenTable()) return 'Mixing bowl, nowhere to cool a cake yet · look';
    return this.household.cakeOut ? 'Mixing bowl · a cake is out already' : 'Mixing bowl · bake a cake (for when friends drop by)';
  }

  /** Why no cake can be baked now (a refusal), or null. */
  mayBake(): Outcome | null {
    if (!this.kitchenTable()) return no('Nowhere to let a cake cool: the kitchen has no table yet.\nSECOND HOME, on Front Street, sells one.');
    return this.household.cakeOut ? no('There is still cake on the table.') : null;
  }

  bake(): Outcome {
    if (!this.household.bake()) return no('There is still cake on the table.');
    this.log('Baked a sponge cake');
    return yes('Flour, eggs, butter, forty minutes in the oven: a sponge cake cools on the table.\nA friend who drops by in the next day or so will stay longer, and be grateful.');
  }

  get treatLabel(): string {
    return this.household.treatedToday ? 'Treat jar · one a night, or the cat gets round' : 'Treat jar · give the cat a treat';
  }

  /**
   * A treat for the cat (it comes running); tomorrow, perhaps, it leaves something by its bowl. A cat that
   * does not come (asleep, mid-leap) gets none: the day's treat stays in the jar for later.
   */
  giveTreat(callCat?: () => { came: boolean; line: string }): Outcome {
    if (this.household.treatedToday) return no('One a night. Look at that face, though.');
    const call = callCat?.();
    if (call && !call.came) return no(`You shake the jar.\n${call.line}`);
    this.household.giveTreat(drawCatGift(this.household.today, this.deps.shelved.games));
    return yes(`You shake the jar.${call ? `\n${call.line}` : ''}`);
  }

  get giftLabel(): string | null {
    const gift = this.household.gift;
    if (!gift) return null;
    return gift.kind === 'coins' ? 'Coins the cat left · pick up' : 'A booklet the cat dragged out · pick up';
  }

  /** What the cat left by its bowl, picked up. */
  takeGift(catName: string): Outcome {
    const gift = this.household.takeGift();
    if (!gift) return no('Nothing there.');
    if (gift.kind === 'coins') {
      this.deps.purse.earnCoins(gift.coins);
      this.log(`${catName} turned up ${formatCoins(gift.coins)}`);
      return yes(`${formatCoins(gift.coins)}, ${catName} fished out from ${pickPlace(gift.coins, COIN_PLACES)}. Good cat.`);
    }
    const copy = this.deps.collection.find(gift.gameId);
    if (!copy || copy.condition !== 'noManual') return yes(`An old booklet… for ${gift.title}, which you no longer have. ${catName} looks proud anyway.`);
    this.deps.collection.update(copy.id, { condition: 'complete' });
    this.log(`${catName} found the manual of ${copy.title}`);
    return yes(`The manual of ${copy.title}! It was ${pickPlace(copy.title.length, BOOKLET_PLACES)} all along. ${catName} looks very pleased.\nThe copy is complete again.`);
  }

  // --- the doors and drawers ------------------------------------------------------------------

  /**
   * What lies in a door or drawer of the flat right now, nothing taken (`world/build/rummage` lays it there to be
   * picked up): the last tenant's leftover while it is there (with their note beside the first), else today's find
   * if it holds one and it was not taken yet; null when it holds nothing.
   */
  peekFind(spot: RummageSpot): LaidFind | null {
    const { household } = this;
    const { notebook } = this.deps;
    if (notebook && !notebook.found && spot.fitted && spot.drawer && holdsPaper(spot.noun) && household.today >= NOTEBOOK_FROM_DAY) {
      return { find: { kind: 'notebook', title: FELIX_NOTEBOOK.title }, leftover: false, note: false };
    }
    if (spot.fitted && household.hasLeftover(spot.key)) {
      return { find: drawLeftover(spot.key, holdsPaper(spot.noun)), leftover: true, note: !household.leftoverFound };
    }
    if (household.rummagedToday(spot.key)) return null;
    const find = drawDailyFind(spot.key, household.rest, { drawer: spot.drawer, paper: holdsPaper(spot.noun) }, this.deps.shelved.games);
    return find && { find, leftover: false, note: false };
  }

  /**
   * Picks up what `spot` holds (what `peekFind` says is there): the coins and tickets go in the wallet, a booklet
   * completes its copy, and the spot is empty till its next find. Returns the lines saying so, or null when nothing
   * is there any more. The journal counts the money with the rest of the day's, so only a booklet gets a line.
   */
  takeFind(spot: RummageSpot): Find | null {
    const laid = this.peekFind(spot);
    if (!laid) return null;
    const { household } = this;
    const { find, leftover } = laid;
    // The day's find waits for the next opening after a leftover: one surprise at a time.
    if (leftover) household.takeLeftover(spot.key);
    else household.markRummaged(spot.key);
    if (find.kind === 'notebook') {
      this.deps.notebook?.find(household.today);
      this.log('Found uncle Félix’s notebook');
      return { title: FELIX_NOTEBOOK.title, detail: FELIX_NOTEBOOK.detail, paper: true, notable: true, note: { ...FELIX_NOTEBOOK.page } };
    }
    if (find.kind === 'manual') {
      const title = FIND_TITLES.manual;
      const copy = this.deps.collection.find(find.gameId);
      if (!copy || copy.condition !== 'noManual') return { title, detail: `The booklet of ${find.title}. You no longer have the game.`, paper: true };
      this.deps.collection.update(copy.id, { condition: 'complete' });
      this.log(`Found the manual of ${copy.title} in the ${spot.noun}`);
      return { title, detail: `The manual of ${copy.title}: the copy is complete again.`, paper: true, notable: true };
    }
    const detail = leftover ? { detail: FIND_TITLES.leftover } : {};
    const note = laid.note ? { note: { ...TENANT_NOTE } } : {};
    if (find.kind === 'coins') {
      this.deps.purse.earnCoins(find.coins);
      return { title: find.coins === 1 ? FIND_TITLES.coin : FIND_TITLES.coins, ...detail, coins: find.coins, paper: false, ...note };
    }
    this.deps.purse.addTickets(find.tickets);
    return { title: FIND_TITLES.tickets, ...detail, tickets: find.tickets, paper: true, ...note };
  }

  /** Radio Brocante's chronicle is on the air and not heard yet today (the radio's caption says so). */
  get chronicleDue(): boolean {
    const hours = this.deps.hours();
    return inHours(hours, [HOUSEHOLD.radio.from, HOUSEHOLD.radio.until]) && !this.household.doneToday('radio');
  }

  /** The radio switched on: Radio Brocante's chronicle, once a market day in the morning; null otherwise. */
  chronicle(): string[] | null {
    const hours = this.deps.hours();
    if (!inHours(hours, [HOUSEHOLD.radio.from, HOUSEHOLD.radio.until]) || !this.household.once('radio')) return null;
    return morningChronicle(this.household.today, (id) => this.deps.collection.owns(id));
  }

  // --- the bedroom -------------------------------------------------------------------------------

  /** What the reading chair would do with `game` in hand, for its caption. */
  readLabel(game: Game): string {
    const copy = this.owned(game);
    if (!copy) return 'Chair · sit';
    if (copy.condition === 'noManual' || copy.condition === 'worn') return `Chair · sit (${copy.title} has no manual)`;
    return this.household.hasRead(copy.platform, copy.id) ? `Chair · sit (you know ${copy.title}'s manual by heart)` : `Chair · sit and read ${copy.title}'s manual`;
  }

  /** Reads `game`'s manual in the chair: the platform's know-how grows. */
  readManual(game: Game): Outcome {
    const copy = this.owned(game);
    if (!copy) return no('');
    if (copy.condition === 'noManual' || copy.condition === 'worn') return no('No manual in this one.');
    const platform = getPlatform(copy.platform).shortName;
    if (this.household.hasRead(copy.platform, copy.id)) return no(`You know ${copy.title}'s manual by heart.`);
    const n = this.household.read(copy.platform, copy.id);
    this.log(`Read the manual of ${copy.title}`);
    const { eye, respect } = HOUSEHOLD.knowHow;
    const level = knowHowOf(n);
    const next = level === 'none' ? `${eye - n} more and you will spot a fake ${platform} print at a glance.`
      : level === 'eye' ? (n === eye ? `You now spot a fake ${platform} print at a glance. ${respect - n} more and the stallholders will notice.` : `${respect - n} more and the ${platform} stallholders will notice.`)
      : n === respect ? `The ${platform} stallholders will hear it in how you talk: they go easier on you now.` : `You know the ${platform} like few do.`;
    return yes(`You leaf through ${copy.title}'s manual: the controls, the lore, the ads at the back.\n${platform} know-how: ${formatCount(n, 'manual')} read. ${next}`);
  }

  /** On waking: the night's dream, if it brought one (once a market day, of the morning's stock). */
  async dream(): Promise<Dream | null> {
    const { todays } = this.deps;
    if (!todays || !this.household.once('dream')) return null;
    return dreamOf(this.household.today, await todays());
  }

  /** The bedroom's builder: how the bedside alarm clock rings (null while it does not stand). */
  setAlarmRinger(ring: (() => void) | null): void {
    this.alarmRinger = ring;
  }

  /** The morning after a night's sleep: the alarm clock rings, if there is one. */
  ringAlarm(): void {
    this.alarmRinger?.();
  }

  /** Whether the market answers the phone now. */
  get marketOpen(): boolean {
    return this.deps.marketOpen();
  }
}

/** Where the cat turns things up in this flat (docs/household.md): real places, drawn by a number of the find. */
const COIN_PLACES = ['under the armchair', 'behind the radiator', 'under the bed', 'down the side of the armchair cushion'] as const;
const BOOKLET_PLACES = ['under the bed', 'behind the radiator', 'under the armchair', 'behind the bookcase'] as const;

function pickPlace(n: number, places: readonly string[]): string {
  return places[Math.abs(Math.round(n)) % places.length]!;
}
