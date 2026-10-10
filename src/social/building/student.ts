import { HOMEBREW_CARTS } from '@/emulator/homebrew';
import { addExtras } from '../extras';
import { has } from '../perks';
import { nudge } from '../standing';
import type { TalkExtra } from '../talk';
import { BUILDING_PERKS } from './buildingPerksPlan';
import type { PerkDeps } from './perkDeps';
import { given, markGiven } from './perkState';

/*
 * Théo's perks (docs/social.md "The building's perks"): his soldering iron and his eye at the kitchen table's repair
 * at Friend (`repairHint`: the repair panel names the faulty part and the tool), a homebrew cartridge burned for the
 * player at Close (a real one: `emulator/homebrew`, it plays in the NES). Cross with the player, his music comes
 * through the ceiling every night, louder (`building/neighbourNoisePlan`, `needs: loudMusic`).
 */

const S = BUILDING_PERKS.student;

/** What the repair panel's step says when Théo helps: the part to look at, the tool to take; null without his help. */
export function repairHint(step: 'find' | 'tool', name: string): string | null {
  if (!has('student', 'repairBonus')) return null;
  return step === 'find' ? S.repairFind.replace('{part}', name) : S.repairTool.replace('{tool}', name);
}

export function wireStudent(deps: PerkDeps): void {
  addExtras(({ person, day }) => {
    if (person !== 'student' || !has('student', 'homebrewCart') || given('student-homebrew')) return [];
    const extra: TalkExtra = {
      id: 'student-homebrew',
      group: 'ask',
      label: 'Ask about his cartridges',
      run: () => {
        markGiven('student-homebrew');
        const cart = HOMEBREW_CARTS.find((c) => !deps.collection.has(c.game.id));
        if (!cart) return { line: S.homebrewNone };
        deps.collection.add({ ...cart.game, status: 'owned', acquired: { price: 0, where: 'a gift from Théo', day } });
        nudge('student', { warmth: 4, trust: 4, day, memory: `I burned you ${cart.game.title}`, memoryWeight: 12 });
        deps.notices.reward({ title: `A homebrew cart: ${cart.game.title}`, detail: 'Burned by Théo upstairs; it plays in the NES. In the parcel in the hall.', big: true });
        return { line: S.homebrew };
      },
    };
    return [extra];
  });
}
