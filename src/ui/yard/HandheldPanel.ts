import type { HandheldPlay } from '@/building/kids/kidDeals';
import { KIDS } from '@/building/kids/kidsPlan';
import { ACTIONS } from '@/input/actions';
import { FireEdge, type HeldControls } from '@/input/GameInput';
import { lastDevice, noteDevice } from '@/input/lastDevice';
import { ARCADE_GAMES, type ArcadeGame, type GameContext } from '@/world/arcade/games';
import { SCREEN_H, SCREEN_W } from '@/world/arcade/games/ArcadeGame';
import { GameRunner } from '@/world/arcade/GameRunner';
import { createCanvas } from '@/graphics/canvas';
import { ModalPanel } from '../ModalPanel';
import { actionKeyLabel } from '../keys';
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
type Control = keyof HeldControls;
const CONTROLS: readonly Control[] = ['left', 'right', 'up', 'down', 'fire'];
/** A frame longer than this (s) is cut short: a tab put away does not run the game on. */
const MAX_FRAME = 0.05;
/** Seconds the last screen stays up once the game is over, so the score is seen, before it goes back to the kid. */
const OVER_HOLD = 1.8;
/** A controller's buttons and stick in the standard mapping: A and X fire, B gives it back, the D-pad, the left stick past its dead zone. */
const PAD = { a: 0, b: 1, x: 2, up: 12, down: 13, left: 14, right: 15, deadZone: 0.45 } as const;

/**
 * A go on one of the courtyard's kids' handhelds (`building/kids`, `world/courtyard/YardKids`): the kid's own handheld
 * held up in front of the player, its game running on its screen with the kid's score as the one to beat (the game
 * shows it as its HI). Played on the stick keys (WASD or the arrows) and fire (Space), as at the arcade; on a
 * controller's D-pad or left stick and A; or on the shell's own printed D-pad and buttons, pressed with the mouse or a
 * finger. Whichever is used, the printed control it stands for goes down on the shell. "Give it back" is printed under
 * the screen (Esc, E, a controller's B, or a click). A modal: the keys are read here (the panel keeps them from the
 * room), the game is stepped at the arcade's fixed rate (`GameRunner`) every frame while it is up. When the game is over
 * the screen holds a moment and the handheld goes back: the kid hears the score (`HandheldPlay.over`). Put down before
 * the end, it is no score at all, and nothing is lost.
 */
