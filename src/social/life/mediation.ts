import { addExtras } from '../extras';
import { tieBetween, tiesOf } from '../gossip';
import { shortName } from '../people';
import { isMet, nudge, standing } from '../standing';
import { atLeast, tierOf, tierRank } from '../tiers';
import type { PersonId } from '../types';
import { life, saveLife } from './lifeStore';

/*
 * Mediation (docs/social.md "Putting in a word"): a friend of someone cross with the player can put in a word for
 * them. Talking to a go-between the player is Friendly with, close to (tie `MEDIATE.tie`) someone Cold or worse with
 * the player: "Could you put in a word with X?". Once a week per go-between; X warms by the tie × `MEDIATE.warmth`
 * and remembers who spoke for the player.
 */

const MEDIATE = { tie: 0.4, warmth: 10, everyDays: 7, shown: 2 } as const;

/** Those `goBetween` could speak to for the player: close to them, met, and cold or worse with the player. */
function crossFriends(goBetween: PersonId): PersonId[] {
  return tiesOf(goBetween)
    .filter((t) => t.tie >= MEDIATE.tie && isMet(t.id))
    .filter((t) => {
      const s = standing(t.id);
      return tierRank(tierOf(s.warmth, s.trust)) <= tierRank('cold');
    })
    .map((t) => t.id);
}

/** Starts the go-betweens' offer in conversation. */
export function startMediation(): void {
  addExtras((ctx) => {
    const s = standing(ctx.person);
    if (!atLeast(tierOf(s.warmth, s.trust), 'friendly')) return [];
    const last = life().mediated[ctx.person];
    if (last !== undefined && ctx.day - last < MEDIATE.everyDays) return [];
    return crossFriends(ctx.person)
      .slice(0, MEDIATE.shown)
      .map((other) => ({
        id: `mediate-${ctx.person}-${other}`,
        group: 'ask' as const,
        label: `Could you put in a word with ${shortName(other)}?`,
        run: () => {
          life().mediated[ctx.person] = ctx.day;
          saveLife();
          const warmth = Math.round(tieBetween(ctx.person, other) * MEDIATE.warmth);
          nudge(other, { warmth, why: `${shortName(ctx.person)} put in a word for you`, day: ctx.day, memory: `${shortName(ctx.person)} spoke up for you`, memoryWeight: warmth });
          return { line: `${shortName(other)}? Leave it with me. I’ll have a word. No promises, mind.` };
        },
      }));
  });
}
