import { ChipSpeaker } from '@/audio/ChipSpeaker';
import { FireEdge, type GameControls } from '@/input/GameInput';
import type { ArcadeGame } from '@/world/arcade/games/ArcadeGame';
import { SCREEN_H, SCREEN_W, drawText } from '@/world/arcade/games/ArcadeGame';
import { GameRunner } from '@/world/arcade/GameRunner';
import { NO_PAD, type Pad, type ProgramContext, type ScreenProgram } from './ScreenProgram';

interface ArcadeProgramOptions {
  /** What the set shows it is running; default the game's title. */
  title?: string;
  /** The HUD tip when the player takes the pad; default the game's hint. */
  hint?: string;
  /** The second player's name and skill, for a game with `setOpponent` (a friend on a games night, the machine otherwise). */
  opponent?: { name: string; skill?: number };
  /** A word painted at the top of the glass where the arcade's ticket count would be (a games night's name): at home nothing pays. */
  banner?: string;
  /** The speaker the game's chip sounds come out of: one at the set (spatial, the evening's); without one, the set's own output. */
  speaker?: ChipSpeaker;
  /** Seconds the last frame stays on the screen before the set goes off. Default 2.5. */
  holdEnd?: number;
  /** Whether Start fires too, besides A and B. Default true (a game that uses Start for itself says false). */
  startFires?: boolean;
}

const HOLD_END = 2.5;

/** A pad's buttons as a game's controls: the d-pad the stick, A and B (and Start) fire, the press edge from `edge`. */
export function padToControls(pad: Pad, edge: FireEdge, startFires = true): GameControls {
  return edge.press({ left: pad.left, right: pad.right, up: pad.up, down: pad.down, fire: pad.a || pad.b || (startFires && pad.start) });
}

/**
 * The one host for an arcade game on a screen of the flat (`ProgramRunner`): the game stepped at
 * the cabinets' fixed rate (`GameRunner`), pad one read as the stick and fire with the press edge
 * worked out once (`padToControls`), its chip sounds into the set's own speaker (or a `ChipSpeaker`
 * the caller places at the set), no tickets (`pointsPerTicket` 0: the game shows none), a banner
 * where they would be, and the last frame held a moment before the set goes off. A games night's
 * match (`PaddleWarsProgram`) extends it for what it tells the evening (`afterStep`, `onEnd`).
 */
export class ArcadeProgram<G extends ArcadeGame = ArcadeGame> implements ScreenProgram {
  readonly title: string;
  readonly width = SCREEN_W;
  readonly height = SCREEN_H;
  readonly hint: string;
  readonly players = 1 as const;
  over = false;
  protected readonly runner: GameRunner;
  private readonly edge = new FireEdge();
  private speaker: ChipSpeaker | null;
  private ownSpeaker = false;
  private ended = false;
  private shownFor = 0;

  constructor(
    readonly game: G,
    private readonly options: ArcadeProgramOptions = {},
  ) {
    this.title = options.title ?? game.title;
    this.hint = options.hint ?? game.hint;
    this.runner = new GameRunner(game);
    this.speaker = options.speaker ?? null;
  }

  start(context: ProgramContext): void {
    if (!this.speaker && context.audio) {
      this.speaker = ChipSpeaker.into(context.audio);
      this.ownSpeaker = true;
    }
    this.runner.reset({ best: 0, pointsPerTicket: 0 });
    const { opponent } = this.options;
    if (opponent) this.game.setOpponent?.(opponent.name, opponent.skill ?? 0.7);
    this.edge.reset(true);
  }

  update(dt: number, pads: readonly [Pad, Pad]): void {
    const controls = padToControls(pads[0] ?? NO_PAD, this.edge, this.options.startFires ?? true);
    this.runner.step(dt, () => controls);
    this.speaker?.playAll(this.game.takeSounds());
    this.speaker?.follow();
    this.afterStep();
    if (this.game.over && !this.ended) {
      this.ended = true;
      this.onEnd();
    }
    // The last frame stays up a moment before the set goes off.
    if (this.ended && (this.shownFor += dt) > (this.options.holdEnd ?? HOLD_END)) this.over = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.game.draw(ctx);
    if (this.options.banner) drawText(ctx, this.options.banner, SCREEN_W / 2, 10, 8, '#ffd23a');
  }

  dispose(): void {
    if (this.ownSpeaker) this.speaker?.dispose();
    this.speaker = null;
  }

  /** After each frame's steps: what the game's state tells the room (a goal, a round). */
  protected afterStep(): void {}

  /** The game is over (its last frame now shows). */
  protected onEnd(): void {}
}
