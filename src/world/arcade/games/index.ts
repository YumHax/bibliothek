import type { ArcadeGame } from './ArcadeGame';
import { Breakout } from './Breakout';
import { Invaders } from './Invaders';
import { ArrowRush } from './ArrowRush';
import { Stacker } from './Stacker';
import { Snake } from './Snake';
import { Comets } from './Comets';
import { Duel } from './Duel';
import { StepBeat } from './StepBeat';
import { NeonSheriff } from './NeonSheriff';
import { LexiPunk, type RemoteScreen } from './LexiPunk';

export type { ArcadeGame, ArcadeControls, RunContext } from './ArcadeGame';
export type { RemoteScreen } from './LexiPunk';
export { StepBeat } from './StepBeat';

/** What a game may need from outside the cabinet: the big frame a web-page game is played in. */
export interface GameContext {
  remoteScreen?: RemoteScreen | null;
}

/** Every game a cabinet can run, by the id the arcade plan names. */
export const ARCADE_GAMES = {
  breakout: () => new Breakout(),
  invaders: () => new Invaders(),
  stacker: () => new Stacker(),
  arrows: () => new ArrowRush(),
  snake: () => new Snake(),
  comets: () => new Comets(),
  duel: () => new Duel(),
  stepbeat: () => new StepBeat(),
  sheriff: () => new NeonSheriff(),
  lexipunk: (context: GameContext) => new LexiPunk(context.remoteScreen ?? null),
} satisfies Record<string, (context: GameContext) => ArcadeGame>;

export type ArcadeGameId = keyof typeof ARCADE_GAMES;
