import type { NoticeActions } from '@/notices';
import { randomStartSeconds } from '@/video/randomStart';
import type { VideoProvider } from '@/video/VideoProvider';
import type { GameBox } from '@/world/GameBox';
import { nowPlaying, type VideoScreen } from '@/world/screen';

export interface ScreenParts {
  videos: VideoProvider;
  /** One gentle word when a search comes back empty or fails (the screen itself only says "no signal"). */
  notices: NoticeActions;
  /** A longplay came on (once per play): the first day's last step is watching one. */
  onScreenPlaying?: () => void;
}

/** The TV and the projector: one plays at a time, so two longplays never talk over each other. */
export class Screens {
  /** The screen last asked to play. */
  private active: VideoScreen | null = null;

  constructor(private readonly parts: ScreenParts) {}

  /**
   * Finds the game's longplay and shows it on `screen`; any other screen that was on is switched
   * off. What goes wrong is said on the screen ("no signal"), once in a reaction in plain words, and
   * explained in the console only.
   */
  async playOn(screen: VideoScreen, box: GameBox): Promise<void> {
    if (this.active && this.active !== screen) this.active.stop();
    this.active = screen;
    const { game } = box;
    screen.searching(game.title);
    try {
      const video = await this.parts.videos.findLongplay(game);
      if (this.active !== screen || screen.state !== 'searching') return; // switched off or replaced meanwhile
      if (!video) {
        screen.fail(`No longplay found for ${game.title}`);
        this.parts.notices.react(`No longplay found for ${game.title}.`);
        return;
      }
      screen.play(video, randomStartSeconds(video.durationSeconds), (videoId) => this.parts.videos.reject?.(game, videoId)); // skip intro and credits
      // The console of the game lights up while its longplay is on.
      nowPlaying.setPlatform(game.platform, game.id);
      let told = false;
      const tell = (): void => {
        if (told) return;
        told = true;
        this.parts.onScreenPlaying?.();
      };
      if ((screen.state as string) === 'playing') tell(); // `play` may be on at once (narrowed to 'searching' above)
      const off = screen.onStateChange((state) => {
        if (state === 'playing') return tell();
        off();
        if (nowPlaying.gameId === game.id) nowPlaying.setPlatform(null);
      });
    } catch (err) {
      console.warn('[video] search failed (is the dev server running?)', err);
      if (this.active !== screen || screen.state !== 'searching') return;
      screen.fail('No signal · search failed'); // the error itself went to the console above
      this.parts.notices.react(`No signal: the search for ${game.title} failed.`);
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
