import { isAction } from '@/input/actions';
import { actionKeyLabel } from '@/ui/keys';
import type { CoreParts, ModalLike } from './SessionParts';
import type { KeyRoute, SessionHost } from './SessionHost';

/** A label stuck on a shelf edge, as the rules see it. */
interface LabelLike {
  readonly id: number;
  readonly text: string;
  readonly tape: string;
}

/** The board edge aimed at (`labels/ShelfLabels.aim`), and the label on it there. */
export interface LabelSpotLike {
  readonly existing: LabelLike | null;
}

/** The label maker, as the session uses it (`world/labels/ShelfLabels` and its panel, wired in `bootstrap/session`). */
export interface LabelMakerLike<Spot extends LabelSpotLike = LabelSpotLike> {
  /** Bought (SECOND HOME): without it K does nothing. */
  readonly owned: boolean;
  /** The player is in one of the flat's rooms. */
  readonly atHome: boolean;
  /** The shelf edge under the crosshair, in reach, or null. */
  aim(): Spot | null;
  /** Deals the panel for `spot` (print, peel); returns the panel to open. */
  panelFor(spot: Spot): ModalLike;
}

export interface LabellingParts extends Pick<CoreParts, 'inspector' | 'player'> {
  labelMaker?: LabelMakerLike;
}

/**
 * K: the label maker (docs/furnishing.md "Shelf labels"). At home with free hands, aimed at a shelf's front edge, it
 * opens the label panel: type, pick the tape, Print sticks the label there; aimed at a label, it offers to peel it
 * off. Without the label maker K is free (nothing is said).
 */
export class Labelling implements KeyRoute {
  constructor(
    private readonly parts: LabellingParts,
    private readonly host: SessionHost,
    private readonly openPanel: (panel: ModalLike) => void,
    /** A piece of furniture is being carried: the hands are full. */
    private readonly carrying: () => boolean = () => false,
  ) {}

  onKey(code: string): boolean {
    const maker = this.parts.labelMaker;
    if (!maker || !isAction(code, 'labelShelf') || !maker.owned || !maker.atHome) return false;
    if (this.parts.inspector.current || this.parts.player.isSeated || this.carrying()) return false;
    const spot = maker.aim();
    if (!spot) {
      this.host.react(`Aim at a shelf’s edge, then ${actionKeyLabel('labelShelf')} to label it`);
      return true;
    }
    this.openPanel(maker.panelFor(spot));
    return true;
  }
}
