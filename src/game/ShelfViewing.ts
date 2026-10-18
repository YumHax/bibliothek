import { isAction } from '@/input/actions';
import { actionCap } from '@/ui/verb';
import type { CoreParts } from './SessionParts';
import type { KeyRoute, SessionHost } from './SessionHost';

/** How a box lifted off its row with the cursor was let go (`shelfView/ShelfView`'s `DropOutcome`). */
type DropLike = { kind: 'placed'; title: string; before: object | null } | { kind: 'full' } | { kind: 'none' };

/** The bookcase view, as the rules use it (`shelfView/ShelfView`, wired in `bootstrap/input`). */
export interface ShelfViewLike {
  /** Facing a bookcase (parked or not). */
  readonly active: boolean;
  /** A box taken in hand from the view: the hands' keys are the hands'. */
  readonly isParked: boolean;
  readonly framingRow: boolean;
  /** The filter's strip has the keyboard. */
  readonly typing: boolean;
  readonly found: { query: string; here: number; room: number };
  /** The bookcase in front within reach, or null. */
  aimed(): object | null;
  face(bookcase: object): boolean;
  /** Steps back; `instant`: there at once (a seat taken from the view sits from where the player stood). */
  leave(instant?: boolean): void;
  stepIn(): boolean;
  stepOut(): boolean;
  moveRow(step: -1 | 1): boolean;
  nextBookcase(step: -1 | 1): boolean;
  openFilter(): boolean;
  pressAt(): boolean;
  release(): { kind: 'took' } | { kind: 'drop'; outcome: DropLike } | { kind: 'nothing' };
  onChange(listener: () => void): () => void;
}

export interface ShelfViewingParts extends Pick<CoreParts, 'inspector'> {
  shelfView?: ShelfViewLike;
}

/**
 * Facing a bookcase (docs/furnishing.md "The bookcase view"): a click on a bookcase between its boxes, or B in front
 * of one, glides the eye square before it; there W steps in to a row and S back out (and off), A / D go to the next
 * bookcase, ↑ / ↓ another row, F writes what to look for, E (or Esc the room hears, or B again) steps back. The
 * cursor's clicks and drags are the Session's mouse, handed here (`press`, `release`). A box taken in hand parks the
 * view: every key is the hands' until it is put back.
 */
export class ShelfViewing implements KeyRoute {
  private wasTyping = false;

  constructor(
    private readonly parts: ShelfViewingParts,
    private readonly host: SessionHost,
    /** A box moved along the shelves from the view, and how they stood before: the undo (U) can take it back. */
    private readonly shelved: (before: object) => void,
    /** U in the view: the last move taken back (`Rearranging`); false when there is none. */
    private readonly undo: () => boolean,
    /** G in the view: the box under the cursor turned spine out, or cover out again (`Rearranging.turnAimed`); false when none is. */
    private readonly turn: () => boolean = () => false,
  ) {
    parts.shelfView?.onChange(() => this.changed());
  }

  /** Facing a bookcase. */
  get active(): boolean {
    return this.parts.shelfView?.active ?? false;
  }

  /** The filter's strip has the keyboard: the room hears nothing. */
  get typing(): boolean {
    return this.parts.shelfView?.typing ?? false;
  }

  /** Steps back from the bookcase faced (a trip, a movement key with a box in hand); false when none is. */
  leave(instant = false): boolean {
    if (!this.active) return false;
    this.parts.shelfView!.leave(instant);
    return true;
  }

  /** A click on a bookcase's open face (`shelfView/BookcaseFronts`). */
  face(bookcase: object): void {
    this.parts.shelfView?.face(bookcase);
  }

  /** The left button pressed in the room: true when the view takes it (a box under its cursor: a drag, or a click on release). */
  press(): boolean {
    return this.parts.shelfView?.pressAt() ?? false;
  }

  /** The left button let go: a box lifted with the cursor goes where it was aimed (or back, told why). */
  release(): void {
    const result = this.parts.shelfView?.release();
    if (result?.kind !== 'drop') return;
    const outcome = result.outcome;
    if (outcome.kind === 'placed' && outcome.before) this.shelved(outcome.before);
    else if (outcome.kind === 'full') this.host.refuse('No room on that shelf.');
  }

  onKey(code: string, e?: KeyboardEvent): boolean {
    const view = this.parts.shelfView;
    if (!view) return false;
    if (!view.active) {
      if (!isAction(code, 'faceShelves') || this.parts.inspector.current) return false;
      const bookcase = view.aimed();
      return bookcase !== null && view.face(bookcase);
    }
    if (view.isParked) return false;
    if (isAction(code, 'leaveShelves', 'close', 'faceShelves')) view.leave();
    else if (isAction(code, 'shelfIn')) view.stepIn();
    else if (isAction(code, 'shelfOut')) {
      if (!view.stepOut()) view.leave();
    } else if (isAction(code, 'shelfLeft', 'shelfRight')) {
      if (!view.nextBookcase(isAction(code, 'shelfLeft') ? -1 : 1)) this.host.refuse('No other bookcase that way.');
    } else if (isAction(code, 'shelfRowUp', 'shelfRowDown')) view.moveRow(isAction(code, 'shelfRowUp') ? -1 : 1);
    // The search's other key (Slash) too: here what is looked for leans out of the shelves.
    else if (isAction(code, 'filterShelves', 'search')) {
      e?.preventDefault(); // would otherwise type into the freshly focused strip
      view.openFilter();
    }
    else if (isAction(code, 'undoMove')) {
      if (!this.undo()) this.host.react('Nothing to take back yet.');
    }
    // G on the box under the cursor: spine out, or cover out again (U takes it back).
    else if (isAction(code, 'turnShelfBox')) this.turn();
    // What would reach past the bookcase from here (the plan from above, the furniture, a random pick across the room): nothing.
    else return isAction(code, 'planView', 'moveFurniture', 'randomPick', 'tipBox');
    return true;
  }

  /** The view started, ended, framed something else, parked or came back, or its filter changed: the keys line and the walk follow. */
  private changed(): void {
    const view = this.parts.shelfView!;
    if (view.typing !== this.wasTyping) {
      this.wasTyping = view.typing;
      // Typing: the walk and the crosshair wait (as for the search bar); put down, what it found is told.
      this.host.setFrozen(view.typing);
      if (!view.typing) this.tellFound(view.found);
    }
    if (!view.active || view.isParked) return;
    this.host.prompt(() => this.keysLine(view), { id: 'shelf-view', until: () => !view.active || view.isParked });
  }

  private keysLine(view: ShelfViewLike): string {
    const back = `[${actionCap('leaveShelves')}] step back`;
    if (view.typing) return '[Enter] done';
    if (view.framingRow) return `[${actionCap('shelfRowUp')}] [${actionCap('shelfRowDown')}] another row · [Wheel] flip through · [${actionCap('shelfOut')}] the whole bookcase · ${back}`;
    return `[${actionCap('shelfIn')}] closer · [${actionCap('shelfLeft')}] [${actionCap('shelfRight')}] next bookcase · [${actionCap('filterShelves')}] look for · ${back}`;
  }

  /** The filter put down: what leans out says it all; only "elsewhere" or "nowhere" is said. */
  private tellFound(found: ShelfViewLike['found']): void {
    if (!found.query || found.here > 0) return;
    this.host.react(found.room > 0 ? `“${found.query}”: on another bookcase in this room.` : `No “${found.query}” on these shelves.`);
  }
}
