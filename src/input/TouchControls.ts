import './TouchControls.css';
import type { Input } from '@/core/Input';
import { SPRINT_CODE, type FirstPersonController } from '@/player/FirstPersonController';
import type { SyntheticMouse } from './SyntheticMouse';
import { isTouchDevice, watchForTouch } from './deviceDetect';

/** One on-screen button: its label and the key code it presses through `Input`. */
export interface TouchButton {
  label: string;
  code: string;
  title?: string;
}

/**
 * Default action bar. Sitting has no key (tap the armchair); `KeyE` both puts a box back and
 * stands up, which is why it is labelled for both.
 */
export const DEFAULT_TOUCH_BUTTONS: TouchButton[] = [
  { label: 'Put back', code: 'KeyE', title: 'Put the game back / stand up' },
  { label: 'Open', code: 'KeyO', title: 'Open the box' },
  { label: 'Search', code: 'Slash', title: 'Search the collection' },
  { label: 'Games', code: 'Tab', title: 'Collection' },
  { label: 'Menu', code: 'Escape', title: 'Back to the start screen' },
];

export interface TouchControlsOptions {
  buttons?: TouchButton[];
  /** Radians of camera turn per CSS pixel of drag. */
  lookSensitivity?: number;
  /** Joystick travel (CSS pixels) for full walking speed. */
  joystickRadius?: number;
  /** Pushing the joystick past `sprintRatio × joystickRadius` sprints. */
  sprintRatio?: number;
  /** A touch shorter than this that does not move counts as a tap (primary click). */
  tapMaxMs?: number;
  /** Movement (CSS pixels) beyond which a touch is a drag, not a tap / long press. */
  tapMaxMove?: number;
  /** Holding still this long presses the right mouse button (rotate the carried box) until release. */
  longPressMs?: number;
  /** Fraction of the screen width, from the left, that spawns the joystick; the rest is the look zone. */
  moveZone?: number;
}

interface StickPointer {
  id: number;
  originX: number;
  originY: number;
}

interface LookPointer {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  moved: boolean;
  longPress: boolean;
  timer: number;
}

const MOVE = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' } as const;
const STICK_DEAD_ZONE = 0.12;

/**
 * Phone / tablet controls drawn over the room:
 * - left half of the screen: a floating joystick → analog holds on WASD codes (push far to sprint);
 * - right half: drag to look (`player.applyLook`), tap for a primary click at the crosshair,
 *   long-press to hold the right mouse button and drag to rotate the carried box;
 * - an action bar whose buttons press key codes through `Input.pressVirtual`.
 * Listens on the canvas itself (pointer events, non-mouse pointers only), so the desktop mouse and
 * every HUD element above the canvas behave exactly as before. Activates on coarse-pointer devices,
 * or lazily at the first real touch.
 */
export class TouchControls {
  private active = false;
  private stick: StickPointer | null = null;
  private look: LookPointer | null = null;
  private readonly opts: Required<TouchControlsOptions>;

  private readonly stickEl: HTMLDivElement;
  private readonly knobEl: HTMLDivElement;
  private readonly barEl: HTMLDivElement;
  private readonly badgeEl: HTMLDivElement;

  constructor(
    container: HTMLElement,
    private readonly canvas: HTMLElement,
    private readonly input: Input,
    private readonly player: FirstPersonController,
    private readonly mouse: SyntheticMouse,
    options: TouchControlsOptions = {},
  ) {
    this.opts = {
      buttons: options.buttons ?? DEFAULT_TOUCH_BUTTONS,
      lookSensitivity: options.lookSensitivity ?? 0.0045,
      joystickRadius: options.joystickRadius ?? 56,
      sprintRatio: options.sprintRatio ?? 1.4,
      tapMaxMs: options.tapMaxMs ?? 250,
      tapMaxMove: options.tapMaxMove ?? 12,
      longPressMs: options.longPressMs ?? 450,
      moveZone: options.moveZone ?? 0.5,
    };

    this.stickEl = document.createElement('div');
    this.stickEl.className = 'touch-stick';
    const size = `${this.opts.joystickRadius * 2}px`;
    this.stickEl.style.width = size;
    this.stickEl.style.height = size;
    this.stickEl.hidden = true;
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'touch-stick__knob';
    this.stickEl.appendChild(this.knobEl);

    this.barEl = document.createElement('div');
    this.barEl.className = 'touch-bar';
    this.barEl.hidden = true;
    for (const button of this.opts.buttons) this.barEl.appendChild(this.createButton(button));

    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'touch-badge';
    this.badgeEl.textContent = 'Rotating — drag, release to stop';
    this.badgeEl.hidden = true;

    container.append(this.stickEl, this.barEl, this.badgeEl);

    if (isTouchDevice()) this.activate();
    else watchForTouch(() => this.activate());
  }

  private activate(): void {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('touch-device');

    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    // Cancelling the touch events kills page scroll, pinch-zoom and the compatibility mouse events.
    const swallow = (e: Event) => e.preventDefault();
    canvas.addEventListener('touchstart', swallow, { passive: false });
    canvas.addEventListener('touchmove', swallow, { passive: false });
    canvas.addEventListener('touchend', swallow, { passive: false });
    document.addEventListener('gesturestart', swallow); // iOS Safari pinch

    this.player.controls.addEventListener('lock', () => this.setInRoom(true));
    this.player.controls.addEventListener('unlock', () => this.setInRoom(false));
    this.setInRoom(this.player.isLocked);
  }

