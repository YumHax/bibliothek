import type * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { announceSaveProblems } from './saveNotices';
import { AlertBar } from './AlertBar';
import { CrosshairLine } from './CrosshairLine';
import { ReadingCard } from './ReadingCard';
import { RewardBanner } from './RewardBanner';
import { SpeechLayer } from './SpeechLayer';
import { bindSpeech } from './speech';
import { TipBoard } from './TipBoard';
import type { NoticeActions, ReadingNotice, RewardNotice, TipOptions } from './types';
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
export class Notices implements NoticeActions, Updatable {
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

  /** The game's own trouble (a save lost, the mouse lock refused): the red bar at the top. */
  alert(text: string, ms?: number): void {
    this.alerts.show(text, ms);
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
