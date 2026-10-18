import type { GameBox } from '@/world/GameBox';
import type { CoreParts } from './SessionParts';
import type { KeyRoute, SessionHost } from './SessionHost';
import { isAction } from '@/input/actions';
import { playSleeveSlide } from '@/audio/furnitureSounds';

/** The boxes carried behind the one in hand (`interaction/Armful`). */
export interface ArmfulLike {
  readonly boxes: readonly GameBox[];
  readonly full: boolean;
  add(box: GameBox): boolean;
  letGo(): void;
  carries(object: unknown): boolean;
}

export interface StackingParts extends Pick<CoreParts, 'inspector'> {
  armful?: ArmfulLike;
}

/**
 * Y on a shelf box (docs/furnishing.md "An armful"): with free hands it is taken in hand, with one of the flat's boxes
 * in hand it goes into the arms behind it, five at most. The armful goes back with E (every box home), or is set down
 * on a table spot (`strays/StrayBox`) as a pile. While the arms are full the box in front is not opened.
 */
export class Stacking implements KeyRoute {
  constructor(
    private readonly parts: StackingParts,
    private readonly host: SessionHost,
    /** The flat's own shelf box under the crosshair, or null. */
    private readonly aimed: () => GameBox | null,
    /** Whether `box` is one of the flat's own (a market copy or a stray's box is not). */
    private readonly own: (box: GameBox) => boolean,
    /** A second box is held beside the one in hand (`Comparing`): the arms take nothing more. */
    private readonly busy: () => boolean = () => false,
  ) {}

  /** More than the box in hand is carried. */
  get stacked(): boolean {
    return (this.parts.armful?.boxes.length ?? 0) > 0;
  }

  onKey(code: string): boolean {
    const armful = this.parts.armful;
    if (!armful) return false;
    if (this.stacked && isAction(code, 'openBox', 'readBooklet', 'liftMedia')) {
      this.host.refuse('Your arms are full: set them down first.');
      return true;
    }
    if (!isAction(code, 'takeArmful')) return false;
    const held = this.parts.inspector.current;
    if (held && !this.own(held)) return false;
    if (held && this.busy()) {
      this.host.refuse('Both hands are full.');
      return true;
    }
    const box = this.aimed();
    if (!box || box === held) {
      this.host.react(held ? 'Aim at another box on a shelf to take it too.' : 'Aim at a box on a shelf.');
      return true;
    }
    if (!box.castsShadow) {
      this.host.refuse('Only a card stands there.');
      return true;
    }
    if (!held) {
      this.host.pickUp(box);
      return true;
    }
    if (armful.full) {
      this.host.refuse('Your arms are full.');
      return true;
    }
    if (armful.add(box)) playSleeveSlide(0.035);
    return true;
  }
}
