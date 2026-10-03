import { isAction } from '@/input/actions';
import { actionKeyLabel } from '@/ui/keys';
import { grabVerb, grabVerbCap, useVerb, useVerbCap } from '@/ui/verb';
import type { CoreParts } from './SessionParts';
import type { KeyRoute, SessionHost } from './SessionHost';
import { whyBlocked as why, type BlockerWords } from '@/furnishing/blockerText';

/** How many moves the undo remembers. */
const UNDO_DEPTH = 20;

/** A piece of the flat's furniture as the Session sees it (`furnishing/Furnishings`). */
export interface PieceLike {
  readonly name: string;
}

/** What stops a carried piece standing where it is aimed (`furnishing/fit`'s `Blocker`). */
export type BlockerLike = BlockerWords;

/** A piece put somewhere, and where it stood before (the undo puts it back there). */
export interface MovedLike {
  readonly piece: PieceLike;
  readonly from: object;
}

/** Carries the flat's furniture about (`furnishing/FurnitureCarrier`). */
export interface FurnitureCarrierLike {
  readonly piece: PieceLike | null;
  readonly fits: boolean;
  readonly blocker: BlockerLike | null;
  /** Aimed at a surface it could go on at all. */
  readonly aiming: boolean;
  /** Aimed where it may not stand, with a spot nearby where it may (a click sets it down there). */
  readonly suggested: boolean;
  /** The movable piece under the crosshair with free hands. */
  readonly hovered: PieceLike | null;
  snapping: boolean;
  onHoverChange(listener: () => void): () => void;
  aimed(): PieceLike | null;
  fixedAimed(): string | null;
  /** Whether the carried piece may be put away (not a bookcase, nothing standing on it). */
  readonly storable: boolean;
  /** The last set-down's move, for the undo (null for one out of storage). */
  readonly lastMove: MovedLike | null;
  take(piece: PieceLike): void;
  turn(direction: number): void;
  setDown(): boolean;
  cancel(): void;
  /** Puts the carried piece away; false when it may not be. */
  store(): boolean;
  /** Takes a stored piece out, in front of the player, into the hands; false outside the flat's rooms. */
  takeOut(piece: PieceLike): boolean;
  moveTo(piece: PieceLike, pose: object): BlockerLike | null;
  /** The player is in one of the flat's rooms. */
  readonly atHome: boolean;
  /** Whether a piece is still there to move (not taken down by a rebuild, not put away). */
  available(piece: PieceLike): boolean;
  onCarryLost(listener: () => void): () => void;
}

/** The spot on a shelf aimed at with a shelf box in hand (`world/shelving/ShelfPlacing`). */
export interface ShelfPlacingLike {
  /** One of the flat's shelf boxes is in hand (not a market copy). */
  readonly active: boolean;
  readonly target: { readonly spot: { readonly fits: boolean; readonly swap?: { readonly game: { readonly title: string } } }; readonly refusal?: string } | null;
  /** The target is another box to swap with. */
  readonly swapping: boolean;
  place(): boolean;
}

/** The room seen from above, its furniture moved with the mouse (`furnishing/planView/PlanView`). */
export interface PlanViewLike {
  readonly isOpen: boolean;
  onKey(code: string): boolean;
  close(): void;
  onMoved(listener: (moved: MovedLike) => void): void;
}

export interface RearrangingParts extends Pick<CoreParts, 'player' | 'inspector' | 'interactor'> {
  furniture?: FurnitureCarrierLike;
  shelfPlacing?: ShelfPlacingLike;
  planView?: PlanViewLike;
}

/**
 * Moving things about the flat (docs/furnishing.md): the furniture bought for the flat, taken with a right-click
 * (or M) and carried about its room on the grid (a click or M sets it down where it fits, R and Q or the wheel
 * turn it, G lets it go free of the grid, E or a right-click puts it back where it was, U undoes the last move);
 * and the box in hand into the gap aimed at on any shelf, or swapped with the box aimed at (a right-click tap or M:
 * the shelves become the player's arrangement, T's "as you arranged them").
 */
export class Rearranging implements KeyRoute {
  /** The moves made, latest last (the undo takes them back one by one). */
  private readonly history: MovedLike[] = [];
  /** The tips told this session (each once). */
  private readonly told = new Set<string>();

  /** `carryChanged`: a piece was taken, set down or put back, or the piece under the crosshair changed (the caption follows). */
  constructor(
    private readonly parts: RearrangingParts,
    private readonly host: SessionHost,
    private readonly carryChanged: () => void = () => {},
  ) {
    parts.furniture?.onHoverChange(() => {
      this.carryChanged();
      if (parts.furniture?.hovered) this.tipOnce('movable', `${grabVerbCap()} what you bought for the flat to move it: it follows your aim on a grid, green where it fits. ${actionKeyLabel('planView')} plans the room from above.`);
    });
    // A bookcase a rebuild took down while it was carried: the hands are free again.
    parts.furniture?.onCarryLost(() => this.end());
    parts.planView?.onMoved((moved) => this.remember(moved));
  }

