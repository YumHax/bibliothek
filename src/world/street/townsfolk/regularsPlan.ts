import type { PersonId } from '@/social/types';

/*
 * The regulars who keep hours (docs/zones.md "The street", people): of the crowd's regulars (`STREET_PLAN.crowd.seeds`),
 * those who are someone the player can know, and when they are out. Outside their hours they stay in; within them
 * they walk the crowd's routes like anyone. Data only.
 */

/** A regular with a routine: their crowd seed, who they are (`social/people/town.ts`), their hours out (game hours). */
interface Regular {
  seed: number;
  person: PersonId;
  hours: readonly (readonly [number, number])[];
}

export const REGULARS: readonly Regular[] = [
  // The 8:10 commuter: out to the train, home in the evening.
  { seed: 301, person: 'theo', hours: [[7.6, 8.4], [18.1, 19.2]] },
  // Mrs Hall and Biscuit (the regulars' dog): the morning round and the evening one.
  { seed: 317, person: 'mrs-hall', hours: [[7.2, 9], [17.4, 19]] },
];
