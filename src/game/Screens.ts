import { randomStartSeconds } from '@/video/randomStart';
import type { VideoProvider } from '@/video/VideoProvider';
import type { GameBox } from '@/world/GameBox';
import type { VideoScreen } from '@/world/screen';

export interface ScreenParts {
  videos: VideoProvider;
}

/** The TV and the projector: one plays at a time, so two longplays never talk over each other. */
export class Screens {
  /** The screen last asked to play. */
  private active: VideoScreen | null = null;

  constructor(private readonly parts: ScreenParts) {}

  /** Finds the game's longplay and shows it on `screen`; any other screen that was on is switched off. */
  async playOn(screen: VideoScreen, box: GameBox): Promise<void> {
    if (this.active && this.active !== screen) this.active.stop();
    this.active = screen;
    screen.searching(box.game.title);
    try {
      const video = await this.parts.videos.findLongplay(box.game);
      if (this.active !== screen || screen.state !== 'searching') return; // switched off or replaced meanwhile
      if (!video) {
        screen.fail(`No longplay found for\n${box.game.title}`);
        return;
      }
      screen.play(video, randomStartSeconds(video.durationSeconds)); // skip intro and credits
    } catch (err) {
      console.warn('[video]', err);
      if (this.active === screen) screen.fail('Video search failed.\nIs the dev server running?');
    }
  }

  stop(screen: VideoScreen): void {
    screen.stop();
    if (this.active === screen) this.active = null;
  }

  /** Switches off whatever plays (the player is leaving the flat: every screen is in it). */
  stopActive(): void {
    if (this.active) this.stop(this.active);
  }
}
