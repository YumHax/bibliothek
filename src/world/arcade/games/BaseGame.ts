import type { Sfx, SfxEvent } from '@/audio/ChipSpeaker';
import { type ArcadeControls, type ArcadeGame, type RunContext, SCREEN_H, SCREEN_W, drawText } from './ArcadeGame';
import { seededRandom } from '@/covers/generated/canvasUtils';
import { Fx } from './Fx';

/** The HUD strip across the top; the playfield starts at `PLAY_TOP`. */
export const PLAY_TOP = 22;
const INTRO_SECONDS = 0.9;
const OUTRO_SECONDS = 1.5;
const COMBO_MAX = 5;
const BEST_BANNER_SECONDS = 2;
const LOW_TIME = 5;

export const COMBO_COLORS = ['#c9c4ff', '#c9c4ff', '#7ee787', '#ffe066', '#ffb347', '#ff5f5f'];

/**
 * The run every cabinet game shares, so each game is only its rules (a play is a 10-15 second
 * burst that skill stretches: every game hands out seconds and gets harder stage by stage, so a
 * run is unbounded in theory and short in practice). A READY / GO countdown, an
 * optional clock with a time bar (games can add seconds), a combo multiplier that decays, score
 * pops, a live ticket counter, a NEW BEST banner the moment the record falls, and an end card
 * (TIME UP / GAME OVER) held for a beat before `over` hands the play back to the cabinet.
 * Subclasses implement `begin` (a fresh board), `tick` (rules) and `paint` (the playfield).
 */
export abstract class BaseGame implements ArcadeGame {
  abstract readonly id: string;
  abstract readonly title: string;
  abstract readonly hint: string;
  abstract readonly summary: string;
  score = 0;
  over = false;

  protected readonly fx = new Fx();
  protected combo = 1;
  protected timeLeft = Infinity;
  protected elapsed = 0;
  private best = 0;
  private pointsPerTicket = 50;
  private intro = 0;
  private outro = 0;
  private endReason = '';
  private comboTimer = 0;
  private bestBeaten = false;
  private bestBanner = 0;
  private sounds: SfxEvent[] = [];
  private rng: () => number = Math.random;

  /** `timeLimit` in seconds, or null for a play that only ends by the game's own rules. */
  protected constructor(private readonly timeLimit: number | null) {}

  takeSounds(): SfxEvent[] {
    const sounds = this.sounds;
    this.sounds = [];
    return sounds;
  }

  abstract autopilot(skill: number): ArcadeControls;

  /** Queues a sound for the cabinet's speaker; the same sound twice in a frame plays once. */
  protected sound(sfx: Sfx, pitch = 1): void {
    if (this.sounds.some((s) => s.sfx === sfx)) return;
    if (this.sounds.length < 6) this.sounds.push({ sfx, pitch });
  }

  reset(run: RunContext): void {
    this.score = 0;
    this.over = false;
    this.best = run.best;
    this.pointsPerTicket = run.pointsPerTicket;
    this.combo = 1;
    this.comboTimer = 0;
    this.timeLeft = this.timeLimit ?? Infinity;
    this.elapsed = 0;
    this.intro = INTRO_SECONDS;
    this.outro = 0;
    this.endReason = '';
    this.bestBeaten = false;
    this.bestBanner = 0;
    this.sounds = [];
    this.rng = seededRandom(run.seed ?? Math.floor(Math.random() * 0x100000000));
    this.fx.clear();
    this.begin();
    this.sound('ready');
  }

  update(dt: number, controls: ArcadeControls): void {
    if (this.over) return;
    this.fx.update(dt);
    this.bestBanner = Math.max(0, this.bestBanner - dt);
    if (this.intro > 0) {
      const wasReady = this.intro >= INTRO_SECONDS * 0.35;
      this.intro -= dt;
      if (wasReady && this.intro < INTRO_SECONDS * 0.35) this.sound('go');
      return;
    }
    if (this.outro > 0) {
      this.outro -= dt;
      if (this.outro <= 0) this.over = true;
      return;
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 1;
    }
    this.elapsed += dt;
    this.tick(dt, controls);
    if (this.outro > 0) return;
    if (Number.isFinite(this.timeLeft)) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.end('TIME UP');
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.fx.begin(ctx);
    this.paint(ctx);
    this.fx.end(ctx);
    this.drawHud(ctx);
    if (this.intro > 0) this.drawIntro(ctx);
    if (this.outro > 0 || this.over) this.drawOutro(ctx);
  }

  /**
   * The run's random numbers, seeded by `reset`: every draw that shapes the board (a spawn, a
   * serve, a pick) goes through it, never `Math.random`, so a play replays exactly from its seed
   * and inputs. Autopilots and screen shake may use `Math.random`: they never change the board.
   */
  protected rand(): number {
    return this.rng();
  }

  /** Whether the rules are running (not in the countdown or the end card). */
  protected get live(): boolean {
    return this.intro <= 0 && this.outro <= 0 && !this.over;
  }

  protected abstract begin(): void;
  protected abstract tick(dt: number, controls: ArcadeControls): void;
  protected abstract paint(ctx: CanvasRenderingContext2D): void;

  /** Adds `points` x the combo, pops the amount at (x, y) when given, and raises the NEW BEST banner once. */
  protected addScore(points: number, x?: number, y?: number, color?: string): number {
    const gained = points * this.combo;
    this.score += gained;
    if (x !== undefined && y !== undefined) this.fx.pop(`+${gained}`, x, y, color ?? COMBO_COLORS[this.combo] ?? '#fff2a8', this.combo >= 3 ? 10 : 8);
    this.sound('score', 1 + (this.combo - 1) * 0.12);
    if (!this.bestBeaten && this.best > 0 && this.score > this.best) {
      this.bestBeaten = true;
      this.bestBanner = BEST_BANNER_SECONDS;
      this.fx.flash('#7ee787', 0.12);
      this.sound('best');
    }
    return gained;
  }

