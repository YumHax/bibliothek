import type { GameBox } from '@/world/GameBox';
import type { CoreParts } from './SessionParts';
import type { KeyRoute, SessionHost } from './SessionHost';
import { isAction } from '@/input/actions';
import { playSleeveSlide } from '@/audio/furnitureSounds';

/** A second box held beside the one in hand (`interaction/SecondHand`). */
export interface SecondHandLike {
  readonly current: GameBox | null;
  take(box: GameBox): boolean;
  letGo(): void;
  carries(object: unknown): boolean;
}

export interface ComparingParts extends Pick<CoreParts, 'inspector'> {
  secondHand?: SecondHandLike;
}

/**
 * C with one of the flat's boxes in hand (docs/furnishing.md "Two boxes side by side"): the shelf box aimed at comes
 * to the hand too and stands beside it, the pair looked at together and turned together; C again, and that one goes
 * back. E puts both back. Without a box aimed at (or with a market copy in hand) C goes on to the cat.
 */
export class Comparing implements KeyRoute {
  constructor(
    private readonly parts: ComparingParts,
    private readonly host: SessionHost,
    /** The flat's own shelf box under the crosshair, or null. */
    private readonly aimed: () => GameBox | null,
    /** Whether `box` is one of the flat's own (a market copy or a stray's box is not). */
    private readonly own: (box: GameBox) => boolean,
    /** The arms hold more than the box in hand (`Stacking`): no hand is free to hold one beside it. */
    private readonly busy: () => boolean = () => false,
  ) {}

  /** A box is held beside the one in hand. */
  get comparing(): boolean {
    return this.parts.secondHand?.current != null;
  }

  onKey(code: string): boolean {
    const hand = this.parts.secondHand;
    const held = this.parts.inspector.current;
    if (!hand || !held || !isAction(code, 'compareBox')) return false;
    if (hand.current) {
      playSleeveSlide(0.03);
      hand.letGo();
      return true;
    }
    if (!this.own(held)) return false;
    if (this.busy()) {
      this.host.refuse('Your arms are full: set them down first.');
      return true;
    }
    const box = this.aimed();
    if (!box || box === held) return false;
    if (!box.castsShadow) {
      this.host.refuse('Only a card stands there: nothing to compare.');
      return true;
    }
    if (hand.take(box)) playSleeveSlide(0.035);
    return true;
  }
}
