import './Toast.css';

const FADE_MS = 320;
const MAX_VISIBLE = 3;

/**
 * Small HUD notifications at the bottom centre of the screen. Toasts stack (newest on top,
 * oldest dropped past `MAX_VISIBLE`) and fade out on their own.
 */
export class Toast {
  private readonly stack: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.stack = document.createElement('div');
    this.stack.className = 'toast-stack';
    container.appendChild(this.stack);
  }

  /** Shows `text` for `ms` milliseconds. Returns a function that dismisses it early. */
  show(text: string, ms = 2000): () => void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.stack.appendChild(el);

    while (this.stack.children.length > MAX_VISIBLE) this.stack.firstElementChild?.remove();

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      el.classList.add('toast--out');
      window.setTimeout(() => el.remove(), FADE_MS);
    };
    window.setTimeout(dismiss, ms);
    return dismiss;
  }

  /** Removes every toast immediately. */
  clear(): void {
    this.stack.replaceChildren();
  }
}