export class HandheldPanel extends ModalPanel {
  private readonly shell: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly titleEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly giveCap: HTMLElement;
  /** The printed controls on the shell, lit while what they stand for is held. */
  private readonly printed = new Map<Control, HTMLElement[]>();
  private play: HandheldPlay | null = null;
  private game: ArcadeGame | null = null;
  private runner: GameRunner | null = null;
  private readonly edge = new FireEdge();
  private readonly held = new Set<string>();
  /** The printed controls held down by a pointer (a finger, the mouse), by pointer id. */
  private readonly touched = new Map<number, Control>();
  private padBack = false;
  private lit = '';
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
        <div class="handheld__controls">
          <span class="handheld__dpad" role="group" aria-label="The D-pad">
            <span class="handheld__arm handheld__arm--up" data-pad="up" aria-label="Up"></span>
            <span class="handheld__arm handheld__arm--left" data-pad="left" aria-label="Left"></span>
            <span class="handheld__arm handheld__arm--right" data-pad="right" aria-label="Right"></span>
            <span class="handheld__arm handheld__arm--down" data-pad="down" aria-label="Down"></span>
          </span>
          <span class="handheld__buttons"><span class="handheld__button" data-pad="fire" aria-label="B"><b>B</b></span><span class="handheld__button" data-pad="fire" aria-label="A"><b>A</b></span></span>
        </div>
        <p class="handheld__status"></p>
      </div>
      <button type="button" class="handheld__give" data-action="close" tabindex="-1">Give it back <kbd class="handheld__give-cap"></kbd></button>`,
    );
    this.shell = this.root.querySelector('.handheld__shell')!;
    this.titleEl = this.root.querySelector('.handheld__title')!;
    this.hintEl = this.root.querySelector('.handheld__hint')!;
    this.giveCap = this.root.querySelector('.handheld__give-cap')!;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-pad]')) {
      const control = el.dataset.pad as Control;
      this.printed.set(control, [...(this.printed.get(control) ?? []), el]);
    }
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
    this.listen(window, 'blur', () => {
      this.held.clear();
      this.touched.clear();
    });
    // The shell's printed controls, pressed with a finger or the mouse: held while the pointer stays down.
    this.listen(this.shell, 'pointerdown', (e) => {
      const control = (e.target as Element).closest<HTMLElement>('[data-pad]')?.dataset.pad as Control | undefined;
      if (!control) return;
      e.preventDefault();
      if (e.pointerType === 'touch') noteDevice('touch');
      this.touched.set(e.pointerId, control);
      (e.target as Element).setPointerCapture?.(e.pointerId);
    });
    const lift = (e: PointerEvent) => this.touched.delete(e.pointerId);
    this.listen(this.shell, 'pointerup', lift);
    this.listen(this.shell, 'pointercancel', lift);
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
    const device = lastDevice();
    this.giveCap.textContent = device === 'gamepad' ? 'B' : device === 'touch' ? '' : actionKeyLabel('putBack');
    this.giveCap.hidden = device === 'touch';
    this.setStatus('');
    this.held.clear();
    this.touched.clear();
    // The B that might be held from the room is not a give-back.
    this.padBack = true;
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
    this.light({ left: false, right: false, up: false, down: false, fire: false });
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
    const pad = this.readPad();
    if (pad.back) {
      this.close();
      return;
    }
    const controls = this.controls(pad.held);
    this.light(controls);
    if (this.ended < 0) {
      runner.step(dt, () => this.edge.press(controls));
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

  /** The first controller's D-pad, left stick and A / X as the game's controls; B's press (once let go since opening) gives it back. */
  private readPad(): { held: HeldControls | null; back: boolean } {
    const pad = [...(navigator.getGamepads?.() ?? [])].find((p): p is Gamepad => !!p && p.connected);
    if (!pad) return { held: null, back: false };
    const button = (i: number) => pad.buttons[i]?.pressed ?? false;
    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    const b = button(PAD.b);
    const back = b && !this.padBack;
    this.padBack = b;
    return {
      held: {
        left: button(PAD.left) || x < -PAD.deadZone,
        right: button(PAD.right) || x > PAD.deadZone,
        up: button(PAD.up) || y < -PAD.deadZone,
        down: button(PAD.down) || y > PAD.deadZone,
        fire: button(PAD.a) || button(PAD.x),
      },
      back,
    };
  }

  /** The keys held, the controller's and the shell's printed controls pressed, together. */
  private controls(pad: HeldControls | null): HeldControls {
    const touched = new Set(this.touched.values());
    const down = (control: Control): boolean => KEYS[control].some((c) => this.held.has(c)) || (pad?.[control] ?? false) || touched.has(control);
    return { left: down('left'), right: down('right'), up: down('up'), down: down('down'), fire: down('fire') };
  }

  /** Each printed control goes down on the shell while what it stands for is held. */
  private light(controls: HeldControls): void {
    const key = CONTROLS.map((c) => (controls[c] ? '1' : '0')).join('');
    if (key === this.lit) return;
    this.lit = key;
    for (const control of CONTROLS) for (const el of this.printed.get(control) ?? []) el.classList.toggle('handheld__pressed', controls[control]);
  }

  /** Tells the kid how the go ended, once. */
  private report(score: number | null): void {
    if (this.reported || !this.play) return;
    this.reported = true;
    this.play.over(score);
  }
}