  private setInRoom(inRoom: boolean): void {
    this.barEl.hidden = !inRoom;
    if (!inRoom) {
      this.endStick();
      if (this.look) this.endLook(this.look, false);
      this.mouse.releaseAll();
    }
  }

  private createButton(button: TouchButton): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'touch-bar__btn';
    el.textContent = button.label;
    if (button.title) el.title = button.title;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); // no focus ring, no compatibility mouse events reaching the Session
      el.classList.add('is-pressed');
      this.input.pressVirtual(button.code);
    });
    const release = () => el.classList.remove('is-pressed');
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
    return el;
  }

  // --- Pointer routing --------------------------------------------------------------------------

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return; // the desktop mouse keeps its pointer-lock path
    e.preventDefault();
    if (!this.player.isLocked) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety: the finger may leave the canvas without losing the gesture */
    }
    if (e.clientX < window.innerWidth * this.opts.moveZone) {
      if (!this.stick) this.beginStick(e);
    } else if (!this.look) {
      this.beginLook(e);
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.stick?.id === e.pointerId) this.updateStick(e);
    else if (this.look?.id === e.pointerId) this.updateLook(e);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.stick?.id === e.pointerId) this.endStick();
    else if (this.look?.id === e.pointerId) this.endLook(this.look, e.type === 'pointerup');
  };

  // --- Joystick ---------------------------------------------------------------------------------

  private beginStick(e: PointerEvent): void {
    this.stick = { id: e.pointerId, originX: e.clientX, originY: e.clientY };
    this.stickEl.style.left = `${e.clientX - this.opts.joystickRadius}px`;
    this.stickEl.style.top = `${e.clientY - this.opts.joystickRadius}px`;
    this.knobEl.style.transform = 'translate(-50%, -50%)';
    this.stickEl.classList.remove('touch-stick--sprint');
    this.stickEl.hidden = false;
  }

  private updateStick(e: PointerEvent): void {
    const stick = this.stick!;
    const radius = this.opts.joystickRadius;
    let x = (e.clientX - stick.originX) / radius;
    let y = (e.clientY - stick.originY) / radius;
    const magnitude = Math.hypot(x, y);
    const sprint = magnitude > this.opts.sprintRatio;
    if (magnitude > 1) {
      x /= magnitude;
      y /= magnitude;
    }
    this.knobEl.style.transform = `translate(calc(-50% + ${x * radius}px), calc(-50% + ${y * radius}px))`;
    this.stickEl.classList.toggle('touch-stick--sprint', sprint);

    const engaged = magnitude >= STICK_DEAD_ZONE;
    const strengths = {
      up: engaged ? Math.max(0, -y) : 0,
      down: engaged ? Math.max(0, y) : 0,
      left: engaged ? Math.max(0, -x) : 0,
      right: engaged ? Math.max(0, x) : 0,
    };
    const wasEngaged = Object.values(MOVE).some((code) => this.input.strength(code) > 0);
    for (const dir of Object.keys(MOVE) as (keyof typeof MOVE)[]) this.input.holdVirtual(MOVE[dir], strengths[dir]);
    this.input.holdVirtual(SPRINT_CODE, sprint);
    if (engaged && !wasEngaged) {
      // Engaging the stick counts as one key press: the Session uses it to stand up from the armchair.
      const dominant = (Object.keys(strengths) as (keyof typeof MOVE)[]).reduce((a, b) => (strengths[b] > strengths[a] ? b : a));
      this.input.pressVirtual(MOVE[dominant]);
    }
  }

  private endStick(): void {
    if (!this.stick) return;
    this.stick = null;
    this.stickEl.hidden = true;
    for (const code of Object.values(MOVE)) this.input.holdVirtual(code, 0);
    this.input.holdVirtual(SPRINT_CODE, 0);
  }

  // --- Look / tap / long press ------------------------------------------------------------------

  private beginLook(e: PointerEvent): void {
    const look: LookPointer = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      startTime: performance.now(),
      moved: false,
      longPress: false,
      timer: 0,
    };
    look.timer = window.setTimeout(() => {
      if (this.look !== look || look.moved) return;
      look.longPress = true;
      this.mouse.down(2); // Inspector: start rotating the carried box, look is paused meanwhile
      this.badgeEl.hidden = !this.player.isLocked || this.player.lookEnabled;
    }, this.opts.longPressMs);
    this.look = look;
  }

  private updateLook(e: PointerEvent): void {
    const look = this.look!;
    const dx = e.clientX - look.lastX;
    const dy = e.clientY - look.lastY;
    look.lastX = e.clientX;
    look.lastY = e.clientY;
    if (!look.moved && Math.hypot(e.clientX - look.startX, e.clientY - look.startY) > this.opts.tapMaxMove) {
      look.moved = true;
      if (!look.longPress) window.clearTimeout(look.timer);
    }
    if (!look.moved) return;
    if (this.player.lookEnabled) {
      const s = this.opts.lookSensitivity;
      this.player.applyLook(dx * s, dy * s);
    } else {
      this.mouse.move(dx, dy); // rotating the held box: Inspector consumes mouse-like deltas
    }
  }

  private endLook(look: LookPointer, completed: boolean): void {
    window.clearTimeout(look.timer);
    this.look = null;
    this.badgeEl.hidden = true;
    if (look.longPress) {
      this.mouse.up(2);
      return;
    }
    const quick = performance.now() - look.startTime < this.opts.tapMaxMs;
    if (completed && !look.moved && quick) this.mouse.click(0);
  }
}
