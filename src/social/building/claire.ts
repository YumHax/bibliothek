import { estatePhase, estateStart } from '@/building/estateSale';
import { ESTATE_SALE } from '@/economy/pricing';
import { has } from '../perks';
import { BUILDING_PERKS } from './buildingPerksPlan';
import { giveGames, yearOf, type PerkDeps } from './perkDeps';
import { given, markGiven } from './perkState';

/*
 * Claire comes back (docs/social.md "The building's perks"): got on with at the estate sale (`claireReturns`), a few
 * game days after it she slips a note under the door and leaves one of her uncle Henri's games, kept back from the
 * tables for the player. Once.
 */

const C = BUILDING_PERKS.claire;

/** Checks on a new game day (and at start-up) whether Claire's game is due. */
export function claireReturns(deps: PerkDeps): void {
  const day = deps.day();
  if (given('claire-returns') || !has('claire', 'claireReturns') || estatePhase(day) !== 'over') return;
  const start = estateStart(day);
  if (start === null || day < start + ESTATE_SALE.days + C.afterDays) return;
  markGiven('claire-returns');
  const [from, to] = C.years;
  const games = giveGames(deps, 'claire-returns', 1, 'a gift from Claire Lambert', (g) => {
    const y = yearOf(g);
    return y !== null && y >= from && y <= to;
  });
  if (!games.length) return;
  deps.slipNote(C.note);
  deps.notices.reward({ title: `From Claire: ${games[0]!.title}`, detail: 'One of her uncle Henri’s, kept back from the sale. In the parcel in the hall.' });
}