  /** The room is being planned from above (L): the touch bar shows the carrying buttons. */
  get planning(): boolean {
    return this.parts.planView?.isOpen ?? false;
  }

  /** Whether a piece of furniture is being carried. */
  get carrying(): boolean {
    return this.parts.furniture?.piece != null;
  }

  /** The caption while a piece is carried: what it is, and whether it may go here (and if not, why), else null. */
  caption(): string | null {
    const furniture = this.parts.furniture;
    const piece = furniture?.piece;
    if (!piece) return null;
    const grid = furniture.snapping ? '' : ' · free';
    if (furniture.fits) return `${piece.name} · set down${grid}`;
    if (!furniture.aiming) return `${piece.name}: aim where it goes`;
    if (furniture.suggested) return `${piece.name}: ${why(furniture.blocker)} · ${useVerb()} for the spot beside`;
    return `${piece.name}: ${why(furniture.blocker)}`;
  }

  /** With free hands, the hint on a movable piece under the crosshair ("right-click to move"), else null. */
  hoverHint(): string | null {
    const furniture = this.parts.furniture;
    if (!furniture || this.carrying || !furniture.hovered) return null;
    return `${grabVerbCap()} to move`;
  }

  /** Whether the crosshair is on a movable piece (with free hands): the caption is re-read while it is. */
  get hovering(): boolean {
    return this.parts.furniture?.hovered != null && !this.carrying;
  }

  /** A click: sets the carried piece down. False when nothing is carried (the click is the crosshair's). */
  click(): boolean {
    if (!this.carrying) return false;
    this.setDown();
    return true;
  }

  /**
   * The right button pressed with free hands or while carrying: puts the carried piece back, or takes the movable
   * piece under the crosshair. False when it did nothing (nothing movable there: a fixed piece is named).
   */
  grab(): boolean {
    const { furniture, inspector, player } = this.parts;
    if (!furniture) return false;
    if (this.carrying) {
      this.cancel();
      return true;
    }
    if (inspector.current || player.isSeated) return false;
    return this.take(false);
  }

  /** A right-click tap with a box in hand: into the gap (or the swap) aimed at on a shelf. False when not aimed at one. */
  tapWithBox(): boolean {
    const { shelfPlacing, inspector } = this.parts;
    if (!inspector.current || !shelfPlacing?.active || !shelfPlacing.target) return false;
    this.putHere();
    return true;
  }

  /** Puts the carried piece back where it was, and leaves the view from above (the mouse let go, a panel opening). */
  cancel(): void {
    this.parts.planView?.close();
    if (!this.carrying) return;
    this.parts.furniture!.cancel();
    this.end();
  }

  onKey(code: string): boolean {
    const { furniture, shelfPlacing, inspector, player, planView } = this.parts;
    // From above, every key is the planning view's (and L opens it with free hands).
    if (planView && (planView.isOpen || (!inspector.current && !furniture?.piece)) && planView.onKey(code)) return true;
    if (furniture?.piece) {
      if (isAction(code, 'setDown')) this.setDown();
      // The controller's Y (the open-box button) turns it too.
      else if (isAction(code, 'turnPiece') || code === 'GamepadY') furniture.turn(1);
      else if (isAction(code, 'turnPieceBack')) furniture.turn(-1);
      else if (isAction(code, 'gridSnap')) {
        furniture.snapping = !furniture.snapping;
        this.host.react(furniture.snapping ? 'On the grid' : 'Free placement: off the grid');
      } else if (isAction(code, 'putBackPiece')) this.cancel();
      else if (isAction(code, 'storePiece')) this.store();
      else return false;
      return true;
    }
    if (inspector.current && isAction(code, 'putHere') && shelfPlacing?.active) {
      this.putHere();
      return true;
    }
    // Only at home: out there U hands back what was just bought.
    if (!inspector.current && !player.isSeated && isAction(code, 'undoMove') && furniture?.atHome) return this.undo();
    if (!inspector.current && !player.isSeated && isAction(code, 'moveFurniture') && furniture) return this.take(true);
    return false;
  }

