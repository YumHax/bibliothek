import type { NoticeActions } from '@/notices';
import type { Outcome } from './HomeLife';

/**
 * Says what came of a household action, by what it was: nothing done is a refusal under the
 * crosshair; something done with an effect (its line's second half: "worth its full price again")
 * is a card to read, the story over the effect; something done and said in one line is a reaction.
 * Returns whether anything happened.
 */
export function tellOutcome(notices: NoticeActions, outcome: Outcome, title?: string): boolean {
  if (!outcome.line) return outcome.done;
  if (!outcome.done) {
    notices.refuse(outcome.line);
    return false;
  }
  const [story = '', ...effect] = outcome.line.split('\n');
  if (effect.length) notices.read({ title, text: story, effect: effect.join('\n') });
  else notices.react(story);
  return true;
}
