import { playNoticeSound } from '@/audio/noticeSounds';
import { readMs } from './readingTime';

const MIN_MS = 7000;
const FADE_MS = 300;

/** A button on the alert ("Retry"): the bar stays until it is pressed, then goes. */
export interface AlertAction {
  label: string;
  run(): void;
}

/**
 * THE ALERT: the game itself has a problem the player must know about (a save that did not reach
 * storage, another tab on the same save, the mouse lock refused, the world that would not load). A
 * red bar at the top of the screen, over everything, the menus included; counted in real time, since
 * it may come while the menu is up. One at a time: a new one replaces it. With an `action` it keeps a
 * button and stays until the button is pressed.
 */
export class AlertBar {
  private readonly el: HTMLDivElement;
  private timer: number | undefined;
  /** An alert with a button not pressed yet: a plain alert shown over it gives way to it again once it goes. */
  private waiting: { text: string; action: AlertAction } | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'alert-bar';
    this.el.setAttribute('role', 'alert');
    this.el.hidden = true;
    container.appendChild(this.el);
  }

  show(text: string, ms = Math.max(MIN_MS, readMs(text) * 1.5), action?: AlertAction, quiet = false): void {
    const el = this.el;
    el.textContent = text;
    el.classList.remove('alert-bar--out');
    el.classList.toggle('alert-bar--action', !!action);
    el.hidden = false;
    // The top edge is the alert's: the caption along it (a playing screen's) steps aside (`body.alert-up`).
    document.body.classList.add('alert-up');
    if (!quiet) playNoticeSound('deny');
    window.clearTimeout(this.timer);
    if (action) {
      this.waiting = { text, action };
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ui-btn alert-bar__action';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        this.waiting = null;
        this.hide();
        action.run();
      });
      el.append(' ', button);
      // Under the pause menu the button takes the focus: Enter / A presses it (the Overlay walks to it with Up too).
      if (document.body.classList.contains('menu-open')) button.focus({ preventScroll: true });
      return;
    }
    this.timer = window.setTimeout(() => {
      const waiting = this.waiting;
      // The alert that waits for its button comes back without a second buzz: it was heard the first time.
      if (waiting) this.show(waiting.text, undefined, waiting.action, true);
      else this.hide();
    }, ms);
  }

  private hide(): void {
    const el = this.el;
    window.clearTimeout(this.timer);
    el.classList.add('alert-bar--out');
    this.timer = window.setTimeout(() => {
      el.hidden = true;
      document.body.classList.remove('alert-up');
    }, FADE_MS);
  }
}
