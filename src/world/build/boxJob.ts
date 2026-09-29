import type { Game } from '@/catalog/types';
import type { SessionActions } from '@/game/SessionActions';
import type { Outcome } from '@/household/HomeLife';
import type { Pastime } from '@/household/pastime';
import { tellOutcome } from '@/household/tellOutcome';
import type { HouseholdContext } from '../buildContext';

/**
 * A household job on the box in hand (cleaning it, peeling its sticker; docs/household.md): refused
 * at once when it cannot be done, else told in a beat (`HouseholdContext.pastimes`: a fade to black
 * with its sounds, the clock wound on). In the dark the box is put down (its shelf rebuilds it with the
 * new state) and its rebuilt box taken back in hand, so the player sees the refreshed cover when the
 * view comes back; then what came of it.
 */
export function boxJob(household: HouseholdContext, session: SessionActions, game: Game, job: { refusal: Outcome | null; pastime: Pastime; change: (before: () => void) => Outcome; title?: string }): void {
  const { notices, pastimes, boxOf } = household;
  if (job.refusal) {
    tellOutcome(notices, job.refusal, job.title);
    return;
  }
  const change = (): Outcome => {
    const outcome = job.change(() => session.putBack());
    // The box put down was rebuilt (and let go of) or is on its way home: either way the hand takes the fresh one again.
    const box = outcome.done ? boxOf?.(game.id) : undefined;
    if (box) session.pickUp(box);
    return outcome;
  };
  if (!pastimes) {
    tellOutcome(notices, change(), job.title);
    return;
  }
  void pastimes.run(job.pastime, change).then((outcome) => {
    if (outcome) tellOutcome(notices, outcome, job.title);
  });
}
