import type { ArcadeControls } from '../games/ArcadeGame';

/**
 * A cabinet play as data: the seed the game was reset with and every fixed step's controls,
 * run-length encoded. The games draw every board-shaping number from their seeded `rand()` and the
 * cabinet steps them at a fixed rate, so feeding the same controls from the same seed plays the
 * same run again, to the point: the attract screen shows the player's best run this way.
 */
export interface Replay {
  seed: number;
  /** The score the run ended on: a replay that ends elsewhere was recorded by older rules and is dropped. */
  score: number;
  /** Who signed it. */
  initials: string;
  /** Runs of identical steps: `[mask, count]`, or `[mask, aimX, aimY, count]` for a light-gun game (-1: off the glass). */
  runs: number[];
  /** Whether the runs carry aim (4 numbers a run instead of 2). */
  aim: boolean;
}

/** The simulation step every cabinet game runs at (live, demo and replay alike). */
export const REPLAY_STEP = 1 / 120;
/** Longest run kept, in numbers (a very long play is not worth the storage). */
const MAX_RUN_NUMBERS = 24000;
/**
 * A light gun's aim is kept exactly on the steps the trigger is pulled (the only ones where it
 * decides anything) and sampled every this many steps in between (20 a second: the crosshair in
 * the replay moves as smoothly as it needs to, and the runs stay long).
 */
const AIM_SAMPLE_STEPS = 6;

const BITS: (keyof Pick<ArcadeControls, 'left' | 'right' | 'up' | 'down' | 'fire' | 'firePressed'>)[] = ['left', 'right', 'up', 'down', 'fire', 'firePressed'];

function maskOf(c: ArcadeControls): number {
  let mask = 0;
  BITS.forEach((bit, i) => {
    if (c[bit]) mask |= 1 << i;
  });
  return mask;
}

/** Records a play step by step; `finish` hands the replay over (null when too long to keep). */
export class ReplayRecorder {
  private readonly runs: number[] = [];
  private tooLong = false;
  private step = 0;
  private aimX = -1;
  private aimY = -1;

  constructor(
    private readonly seed: number,
    private readonly aim: boolean,
  ) {}

  push(controls: ArcadeControls): void {
    if (this.tooLong) return;
    const mask = maskOf(controls);
    const runs = this.runs;
    const width = this.aim ? 4 : 2;
    if (controls.firePressed || this.step % AIM_SAMPLE_STEPS === 0) {
      this.aimX = controls.aim ? Math.round(controls.aim.x) : -1;
      this.aimY = controls.aim ? Math.round(controls.aim.y) : -1;
    }
    this.step += 1;
    const x = this.aimX;
    const y = this.aimY;
    const at = runs.length - width;
    if (at >= 0 && runs[at] === mask && (!this.aim || (runs[at + 1] === x && runs[at + 2] === y))) {
      runs[runs.length - 1]! += 1;
      return;
    }
    if (runs.length + width > MAX_RUN_NUMBERS) {
      this.tooLong = true;
      return;
    }
    if (this.aim) runs.push(mask, x, y, 1);
    else runs.push(mask, 1);
  }

  finish(score: number, initials: string): Replay | null {
    if (this.tooLong) return null;
    return { seed: this.seed, score, initials, runs: [...this.runs], aim: this.aim };
  }
}

/** Plays a replay's controls back, one step at a time. */
export class ReplayPlayer {
  private run = 0;
  private left: number;

  constructor(readonly replay: Replay) {
    this.left = this.countAt(0);
  }

  /** Whether every recorded step has been handed out. */
  get done(): boolean {
    return this.run * this.width >= this.replay.runs.length;
  }

  next(): ArcadeControls {
    const { runs } = this.replay;
    const at = this.run * this.width;
    const mask = runs[at] ?? 0;
    const controls: ArcadeControls = { left: false, right: false, up: false, down: false, fire: false, firePressed: false };
    BITS.forEach((bit, i) => (controls[bit] = (mask & (1 << i)) !== 0));
    if (this.replay.aim) {
      const x = runs[at + 1] ?? -1;
      const y = runs[at + 2] ?? -1;
      controls.aim = x < 0 ? null : { x, y };
    }
    this.left -= 1;
    if (this.left <= 0) {
      this.run += 1;
      this.left = this.countAt(this.run);
    }
    return controls;
  }

  private get width(): number {
    return this.replay.aim ? 4 : 2;
  }

  private countAt(run: number): number {
    return this.replay.runs[run * this.width + this.width - 1] ?? 0;
  }
}
