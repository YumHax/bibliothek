import { writeWithCaps } from './keyCaps';
import type { PromptOptions } from './types';

const FADE_MS = 150;

interface Prompt {
  id: string;
  text: string;
  until?: () => boolean;
}

let serial = 0;

/**
 * THE PROMPT: the keys that matter while the player is in a state (seated, carrying a piece of furniture, a pad in
 * hand, at an arcade machine): a quiet line at the bottom of the view, above the subtitles, no sound, the keys as
 * caps (`[E]`, `keyCaps`). States stack: the latest one's line shows, and when it ends the one under it comes back
 * (seated with a pad in hand: the pad's keys, then the seat's). Gone when `until` says the state ended or the
 * remover is called; never put away by hand (it is state, not a message), never timed.
 */
export class PromptLine {
  private readonly el: HTMLDivElement;
  private readonly prompts: Prompt[] = [];
  private shown: Prompt | null = null;
  private hideTimer = 0;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'prompt-line';
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
    container.appendChild(this.el);
  }

  show(text: string, options: PromptOptions = {}): () => void {
    const id = options.id ?? `prompt:${serial++}`;
    const i = this.prompts.findIndex((p) => p.id === id);
    if (i >= 0) this.prompts.splice(i, 1);
    const prompt: Prompt = { id, text, until: options.until };
    this.prompts.push(prompt);
    this.render();
    return () => this.remove(prompt);
  }

  /** The states asked whether they ended. */
  update(): void {
    let changed = false;
    for (const prompt of [...this.prompts]) {
      if (!prompt.until?.()) continue;
      this.prompts.splice(this.prompts.indexOf(prompt), 1);
      changed = true;
    }
    if (changed) this.render();
  }

  private remove(prompt: Prompt): void {
    const i = this.prompts.indexOf(prompt);
    if (i < 0) return;
    this.prompts.splice(i, 1);
    this.render();
  }

  /** The topmost state's line, or nothing. */
  private render(): void {
    const top = this.prompts[this.prompts.length - 1] ?? null;
    if (top === this.shown) return;
    this.shown = top;
    window.clearTimeout(this.hideTimer);
    if (!top) {
      this.el.classList.add('prompt-line--out');
      this.hideTimer = window.setTimeout(() => {
        if (!this.shown) this.el.hidden = true;
      }, FADE_MS);
      return;
    }
    writeWithCaps(this.el, top.text);
    this.el.hidden = false;
    this.el.classList.remove('prompt-line--out');
  }
}