  /** Takes the movable piece under the crosshair; `say` when there is none (M), else only a fixed piece is named. */
  private take(say: boolean): boolean {
    const furniture = this.parts.furniture!;
    const piece = furniture.aimed();
    if (!piece) {
      const fixed = furniture.fixedAimed();
      if (fixed !== null) this.host.react(fixedLine(fixed));
      else if (say) this.host.react('Only what you bought for the flat can be moved');
      return fixed !== null || say;
    }
    furniture.take(piece);
    this.parts.interactor.enabled = false;
    this.carryChanged();
    this.host.tip(
      `${useVerbCap()} to set it down where it shows green. ${actionKeyLabel('turnPiece')} and ${actionKeyLabel('turnPieceBack')} (or the wheel) turn it, ${actionKeyLabel('gridSnap')} lets it off the grid, ${actionKeyLabel('storePiece')} puts it away, ${grabVerb()} or ${actionKeyLabel('putBackPiece')} puts it back. Carry it through a door to take it to another room.`,
      { id: 'carrying-furniture', until: () => !this.carrying },
    );
    return true;
  }

  private putHere(): void {
    const shelfPlacing = this.parts.shelfPlacing!;
    const target = shelfPlacing.target;
    if (!target) this.host.react(`Aim at a gap on a shelf, then ${grabVerb()} or press ${actionKeyLabel('putHere')}`);
    else if (!target.spot.fits) this.host.refuse(target.refusal ?? (shelfPlacing.swapping ? 'No room for the other box on that row.' : 'No room on that shelf.'));
    else if (shelfPlacing.place()) this.host.putBack(); // it flies to its new spot
  }

  private setDown(): void {
    const furniture = this.parts.furniture!;
    const piece = furniture.piece!;
    if (!furniture.setDown()) {
      this.host.refuse(furniture.aiming ? `No room for the ${piece.name.toLowerCase()} there: ${why(furniture.blocker)}.` : `Aim where the ${piece.name.toLowerCase()} goes.`);
      return;
    }
    const moved = furniture.lastMove;
    if (moved) this.remember(moved);
    this.end();
    if (moved) this.tipOnce('undo-furniture', `${actionKeyLabel('undoMove')} undoes a move.`);
  }

  /** A tip told once this session. */
  private tipOnce(id: string, text: string): void {
    if (this.told.has(id)) return;
    this.told.add(id);
    this.host.tip(text, { id });
  }

  /** A move made (here or from above): the undo can take it back. */
  private remember(moved: MovedLike): void {
    this.history.push(moved);
    if (this.history.length > UNDO_DEPTH) this.history.shift();
  }

  /** Puts the carried piece away (out of sight; the pause menu's "Stored furniture" takes it out again, in any room). */
  private store(): void {
    const furniture = this.parts.furniture!;
    const piece = furniture.piece!;
    if (!furniture.storable) {
      this.host.refuse(piece.name === 'Bookcase' ? 'A bookcase stays out: it holds the games.' : `Take what stands on the ${piece.name.toLowerCase()} off first.`);
      return;
    }
    furniture.store();
    this.history.splice(0, this.history.length, ...this.history.filter((move) => move.piece !== piece));
    this.end();
    this.host.react(`${piece.name} put away`);
    this.tipOnce('stored-furniture', 'The pause menu’s Stored furniture takes it out again, in any room of the flat.');
  }

  /** A stored piece taken out, in front of the player, into the hands (the pause menu's "Stored furniture"). */
  takeOut(piece: PieceLike): void {
    const furniture = this.parts.furniture;
    if (!furniture || this.carrying || this.parts.inspector.current) return;
    if (!furniture.takeOut(piece)) {
      this.host.refuse('Stored furniture comes out at home, in a room.');
      return;
    }
    this.parts.interactor.enabled = false;
    this.carryChanged();
    this.host.tip(`${useVerbCap()} to set it down where it shows green, ${grabVerb()} to put it away again.`, { id: 'taken-out', until: () => !this.carrying });
  }

  /** The last move taken back: the piece goes where it stood before, if nothing stands there now. */
  private undo(): boolean {
    // A move of a piece since put away, or taken down by a rebuild, cannot be undone: forgotten.
    while (this.history.length && !this.parts.furniture!.available(this.history.at(-1)!.piece)) this.history.pop();
    const last = this.history.at(-1);
    if (!last) return false;
    const blocker = this.parts.furniture!.moveTo(last.piece, last.from);
    if (blocker) {
      this.host.refuse(`The ${last.piece.name.toLowerCase()} cannot go back: ${why(blocker)}.`);
      return true;
    }
    this.history.pop();
    this.host.react(`${last.piece.name} back where it was`);
    return true;
  }

  private end(): void {
    this.parts.interactor.enabled = true;
    this.carryChanged();
  }
}


/** What is said of a piece that never moves (a built-in: the wardrobe, the kitchen units). */
function fixedLine(name: string): string {
  return name ? `The ${name} stays where it is` : 'That stays where it is';
}
