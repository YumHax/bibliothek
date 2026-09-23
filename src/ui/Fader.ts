import './Fader.css';

/** Full-screen black curtain for teleports: `out()` covers the view, `in()` reveals it, both awaitable. */
export class Fader {
  private readonly el: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'fader';
    this.el.style.opacity = '0';
    this.el.hidden = true;
    container.appendChild(this.el);
  }

  out(ms = 350): Promise<void> {
    this.el.hidden = false;
    return this.animate('1', ms);
  }

  async in(ms = 450): Promise<void> {
    await this.animate('0', ms);
    this.el.hidden = true;
  }

  private animate(opacity: string, ms: number): Promise<void> {
    this.el.style.transitionDuration = `${ms}ms`;
    // Force a style flush so the transition starts from the current opacity.
    void this.el.offsetWidth;
    this.el.style.opacity = opacity;
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
}
