import type { NoticeDismissing } from '@/notices';
import { isAction } from '@/input/actions';
import { Arming } from '@/ui/confirmTwice';
import type { KeyRoute } from './SessionHost';

export interface NoticeDismissParts {
  /** What the game shows the player that a key may put away (the `Notices`). */
  noticeDismiss?: NoticeDismissing;
}

/** A second press within this long puts every waiting card away, not just the one up (ms). */
const DOUBLE_MS = 450;

/**
 * X puts down what is being read (docs/notices.md): the card up, read or not; twice quickly, every card waiting
 * behind it; with no card, the reward banner and the newest tip; the subtitles with any press. Last in the routes
 * but for seating: a piece of furniture carried (put away) and a market copy in hand (swap) keep X.
 */
export class NoticeDismiss implements KeyRoute {
  /** Each press restarts the window; a press within the window of the one before puts every card away (nothing to repaint). */
  private readonly arming = new Arming<'all'>(() => {}, DOUBLE_MS);

  constructor(private readonly parts: NoticeDismissParts) {}

  onKey(code: string): boolean {
    const notices = this.parts.noticeDismiss;
    if (!isAction(code, 'dismissNotice') || !notices) return false;
    return notices.dismiss(this.arming.again('all'));
  }
}
