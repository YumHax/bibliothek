import type { SessionActions } from '@/game/SessionActions';
import { PLAY_COST } from '@/economy/pricing';
import { formatCoins } from '@/text/money';
import { findPerson } from '@/social/people';
import { effect, effectValue, has } from '@/social/perks';
import { isMet } from '@/social/standing';
import { onceToday, usedToday } from '@/social/street/streetPerks';
import type { TalkExtra, TalkSession } from '@/social/talk';
import type { PersonId } from '@/social/types';
import { actReaction, vendorBody } from '../people/socialHook';
import type { Vendor } from '../people/Vendor';
import type { Walker } from '../people/Walker';

/*
 * Talking to the arcade's people (docs/social.md "Front Street and the arcade"): Gus at the prize counter (the day's
 * news, a free credit for a friendly face, all the news at once for a friend, the change machine jammed for a cold
 * one) and Nico the kid (how he watches the player's games: `kidMood`).
 */

export const ATTENDANT: PersonId = 'attendant';
export const KID: PersonId = 'kid';

/** The name over their lines once met. */
function speakerOf(id: PersonId, fallback: string): string {
  const card = findPerson(id);
  return card && isMet(id) ? (card.short ?? card.name) : fallback;
}

interface AttendantTalkOptions {
  vendor: Vendor;
  /** The next fresh line of the day's news (the story's word first), or null when all was said. */
  news: () => string | null;
  /** Every news line of the day, said or not. */
  allNews: () => readonly string[];
  /** Coins in hand (a free credit is a coin across the counter). */
  purse?: { earnCoins(coins: number): void };
  day: () => number;
}

/** The conversation with Gus. */
export function attendantTalk(options: AttendantTalkOptions, session: SessionActions): TalkSession {
  const { vendor, purse } = options;
  const day = options.day();
  const credits = (): number => effectValue(ATTENDANT, 'freeCredit', 0);
  const creditsUsed = (): number => [1, 2].filter((n) => usedToday(ATTENDANT, `freeCredit${n}`, day)).length;
  const extras: TalkExtra[] = [
    {
      id: 'news',
      group: 'talk',
      label: 'What’s new today?',
      run: () => ({ line: options.news() ?? 'Nothing new. Same machines, same claw, same me.' }),
    },
    {
      id: 'credit',
      group: 'ask',
      label: credits() > 1 ? 'A free credit? (two a day for you)' : 'A free credit?',
      disabled: () => (!purse || credits() === 0 ? 'Only for a friendly face' : creditsUsed() >= credits() ? 'Not again today' : null),
      run: () => {
        const n = creditsUsed() + 1;
        if (!purse || n > credits() || !onceToday(ATTENDANT, `freeCredit${n}`, day)) return { line: 'Don’t push it.' };
        purse.earnCoins(PLAY_COST);
        session.reward({ title: 'A free credit', detail: `Gus slides ${formatCoins(PLAY_COST)} across the counter.`, coins: PLAY_COST });
        return { line: 'On the house. Don’t tell the regulars.' };
      },
    },
    {
      id: 'insider',
      group: 'ask',
      label: 'Give me the whole picture',
      disabled: () => (!has(ATTENDANT, 'insider') ? 'Only for a friend' : null),
      run: () => {
        const all = options.allNews();
        if (!all.length) return { line: 'Quiet day. Even the claw is behaving.' };
        session.read({ title: 'Gus, under his breath', text: all.join('\n\n'), look: 'note' });
        return { line: 'Here’s everything. You didn’t get it from me.' };
      },
    },
  ];
  const body = vendorBody(vendor);
  return { person: ATTENDANT, place: 'arcade', body: { ...body, speak: (line) => vendor.speak(line, speakerOf(ATTENDANT, 'The attendant')) }, extras };
}

/** The conversation with Nico. */
export function kidTalk(kid: Walker): TalkSession {
  return {
    person: KID,
    place: 'arcade',
    body: { speak: (line) => kid.speak(line, speakerOf(KID, 'The kid')), react: (reaction) => actReaction(kid, reaction) },
  };
}

/**
 * How Nico takes the player's games: `devoted` (close: comes over for every game, always player two), `cheer`
 * (friendly: louder), `heckle` (cold: jeers, and leaves the second stick alone), else `plain`.
 */
type KidMood = 'devoted' | 'cheer' | 'plain' | 'heckle';

export function kidMood(): KidMood {
  if (effect(KID, 'heckles')) return 'heckle';
  if (has(KID, 'playerTwo')) return 'devoted';
  if (has(KID, 'cheers')) return 'cheer';
  return 'plain';
}

/** The tickets of the regulars' whip-round Nico passes on for a tournament round won with him in the player's corner (friend), or 0. */
export function kidWhipRound(): number {
  return effectValue(KID, 'doubles', 0);
}
