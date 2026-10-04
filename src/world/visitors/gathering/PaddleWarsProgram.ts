import type { ChipSpeaker } from '@/audio/ChipSpeaker';
import { NO_PAD, type Pad, type ScreenProgram } from '@/onscreen';
import { NO_CONTROLS, SCREEN_H, SCREEN_W, drawText, type ArcadeControls } from '../../arcade/games/ArcadeGame';
import { PLAY_TOP } from '../../arcade/games/BaseGame';
import { Duel } from '../../arcade/games/Duel';

/** How long the final score stays on the TV before the set goes off (s). */
const FINAL_HOLD = 2.5;

/** What a match tells the evening: a goal either way, and the final tally. */
interface MatchEvents {
  goal(forPlayer: boolean): void;
  over(tally: { you: number; them: number }): void;
}

/**
 * A games night's match on the living room's TV (`onscreen/ProgramRunner`): the arcade's PADDLE WARS for two, the
 * player on pad one, a friend as player two (their name on the screen; PADDLE WARS's player two plays as it plays).
 * Nothing is paid out at home: the ticket count on the strip is covered by the evening's own title. Its blips come
 * from a chip speaker at the TV (`speaker`, the evening's). The match ends by itself (`over`): the set goes off.
 */
export class PaddleWarsProgram implements ScreenProgram {
  readonly title = 'PADDLE WARS';
  readonly width = SCREEN_W;
  readonly height = SCREEN_H;
  readonly hint = 'W / S move the paddle · hold Space to smash';
  readonly players = 1 as const;
  over = false;
  private readonly game = new Duel();
  private fireWas = false;
  private you = 0;
  private them = 0;
  private reported = false;
  /** Seconds the final score has been on the screen: the set goes off once it was seen. */
  private shownFor = 0;

  constructor(
    private readonly opponent: string,
    private readonly speaker: ChipSpeaker,
    private readonly events: MatchEvents,
  ) {}

  start(): void {
    this.game.reset({ best: 0, pointsPerTicket: Number.MAX_SAFE_INTEGER });
    this.game.setOpponent(this.opponent);
  }

  update(dt: number, pads: readonly [Pad, Pad]): void {
    const pad = pads[0] ?? NO_PAD;
    const fire = pad.a || pad.b || pad.start;
    const controls: ArcadeControls = { ...NO_CONTROLS, up: pad.up, down: pad.down, left: pad.left, right: pad.right, fire, firePressed: fire && !this.fireWas };
    this.fireWas = fire;
    this.game.update(dt, controls);
    this.speaker.playAll(this.game.takeSounds());
    this.speaker.follow();
    const { you, them } = this.game.tally;
    if (you > this.you) this.events.goal(true);
    if (them > this.them) this.events.goal(false);
    this.you = you;
    this.them = them;
    if (this.game.over && !this.reported) {
      this.reported = true;
      this.events.over({ you, them });
    }
    // The final score stays up a moment before the set goes off.
    if (this.reported && (this.shownFor += dt) > FINAL_HOLD) this.over = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.game.draw(ctx);
    // At home nothing pays: the strip's ticket count gives way to the evening's name.
    ctx.fillStyle = '#000000';
    ctx.fillRect(SCREEN_W / 2 - 42, 0, 84, PLAY_TOP - 4);
    drawText(ctx, 'GAMES NIGHT', SCREEN_W / 2, 10, 8, '#ffd23a');
  }

  dispose(): void {
    // The speaker is the evening's (it outlives one match).
  }
}
