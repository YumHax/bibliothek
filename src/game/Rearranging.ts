import { isAction } from '@/input/actions';
import { actionKeyLabel } from '@/ui/keys';
import { useVerbCap } from '@/ui/verb';
import type { CoreParts } from './SessionParts';
import type { KeyRoute, SessionHost } from './SessionHost';

/** A turn of the carried piece per press of R (radians, 45°); the wheel turns it finer (the carrier's step). */
const TURN = Math.PI / 4;

/** A piece of the flat's furniture as the Session sees it (`furnishing/Furnishings`). */
export interface PieceLike {
  readonly name: string;
}

/** Carries the flat's furniture about (`furnishing/FurnitureCarrier`). */
export interface FurnitureCarrierLike {
  readonly piece: PieceLike | null;
  readonly fits: boolean;
  aimed(): PieceLike | null;
  take(piece: PieceLike): void;
  turn(radians: number): void;
  setDown(): boolean;
  cancel(): void;
}

/** The spot on a shelf aimed at with a shelf box in hand (`world/shelving/ShelfPlacing`). */
export interface ShelfPlacingLike {
  /** One of the flat's shelf boxes is in hand (not a market copy). */
  readonly active: boolean;
  readonly target: { readonly spot: { readonly fits: boolean } } | null;
  place(): boolean;
}

export interface RearrangingParts extends Pick<CoreParts, 'player' | 'inspector' | 'interactor'> {
  furniture?: FurnitureCarrierLike;
  shelfPlacing?: ShelfPlacingLike;
}

/**
 * Moving things about the flat (M): the box in hand into the gap aimed at on any shelf (the shelves become the
 * player's arrangement, T's "as you arranged them"), and the furniture bought for the flat, carried about its
 * room (a click or M sets it down where it fits, R or the wheel turns it, E puts it back where it was).
 */
export class Rearranging implements KeyRoute {
  /** `carryChanged`: a piece was taken, set down or put back (the caption follows it). */
  constructor(
    private readonly parts: RearrangingParts,
    private readonly host: SessionHost,
    private readonly carryChanged: () => void = () => {},
  ) {}

  /** Whether a piece of furniture is being carried. */
  get carrying(): boolean {
    return this.parts.furniture?.piece != null;
  }

  /** The caption while a piece is carried (a click sets it down), else null. */
  caption(): string | null {
    const furniture = this.parts.furniture;
    const piece = furniture?.piece;
    if (!piece) return null;
    return furniture.fits ? `${piece.name} · set down` : `${piece.name}: no room here`;
  }

  /** A click: sets the carried piece down. False when nothing is carried (the click is the crosshair's). */
  click(): boolean {
    if (!this.carrying) return false;
    this.setDown();
    return true;
  }

  /** Puts the carried piece back where it was (the mouse let go, a panel opening). */
  cancel(): void {
    if (!this.carrying) return;
    this.parts.furniture!.cancel();
    this.end();
  }

  onKey(code: string): boolean {
    const { furniture, shelfPlacing, inspector, player } = this.parts;
    if (furniture?.piece) {
      if (isAction(code, 'setDown')) this.setDown();
      // The controller's Y (the open-box button) turns it too.
      else if (isAction(code, 'turnPiece') || code === 'GamepadY') furniture.turn(TURN);
      else if (isAction(code, 'putBackPiece')) this.cancel();
      else return false;
      return true;
    }
    if (inspector.current && isAction(code, 'putHere') && shelfPlacing?.active) {
      const target = shelfPlacing.target;
      if (!target) this.host.react(`Aim at a gap on a shelf, then press ${actionKeyLabel('putHere')}`);
      else if (!target.spot.fits) this.host.refuse('No room on that shelf.');
      else if (shelfPlacing.place()) this.host.putBack(); // it flies to its new spot
      return true;
    }
    if (!inspector.current && !player.isSeated && isAction(code, 'moveFurniture') && furniture) {
      const piece = furniture.aimed();
      if (!piece) {
        this.host.react('Only what you bought for the flat can be moved');
        return true;
      }
      furniture.take(piece);
      this.parts.interactor.enabled = false;
      this.carryChanged();
      this.host.tip(`${useVerbCap()} to set it down where it fits. ${actionKeyLabel('turnPiece')} or the wheel turns it, ${actionKeyLabel('putBackPiece')} puts it back.`, {
        id: 'carrying-furniture',
        until: () => !this.carrying,
      });
      return true;
    }
    return false;
  }

  private setDown(): void {
    const furniture = this.parts.furniture!;
    if (!furniture.setDown()) {
      this.host.refuse(`No room for the ${furniture.piece!.name.toLowerCase()} there.`);
      return;
    }
    this.end();
  }

  private end(): void {
    this.parts.interactor.enabled = true;
    this.carryChanged();
  }
}
