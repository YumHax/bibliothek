import type * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { announceSaveProblems } from './saveNotices';
import { AlertBar, type AlertAction } from './AlertBar';
import { CrosshairLine } from './CrosshairLine';
import { ReadingCard } from './ReadingCard';
import { RewardBanner } from './RewardBanner';
import { SpeechLayer } from './SpeechLayer';
import { bindSpeech } from './speech';
import { TipBoard } from './TipBoard';
import type { NoticeActions, NoticeDismissing, ReadingNotice, RewardNotice, TipOptions } from './types';
import './notices.css';

export interface NoticesOptions {
  /** The camera: where the bubbles are projected from, and where the player stands (a card to read is put down by walking away). */
  camera: THREE.Camera;
  /** The game is in front of the player (not under the pause menu, not in a hidden tab): only then do the notices' clocks run. */
  attending: () => boolean;
}

/**
 * Everything the game tells the player, each kind in its own place (see `NoticeActions` and
 * docs/notices.md): the speech bubbles and subtitles, the crosshair's line, the reward banner, the
 * tips, the card to read, the alert bar. Made once by `bootstrap/ui.ts`, ticked by the engine; binds
 * the people's speech bubbles to its speech layer, and announces save problems as alerts.
 */
export class Notices implements NoticeActions, NoticeDismissing, Updatable {
  readonly speech: SpeechLayer;
  private readonly line: CrosshairLine;
  private readonly rewards: RewardBanner;
  private readonly tips: TipBoard;
  private readonly reading: ReadingCard;
  private readonly alerts: AlertBar;

  constructor(container: HTMLElement, private readonly options: NoticesOptions) {
    this.speech = new SpeechLayer(container, options.camera);
    this.line = new CrosshairLine(container);
    this.tips = new TipBoard(container);
    this.reading = new ReadingCard(container, options.camera);
    this.rewards = new RewardBanner(container);
    this.alerts = new AlertBar(container);
    bindSpeech(this.speech);
    announceSaveProblems(this);
  }

  say(line: string, speaker?: string): void {
    this.speech.voice(line, speaker);
  }

  react(text: string): void {
    this.line.show(text, 'ok');
  }

  refuse(text: string): void {
    this.line.show(text, 'no');
  }

  reward(reward: RewardNotice): void {
    this.rewards.show(reward);
  }

  tip(text: string, options?: TipOptions): () => void {
    return this.tips.show(text, options);
  }

  read(card: ReadingNotice): void {
    this.reading.show(card);
  }

  /** The game's own trouble (a save lost, the mouse lock refused): the red bar at the top; with `action`, a button (Retry) it waits for. */
  alert(text: string, ms?: number, action?: AlertAction): void {
    this.alerts.show(text, ms, action);
  }

  /**
   * The player puts away what is on screen (the `dismissNotice` key, X): the card being read first (with `all`, every
   * waiting card too), else the reward banner up and the newest tip (`all`: every waiting banner, every tip). Any
   * press also clears the subtitle strip. The alerts stay: they have their own button.
   */
  dismiss(all = false): boolean {
    const subtitles = this.speech.clearSubtitles();
    if (this.reading.dismiss(all)) return true;
    const reward = this.rewards.dismiss(all);
    const tip = this.tips.dismiss(all);
    return reward || tip || subtitles;
  }

  /** Settings > Game: the tips top left shown or not (a tip asked for while off is dropped). */
  setTipsShown(shown: boolean): void {
    this.tips.setShown(shown);
  }

  /** False while Settings > Game > Show tips is off: a chain of tips (the first day) waits instead of marking them seen. */
  get tipsShown(): boolean {
    return this.tips.isShown;
  }

  update(dt: number): void {
    const attending = this.options.attending();
    this.speech.update(dt, attending);
    this.line.update(dt, attending);
    this.rewards.update(dt, attending);
    this.tips.update(dt, attending);
    this.reading.update(dt, attending);
  }
}
