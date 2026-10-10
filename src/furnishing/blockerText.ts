/** What stops a piece being set down, as the caption reads it (`fit`'s `Blocker`, or the Session's own view of it). */
export interface BlockerWords {
  readonly kind: 'room' | 'doorway' | 'window' | 'piece' | 'furniture' | 'someone' | 'edge' | 'way';
  readonly name?: string;
}

/** Why a piece may not stand where it is aimed, for the caption: "it would block the doorway", "Sam is in the way". */
export function whyBlocked(blocker: BlockerWords | null): string {
  switch (blocker?.kind) {
    case 'room':
      return 'it does not fit in the room';
    case 'doorway':
      return 'it would block the doorway';
    case 'way':
      return 'it would block the way through';
    case 'window':
      return 'not over the window';
    case 'edge':
      return 'it would hang off the edge';
    case 'someone':
      return blocker.name === 'you' ? 'you are standing there' : `${blocker.name ?? 'someone'} is in the way`;
    case 'piece':
    case 'furniture':
      return blocker.name ? `it would hit the ${blocker.name}` : 'something is in the way';
    default:
      return 'no room here';
  }
}
