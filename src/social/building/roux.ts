import { huntFile } from '@/building/hunt/BuildingHunt';
import { onRouxPhase } from '@/building/rouxMove';
import { HOME_GOOD_PRICES } from '@/economy/pricing';
import { NEXT_LEADS, type StoryStage } from '@/story/prototype';
import { addExtras } from '../extras';
import type { TalkExtra } from '../talk';
import { effectValue, has } from '../perks';
import { nudge, tier } from '../standing';
import { atLeast } from '../tiers';
import { BUILDING_PERKS } from './buildingPerksPlan';
import { giveGames, yearOf, type PerkDeps } from './perkDeps';
import { doneOn, given, markDay, markGiven, setStep, step } from './perkState';

/*
 * Mrs Roux's perks (docs/social.md "The building's perks"): her stories at Friendly (one a day; every other one a true
 * lead for the sixth floor's hunt or the lost prototype, when one is open), Lucien's box of games at Friend, her flat
 * for less at Close (`annexPrice`), and a parting gift when she moves, by how close you were.
 */

const R = BUILDING_PERKS.roux;

/** What her flat costs the player now: the agency's price, less her discount for a close friend. */
export function annexPrice(): number {
  return Math.round(HOME_GOOD_PRICES.annex * effectValue('roux', 'annexDiscount', 1));
}

/** A lead she can give now (the hunt's next step, else the prototype's), or null. */
function leadNow(stage: StoryStage): string | null {
  const next = huntFile()?.next;
  if (next) return `${R.huntIntro}${next}`;
  const proto = NEXT_LEADS[stage];
  return proto ? `${R.protoIntro}${proto}` : null;
}

export function wireRoux(deps: PerkDeps, story: { readonly stage: StoryStage }): void {
  addExtras(({ person, day }) => {
    if (person !== 'roux') return [];
    const extras: TalkExtra[] = [];
    if (has('roux', 'stories')) {
      extras.push({
        id: 'roux-stories',
        group: 'talk',
        label: 'Tell me about the building',
        disabled: () => (doneOn('roux-story', day) ? 'One story a day: come back tomorrow' : null),
        run: () => {
          const n = step('roux-story');
          setStep('roux-story', n + 1);
          markDay('roux-story', day);
          const lead = n % 2 === 1 ? leadNow(story.stage) : null;
          nudge('roux', { warmth: 2, reason: 'story', day, why: 'loved telling her stories' });
          return { line: lead ?? R.stories[n % R.stories.length]! };
        },
      });
    }
    if (has('roux', 'lucienGames') && !given('roux-lucien')) {
      extras.push({
        id: 'roux-lucien',
        group: 'ask',
        label: 'Ask about Lucien’s box',
        run: () => {
          markGiven('roux-lucien');
          const [from, to] = R.lucien.years;
          const games = giveGames(deps, 'roux-lucien', R.lucien.games, R.lucien.where, (g) => {
            const y = yearOf(g);
            return y !== null && y >= from && y <= to;
          });
          nudge('roux', { warmth: 4, trust: 4, day, memory: 'you took Lucien’s games', memoryWeight: 12 });
          deps.notices.reward({ title: `Lucien’s box: ${games.length} games`, detail: `${games.map((g) => g.title).join(', ')}.\nFrom Mrs Roux. They wait in your parcel in the hall.`, big: true });
          return { line: R.lucien.line };
        },
      });
    }
    return extras;
  });

  // Moving day: a parting gift, by how close you were.
  onRouxPhase((phase) => {
    if (phase !== 'moving' || given('roux-parting')) return;
    const t = tier('roux');
    const gift = atLeast(t, 'close') ? R.parting.close : atLeast(t, 'friend') ? R.parting.friend : atLeast(t, 'friendly') ? R.parting.friendly : null;
    markGiven('roux-parting');
    if (!gift) return;
    deps.wallet.earnCoins(gift.coins);
    const games = gift.game ? giveGames(deps, 'roux-parting', 1, 'a gift from Mrs Roux', () => true) : [];
    deps.notices.reward({ title: 'Mrs Roux’s parting gift', detail: `“For the coffee, and for being kind to an old woman.”${games[0] ? `\nAnd ${games[0].title}: it waits in your parcel.` : ''}`, coins: gift.coins });
  });
}
