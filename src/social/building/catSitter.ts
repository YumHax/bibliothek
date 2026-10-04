import { has } from '../perks';
import { BUILDING_PERKS } from './buildingPerksPlan';
import type { PerkDeps } from './perkDeps';
import { doneOn, markDay } from './perkState';

/*
 * The Moreaus' cat sitting (docs/social.md "The building's perks", docs/cat.md): friends with them and trusted
 * (`catSitter`), when the player has been out of the flat a long while and the cat's bowl runs low, they come up with
 * the spare key and fill it, and leave a note under the door. Once a game day, only for an adopted cat.
 */

/** What the cat sitting needs of the flat: the cat's bowl and name, whether it lives here. */
export interface CatSitting {
  bowl: { readonly level: number; refill(): void };
  adopted(): boolean;
  catName(): string;
}

const C = BUILDING_PERKS.catSitter;

/** Follows the player in and out of the flat: `away(inFlat)` on every change of zone. */
export function catSitter(deps: PerkDeps, cat: CatSitting): (inFlat: boolean) => void {
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
    if (left === null || now() - left < C.awayHours || !cat.adopted() || cat.bowl.level >= C.below) return;
    if (!has('moreau', 'catSitter') || doneOn('cat-sitter', day)) return;
    markDay('cat-sitter', day);
    cat.bowl.refill();
    const time = `${(Math.floor(deps.hour()) + 23) % 24}:00`;
    deps.slipNote({ ...C.note, lines: C.note.lines.map((l) => l.replace('{cat}', cat.catName()).replace('{time}', time)) });
  };
}
