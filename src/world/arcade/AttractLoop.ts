import type { ChipSpeaker } from '@/audio/ChipSpeaker';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { type ArcadeControls, type ArcadeGame, NO_CONTROLS } from './games/ArcadeGame';
import type { GameRunner } from './GameRunner';
import type { CabinetScreens } from './CabinetScreens';
import type { ScoreTable } from './scoreTable';
import { ReplayPlayer } from './replay/Replay';
import type { ReplayShelf } from './replay/ReplayStore';

/** What an idle cabinet shows: its title card, the game playing itself, or the player's best run. */
type AttractMode = 'title' | 'autoplay' | 'replay';

/** The title card redraws this often (INSERT COIN blinks), a dead tube's snow that often. */
const ATTRACT_FPS = 6;
const STATIC_FPS = 12;
/** A cabinet nobody plays sings its jingle every so often (seconds, random in the range). */
const JINGLE_EVERY: [number, number] = [35, 90];
/** The loop: the title card this long, then a demo (cut short at `DEMO_MAX`) or the best run, held at its end card `DEMO_HOLD`. */
const TITLE_SECONDS = 7;
const DEMO_MAX = 32;
const REPLAY_MAX = 150;
const DEMO_HOLD = 1.6;
const DEMO_SKILL = 0.55;

export interface AttractParts {
  game: ArcadeGame;
  runner: GameRunner;
  screens: CabinetScreens;
  speaker: ChipSpeaker;
  scores: ScoreTable;
  pointsPerTicket: number;
  replays?: ReplayShelf;
  /** Seeds when the first jingle comes, so the hall's cabinets do not sing together. */
  seed: number;
  /** Back on the title card (the cabinet gives the second stick back to whoever holds it). */
  onTitle?: () => void;
}

/**
 * An idle cabinet's attract sequence, round and round: its title card (with a jingle now and
 * then), then the game playing itself (DEMO, on its autopilot, silent) or, every other time round,
 * the player's best run replayed step for step (a replay that no longer ends on its score was
 * recorded under older rules and is dropped). Only the title card when the camera is far or the
 * game cannot play itself; snow when the cabinet is out of order.
 */
export class AttractLoop {
  private mode: AttractMode = 'title';
  private modeClock = 0;
  private cycles = 0;
  private clock = 0;
  private phase = 0;
  private hold = 0;
  private jingleIn: number;
  private replay: ReplayPlayer | null = null;

  constructor(private readonly parts: AttractParts) {
    this.jingleIn = JINGLE_EVERY[0] * seededRandom(parts.seed)() + 5;
  }

  /** Whether the title card is up (not a demo or a replay). */
  get showingTitle(): boolean {
    return this.mode === 'title';
  }

  /** Back to the title card, from a play, a regular or a show. */
  enter(): void {
    this.mode = 'title';
    this.modeClock = 0;
    this.replay = null;
    this.hold = 0;
    this.parts.onTitle?.();
    this.parts.screens.drawTitle(this.phase);
  }

  /** One frame of it (`dead`: out of order today); returns the controls of the show's step, for the stick. */
  update(dt: number, dead: boolean): ArcadeControls {
    const { game, runner, screens, speaker, replays } = this.parts;
    if (dead) {
      this.clock += dt;
      if (this.clock >= 1 / STATIC_FPS) {
        this.clock = 0;
        screens.drawStatic();
      }
      return NO_CONTROLS;
    }
    this.modeClock += dt;
    if (this.mode === 'title') {
      this.jingleIn -= dt;
      if (this.jingleIn <= 0) {
        this.jingleIn = JINGLE_EVERY[0] + Math.random() * (JINGLE_EVERY[1] - JINGLE_EVERY[0]);
        speaker.level = 0.35;
        speaker.play('jingle');
      }
      this.clock += dt;
      if (this.clock >= 1 / ATTRACT_FPS) {
        this.clock = 0;
        this.phase += 1;
        screens.drawTitle(this.phase);
      }
      if (this.modeClock >= TITLE_SECONDS && game.demoable !== false && screens.near()) this.startShowing();
      return NO_CONTROLS;
    }
    // A demo or a replay: silent, the game drawn under a banner.
    let controls: ArcadeControls = NO_CONTROLS;
    const replay = this.replay;
    if (!game.over && this.modeClock < (replay ? REPLAY_MAX : DEMO_MAX)) {
      controls = runner.step(dt, () => (replay && !replay.done ? replay.next() : replay ? NO_CONTROLS : game.autopilot(DEMO_SKILL)));
      game.takeSounds();
    } else {
      // Recorded under older rules, it no longer ends where it did: nothing worth showing any more.
      if (this.hold === 0 && game.over && replay && game.score !== replay.replay.score) replays?.drop(game.id);
      this.hold += dt;
      if (this.hold >= DEMO_HOLD || !game.over) {
        this.enter();
        return controls;
      }
    }
    screens.paintGame(dt, false, () => screens.drawShowBanner(this.modeClock, this.mode === 'replay' ? (this.replay?.replay ?? null) : null));
    return controls;
  }

  /** Off the title card: the player's best run every other time round (when there is one), else the game playing itself. */
  private startShowing(): void {
    const { game, runner, screens, scores, pointsPerTicket, replays } = this.parts;
    const best = replays?.get(game.id) ?? null;
    this.cycles += 1;
    this.replay = best && this.cycles % 2 === 0 ? new ReplayPlayer(best) : null;
    this.mode = this.replay ? 'replay' : 'autoplay';
    this.modeClock = 0;
    this.hold = 0;
    screens.drawSoon();
    runner.reset({ best: scores.bestOf(game.id), pointsPerTicket, ...(this.replay && best ? { seed: best.seed } : {}) });
    game.setOpponent?.('CPU', 0.7);
  }
}
