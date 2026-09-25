import './PointerLockFlow.css';
import type { FirstPersonController } from './FirstPersonController';
import type { Overlay } from '@/ui/Overlay';
import type { Input } from '@/core/Input';
import { isTouchDevice } from '@/input/deviceDetect';

/** Chrome refuses a new pointer lock for ~1 s after Esc; we retry once after that cooldown. */
const LOCK_RETRY_MS = 1200;

/** How the player is in the room; `null` while the start card is showing. */
export type RoomMode = 'pointer' | 'gamepad' | 'touch';

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
  private pendingVirtual: RoomMode | null = null;

  /**
   * `input` is optional for backwards compatibility; without it gamepad Start / Esc cannot
   * enter or leave the room (touch and mouse still work).
   */
  constructor(
    private readonly player: FirstPersonController,
    private readonly overlay: Overlay,
    canvas: HTMLElement,
    input?: Input,
  ) {
    player.controls.addEventListener('lock', () => {
      const mode: RoomMode = player.hasPointerLock ? 'pointer' : (this.pendingVirtual ?? 'gamepad');
      this.pendingVirtual = null;
      this.setMode(mode);
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
    const attempt = ++this.attempt;
    const chosen = mode ?? (isTouchDevice() ? 'touch' : 'pointer');
    if (chosen !== 'pointer') {
      this.enterVirtual(chosen);
      return;
    }
    this.overlay.setPlaying(true);
    if (await this.player.lock()) return;
    if (attempt !== this.attempt) return; // superseded by a newer click
    this.overlay.showHint('Mouse lock refused by the browser, retrying…');
    await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
    if (attempt !== this.attempt || this.player.isLocked) return;
    if (!(await this.player.lock())) {
      this.overlay.setPlaying(false);
      this.overlay.showHint('Pointer lock unavailable. Click again, or check the page is not inside an iframe.', 5000);
    }
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
    if (mode === 'gamepad') this.overlay.showHint('Controller mode — press Start or Esc to return to the menu', 3500);
  }

  private onPress(code: string): void {
    // A D-pad move or a pick in the menu is not a request to enter the room.
    if (this.overlay.wasHandled(code)) return;
    if (code === 'GamepadStart') {
      if (this.player.isLocked) this.exit();
      else void this.enter('gamepad');
      return;
    }
    if (code.startsWith('Gamepad')) {
      if (!this.player.isLocked) void this.enter('gamepad');
      return;
    }
    // Esc leaves a real pointer lock through the browser; a virtual lock needs us to do it.
    if (code === 'Escape' && this.player.isVirtualLocked) this.exit();
  }

  private setMode(mode: RoomMode | null): void {
    if (mode === this._mode) return;
    this._mode = mode;
    const classes = document.body.classList;
    for (const cls of Object.values(MODE_CLASS)) classes.remove(cls);
    classes.remove(VIRTUAL_CLASS);
    if (mode) {
      classes.add(MODE_CLASS[mode]);
      if (mode !== 'pointer') classes.add(VIRTUAL_CLASS);
    }
  }
}
