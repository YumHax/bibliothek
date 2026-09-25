import type { SfxEvent } from '@/audio/ChipSpeaker';
import { type ArcadeControls, type ArcadeGame, NO_CONTROLS, SCREEN_H, SCREEN_W, drawText } from './ArcadeGame';

/**
 * The big frame a web-page game is played in (the UI's `ArcadeScreenPanel` fits it): shows `url`,
 * reports each score the page sends (`final` at its end), and `onClose` once when it shuts.
 */
export interface RemoteScreen {
  open(options: { title: string; url: string; origins: readonly string[]; onScore: (score: number, final: boolean) => void; onClose: () => void }): void;
}

/** Where the game lives, and the origins its score messages may come from. */
const URL = 'https://lexipunk.com/?embed=bibliothek';
const ORIGINS = ['https://lexipunk.com', 'https://www.lexipunk.com'];

/**
 * LEXIPUNK on a cabinet: the user's own word game (lexipunk.com), played in the big frame
 * (`RemoteScreen`, the UI's `ArcadeScreenPanel`) rather than on the glass. A coin opens the frame;
 * the page reports its score by `postMessage` (see `ArcadeScreenPanel`) and the play is over when
 * the page says so or the frame is shut, paying the last score it reported (nothing if it never
 * reported one). Meanwhile the cabinet's glass says where the game is. It cannot play itself: no
 * demo, no replay, no regular (`demoable: false`). Without a screen wired in, a play ends at once.
 */
export class LexiPunk implements ArcadeGame {
  readonly id = 'lexipunk';
  readonly title = 'LEXIPUNK';
  readonly hint = 'Play in the big frame · Done when you are finished';
  readonly summary = 'WORDS · PUNK · YOUR SCORE PAYS TICKETS';
  readonly demoable = false;
  score = 0;
  over = false;

  private clock = 0;
  private reported = false;
  private sounds: SfxEvent[] = [];

  constructor(private readonly screen: RemoteScreen | null) {}

  reset(): void {
    this.score = 0;
    this.over = false;
    this.clock = 0;
    this.reported = false;
    this.sounds = [];
    if (!this.screen) {
      this.over = true;
      return;
    }
    this.screen.open({
      title: this.title,
      url: URL,
      origins: ORIGINS,
      onScore: (score, final) => {
        this.score = score;
        if (!this.reported) this.sounds.push({ sfx: 'blip' });
        this.reported = true;
        if (final) this.sounds.push({ sfx: 'best' });
      },
      onClose: () => {
        this.over = true;
      },
    });
  }

  update(dt: number): void {
    this.clock += dt;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0c0612';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // Letters raining behind the logo.
    ctx.fillStyle = 'rgba(255,47,160,0.25)';
    for (let i = 0; i < 18; i++) {
      const x = (i * 53) % SCREEN_W;
      const y = (this.clock * (30 + (i % 5) * 12) + i * 37) % SCREEN_H;
      drawText(ctx, String.fromCharCode(65 + ((i * 7) % 26)), x, y, 10, 'rgba(255,47,160,0.3)');
    }
    drawText(ctx, 'LEXIPUNK', SCREEN_W / 2, 70, 26, '#ff2fa0');
    drawText(ctx, 'NOW PLAYING ON THE BIG SCREEN', SCREEN_W / 2, 110, 8, '#33e0ff');
    drawText(ctx, this.reported ? `SCORE ${this.score.toLocaleString('en-US')}` : 'SCORE —', SCREEN_W / 2, 146, 14, '#ffd23a');
    if (Math.floor(this.clock * 2) % 2 === 0) drawText(ctx, 'PRESS DONE TO CASH IN', SCREEN_W / 2, 190, 8, '#ff8a80');
  }

  takeSounds(): SfxEvent[] {
    const out = this.sounds;
    this.sounds = [];
    return out;
  }

  autopilot(): ArcadeControls {
    return NO_CONTROLS;
  }
}