  /** A bare bonus: fixed points (no combo), announced with a caption. */
  protected bonus(points: number, caption: string, x = SCREEN_W / 2, y = SCREEN_H / 2): void {
    const combo = this.combo;
    this.combo = 1;
    this.addScore(points);
    this.combo = combo;
    this.fx.pop(`${caption} +${points}`, x, y, '#ffe066', 10);
    this.fx.flash('#ffe066', 0.1);
    this.sound('bonus');
  }

  /** One more step on the multiplier, kept for `hold` seconds since the last step. */
  protected bumpCombo(hold = 2.5): void {
    this.combo = Math.min(COMBO_MAX, this.combo + 1);
    this.comboTimer = hold;
    if (this.combo === COMBO_MAX && this.comboTimer === hold) this.fx.shake(1.5, 0.1);
  }

  protected breakCombo(): void {
    if (this.combo > 1) {
      this.fx.pop('COMBO LOST', SCREEN_W / 2, PLAY_TOP + 30, '#ff8a80', 8);
      this.sound('lose');
    }
    this.combo = 1;
    this.comboTimer = 0;
  }

  /** Puts seconds on the clock (timed games only) and says so. */
  protected addTime(seconds: number, x = SCREEN_W / 2, y = PLAY_TOP + 50): void {
    if (!Number.isFinite(this.timeLeft)) return;
    this.timeLeft = Math.max(0, this.timeLeft + seconds);
    this.fx.pop(`${seconds > 0 ? '+' : ''}${seconds}s`, x, y, seconds > 0 ? '#7ee787' : '#ff8a80', 10);
    this.sound(seconds > 0 ? 'time' : 'penalty');
  }

  /** The stage the game is at (WALL 3, WAVE 2, LEVEL 4...), dim at the top of the playfield. */
  protected drawStage(ctx: CanvasRenderingContext2D, text: string): void {
    drawText(ctx, text, SCREEN_W / 2, PLAY_TOP + 8, 7, 'rgba(201,196,255,0.55)');
  }

  /** Ends the play after a held card; the cabinet reads `over` once the card has shown. */
  protected end(reason: string): void {
    if (this.outro > 0 || this.over) return;
    this.outro = OUTRO_SECONDS;
    this.endReason = reason;
    this.fx.shake(2, 0.2);
    this.sound('over');
  }

  /** Whether the READY / GO countdown is still on (an autopilot waits it out). */
  protected get counting(): boolean {
    return this.intro > 0;
  }

  private get tickets(): number {
    return Math.floor(this.score / this.pointsPerTicket);
  }

  // --- Overlays -------------------------------------------------------------------------------

  private drawHud(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, SCREEN_W, PLAY_TOP - 3);
    drawText(ctx, `${this.score}`, 6, 10, 10, '#ffffff', 'left');
    if (this.combo > 1) drawText(ctx, `x${this.combo}`, 6 + ctx.measureText(`${this.score}`).width + 8, 10, 9, COMBO_COLORS[this.combo] ?? '#ffe066', 'left');
    drawText(ctx, `${this.tickets} TIX`, SCREEN_W / 2, 10, 9, '#ffd23a');
    if (Number.isFinite(this.timeLeft)) {
      const low = this.timeLeft <= LOW_TIME && this.live;
      const blink = low && Math.floor(this.timeLeft * 4) % 2 === 0;
      drawText(ctx, `${Math.ceil(this.timeLeft)}s`, SCREEN_W - 6, 10, 10, blink ? '#ff5f5f' : low ? '#ffb347' : '#c9c4ff', 'right');
      const total = this.timeLimit ?? 1;
      const frac = Math.min(1, this.timeLeft / total);
      ctx.fillStyle = '#222233';
      ctx.fillRect(0, PLAY_TOP - 3, SCREEN_W, 3);
      ctx.fillStyle = low ? '#ff5f5f' : '#63b3ff';
      ctx.fillRect(0, PLAY_TOP - 3, SCREEN_W * frac, 3);
    } else if (this.best > 0) {
      drawText(ctx, `BEST ${this.best}`, SCREEN_W - 6, 10, 8, '#c9c4ff', 'right');
    }
    if (this.bestBanner > 0) {
      const y = PLAY_TOP + 16;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(SCREEN_W / 2 - 70, y - 9, 140, 18);
      drawText(ctx, 'NEW BEST!', SCREEN_W / 2, y, 11, Math.floor(this.bestBanner * 8) % 2 === 0 ? '#7ee787' : '#ffffff');
    }
  }

  private drawIntro(ctx: CanvasRenderingContext2D): void {
    const go = this.intro < INTRO_SECONDS * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, SCREEN_H / 2 - 24, SCREEN_W, 48);
    drawText(ctx, go ? 'GO!' : 'READY', SCREEN_W / 2, SCREEN_H / 2, go ? 24 : 18, go ? '#7ee787' : '#fff2a8');
  }

  private drawOutro(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, SCREEN_H / 2 - 30, SCREEN_W, 60);
    drawText(ctx, this.endReason, SCREEN_W / 2, SCREEN_H / 2 - 8, 18, '#ff8a80');
    drawText(ctx, `${this.score} PTS  ${this.tickets} TICKETS`, SCREEN_W / 2, SCREEN_H / 2 + 16, 9, '#ffd23a');
  }
}
