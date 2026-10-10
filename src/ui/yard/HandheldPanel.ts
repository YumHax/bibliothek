import type { HandheldPlay } from '@/building/kids/kidDeals';
import { KIDS } from '@/building/kids/kidsPlan';
import { ACTIONS } from '@/input/actions';
import { FireEdge, type HeldControls } from '@/input/GameInput';
import { ARCADE_GAMES, type ArcadeGame, type GameContext } from '@/world/arcade/games';
import { SCREEN_H, SCREEN_W } from '@/world/arcade/games/ArcadeGame';
import { GameRunner } from '@/world/arcade/GameRunner';
import { createCanvas } from '@/graphics/canvas';
import { ModalPanel } from '../ModalPanel';
import { html, paint } from '../panel/html';
import './HandheldPanel.css';

/** The keys of the stick and fire (physical codes, the arcade's own: `input/actions`). */
const KEYS: Readonly<Record<keyof HeldControls, readonly string[]>> = {
  left: ACTIONS.stickLeft.codes,
  right: ACTIONS.stickRight.codes,
  up: ACTIONS.stickUp.codes,
  down: ACTIONS.stickDown.codes,
  fire: ACTIONS.fire.codes,
};
const GAME_KEYS = new Set(Object.values(KEYS).flat());
/** A frame longer than this (s) is cut short: a tab put away does not run the game on. */
const MAX_FRAME = 0.05;
/** Seconds the last screen stays up once the game is over, so the score is seen, before it goes back to the kid. */
const OVER_HOLD = 1.8;

/**
 * A go on one of the courtyard's kids' handhelds (`building/kids`, `world/courtyard/YardKids`): the kid's own handheld
 * held up in front of the player, its game running on its screen with the kid's score as the one to beat (the game
 * shows it as its HI), the stick on WASD or the arrows and fire on Space, as at the arcade. A modal: the keys are
 * read here (the panel keeps them from the room), the game is stepped at the arcade's fixed rate (`GameRunner`) every
 * frame while it is up. When the game is over the screen holds a moment and the handheld goes back: the kid hears the
 * score (`HandheldPlay.over`). Put down before the end (Esc, E), it is no score at all, and nothing is lost.
 */
export class HandheldPanel extends ModalPanel {
  private readonly shell: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly titleEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private play: HandheldPlay | null = null;
  private game: ArcadeGame | null = null;
  private runner: GameRunner | null = null;
  private readonly edge = new FireEdge();
  private readonly held = new Set<string>();
  private frame = 0;
  private last = 0;
  /** Seconds since the game ended (the last screen held), or -1 while it runs. */
  private ended = -1;
  private reported = false;

  constructor(container: HTMLElement) {
    super(container, { className: 'ui-modal--centre ui-panel handheld', label: 'A handheld' });
    const [canvas, ctx] = createCanvas(SCREEN_W, SCREEN_H);
    this.ctx = ctx;
    paint(
      this.root,
      html`<div class="handheld__shell" data-kind="pocket">
        <p class="handheld__title"></p>
        <div class="handheld__bezel"></div>
        <p class="handheld__hint"></p>
        <div class="handheld__controls" aria-hidden="true"><span class="handheld__dpad"></span><span class="handheld__buttons"><span></span><span></span></span></div>
        <p class="handheld__status"></p>
      </div>`,
    );
    this.shell = this.root.querySelector('.handheld__shell')!;
    this.titleEl = this.root.querySelector('.handheld__title')!;
    this.hintEl = this.root.querySelector('.handheld__hint')!;
    // The frame's status line (`setStatus`): the game's end said there.
    this.statusEl = this.root.querySelector('.handheld__status')!;
    this.statusEl.setAttribute('role', 'status');
    canvas.className = 'handheld__screen';
    canvas.tabIndex = 0;
    canvas.dataset.autofocus = '';
    canvas.setAttribute('aria-label', 'The game');
    this.root.querySelector('.handheld__bezel')!.append(canvas);
    // A key let go anywhere is let go here (the room's Input hears it too, in the same phase).
    this.listen(window, 'keyup', (e) => this.held.delete(e.code), { capture: true });
    this.listen(window, 'blur', () => this.held.clear());
  }

  /** The go the panel runs next time it opens. */
  prepare(play: HandheldPlay): void {
    this.play = play;
  }

  /** ModalLike: the Session only ever closes it (a kid hands it over). */
  override toggle(): void {
    if (this.isOpen) this.close();
  }

  protected override onOpened(): void {
    const play = this.play;
    if (!play) return;
    const { kid } = play;
    this.shell.dataset.kind = kid.handheld ?? 'pocket';
    const make: (context: GameContext) => ArcadeGame = ARCADE_GAMES[kid.game];
    this.game = make({});
    this.runner = new GameRunner(this.game);
    this.runner.reset({ best: play.best, pointsPerTicket: 0 });
    // The twins' one handheld is Mai's, whoever is on it.
    const owner = KIDS.find((k) => k.id === kid.shares) ?? kid;
    this.titleEl.textContent = `${owner.name.split(' ')[0]}’s handheld · ${this.game.title}`;
    this.hintEl.textContent = this.game.hint;
    this.setStatus('');
    this.held.clear();
    // The press that opened it is not a shot.
    this.edge.latch();
    this.ended = -1;
    this.reported = false;
    this.last = performance.now();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  protected override onClosed(): void {
    cancelAnimationFrame(this.frame);
    this.report(null);
    this.game = null;
    this.runner = null;
  }

  /** The keys of the game stay in it; the rest (Esc, E) go on to the panel. */
  protected override onKey(e: KeyboardEvent): void {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    this.held.add(e.code);
  }

  /** The arrows are the game's: they never walk the focus. */
  protected override onSide(): boolean {
    return true;
  }

  protected override navigable(): boolean {
    return false;
  }

  private tick(now: number): void {
    const { game, runner } = this;
    if (!game || !runner || !this.isOpen) return;
    const dt = Math.min(MAX_FRAME, (now - this.last) / 1000);
    this.last = now;
    if (this.ended < 0) {
      runner.step(dt, () => this.edge.press(this.controls()));
      this.play?.sounds(game.takeSounds());
      if (game.over) {
        this.ended = 0;
        this.setStatus(game.score > (this.play?.best ?? 0) ? 'You beat it!' : 'Game over.', game.score > (this.play?.best ?? 0) ? 'ok' : 'info');
      }
    } else {
      this.ended += dt;
      if (this.ended >= OVER_HOLD) {
        this.report(game.score);
        this.close();
        return;
      }
    }
    game.draw(this.ctx);
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private controls(): HeldControls {
    const down = (codes: readonly string[]): boolean => codes.some((c) => this.held.has(c));
    return { left: down(KEYS.left), right: down(KEYS.right), up: down(KEYS.up), down: down(KEYS.down), fire: down(KEYS.fire) };
  }

  /** Tells the kid how the go ended, once. */
  private report(score: number | null): void {
    if (this.reported || !this.play) return;
    this.reported = true;
    this.play.over(score);
  }
}
