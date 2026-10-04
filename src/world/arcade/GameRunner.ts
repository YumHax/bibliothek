import { type ArcadeControls, type ArcadeGame, NO_CONTROLS, type RunContext } from './games/ArcadeGame';
import { REPLAY_STEP, type Replay, ReplayRecorder } from './replay/Replay';
import { FixedStep } from './FixedStep';

/**
 * Steps a cabinet's game at the fixed `REPLAY_STEP` (`FixedStep`), live, in demos and in replays
 * alike (fixed steps are what makes a recorded run replay exactly), and records the player's run
 * step by step when asked, for the attract screen's best-run replay.
 */
export class GameRunner {
  private readonly steps = new FixedStep(REPLAY_STEP);
  /** The controls of the last step taken (a frame shorter than a step takes none: the stick and the gun hold still). */
  private lastStep: ArcadeControls = NO_CONTROLS;
  private recorder: ReplayRecorder | null = null;

  constructor(private readonly game: ArcadeGame) {}

  /** A fresh run of the game from `run`; `record` keeps its steps (the player's play, when the game can replay). */
  reset(run: RunContext, record = false): void {
    this.game.reset(run);
    this.steps.reset();
    this.lastStep = NO_CONTROLS;
    this.recorder = record && run.seed !== undefined ? new ReplayRecorder(run.seed, this.game.gun === true) : null;
  }

  /**
   * Advances the game by `dt` in fixed steps, asking `source` for each step's controls (recorded
   * when recording); returns the last step's controls (for the stick and buttons).
   */
  step(dt: number, source: () => ArcadeControls): ArcadeControls {
    this.steps.run(dt, (h) => {
      if (this.game.over) return true;
      this.lastStep = source();
      this.game.update(h, this.lastStep);
      this.recorder?.push(this.lastStep);
      return false;
    });
    return this.lastStep;
  }

  /** The recorded run, signed (null when nothing was recorded or it ran too long); recording stops. */
  finishRecording(score: number, initials: string): Replay | null {
    const replay = this.recorder?.finish(score, initials) ?? null;
    this.recorder = null;
    return replay;
  }

  dropRecording(): void {
    this.recorder = null;
  }
}
