import { isAction } from '@/input/actions';
import { actionKeyLabel } from '@/ui/keys';
import type { ProgramRunner, ScreenProgram } from '@/onscreen';
import type { KeyRoute, SessionHost } from './SessionHost';

export interface ProgramParts {
  /** Runs the games that are programs on the flat's screens (`src/onscreen`); absent: they play as longplays. */
  programs?: ProgramRunner;
}

/** Two presses of walk-away this close together (ms) put the pad down and switch the program off. */
const PUT_DOWN_CONFIRM_MS = 1500;

/**
 * Holding the pad of a program on the TV (`onscreen/ProgramRunner`: the emulator with a homebrew cart, a canvas
 * game): when one comes on the player picks the pad up where they are (in the armchair they sat in, or standing
 * where they stood: the walk and the crosshair are frozen), every key is the program's but walk-away, twice,
 * which puts the pad down and switches the set off. The pointer unlocked holds the program still.
 */
export class ProgramPlay implements KeyRoute {
  /** Whether the walk and the crosshair were frozen for the pad, to give them back. */
  private frozen = false;
  private armed = 0;

  constructor(private readonly parts: ProgramParts, private readonly host: SessionHost) {
    parts.programs?.listen({
      started: (program) => this.pickUp(program),
      stopped: () => this.letGo(),
    });
  }

  /** Whether the player holds a program's pad. */
  get holding(): boolean {
    return this.parts.programs?.isHolding ?? false;
  }

  /** The pointer was unlocked: a program being played holds still. True when one was held. */
  hold(): boolean {
    if (!this.holding) return false;
    this.parts.programs?.setPaused(true);
    return true;
  }

  /** The pointer is locked again: the program goes on. */
  resume(): void {
    this.parts.programs?.setPaused(false);
  }

  /** Puts the pad down and switches the program off. False when the player held none. */
  leave(): boolean {
    if (!this.holding) return false;
    this.parts.programs?.stop();
    return true;
  }

  onKey(code: string): boolean {
    if (!this.holding) return false;
    if (isAction(code, 'walkAway')) {
      const now = performance.now();
      if (now - this.armed > PUT_DOWN_CONFIRM_MS) {
        this.armed = now;
        this.host.react(`${actionKeyLabel('walkAway')} again to put the pad down.`);
      } else {
        this.armed = 0;
        this.leave();
      }
    }
    return true;
  }

  private pickUp(program: ScreenProgram): void {
    this.host.putBack();
    // Where they are (the armchair, or standing): no walking, no clicking about while the pad is in hand.
    this.host.setFrozen(true);
    this.frozen = true;
    this.parts.programs?.setHolding(true);
    this.host.tip(`${program.hint}\n${actionKeyLabel('walkAway')} twice puts the pad down.`, { id: 'program-pad', until: () => !this.holding });
  }

  private letGo(): void {
    if (this.frozen) this.host.setFrozen(false);
    this.frozen = false;
    this.armed = 0;
  }
}
