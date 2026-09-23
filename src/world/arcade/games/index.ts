import type { ArcadeGame } from './ArcadeGame';
import { Breakout } from './Breakout';
import { Invaders } from './Invaders';
import { ArrowRush } from './ArrowRush';
import { Stacker } from './Stacker';

export type { ArcadeGame, ArcadeControls, RunContext } from './ArcadeGame';

/** Every game a cabinet can run, by the id the arcade plan names. */
export const ARCADE_GAMES = {
  breakout: () => new Breakout(),
  invaders: () => new Invaders(),
  stacker: () => new Stacker(),
  arrows: () => new ArrowRush(),
} satisfies Record<string, () => ArcadeGame>;

export type ArcadeGameId = keyof typeof ARCADE_GAMES;
