import { tieBetween } from '@/social/gossip';
import { has } from '@/social/perks';
import type { PersonId } from '@/social/types';

/*
 * How the player's standing sways the co-owners' votes (docs/social.md "The building"), through each resident's vote
 * effects (`social/people/building` `VOTE_EFFECTS`): a Friend votes with the player's ballot, a Close one also brings
 * round one more voter (the one they are closest to), a Hostile one votes against it. Only on resolutions the player voted on; the rest vote by their nature (`coproMeeting.voteOf`).
 */

/** How a voter stands to the player's ballot: with it, brought round to it by a friend, or against it. */
export type Stance = 'with' | 'lobbied' | 'against';

/** The voters' stances by `who`; a voter absent from the map votes by their own lights. */
export function swayOf(voters: readonly { who: string; person?: PersonId }[]): Map<string, Stance> {
  const stances = new Map<string, Stance>();
  for (const v of voters) {
    if (!v.person) continue;
    if (has(v.person, 'votesWithYou')) stances.set(v.who, 'with');
    else if (has(v.person, 'votesAgainst')) stances.set(v.who, 'against');
  }
  // Each Close friend lobbies one more: whoever they are closest to among those not yet decided.
  for (const v of voters) {
    if (!v.person || !has(v.person, 'lobbies')) continue;
    const undecided = voters.filter((o) => o.who !== v.who && !stances.has(o.who));
    if (!undecided.length) break;
    const closest = undecided.reduce((best, o) => (tieOf(v.person!, o) > tieOf(v.person!, best) ? o : best), undecided[0]!);
    stances.set(closest.who, 'lobbied');
  }
  return stances;
}

function tieOf(a: PersonId, voter: { person?: PersonId }): number {
  return voter.person ? tieBetween(a, voter.person) : 0;
}

/** The vote a stance casts on a resolution the player voted `player` on (`current`: what stands now). */
export function swayedVote(stance: Stance, player: string, current: string, options: readonly { id: string }[]): string {
  if (stance !== 'against') return player;
  if (current !== player) return current;
  return options.find((o) => o.id !== player)?.id ?? current;
}
