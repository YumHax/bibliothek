import type { Quaternion } from 'three';
import type { Updatable } from '@/core/Engine';

/** Seconds without a key, a look or a click before the HUD steps back. */
const IDLE_AFTER_S = 4;

/**
 * While the player watches from a seat (a longplay on the TV, the projector) and touches nothing for a few seconds,
 * `body.hud-idle` fades the crosshair, its caption and the prompt line nearly out of the picture (`styles.css`); any
 * key, mouse move, click, wheel, touch or turn of the view brings them back at once. Nowhere else: on foot the crosshair is the aim.
 */
export class HudIdle implements Updatable {
  private quiet = 0;
  private idle = false;
  /** The view last frame: a turn of the head (a controller's stick, which presses nothing) wakes the HUD too. */
  private readonly lastView = { x: 0, y: 0, z: 0, w: 1 };

  constructor(
    /** Whether the HUD may step back now (seated, in the room, no panel). */
    private readonly watching: () => boolean,
    input: { onPress(handler: (code: string) => void): () => void },
    private readonly view: { readonly quaternion: Quaternion },
  ) {
    const wake = (): void => {
      this.quiet = 0;
      this.set(false);
    };
    input.onPress(wake); // keys and the controller's buttons (virtual presses)
    for (const type of ['mousemove', 'mousedown', 'wheel', 'pointerdown'] as const) window.addEventListener(type, wake, { passive: true });
  }

  update(dt: number): void {
    if (!this.watching()) {
      this.quiet = 0;
      this.set(false);
      return;
    }
    const q = this.view.quaternion;
    const v = this.lastView;
    const turned = Math.abs(q.x - v.x) + Math.abs(q.y - v.y) + Math.abs(q.z - v.z) + Math.abs(q.w - v.w) > 1e-4;
    v.x = q.x;
    v.y = q.y;
    v.z = q.z;
    v.w = q.w;
    if (turned) {
      this.quiet = 0;
      this.set(false);
      return;
    }
    this.quiet += dt;
    if (this.quiet >= IDLE_AFTER_S) this.set(true);
  }

  private set(idle: boolean): void {
    if (idle === this.idle) return;
    this.idle = idle;
    document.body.classList.toggle('hud-idle', idle);
  }
}
