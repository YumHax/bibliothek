import type { ChipSpeaker } from '@/audio/ChipSpeaker';
import { ArcadeProgram } from '@/onscreen/ArcadeProgram';
import { Duel } from '../../arcade/games/Duel';

/** How long the final score stays on the TV before the set goes off (s). */
const FINAL_HOLD = 2.5;

/** What a match tells the evening: a goal either way, and the final tally. */
interface MatchEvents {
  goal(forPlayer: boolean): void;
  over(tally: { you: number; them: number }): void;
}

/**
 * A games night's match on the living room's TV: the arcade's PADDLE WARS hosted by `ArcadeProgram`
 * (the player on pad one, a friend as player two: their name on the screen, PADDLE WARS's player
 * two plays as it plays), nothing paid out at home, GAMES NIGHT where the ticket count would be,
 * its blips from a chip speaker at the TV (`speaker`, the evening's). The match ends by itself:
 * the set goes off. Each goal and the final tally go to the evening (`events`).
 */
export class PaddleWarsProgram extends ArcadeProgram<Duel> {
  private you = 0;
  private them = 0;

  constructor(opponent: string, speaker: ChipSpeaker, private readonly events: MatchEvents) {
    super(new Duel(), {
      title: 'PADDLE WARS',
      hint: 'W / S move the paddle · hold Space to smash',
      opponent: { name: opponent, skill: 0.7 },
      banner: 'GAMES NIGHT',
      speaker,
      holdEnd: FINAL_HOLD,
    });
  }

  protected override afterStep(): void {
    const { you, them } = this.game.tally;
    if (you > this.you) this.events.goal(true);
    if (them > this.them) this.events.goal(false);
    this.you = you;
    this.them = them;
  }

  protected override onEnd(): void {
    this.events.over(this.game.tally);
  }
}
