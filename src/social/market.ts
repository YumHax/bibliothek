import type { PlatformId } from '@/catalog/types';
import { PLATFORM_LIST } from '@/catalog/platforms';
import type { NoticeActions } from '@/notices';
import { KEYS, PersistedStore } from '@/persistence';
import { addExtras } from './extras';
import { shortName } from './people';
import { effectValue, has } from './perks';
import { countedToday, isMet, meet, nudge, tier } from './standing';
import { atLeast } from './tiers';
import type { PersonId } from './types';
import { formatCoins } from '@/text/money';

/*
 * The flea market's stallholders as people (docs/social.md "The market"): what buying, holding and insulting do to
 * the standing with a stall's holder, how their tier reaches the market's own rules (`MarketStock`: the haggle's
 * loyalty, the copy kept aside, a refusal to haggle, the showpiece kept back, a dearer tag), the morning call when a
 * wished-for game comes in, and credit from a close one. `MarketStanding` keeps its own loyalty count; the market
 * reads whichever of the two is warmer.
 */

/** What the market does to a stallholder's standing, and what their credit is. */
const MARKET_SOCIAL = {
  /** A copy bought at their stall: this much, the first `perDay` copies of a game day. */
  buy: { warmth: 3, trust: 1, perDay: 3 },
  /** A held copy collected (the deposit honoured). */
  holdCollected: { warmth: 1, trust: 3 },
  /** Each insulting offer in a haggle. */
  insult: { warmth: -7, trust: -2 },
  /** Credit from a close stallholder: how much, the trust it needs, what paying late costs (once a day it is late). */
  credit: { coins: 50, lateWarmth: -10, lateTrust: -15, repaidTrust: 4 },
  /** A save that knew the stall before: warmth and trust per copy bought there, capped. */
  seed: { warmthPerBuy: 4, trustPerBuy: 3, maxWarmth: 60, maxTrust: 45 },
} as const;

/** The person behind `platform`'s stall. */
export function stallPerson(platform: PlatformId): PersonId {
  return `stall-${platform}`;
}

/** The loyalty (0..3) the stallholder's tier is worth: friendly 1, friend 2, close 3. */
function socialLoyalty(platform: PlatformId): number {
  const t = tier(stallPerson(platform));
  return atLeast(t, 'close') ? 3 : atLeast(t, 'friend') ? 2 : atLeast(t, 'friendly') ? 1 : 0;
}

/** The loyalty the market uses at `platform`'s stall: the warmer of the copies counted (`MarketStanding`) and the tier. */
export function stallLoyalty(platform: PlatformId, counted: number): number {
  return Math.max(counted, socialLoyalty(platform));
}

/** A cold stallholder won't haggle with the player. */
export function refusesHaggle(platform: PlatformId): boolean {
  return has(stallPerson(platform), 'noHaggle');
}

/** A hostile stallholder keeps the showpiece out of the player's sight. */
export function hidesShowpiece(platform: PlatformId): boolean {
  return has(stallPerson(platform), 'hidesBest');
}

/** The factor on the tags at `platform`'s stall for this player (1, or a hostile holder's markup). */
export function stallMarkup(platform: PlatformId): number {
  return effectValue(stallPerson(platform), 'markup', 1);
}

/** What a cold stallholder says to a haggle. */
export function noHaggleLine(price: number): string {
  return `Not with you. ${formatCoins(price)}, like the tag says.`;
}

/** A copy bought at `platform`'s stall on `day` (the first few of a day count); a held one collected counts for trust. */
export function boughtAtStall(platform: PlatformId, day: number, wasHeld: boolean): void {
  const id = stallPerson(platform);
  meet(id, day);
  const { buy } = MARKET_SOCIAL;
  for (let n = 1; n <= buy.perDay; n++) {
    if (countedToday(id, `buy${n}`, day)) continue;
    nudge(id, { warmth: buy.warmth, trust: buy.trust, reason: `buy${n}`, day, why: 'a good customer' });
    break;
  }
  if (wasHeld) nudge(id, { warmth: MARKET_SOCIAL.holdCollected.warmth, trust: MARKET_SOCIAL.holdCollected.trust, day, why: 'came back for the copy held' });
}

