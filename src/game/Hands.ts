import type { GameBox } from '@/world/GameBox';
import type { CoreParts } from './SessionParts';
import { isAction } from '@/input/actions';
import type { KeyRoute } from './SessionHost';

export type HandsParts = Pick<CoreParts, 'inspector' | 'panel'>;

/**
 * The box in the player's hand: taken (its panel shows), put back (E; a click at nothing does nothing), opened
 * (O). `letGo` runs on either move: the market copy in hand is let go, a stale search glow cleared.
 */
export class Hands implements KeyRoute {
  constructor(private readonly parts: HandsParts, private readonly letGo: (taking: boolean) => void) {}

  get held(): GameBox | null {
    return this.parts.inspector.current;
  }

  pickUp(box: GameBox): void {
    this.letGo(true);
    this.parts.inspector.inspect(box);
    this.parts.panel.show(box.game);
  }

  putBack(): void {
    this.letGo(false);
    this.parts.inspector.release();
    this.parts.panel.hide();
  }

  onKey(code: string): boolean {
    const { inspector } = this.parts;
    if (!inspector.isActive) return false;
    if (isAction(code, 'putBack')) this.putBack();
    else if (isAction(code, 'openBox')) inspector.toggleOpen();
    else if (isAction(code, 'turnBox')) inspector.turnOver();
    else return false;
    return true;
  }
}
