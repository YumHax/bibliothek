import './PointerLockFlow.css';
import type { FirstPersonController } from './FirstPersonController';
import type { Overlay } from '@/ui/Overlay';
import type { Input } from '@/core/Input';
import { isTouchDevice } from '@/input/deviceDetect';
import { lastDevice } from '@/input/lastDevice';
import { isAction } from '@/input/actions';
import type { PadButton } from '@/input/padButtons';

/** The controller's Start: in and out of the room (no action of the table: it is not a key the Session hears). */
const START: PadButton = 'GamepadStart';

/** Chrome refuses a new pointer lock for ~1 s after Esc; we retry once after that cooldown. */
const LOCK_RETRY_MS = 1200;

/** How the player is in the room; `null` while the start card is showing. */
type RoomMode = 'pointer' | 'gamepad' | 'touch';

const MODE_CLASS: Record<RoomMode, string> = {
  pointer: 'input-pointer',
  gamepad: 'input-gamepad',
  touch: 'input-touch',
};
const VIRTUAL_CLASS = 'input-virtual';
/** Real mouse button events we swallow while the mouse is not the active device. */
const MOUSE_BUTTON_EVENTS = ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'] as const;

/**
 * Entering and leaving the room, in three modes:
 * - `pointer`: start card → pointer lock (with retry) → crosshair, and back on Esc. Clicking the
 *   canvas after Esc re-enters without going through the card.
 * - `gamepad`: a gamepad button on the card enters a *virtual* lock (pointer lock needs a user
 *   gesture, which a gamepad press is not), except the presses the menu uses to navigate
 *   (`Overlay.wasHandled`). The mouse is ignored and its cursor hidden;
 *   Start or Esc returns to the card. Start while pointer-locked releases the mouse like Esc.
 * - `touch`: on coarse-pointer devices the card's tap enters a virtual lock too; `TouchControls`
 *   provides look / move / tap, and its Menu button (Esc) returns to the card.
 * The `<body>` carries `input-pointer` / `input-gamepad` / `input-touch` (+ `input-virtual`) while in the room.
 */
export class PointerLockFlow {
  private attempt = 0;
  private _mode: RoomMode | null = null;
  /** The mode the player was last in the room with, for `resume`. */
  private lastMode: RoomMode | null = null;
  private pendingVirtual: RoomMode | null = null;
  /** The controller mode's keys have been shown this session (once is enough). */
  private controllerTipShown = false;