/** `insults` insulting offers in a haggle at `platform`'s stall: warmth and trust lost, remembered, passed round the hall. */
export function insultedAtStall(platform: PlatformId, day: number, insults: number): void {
  if (insults <= 0) return;
  const { insult } = MARKET_SOCIAL;
  nudge(stallPerson(platform), {
    warmth: insult.warmth * insults,
    trust: insult.trust * insults,
    day,
    why: insults > 1 ? 'insulted by your offers' : 'insulted by your offer',
    memory: 'you lowballed me',
    memoryWeight: insult.warmth * insults,
    gossip: true,
  });
}

/** A save from before the social layer: whoever the player bought from already knows them, warmed by the copies counted. */
function seedStallsFromLoyalty(buysAt: (platform: PlatformId) => number, day: number): void {
  const { seed } = MARKET_SOCIAL;
  for (const platform of PLATFORM_LIST) {
    const id = stallPerson(platform.id);
    const buys = buysAt(platform.id);
    if (buys <= 0 || isMet(id)) continue;
    meet(id, day);
    nudge(id, { warmth: Math.min(seed.maxWarmth, buys * seed.warmthPerBuy), trust: Math.min(seed.maxTrust, buys * seed.trustPerBuy), day, why: 'remembers your custom' });
  }
}

// --- Credit -----------------------------------------------------------------------------------------------------

interface Owed {
  person: PersonId;
  coins: number;
  /** The game day it is due (the next market day). */
  due: number;
}

let creditStore: PersistedStore<{ owed: Owed[] }> | null = null;
let credit: { owed: Owed[] } | null = null;

function owedState(): { owed: Owed[] } {
  if (credit) return credit;
  creditStore = new PersistedStore<{ owed: Owed[] }>({
    key: KEYS.marketCredit,
    version: 1,
    defaults: () => ({ owed: [] }),
    read: (data) => {
      const raw = (data as { owed?: unknown } | null)?.owed;
      if (!Array.isArray(raw)) return null;
      return { owed: raw.filter((o): o is Owed => !!o && typeof o.person === 'string' && typeof o.coins === 'number' && typeof o.due === 'number') };
    },
  });
  credit = creditStore.load();
  return credit;
}

function saveCredit(): void {
  creditStore?.save(owedState());
}

/** What the player owes `id`, or null. */
function owedTo(id: PersonId): Owed | null {
  return owedState().owed.find((o) => o.person === id) ?? null;
}

/** The wallet as credit uses it. */
interface CreditWallet {
  readonly coins: number;
  spend(coins: number): boolean;
  earnCoins(coins: number): void;
}

/**
 * The debts due by `day` are paid out of the wallet: paid, a little trust; short, the stallholder is let down (once a
 * game day) and the debt stays until it is paid.
 */
function settleCredit(day: number, wallet: CreditWallet, notices: Pick<NoticeActions, 'slip' | 'read'>): void {
  const state = owedState();
  for (const debt of [...state.owed]) {
    if (debt.due > day) continue;
    const name = shortName(debt.person);
    if (wallet.spend(debt.coins)) {
      state.owed = state.owed.filter((o) => o !== debt);
      saveCredit();
      nudge(debt.person, { trust: MARKET_SOCIAL.credit.repaidTrust, day, reason: 'creditRepaid', why: 'paid back on time', memory: 'you paid me back', memoryWeight: 4 });
      notices.slip({ title: `Paid ${name} back`, detail: 'The market credit is settled.', coins: -debt.coins });
      continue;
    }
    const counted = nudge(debt.person, {
      warmth: MARKET_SOCIAL.credit.lateWarmth,
      trust: MARKET_SOCIAL.credit.lateTrust,
      reason: 'creditLate',
      day,
      why: 'not paid back',
      memory: 'you didn’t pay me back',
      gossip: true,
    });
    if (counted) notices.read({ title: `${name} is waiting`, text: `You owe ${name} ${formatCoins(debt.coins)} from the market, and your wallet can’t cover it.`, effect: 'It is taken as soon as you have the coins. Until then, they are not pleased.', look: 'note' });
  }
}

