export type KeyPressHandler = (code: string, event: KeyboardEvent) => void;

/**
 * Input state tracker. Uses `KeyboardEvent.code` so it works on AZERTY too
 * (physical key position, not the printed character).
 *
 * Besides the keyboard it accepts *virtual* input from other sources (gamepad, on-screen controls):
 * `holdVirtual(code, strength)` keeps a code held with an analog strength (a stick tilt) and
 * `pressVirtual(code)` fires the `onPress` handlers exactly as a physical key press would.
 * Consumers keep reading `isDown` / `axis` / `onPress` and never know where the input came from.
 */
export class Input {
  private readonly pressed = new Set<string>();
  /** Analog hold strength per code (0 < strength <= 1) coming from virtual sources. */
  private readonly virtual = new Map<string, number>();
  private readonly pressHandlers = new Set<KeyPressHandler>();
  /** Rebound keys: physical code -> the code the game reads (a permutation, see `setBindings`). */
  private readonly remap = new Map<string, string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      const code = this.remap.get(e.code) ?? e.code;
      this.pressed.add(code);
      if (!e.repeat) for (const handler of this.pressHandlers) handler(code, e);
    });
    // Capture phase: the panels stop their keys from reaching the window, and a key held when one opened
    // (W while walking) must still be released, or the player walks on after closing it.
    target.addEventListener('keyup', (e) => this.pressed.delete(this.remap.get(e.code) ?? e.code), true);
    // Losing focus (alt-tab) must not leave keys stuck down. Virtual holds are owned by their
    // source (polled gamepad, touch pointer lifecycle), which releases them itself.
    target.addEventListener('blur', () => this.pressed.clear());
  }

  /**
   * Rebinds physical keys: `{ KeyP: 'KeyN' }` makes P do what N did. Everything downstream (`isDown`,
   * `onPress`) sees the game's codes, so no consumer knows about it. Virtual presses are not remapped.
   * The map should be a permutation (the Settings screen swaps two keys) so no action is lost.
   */
  setBindings(bindings: Readonly<Record<string, string>>): void {
    this.remap.clear();
    for (const [physical, logical] of Object.entries(bindings)) if (physical !== logical) this.remap.set(physical, logical);
    this.pressed.clear();
  }

  /** The physical key that produces `code` under the current bindings. */
  physicalFor(code: string): string {
    for (const [physical, logical] of this.remap) if (logical === code) return physical;
    return code;
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c) || (this.virtual.get(c) ?? 0) > 0);
  }

  /** How hard `code` is held, in [0, 1]: 1 for a physical key, the analog value for a virtual hold. */
  strength(code: string): number {
    return this.pressed.has(code) ? 1 : (this.virtual.get(code) ?? 0);
  }

  /**
   * Signed axis in [-1, 1]: strength of the positive key group minus strength of the negative one.
   * Keyboard-only input yields exactly -1, 0 or 1; an analog stick yields fractional values.
   */
  axis(negative: string[], positive: string[]): number {
    return this.groupStrength(positive) - this.groupStrength(negative);
  }

  /** Called once per physical key press (auto-repeat ignored) or virtual press. Returns an unsubscribe function. */
  onPress(handler: KeyPressHandler): () => void {
    this.pressHandlers.add(handler);
    return () => this.pressHandlers.delete(handler);
  }

  /**
   * Synthesises one press of `code` (gamepad button, on-screen button). Handlers receive a
   * synthetic `KeyboardEvent` so their `preventDefault()` calls are harmless.
   */
  pressVirtual(code: string): void {
    const event = new KeyboardEvent('keydown', { code, cancelable: true });
    for (const handler of this.pressHandlers) handler(code, event);
  }

  /**
   * Holds `code` down with an analog strength (clamped to [0, 1]; `false` / 0 releases it).
   * Keyboard state is untouched, so a physical key and a stick can drive the same code together.
   */
  holdVirtual(code: string, strength: number | boolean): void {
    const value = typeof strength === 'boolean' ? (strength ? 1 : 0) : Math.min(1, Math.max(0, strength));
    if (value > 0) this.virtual.set(code, value);
    else this.virtual.delete(code);
  }

  /** Releases every virtual hold (e.g. the gamepad was unplugged). */
  releaseVirtual(): void {
    this.virtual.clear();
  }

  private groupStrength(codes: string[]): number {
    let max = 0;
    for (const code of codes) max = Math.max(max, this.strength(code));
    return max;
  }
}
