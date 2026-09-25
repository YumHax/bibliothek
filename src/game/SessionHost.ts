import type { GameBox } from '@/world/GameBox';

/**
 * What a Session controller may ask of the Session: say something, and the few moves every
 * feature shares (the hands, standing up, freezing the walk). The Session is the only host; a
 * controller never reaches another controller except through it (or through what it was given).
 */
export interface SessionHost {
  /** A toast (or the hint line when there is no toast). */
  notify(text: string, ms?: number): void;
  hint(message: string): void;
  pickUp(box: GameBox): void;
  /** Empties the hands (a market copy goes back on its stall). */
  putBack(): void;
  /** Out of the armchair, the bed, or away from the arcade machine. */
  stand(): void;
  /** While typing (search), choosing (travel menu) or asleep: WASD does not walk and the crosshair does not pick; the pointer lock stays engaged. */
  setFrozen(frozen: boolean): void;
}

/** A controller's share of the keyboard, asked in the Session's route order: true when it took the key (the routing stops there). */
export interface KeyRoute {
  onKey(code: string, e: KeyboardEvent): boolean;
}
