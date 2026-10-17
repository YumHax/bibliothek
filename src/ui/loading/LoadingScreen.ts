import { KEYS } from '@/persistence/keys';
import { safeStorage } from '@/persistence/storage';

/**
 * The loading screen `index.html` paints before any script runs (`.boot`, `loading.css`): the title and a bar that
 * creeps on its own while the code downloads. Once the bootstrap runs, it drives the bar step by step: each `step`
 * sends the fill toward the end of that step's share as a CSS transition timed on how long the step took last time
 * (`KEYS.loadTimesCache`), then waits for a paint. A transform transition runs on the compositor, so the bar keeps
 * moving while a step holds the main thread. `finish` fills it and fades the screen out onto the start card; `abandon`
 * takes it away at once (the start card's Retry must show); `fail` stops the bar and says the start went wrong. Each step is a `performance.measure` (`boot:<name>`) and the timings are logged once.
 */

/** A step's expected time (ms) before it was ever measured on this browser. */
const DEFAULT_MS = 400;
/** The first guesses for the long steps, before a load on this browser measured them. */
const FIRST_GUESS_MS: Record<string, number> = { living: 1500, prime: 2500, zone: 600 };
/** How much of a newly measured time goes into the remembered one (the rest is the old one): one slow load does not stick. */
const BLEND = 0.6;
/** The longest a step waits for a paint (a hidden tab paints nothing). */
const PAINT_WAIT_MS = 100;
/** The fill's last stretch and the screen's fade (`loading.css`, `--boot-fade`). */
const FINISH_MS = 250;

type Times = Record<string, number>;

function readTimes(): Times {
  try {
    const raw = safeStorage()?.getItem(KEYS.loadTimesCache);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const times: Times = {};
    for (const [name, ms] of Object.entries(parsed)) if (typeof ms === 'number' && ms > 0) times[name] = ms;
    return times;
  } catch {
    return {};
  }
}

function writeTimes(times: Times): void {
  try {
    safeStorage()?.setItem(KEYS.loadTimesCache, JSON.stringify(times));
  } catch {
    // Full or blocked: the next load guesses again.
  }
}

/** Resolves after the next paint, or after `PAINT_WAIT_MS` when none comes. */
function painted(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, PAINT_WAIT_MS);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 0),
    );
  });
}

/** The bar's current fill (0..1), read off its transform mid-animation. */
function currentFill(fill: HTMLElement): number {
  const matrix = getComputedStyle(fill).transform;
  if (!matrix || matrix === 'none') return 0;
  const scale = Number(matrix.match(/matrix\(([^,]+)/)?.[1]);
  return Number.isFinite(scale) ? Math.min(Math.max(scale, 0), 1) : 0;
}

export class LoadingScreen {
  private readonly fill: HTMLElement;
  private readonly line: HTMLElement;
  private readonly remembered = readTimes();
  private readonly measured: Times = {};
  /** Where the fill stood when the bootstrap took it over, and the steps' expected times summed from there. */
  private readonly from: number;
  private readonly total: number;
  /** The expected time of the steps done so far. */
  private elapsed = 0;
  private current: { name: string; at: number } | null = null;
  private over = false;

  /**
   * `steps` names every step `step` will be called with, in order: their expected times share out what is left of
   * the bar. A step not in the list moves nothing.
   */
  constructor(private readonly root: HTMLElement, private readonly steps: readonly string[]) {
    this.fill = root.querySelector<HTMLElement>('.boot__fill')!;
    this.line = root.querySelector<HTMLElement>('.boot__line')!;
    // The download's creep stops where it is; the steps share out the rest.
    this.from = currentFill(this.fill);
    this.fill.style.animation = 'none';
    this.fill.style.transform = `scaleX(${this.from})`;
    this.total = steps.reduce((sum, name) => sum + this.expected(name), 0);
    performance.mark('boot:scripts');
  }

  /** The screen in the page, or null when there is none (the page was not served from index.html). */
  static fromPage(steps: readonly string[]): LoadingScreen | null {
    const root = document.getElementById('boot');
    return root ? new LoadingScreen(root, steps) : null;
  }

  /** Ends the step under way and starts `name`, with `line` under the bar; resolves once the bar has been painted moving. */
  step(name: string, line?: string): Promise<void> {
    if (this.over) return Promise.resolve();
    this.endStep();
    this.current = { name, at: performance.now() };
    if (line !== undefined) this.line.textContent = line;
    const ms = this.steps.includes(name) ? this.expected(name) : 0;
    if (ms > 0) {
      const to = this.from + ((1 - this.from) * (this.elapsed + ms)) / this.total;
      this.fill.style.transitionDuration = `${Math.round(ms)}ms`;
      this.fill.style.transform = `scaleX(${to})`;
    }
    this.elapsed += ms;
    return painted();
  }

  /** The world is ready: the bar fills, the screen fades out onto the start card and leaves the page. */
  finish(): void {
    if (this.over) return;
    this.endStep();
    this.close();
    this.remember();
    this.fill.style.transitionDuration = `${FINISH_MS}ms`;
    this.fill.style.transform = 'scaleX(1)';
    this.root.classList.add('boot--done');
    setTimeout(() => this.root.remove(), FINISH_MS * 2);
  }

  /** Takes the screen away at once (the world failed to load: the start card shows its Retry). */
  abandon(): void {
    if (this.over) return;
    this.close();
    this.root.remove();
  }

  private expected(name: string): number {
    return this.remembered[name] ?? FIRST_GUESS_MS[name] ?? DEFAULT_MS;
  }

  private endStep(): void {
    if (!this.current) return;
    const { name, at } = this.current;
    this.measured[name] = performance.now() - at;
    performance.measure(`boot:${name}`, { start: at });
    this.current = null;
  }

  private close(): void {
    this.over = true;
  }

  /** The measured times blended into the remembered ones, and the load's timings logged once. */
  private remember(): void {
    const times: Times = { ...this.remembered };
    for (const [name, ms] of Object.entries(this.measured)) {
      const before = this.remembered[name];
      times[name] = before === undefined ? ms : before * (1 - BLEND) + ms * BLEND;
    }
    writeTimes(times);
    const rounded = Object.fromEntries(Object.entries(this.measured).map(([name, ms]) => [name, Math.round(ms)]));
    console.info(`[boot] scripts ready at ${Math.round(performance.getEntriesByName('boot:scripts')[0]?.startTime ?? 0)} ms, steps (ms):`, rounded);
  }

  /** The start threw: the bar stops where it is and the line says to reload. */
  fail(): void {
    if (this.over) return;
    this.close();
    // The bar stops where it is.
    this.fill.style.transform = `scaleX(${currentFill(this.fill)})`;
    this.root.classList.add('boot--failed');
    this.line.textContent = 'Something went wrong. Reload the page to try again.';
  }
}
