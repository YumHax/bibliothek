import type * as THREE from 'three';
import { Vector3 } from 'three';
import type { Updatable } from '@/core/Engine';
import { announceSaveProblems } from './saveNotices';
import { AlertBar, type AlertAction } from './AlertBar';
import { CrosshairLine } from './CrosshairLine';
import { PromptLine } from './PromptLine';
import { ReadingCard } from './ReadingCard';
import { RewardBanner } from './RewardBanner';
import { SlipLine } from './SlipLine';
import { SpeechLayer } from './SpeechLayer';
import { bindSpeech, isConversing, onConversingEnd } from './speech';
import { TipBoard } from './TipBoard';
import type { NoticeActions, NoticeDismissing, PromptOptions, PromptText, ReadingNotice, RewardNotice, SlipNotice, TipOptions } from './types';
import './notices.css';

/** A tip card under the crosshair folds into the tray once the player has walked this far (m) or acted (a reaction, a slip). */
const WALKED_ON_M = 1;
/** ...unless it came in this recently (ms): the card that came with the very click being answered stays. */
const CARD_SPARED_MS = 1200;

/**
 * A film (the opening, a memory: `body.intro-playing`) or photo mode (`body.photo-mode`) has the screen: the HUD is out
 * of the way, so what is raised meanwhile waits for its end instead of playing out unseen.
 */
function filmOn(): boolean {
  const body = document.body.classList;
  return body.contains('intro-playing') || body.contains('photo-mode');
}

interface NoticesOptions {
  /** The camera: where the bubbles are projected from, and where the player stands (a card to read is put down by walking away). */
  camera: THREE.Camera;
  /** The game is in front of the player (not under the pause menu, not in a hidden tab): only then do the notices' clocks run. */
  attending: () => boolean;
}

/**
 * Everything the game tells the player, each kind in its own place (see `NoticeActions` and
 * docs/notices.md): the speech bubbles and subtitles, the crosshair's line and the slip under it, the reward
 * banner, the tips, the prompt line, the card to read, the alert bar. Made once by `bootstrap/ui.ts`, ticked by the engine; binds
 * the people's speech bubbles to its speech layer, and announces save problems as alerts.
 */
export class Notices implements NoticeActions, NoticeDismissing, Updatable {
  readonly speech: SpeechLayer;
  private readonly line: CrosshairLine;
  private readonly slips: SlipLine;
  private readonly rewards: RewardBanner;
  private readonly tips: TipBoard;
  private readonly prompts: PromptLine;
  private readonly reading: ReadingCard;
  private readonly alerts: AlertBar;

  constructor(container: HTMLElement, private readonly options: NoticesOptions) {
    this.speech = new SpeechLayer(container, options.camera);
    this.line = new CrosshairLine(container);
    this.slips = new SlipLine(container);
    this.tips = new TipBoard(container);
    this.prompts = new PromptLine(container);
    this.reading = new ReadingCard(container, options.camera);
    this.rewards = new RewardBanner(container);
    this.alerts = new AlertBar(container);
    bindSpeech(this.speech);
    // Nothing comes over a conversation: a banner or a card raised while one is open waits for its end, then they come in turn.
    onConversingEnd(() => {
      const held = this.held.splice(0);
      for (const show of held) show();
    });
    announceSaveProblems(this);
  }

  say(line: string, speaker?: string): void {
    this.speech.voice(line, speaker);
  }

  /**
   * The player is in front of the room and free to read it: attending, no film or photo mode, no conversation. What
   * watches the player to time a tip (the first day) waits while this is false.
   */
  get readyToTell(): boolean {
    return this.options.attending() && !filmOn() && !isConversing();
  }

  react(text: string): void {
    this.tips.foldCard(CARD_SPARED_MS);
    this.line.show(text, 'ok');
  }

  refuse(text: string): void {
    this.tips.foldCard(CARD_SPARED_MS);
    this.line.show(text, 'no');
  }

  /** What was raised during a conversation, a film or photo mode, in order (`isConversing`, `filmOn`). */
  private readonly held: (() => void)[] = [];

