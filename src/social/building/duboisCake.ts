import { pocket } from '@/errands/pocket';
import { has } from '../perks';
import { BUILDING_PERKS } from './buildingPerksPlan';
import type { PerkDeps } from './perkDeps';
import { setStep, step } from './perkState';

/*
 * Mrs Dubois' slice of cake (docs/social.md "The building's perks"): a friend of hers and trusted (`leavesCake`),
 * when the player comes home after a long while out, every few game days, there is a slice of her lemon cake on the
 * mat and her note: a real slice, in the pocket, to eat with a visitor or give away.
 */

const C = BUILDING_PERKS.duboisCake;
/** The pocket holds this many slices at most. */
const MAX_SLICES = 3;
/** The perk state's key: the game day of her last slice (`perkState.step`). */
const LAST = 'dubois-cake';

/** Follows the player in and out of the flat: `away(inFlat)` on every change of zone. */
export function duboisCake(deps: PerkDeps): (inFlat: boolean) => void {
  let leftAt: number | null = null;
  const now = (): number => deps.day() * 24 + deps.hour();
  return (inFlat) => {
    if (!inFlat) {
      leftAt ??= now();
      return;
    }
    const left = leftAt;
    leftAt = null;
    const day = deps.day();
    if (left === null || now() - left < C.awayHours || !has('dubois', 'leavesCake')) return;
    const last = step(LAST);
    if (last > 0 && day - last < C.everyDays) return;
    setStep(LAST, Math.max(1, day));
    pocket.add('cake', 1, MAX_SLICES);
    deps.slipNote(C.note);
  };
}