/**
 * The market's side of the conversation with a stallholder (`addExtras`): credit asked from a close one, a debt paid
 * back by hand. The morning call when a wished-for game is on a friend's stall. Wired once at boot.
 */
export function startMarketSocial(deps: {
  wallet: CreditWallet;
  notices: Pick<NoticeActions, 'slip' | 'read' | 'say' | 'refuse'>;
  /** The game day today, and a hook on each new one. */
  today: { readonly gameDay: number; onNewGameDay(cb: (day: number) => void): () => void };
  /** Today's copies on the stalls (drawn on asking). */
  todays(): Promise<readonly { readonly game: { readonly id: string; readonly title: string; readonly platform: PlatformId }; readonly source: string }[]>;
  wanted(gameId: string): boolean;
  /** Copies bought per stall before the social layer (`MarketStanding.buysAt`). */
  buysAt(platform: PlatformId): number;
}): void {
  const { wallet, notices, today } = deps;
  seedStallsFromLoyalty(deps.buysAt, today.gameDay);
  const morning = (day: number): void => {
    settleCredit(day, wallet, notices);
    void deps.todays().then((items) => {
      for (const platform of PLATFORM_LIST) {
        const id = stallPerson(platform.id);
        if (!has(id, 'wishlistCall') || countedToday(id, 'wishCall', day)) continue;
        const find = items.find((item) => item.game.platform === platform.id && deps.wanted(item.game.id));
        if (!find) continue;
        nudge(id, { reason: 'wishCall', day });
        notices.say(`Morning! ${shortName(id)} from the market. I’ve got ${find.game.title} on my table today. I’ll keep an eye on it for you.`, `${shortName(id)} (on the phone)`);
      }
    }, () => undefined);
  };
  morning(today.gameDay);
  today.onNewGameDay(morning);

  addExtras(({ person, day }) => {
    if (!person.startsWith('stall-')) return [];
    const name = shortName(person);
    const owed = owedTo(person);
    if (owed) {
      return [{
        id: 'payCredit',
        group: 'trade',
        label: `Pay back the ${formatCoins(owed.coins)} I owe`,
        disabled: () => (wallet.coins < owed.coins ? `You have ${formatCoins(wallet.coins)}` : null),
        run: () => {
          if (!wallet.spend(owed.coins)) return { line: 'When you can, then.' };
          const state = owedState();
          state.owed = state.owed.filter((o) => o.person !== person);
          saveCredit();
          // Once a day: borrowing and paying straight back is not a way to buy trust.
          nudge(person, { trust: MARKET_SOCIAL.credit.repaidTrust + (owed.due > day ? 2 : 0), day, reason: 'creditRepaid', why: 'paid back', memory: 'you paid me back', memoryWeight: 4 });
          notices.slip({ title: `Paid ${name} back`, coins: -owed.coins });
          return { line: owed.due > day ? 'Already? You’re a good one.' : 'There we are. Square again.' };
        },
      }];
    }
    if (!has(person, 'credit')) return [];
    const coins = MARKET_SOCIAL.credit.coins;
    return [{
      id: 'askCredit',
      group: 'ask',
      label: `Ask for credit (${formatCoins(coins)})`,
      run: () => {
        wallet.earnCoins(coins);
        const state = owedState();
        state.owed.push({ person, coins, due: day + 1 });
        saveCredit();
        notices.slip({ title: `Credit from ${name}`, detail: 'Out of your wallet next market day.', coins });
        return { line: 'For you? Of course. Next market day, mind.' };
      },
    }];
  });
}
