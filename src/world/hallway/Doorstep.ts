import type { SessionActions } from '@/game/SessionActions';
import type { MailPiece } from '../props/MailDrop';
import type { DoorCaller } from './FrontDoor';

/** Someone who rings and waits on the landing outside the flat's front door (the postman). */
export interface DoorRinger {
  /** Who it is, for the front door's caption while they wait ("the postman"). */
  readonly who: string;
  /** The door was opened to them from inside: they say their piece (hand the parcel over…). */
  answer(session: SessionActions): void;
}

/**
 * The flat's doorstep, shared by the hallway (the front door, the mat) and whoever comes to the
 * door from the stairs. It is the front door's `visitors` (`FrontDoor.DoorCaller`): one ringer at a
 * time `ring`s and waits until the door is opened (no keys needed to answer the door) or gives up
 * (`leave`); with nobody of its own waiting it hands the door on to `also` (the friends who come
 * round, `src/world/visitors/`). Notes slipped under the door (`slipNote`) land on the hallway's
 * mat; one slipped before the hallway listens waits for it.
 */
export class Doorstep implements DoorCaller {
  private ringer: DoorRinger | null = null;
  private next: DoorCaller | null = null;
  private readonly noteListeners = new Set<(piece: MailPiece) => void>();
  private readonly unread: MailPiece[] = [];

  /** Who else may be at the door when no ringer of the doorstep's is (the visitors). */
  also(caller: DoorCaller | null): void {
    this.next = caller;
  }

  /** The ringer waiting at the door, if any (not the visitors). */
  get waiting(): DoorRinger | null {
    return this.ringer;
  }

  /** `ringer` rings and waits; false when someone is already at the door. */
  ring(ringer: DoorRinger): boolean {
    if (this.ringer === ringer) return true;
    if (this.ringer || this.next?.caller()) return false;
    this.ringer = ringer;
    return true;
  }

  /** `ringer` gave up (or was answered and went): the door is theirs no more. */
  leave(ringer: DoorRinger): void {
    if (this.ringer === ringer) this.ringer = null;
  }

  // --- FrontDoor.DoorCaller -------------------------------------------------------------------

  caller(): string | null {
    return this.ringer?.who ?? this.next?.caller() ?? null;
  }

  answered(session: SessionActions): void {
    const ringer = this.ringer;
    if (!ringer) {
      this.next?.answered(session);
      return;
    }
    this.ringer = null;
    ringer.answer(session);
  }

  passing(): boolean {
    return this.next?.passing() ?? false;
  }

  // --- Notes under the door -------------------------------------------------------------------

  /** A note under the door: onto the mat. */
  slipNote(piece: MailPiece): void {
    if (!this.noteListeners.size) {
      this.unread.push(piece);
      return;
    }
    for (const listener of [...this.noteListeners]) listener(piece);
  }

  /** The mat hears of every note slipped under the door (those slipped before first). Returns the unsubscribe. */
  onNote(listener: (piece: MailPiece) => void): () => void {
    this.noteListeners.add(listener);
    for (const piece of this.unread.splice(0)) listener(piece);
    return () => this.noteListeners.delete(listener);
  }
}
