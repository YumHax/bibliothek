import { mainsOn } from '@/building/mains';
import { addExtras } from '../extras';
import { has } from '../perks';
import { nudge, tier } from '../standing';
import type { TalkExtra } from '../talk';
import { atLeast } from '../tiers';
import { BUILDING_PERKS } from './buildingPerksPlan';
import { giveGames, type PerkDeps } from './perkDeps';
import { doneOn, given, markDay, markGiven, setStep, step } from './perkState';
import { random } from '@/random';
import { formatCoins } from '@/text/money';

/*
 * Mr Martin's perks (docs/social.md "The building's perks"): his late brother's cartridges, a two-step arc (asked
 * about at Friend, opened together at Close with his trust: Gilles's NES carts, kept together), and a seat at the
 * card table in a power cut once he is Friendly (a hand for a couple of coins).
 */

const M = BUILDING_PERKS.martin;

export function wireMartin(deps: PerkDeps): void {
  addExtras(({ person, day }) => {
    if (person !== 'martin') return [];
    const extras: TalkExtra[] = [];
    const t = tier('martin');
    if (!given('martin-carts') && atLeast(t, 'friend')) {
      const asked = step('martin-carts') >= 1;
      extras.push({
        id: 'martin-carts',
        group: 'ask',
        label: asked ? 'Open Gilles’s box with him' : 'Ask about his brother’s cartridges',
        disabled: () => (!asked ? null : doneOn('martin-carts-asked', day) ? 'Give him a day' : !has('martin', 'brotherCarts') ? 'He isn’t ready: when you are close and he trusts you' : null),
        run: () => {
          if (!asked) {
            setStep('martin-carts', 1);
            markDay('martin-carts-asked', day);
            nudge('martin', { trust: 3, day, why: 'touched you asked about Gilles', memory: 'you asked about Gilles', memoryWeight: 10 });
            return { line: M.ask };
          }
          markGiven('martin-carts');
          const games = giveGames(deps, 'martin-carts', M.carts.games, M.carts.where, (g) => g.platform === M.carts.platform);
          nudge('martin', { warmth: 8, trust: 6, day, why: 'opened the box together', memory: 'you opened Gilles’s box with me', memoryWeight: 20 });
          if (games.length) deps.notices.reward({ title: `Gilles’s cartridges: ${games.length} games`, detail: `${games.map((g) => g.title).join(', ')}. To keep together. In the parcel in the hall.`, big: true });
          return { line: M.open };
        },
      });
    }
    // A power cut: the card table in the hall by candlelight.
    if (!mainsOn() && has('martin', 'cardsInvite')) {
      extras.push({
        id: 'martin-cards',
        group: 'invite',
        label: `Sit in at cards (${formatCoins(M.cards.stake)})`,
        disabled: () => (doneOn('martin-cards', day) ? 'One hand a night' : deps.wallet.coins < M.cards.stake ? `${formatCoins(M.cards.stake)} to play` : null),
        run: () => {
          if (!deps.wallet.spend(M.cards.stake)) return { line: 'Next time, then.' };
          markDay('martin-cards', day);
          nudge('martin', { warmth: M.cards.warmth, reason: 'cards', day, why: 'enjoyed the hand of cards' });
          if (random() < M.cards.odds) {
            deps.wallet.earnCoins(M.cards.win);
            deps.notices.reward({ title: 'Won the hand', detail: 'Belote by candlelight.', coins: M.cards.win - M.cards.stake });
            return { line: M.cards.lines.win };
          }
          return { line: M.cards.lines.lose };
        },
      });
    }
    return extras;
  });
}
