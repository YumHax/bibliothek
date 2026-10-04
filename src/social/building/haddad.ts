import { huntFile, huntFound } from '@/building/hunt/BuildingHunt';
import type { Game } from '@/catalog/types';
import { shopPrice } from '@/economy/pricing';
import { gameDayRandom } from '@/time/daily';
import { addExtras } from '../extras';
import { has } from '../perks';
import { nudge } from '../standing';
import type { TalkExtra } from '../talk';
import { BUILDING_PERKS } from './buildingPerksPlan';
import type { PerkDeps } from './perkDeps';
import { doneOn, markDay } from './perkState';
import { formatCoins } from '@/text/money';

/*
 * Mrs Haddad's perks (docs/social.md "The building's perks"): her swaps ask less at Friendly (`swaps.ts`), what she
 * knows of Albert Vasseur at Friend (the sixth floor's next lead, once a day), and at Close a Sega game she found
 * twice, kept aside for the player at what she paid (one a week).
 */

const H = BUILDING_PERKS.haddad;
/** Her find changes every this many game days. */
const FIND_WEEK = 7;

/** This week's find: a Sega game the player has not got, the same all week; null when there is none. */
function findOf(deps: PerkDeps, week: number): { game: Game; price: number } | null {
  const random = gameDayRandom('haddad-find', week);
  const pool = deps.pool.filter((g) => H.finds.platforms.includes(g.platform) && !deps.collection.has(g.id));
  const game = pool[Math.floor(random() * pool.length)];
  return game ? { game, price: Math.max(1, Math.round(shopPrice(game, undefined) * H.finds.share)) } : null;
}

export function wireHaddad(deps: PerkDeps): void {
  addExtras(({ person, day }) => {
    if (person !== 'haddad') return [];
    const extras: TalkExtra[] = [];
    if (has('haddad', 'lore')) {
      extras.push({
        id: 'haddad-lore',
        group: 'ask',
        label: 'Ask about Albert Vasseur',
        disabled: () => (doneOn('haddad-lore', day) ? 'She told you what she knows today' : null),
        run: () => {
          markDay('haddad-lore', day);
          const next = huntFile()?.next;
          if (huntFound('attic')) return { line: H.loreDone };
          return { line: `${H.loreIntro}${next ?? 'He went up past the fifth in the lift. Nobody else could. Ask the old ones, Mrs Roux, Mr Lambert.'}` };
        },
      });
    }
    const week = Math.floor(day / FIND_WEEK);
    if (has('haddad', 'sharesFinds') && !doneOn('haddad-find', week)) {
      const find = findOf(deps, week);
      if (find) {
        extras.push({
          id: 'haddad-find',
          group: 'trade',
          label: `Buy ${find.game.title} (${formatCoins(find.price)})`,
          disabled: () => (deps.wallet.coins < find.price ? `${formatCoins(find.price)}, you have ${deps.wallet.coins}` : null),
          run: () => {
            if (!deps.wallet.spend(find.price)) return {};
            markDay('haddad-find', week);
            deps.collection.add({ ...find.game, status: 'owned', condition: 'noManual', acquired: { price: find.price, where: 'Mrs Haddad (a friend’s price)', day } });
            nudge('haddad', { warmth: 2, trust: 2, day, why: 'glad it went to a good home' });
            deps.notices.reward({ title: `Bought ${find.game.title}`, detail: 'From Mrs Haddad, at what she paid. It waits in your parcel.', coins: -find.price });
            return { line: H.finds.line };
          },
        });
      }
    }
    return extras;
  });
}
