/*
 * Who has a game that is out of the house, and till when: the friends' loans (`world/visitors/VisitBook`) and the
 * neighbours' borrowed games (`social/life/favours`) live far from the collection, so the bootstrap hands this leaf one
 * resolver and the box, the shelf's note in the gap, the list and the search read it. Null for a game nobody has.
 */

/** A game lent out: to whom (their short name) and when it comes back, in words ("on Thursday", "tomorrow"). */
interface LoanNote {
  who: string;
  back: string;
}

let resolve: (gameId: string) => LoanNote | null = () => null;

/** Wired once (`bootstrap/services`): the loans as the flat's books keep them. */
export function setLoanResolver(fn: (gameId: string) => LoanNote | null): void {
  resolve = fn;
}

/** Who has `gameId` and till when, or null. */
export function loanOf(gameId: string): LoanNote | null {
  return resolve(gameId);
}
