import type { Input } from '@/core/Input';

/** The stick's four ways and the fire button, held or not: what a game is handed each frame before the press edge is added. */
export interface HeldControls {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
}

/** `HeldControls` with fire's press edge: `firePressed` is true on the one frame fire went down. */
export interface GameControls extends HeldControls {
  firePressed: boolean;
}

/** Which key codes hold each way and fire (the arcade's action codes, `world/arcade/arcadeKeys`). */
type ControlKeys = Readonly<Record<keyof HeldControls, readonly string[]>>;

/**
 * Fire's press edge, worked out here and nowhere else: `press(held)` adds `firePressed` to controls
 * something else holds (a pad on the TV, a recorded step). A click may stand in for the trigger
 * (`click`), and the press that started a play or locked the pointer is not a shot (`latch`: fire
 * counts only once let go).
 */
export class FireEdge {
  private lastFire = false;
  private latched = false;
  private clicked = false;

  /** A click counts as a fire press on the next reading (a light gun's trigger, the wheel's lever). */
  click(): void {
    this.clicked = true;
  }

  /** Fire counts only once it has been let go: the press that started the play, or the click that locked the pointer, is not a shot. */
  latch(): void {
    this.latched = true;
    this.lastFire = true;
    this.clicked = false;
  }

  /** Forgets the edges; `fireDown` takes fire as down right now (the press that opened a screen must not count as a new one). */
  reset(fireDown = false): void {
    this.lastFire = fireDown;
    this.latched = false;
    this.clicked = false;
  }

  /** `held` with fire's edge, `click()` and `latch()` applied. */
  press(held: HeldControls): GameControls {
    let fire = held.fire || this.clicked;
    this.clicked = false;
    if (this.latched) {
      if (!fire) this.latched = false;
      fire = false;
    }
    const controls: GameControls = { ...held, fire, firePressed: fire && !this.lastFire };
    this.lastFire = fire;
    return controls;
  }
}

/** A `FireEdge` over the keys: `read()` is the player's controls this frame, straight from `Input` (the machines). */
export class GameInput extends FireEdge {
  constructor(
    private readonly keys: ControlKeys,
    private readonly input: Input,
  ) {
    super();
  }

  read(): GameControls {
    const { input, keys } = this;
    return this.press({
      left: input.isDown(...keys.left),
      right: input.isDown(...keys.right),
      up: input.isDown(...keys.up),
      down: input.isDown(...keys.down),
      fire: input.isDown(...keys.fire),
    });
  }
}

/** The keys of a game's controls that are held down or not. */
export type ControlKey = keyof HeldControls;

/**
 * Edge detection over the frames that read it: `pressed(controls, key)` is true on the first frame
 * `key` is down since it was last up. Each key is tracked on its own, only when asked about, so a
 * game that reads a key only while its rules run sees a press from where it last looked.
 */
export class KeyEdges {
  private held: Partial<Record<ControlKey, boolean>>;

  /** `initial`: keys taken as already down (the fire press that opened an initials screen must not sign it). */
  constructor(private readonly initial: Partial<Record<ControlKey, boolean>> = {}) {
    this.held = { ...initial };
  }

  pressed(controls: HeldControls | GameControls, key: ControlKey): boolean {
    const down = controls[key];
    const edge = down && !this.held[key];
    this.held[key] = down;
    return edge;
  }

  /** Whether `key` was down the last time it was asked about (an autopilot lets go before pressing again). */
  isHeld(key: ControlKey): boolean {
    return this.held[key] ?? false;
  }

  reset(): void {
    this.held = { ...this.initial };
  }
}
