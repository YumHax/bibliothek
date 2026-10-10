import './Fader.css';

/** How long the curtain stays down before it says where it is going (ms): a quick trip never shows it. */
const NAME_AFTER_MS = 800;

/**
 * Full-screen curtain for teleports: `out()` covers the view, `in()` reveals it, both awaitable. A trip
 * may tint it with the light of where it goes (warm for a shop, the sky's for the street) and name the
 * destination, which shows, with ticking dots, only if the curtain is still down after `NAME_AFTER_MS`
 * (the first trip to the street, while its shaders compile).
 */
export class Fader {
  private readonly el: HTMLDivElement;
  private readonly name: HTMLParagraphElement;
  private nameTimer = 0;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'fader';
    this.el.style.opacity = '0';
    this.el.hidden = true;
    this.name = document.createElement('p');
    this.name.className = 'fader__name';
    this.name.hidden = true;
    this.el.appendChild(this.name);
    container.appendChild(this.el);
  }

  /** Covers the view, in `tint` (a CSS colour; black by default) if given. */
  out(ms = 350, tint?: string): Promise<void> {
    this.el.style.backgroundColor = tint ?? '';
    this.el.hidden = false;
    return this.animate('1', ms);
  }

  /** Names where the trip goes, should the curtain still be down in a moment. */
  destination(label: string): void {
    window.clearTimeout(this.nameTimer);
    this.name.textContent = label;
    this.nameTimer = window.setTimeout(() => {
      this.name.hidden = false;
    }, NAME_AFTER_MS);
  }

  async in(ms = 450): Promise<void> {
    window.clearTimeout(this.nameTimer);
    await this.animate('0', ms);
    this.el.hidden = true;
    this.name.hidden = true;
    this.el.style.backgroundColor = '';
  }

  private animate(opacity: string, ms: number): Promise<void> {
    this.el.style.transitionDuration = `${ms}ms`;
    // Force a style flush so the transition starts from the current opacity.
    void this.el.offsetWidth;
    this.el.style.opacity = opacity;
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
}
