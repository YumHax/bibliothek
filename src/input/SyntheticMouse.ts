export type MouseButton = 0 | 2;

/**
 * Replays gamepad / touch gestures as the DOM mouse events the rest of the app already handles
 * (`Session` reads `mousedown` on the document, `Inspector` rotates on right button + `mousemove`).
 * Events are dispatched on the canvas and bubble to the document; they are untrusted
 * (`isTrusted === false`), which is how `PointerLockFlow` tells them apart from a real mouse.
 */
export class SyntheticMouse {
  private readonly held = new Set<MouseButton>();

  constructor(private readonly target: HTMLElement) {}

  isHeld(button: MouseButton): boolean {
    return this.held.has(button);
  }

  down(button: MouseButton): void {
    if (this.held.has(button)) return;
    this.held.add(button);
    this.fire('mousedown', button, 0, 0);
  }

  up(button: MouseButton): void {
    if (!this.held.delete(button)) return;
    this.fire('mouseup', button, 0, 0);
  }

  /** A full press + release, i.e. a click at the crosshair. */
  click(button: MouseButton): void {
    this.down(button);
    this.up(button);
  }

  /** Relative motion in CSS pixels, mirroring `movementX` / `movementY` of a locked pointer. */
  move(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.fire('mousemove', 0, dx, dy);
  }

  /** Releases whatever is still held (source disconnected, left the room). */
  releaseAll(): void {
    for (const button of [...this.held]) this.up(button);
  }

  private fire(type: string, button: MouseButton, movementX: number, movementY: number): void {
    let buttons = 0;
    for (const b of this.held) buttons |= b === 0 ? 1 : 2;
    this.target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        button,
        buttons,
        movementX,
        movementY,
        // Handlers that care about a position get the crosshair.
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight / 2,
      }),
    );
  }
}
