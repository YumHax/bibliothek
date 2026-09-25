import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import { SPRINT_CODE, type FirstPersonController } from '@/player/FirstPersonController';
import { primaryCode } from './actions';
import { GAMEPAD_BUTTON_CODES } from './padButtons';
import type { SyntheticMouse } from './SyntheticMouse';

export { GAMEPAD_BUTTON_CODES } from './padButtons';

export interface GamepadOptions {
  /** Radial dead zone of both sticks, in [0, 1). */
  deadZone?: number;
  /** Look speed at full right-stick tilt, radians per second. */
  lookSpeed?: number;
  /** Response curve exponent of the right stick (> 1 gives finer control near the centre). */
  lookCurve?: number;
  invertY?: boolean;
  /** How fast a full right-stick tilt spins a carried box, in synthetic mouse pixels per second. */
  rotateSpeed?: number;
  /**
   * Extra key codes pressed alongside a button's own code, e.g. `{ GamepadX: 'KeyE', GamepadY: 'KeyO' }`
   * (the action table's `PAD_ALIASES`). Empty by default so the Session can bind the `Gamepad*` codes
   * itself without double actions.
   */
  keyAliases?: Record<string, string>;
  onConnectionChange?(connected: boolean, gamepad: Gamepad | null): void;
}

const BUTTON = { A: 0, B: 1, LB: 4, RB: 5, LS: 10, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
/** Codes the left stick / d-pad hold, i.e. what the controller reads for movement. */
const MOVE = { up: primaryCode('forward'), down: primaryCode('back'), left: primaryCode('left'), right: primaryCode('right') } as const;
/** Crouch code owned by the gamepad (touch never holds it, so the two never fight). */
const CROUCH_CODE = primaryCode('crouch');

/**
 * Polls the first connected gamepad each frame (standard mapping) and translates it into what the
 * rest of the app already understands:
 * - left stick / d-pad → analog holds on WASD codes (the controller reads `input.axis`), plus one
 *   virtual key press when the stick engages so a seated player stands up like on the keyboard;
 * - right stick → `player.applyLook`, or synthetic `mousemove` while a box is being rotated;
 * - A → left mouse button, B and RB → right mouse button (held, like the real buttons);
 * - left stick click → sprint (`SPRINT_CODE` held), LB → crouch (`ShiftLeft` held);
 * - every button → an `Input` press code (`GamepadA`, `GamepadStart`, …) for the Session / PointerLockFlow.
 */
export class GamepadInput implements Updatable {
  private readonly held: boolean[] = [];
  private readonly appliedHolds = new Map<string, number>();
  private connected = false;
  private stickEngaged = false;
  private readonly opts: Required<Omit<GamepadOptions, 'onConnectionChange'>> & Pick<GamepadOptions, 'onConnectionChange'>;
  private lookScale = 1;

  constructor(
    private readonly input: Input,
    private readonly player: FirstPersonController,
    private readonly mouse: SyntheticMouse,
    options: GamepadOptions = {},
  ) {
    this.opts = {
      deadZone: options.deadZone ?? 0.18,
      lookSpeed: options.lookSpeed ?? 2.6,
      lookCurve: options.lookCurve ?? 1.7,
      invertY: options.invertY ?? false,
      rotateSpeed: options.rotateSpeed ?? 500,
      keyAliases: options.keyAliases ?? {},
      onConnectionChange: options.onConnectionChange,
    };
  }

  /** Settings > Look: `speed` multiplies the configured `lookSpeed`. */
  setLook(options: { speed: number; invertY: boolean }): void {
    this.lookScale = options.speed;
    this.opts.invertY = options.invertY;
  }

  update(dt: number): void {
    const pad = pickGamepad();
    if (!pad) {
      if (this.connected) this.disconnect();
      return;
    }
    if (!this.connected) {
      this.connected = true;
      this.opts.onConnectionChange?.(true, pad);
    }
    this.updateButtons(pad);
    this.updateMovement(pad);
    this.updateLook(pad, dt);
  }

  private updateButtons(pad: Gamepad): void {
    const count = Math.max(pad.buttons.length, this.held.length);
    for (let i = 0; i < count; i++) {
      const down = pad.buttons[i]?.pressed ?? false;
      const was = this.held[i] ?? false;
      if (down === was) continue;
      this.held[i] = down;
      if (down) this.onButtonDown(i);
      else this.onButtonUp(i);
    }
    this.hold(SPRINT_CODE, this.isHeld(BUTTON.LS) ? 1 : 0);
    this.hold(CROUCH_CODE, this.isHeld(BUTTON.LB) ? 1 : 0);
  }

  private onButtonDown(index: number): void {
    // Read this before the press: on the start card the press itself enters the room, and the
    // same push must not also click whatever the crosshair happens to be over.
    const inRoom = this.player.isLocked;
    const code = GAMEPAD_BUTTON_CODES[index];
    if (code) {
      this.input.pressVirtual(code);
      const alias = this.opts.keyAliases[code];
      if (alias) this.input.pressVirtual(alias);
    }
    if (!inRoom) return;
    if (index === BUTTON.A) this.mouse.down(0);
    if (index === BUTTON.B || index === BUTTON.RB) this.mouse.down(2);
  }

  private onButtonUp(index: number): void {
    if (index === BUTTON.A) this.mouse.up(0);
    if ((index === BUTTON.B || index === BUTTON.RB) && !this.isHeld(BUTTON.B) && !this.isHeld(BUTTON.RB)) {
      this.mouse.up(2);
    }
  }

  private updateMovement(pad: Gamepad): void {
    const [x, y] = radial(pad.axes[0] ?? 0, pad.axes[1] ?? 0, this.opts.deadZone, 1);
    const strengths = {
      up: this.isHeld(BUTTON.UP) ? 1 : Math.max(0, -y),
      down: this.isHeld(BUTTON.DOWN) ? 1 : Math.max(0, y),
      left: this.isHeld(BUTTON.LEFT) ? 1 : Math.max(0, -x),
      right: this.isHeld(BUTTON.RIGHT) ? 1 : Math.max(0, x),
    };
    let dominant: keyof typeof MOVE = 'up';
    let engaged = false;
    for (const dir of Object.keys(MOVE) as (keyof typeof MOVE)[]) {
      this.hold(MOVE[dir], strengths[dir]);
      if (strengths[dir] > 0) engaged = true;
      if (strengths[dir] > strengths[dominant]) dominant = dir;
    }
    // Engaging the stick counts as one key press: the Session uses it to stand up from the armchair.
    if (engaged && !this.stickEngaged) this.input.pressVirtual(MOVE[dominant]);
    this.stickEngaged = engaged;
  }

  private updateLook(pad: Gamepad, dt: number): void {
    if (!this.player.isLocked) return;
    const [x, rawY] = radial(pad.axes[2] ?? 0, pad.axes[3] ?? 0, this.opts.deadZone, this.opts.lookCurve);
    if (x === 0 && rawY === 0) return;
    const y = this.opts.invertY ? -rawY : rawY;
    if (this.player.lookEnabled) {
      const speed = this.opts.lookSpeed * this.lookScale;
      this.player.applyLook(x * speed * dt, y * speed * dt);
    } else {
      // Look is disabled while the Inspector rotates the held box: feed it mouse-like deltas instead.
      this.mouse.move(x * this.opts.rotateSpeed * dt, y * this.opts.rotateSpeed * dt);
    }
  }

  private isHeld(index: number): boolean {
    return this.held[index] ?? false;
  }

  /** Writes a virtual hold only when it changes, so an idle gamepad never overrides another source. */
  private hold(code: string, strength: number): void {
    const previous = this.appliedHolds.get(code) ?? 0;
    if (previous === strength) return;
    this.appliedHolds.set(code, strength);
    this.input.holdVirtual(code, strength);
  }

  private disconnect(): void {
    this.connected = false;
    this.held.length = 0;
    this.stickEngaged = false;
    for (const code of this.appliedHolds.keys()) this.hold(code, 0);
    this.mouse.releaseAll();
    this.opts.onConnectionChange?.(false, null);
  }
}

/** Radial dead zone with rescaling to [0, 1] and an optional response curve. */
function radial(x: number, y: number, deadZone: number, curve: number): [number, number] {
  const length = Math.hypot(x, y);
  if (length <= deadZone) return [0, 0];
  const scaled = Math.min(1, (length - deadZone) / (1 - deadZone)) ** curve;
  return [(x / length) * scaled, (y / length) * scaled];
}

/** First connected gamepad, preferring one with the standard mapping. `null` when the API is unavailable. */
function pickGamepad(): Gamepad | null {
  if (typeof navigator.getGamepads !== 'function') return null;
  let fallback: Gamepad | null = null;
  try {
    for (const pad of navigator.getGamepads()) {
      if (!pad || !pad.connected) continue;
      if (pad.mapping === 'standard') return pad;
      fallback ??= pad;
    }
  } catch {
    return null; // permissions policy / insecure context
  }
  return fallback;
}