  /** A banner or a card comes now, or waits for the conversation or the film to end. */
  private whenFree(show: () => void): void {
    if (isConversing() || filmOn()) this.held.push(show);
    else show();
  }

  reward(reward: RewardNotice): void {
    this.whenFree(() => this.rewards.show(reward));
  }

  tip(text: string, options?: TipOptions): () => void {
    // A tip about the conversation itself (`overConversation`) comes over it; any other waits like the banners.
    if (!(isConversing() && !options?.overConversation) && !filmOn()) return this.tips.show(text, options);
    let cancelled = false;
    let off: (() => void) | null = null;
    this.held.push(() => {
      // Its state over while it waited (`until`): it would only ring and go.
      if (!cancelled && !options?.until?.()) off = this.tips.show(text, options);
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }

  prompt(text: PromptText, options?: PromptOptions): () => void {
    return this.prompts.show(text, options);
  }

  slip(notice: SlipNotice): void {
    this.tips.foldCard(CARD_SPARED_MS);
    if (filmOn()) this.held.push(() => this.slips.show(notice));
    else this.slips.show(notice);
  }

  read(card: ReadingNotice): void {
    this.whenFree(() => this.reading.show(card));
  }

  /** The game's own trouble (a save lost, the mouse lock refused): the red bar at the top; with `action`, a button (Retry) it waits for. */
  alert(text: string, ms?: number, action?: AlertAction): void {
    this.alerts.show(text, ms, action);
  }

  /**
   * The player puts away what is on screen (the `dismissNotice` key, X): the card being read first (a page, or the
   * card: one a press), else the reward banner up, the slip and the newest tip (`all`: every waiting banner, every
   * tip). Any press also clears the subtitle strip. The alerts stay (their own button), and the prompts (state, not
   * a message).
   */
  dismiss(all = false): boolean {
    const subtitles = this.speech.clearSubtitles();
    // The cards go one a press (a letter's pages, the day's mail are never thrown away by a double press); `all` is for the rest.
    if (this.reading.dismiss()) return true;
    const reward = this.rewards.dismiss(all);
    const slip = this.slips.dismiss();
    const tip = this.tips.dismiss(all);
    return reward || slip || tip || subtitles;
  }

  /** Puts down the card being read, nothing else (Esc in the room, when the page hears it). False when no card is up. */
  putDownCard(): boolean {
    return this.reading.dismiss();
  }

  /** Settings > Game: the tips top left shown or not (a tip asked for while off is dropped). */
  setTipsShown(shown: boolean): void {
    this.tips.setShown(shown);
  }

  /** False while Settings > Game > Show tips is off: a chain of tips (the first day) waits instead of marking them seen. */
  get tipsShown(): boolean {
    return this.tips.isShown;
  }

  /** Where the player stood when the walk was last measured, and how far they went since (a tip card folds past `WALKED_ON_M`). */
  private readonly lastStand = new Vector3(Number.NaN, 0, 0);
  private walked = 0;

  update(dt: number): void {
    // Under a film the HUD is hidden: its clocks stop with it, and what waited comes once it is over.
    const attending = this.options.attending() && !filmOn();
    if (this.held.length && !isConversing() && !filmOn()) for (const show of this.held.splice(0)) show();
    // Walked on a metre: the tip card under the crosshair has done its part and folds into the tray.
    const here = this.options.camera.position;
    if (!this.tips.cardUp) this.walked = 0;
    else if (!Number.isNaN(this.lastStand.x)) this.walked += Math.hypot(here.x - this.lastStand.x, here.z - this.lastStand.z);
    this.lastStand.copy(here);
    if (this.walked >= WALKED_ON_M) {
      this.walked = 0;
      this.tips.foldCard(CARD_SPARED_MS);
    }
    this.speech.update(dt, attending);
    this.line.update(dt, attending);
    this.slips.update(dt, attending);
    this.rewards.update(dt, attending);
    this.tips.update(dt, attending);
    this.prompts.update();
    this.reading.update(dt, attending);
  }
}
