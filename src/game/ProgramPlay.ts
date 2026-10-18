import { isAction } from '@/input/actions';
import { Arming } from '@/ui/confirmTwice';
import { actionKeyLabel } from '@/ui/keys';
import type { ProgramRunner, ScreenProgram } from '@/onscreen';
import type { KeyRoute, SessionHost } from './SessionHost';
import type { MediaDeck } from '@/world/media/MediaDeck';
import type { PlatformId } from '@/catalog/types';
import * as THREE from 'three';
import { closeUp } from '@/player/closeUp';
import { padInView } from '@/player/padInView';

/** The pad picked up: the view turns to the set and draws in a little, and lets go once the player looks or walks away. */
const PAD_FRAMING = { zoom: 1.18, leaveAngle: 0.9, leaveDistance: 1.2 };

export interface ProgramParts {
  /** Runs the games that are programs on the flat's screens (`src/onscreen`); absent: they play as longplays. */
  programs?: ProgramRunner;
}

/**
 * A program's controls line names the pad's buttons ("A jumps", "D-pad moves"): each gets the key it is on here as a
 * key cap next to it ("A [K] jumps"), so the line is read on the keyboard (rebound keys and AZERTY included).
 */
function padHint(hint: string): string {
  const cap = (id: 'padA' | 'padB' | 'padStart' | 'padSelect'): string => `[${actionKeyLabel(id)}]`;
  const dpad = (['stickUp', 'stickLeft', 'stickDown', 'stickRight'] as const).map((id) => `[${actionKeyLabel(id)}]`).join('');
  return hint.replace(/\b(D-pad|Start|Select|A|B)\b/g, (button: string) => {
    if (button === 'D-pad') return `D-pad ${dpad}`;
    return `${button} ${cap(button === 'A' ? 'padA' : button === 'B' ? 'padB' : button === 'Start' ? 'padStart' : 'padSelect')}`;
  });
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
  /** The framing on the set while the pad is held, let go with it. */
  private framing: (() => void) | null = null;
  /** The console's pad lifted into view while held, put back with it. */
  private padDown: (() => void) | null = null;
  /** Walk-away pressed once: a second press within `PUT_DOWN_CONFIRM_MS` puts the pad down (nothing to repaint, the reaction says it). */
  private readonly arming = new Arming<'putDown'>(() => {}, PUT_DOWN_CONFIRM_MS);

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
    // X is no button of the pad: it goes on to `NoticeDismiss`, a banner or a card closed without putting the pad down.
    if (isAction(code, 'dismissNotice')) return false;
    if (isAction(code, 'walkAway')) {
      if (this.arming.press('putDown')) this.leave();
      else this.host.react(`${actionKeyLabel('walkAway')} again to put the pad down.`);
    }
    return true;
  }

  private pickUp(program: ScreenProgram): void {
    this.host.putBack();
    // Where they are (the armchair, or standing): no walking, no clicking about while the pad is in hand.
    this.host.setFrozen(true);
    this.frozen = true;
    this.parts.programs?.setHolding(true);
    const screen = this.parts.programs?.currentScreen;
    if (screen instanceof THREE.Object3D) this.framing = closeUp(screen, PAD_FRAMING);
    // The pad of the game's console (the TV's stand) comes up into the hands.
    const game = this.parts.programs?.currentGame;
    const deck = game && screen && 'deckFor' in screen ? (screen as { deckFor(p: PlatformId): MediaDeck | null }).deckFor(game.platform) : null;
    const model = deck?.padModel?.();
    if (model) this.padDown = padInView(model.pad, model.cable);
    this.host.prompt(`${padHint(program.hint)} · [${actionKeyLabel('walkAway')}] twice: pad down`, { id: 'program-pad', until: () => !this.holding });
  }

  private letGo(): void {
    this.framing?.();
    this.framing = null;
    this.padDown?.();
    this.padDown = null;
    if (this.frozen) this.host.setFrozen(false);
    this.frozen = false;
    this.arming.reset();
  }
}