  /**
   * `input` is optional for backwards compatibility; without it gamepad Start / Esc cannot
   * enter or leave the room (touch and mouse still work).
   */
  constructor(
    private readonly player: FirstPersonController,
    private readonly overlay: Overlay,
    canvas: HTMLElement,
    input?: Input,
    /** Where a refused lock is announced, and the controller mode's keys shown. */
    private readonly notices?: { alert(text: string, ms?: number): void; tip(text: string, options?: { id?: string; ms?: number }): unknown },
  ) {
    player.controls.addEventListener('lock', () => {
      const mode: RoomMode = player.hasPointerLock ? 'pointer' : (this.pendingVirtual ?? 'gamepad');
      this.pendingVirtual = null;
      this.setMode(mode);
      // The menu goes once the lock is really there (a refused one keeps it up, saying "Resuming…").
      overlay.setResuming(false);
      overlay.setPlaying(true);
    });
    player.controls.addEventListener('unlock', () => {
      overlay.setPlaying(false);
      this.setMode(null);
    });
    canvas.addEventListener('click', () => {
      if (!player.isLocked) void this.enter();
    });

    // In a virtual mode the real mouse is ignored: swallow its button events aimed at the 3D view.
    // Synthetic events from the gamepad / touch layer are untrusted and pass; HUD elements are untouched.
    for (const type of MOUSE_BUTTON_EVENTS) {
      window.addEventListener(
        type,
        (e) => {
          if (!e.isTrusted || !this._mode || this._mode === 'pointer') return;
          if (e.target !== canvas && e.target !== document.body && e.target !== canvas.parentElement) return;
          e.stopImmediatePropagation();
          e.preventDefault();
        },
        true,
      );
    }

    // In controller mode, a real mouse button on the 3D view takes the mouse back: out of the virtual lock and
    // into a pointer lock (the press is a gesture, so the browser allows it). It does nothing else.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!e.isTrusted || e.pointerType !== 'mouse' || this._mode !== 'gamepad' || e.target !== canvas) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        this.player.exitVirtual();
        void this.enter('pointer');
      },
      true,
    );

    input?.onPress((code) => this.onPress(code));
  }

  /** Current mode, `null` on the start card. */
  get mode(): RoomMode | null {
    return this._mode;
  }

  /**
   * Enters the room. Without an explicit `mode`, touch devices get a virtual lock and everything
   * else asks the browser for a pointer lock.
   */
  async enter(mode?: RoomMode): Promise<void> {
    if (!this.overlay.ready) return; // the world is still loading: the start card says so
    const attempt = ++this.attempt;
    this.overlay.setResuming(false); // a newer try takes over from one still waiting
    const chosen = mode ?? (isTouchDevice() ? 'touch' : 'pointer');
    if (chosen !== 'pointer') {
      this.enterVirtual(chosen);
      return;
    }
    // No gesture behind this (a panel closed with Esc, which is not one): the browser would refuse the
    // lock, so ask quietly for the click that it needs instead of trying and failing out loud. A panel
    // closed from the controller (its B) goes back in the controller's way, which needs no gesture.
    if (!hasUserGesture()) {
      if (lastDevice() === 'gamepad') this.enterVirtual('gamepad');
      else this.overlay.promptReturn();
      return;
    }
    // The menu stays until the lock is there (the `lock` listener hides it).
    if (await this.player.lock()) return;
    if (attempt !== this.attempt) return; // superseded by a newer click
    // Refused, most likely Chrome's cooldown after Esc: the card says "Resuming…" and asks once more, quietly.
    this.overlay.setResuming(true);
    await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
    if (attempt !== this.attempt || this.player.isLocked) return;
    if (!(await this.player.lock())) {
      if (attempt !== this.attempt) return;
      this.overlay.setResuming(false);
      this.overlay.setPlaying(false);
      this.notices?.alert('The browser would not lock the mouse. Click the room to try again.');
    }
  }

  /**
   * Goes back into the room the way the player was last in it (after a panel closed): a controller
   * player gets the virtual lock again instead of a pointer lock nobody clicked for.
   */
  resume(): Promise<void> {
    return this.enter(this.lastMode ?? undefined);
  }

  /** Leaves the room whichever way it was entered (releases the pointer lock or the virtual one). */
  exit(): void {
    if (this.player.hasPointerLock) this.player.unlock();
    else this.player.exitVirtual();
  }

  private enterVirtual(mode: RoomMode): void {
    if (this.player.isLocked) return;
    this.pendingVirtual = mode;
    this.overlay.setPlaying(true);
    this.player.enterVirtual();
    if (mode === 'gamepad' && !this.controllerTipShown) {
      this.controllerTipShown = true;
      this.notices?.tip('Controller mode: press Start or Esc for the menu.', { id: 'controller-mode', ms: 8000 });
    }
  }

  private onPress(code: string): void {
    // A D-pad move or a pick in the menu is not a request to enter the room, nor is a press in a panel.
    if (this.overlay.wasHandled(code) || this.overlay.isModal) return;
    if (code === START) {
      if (this.player.isLocked) this.exit();
      else void this.enter('gamepad');
      return;
    }
    if (code.startsWith('Gamepad')) {
      if (!this.player.isLocked) void this.enter('gamepad');
      return;
    }
    // Esc leaves a real pointer lock through the browser; a virtual lock needs us to do it.
    if (isAction(code, 'close') && this.player.isVirtualLocked) this.exit();
  }

  private setMode(mode: RoomMode | null): void {
    if (mode === this._mode) return;
    this._mode = mode;
    if (mode) this.lastMode = mode;
    const classes = document.body.classList;
    for (const cls of Object.values(MODE_CLASS)) classes.remove(cls);
    classes.remove(VIRTUAL_CLASS);
    if (mode) {
      classes.add(MODE_CLASS[mode]);
      if (mode !== 'pointer') classes.add(VIRTUAL_CLASS);
    }
  }
}

/**
 * Whether the page is handling a user gesture now (a click, a key other than Esc), which a pointer
 * lock needs. Unknown (an older browser without `navigator.userActivation`): assume yes and try.
 */
function hasUserGesture(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation ? activation.isActive : true;
}
