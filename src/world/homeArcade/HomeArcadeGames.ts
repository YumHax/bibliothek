import type { SfxEvent } from '@/audio/ChipSpeaker';
import { ARCADE_GAMES, type ArcadeGameId } from '../arcade/games';
import { type ArcadeControls, type ArcadeGame, NO_CONTROLS, type RunContext, SCREEN_H, SCREEN_W, drawText } from '../arcade/games/ArcadeGame';
import { KeyEdges } from '@/input/GameInput';
import { SoundQueue } from '../arcade/SoundQueue';
import { formatNumber } from '@/text/count';

/** The hall's cabinet games a home cabinet carries: those that need nothing bolted on (no light gun, pad or web page). */
export const HOME_GAME_IDS: readonly ArcadeGameId[] = ['breakout', 'invaders', 'stacker', 'frog', 'snake', 'comets', 'duel'];

/** The menu's id while no game is picked yet: its table stays empty. */
const MENU_ID = 'home-menu';
/** The board's name, on the marquee and the title card. */
export const HOME_TITLE = 'ARCADE 7-IN-1';
/** How long a demo hesitates on the menu before it picks (s). */
const DEMO_PICK_S = 1.6;

/**
 * A multi-game board for a home cabinet ("7-IN-1"): each play starts on a menu of the hall's own games (up / down
 * picks, fire plays it, the player's best beside each), then is that game until it is over. Everything the cabinet
 * reads (`id`, `score`, `over`, the sounds, the second player) is the game being played's, so the cabinet's table,
 * initials and end card are that game's. Replay-exact like the games themselves: the menu only reads the controls.
 */
export class HomeArcadeGames implements ArcadeGame {
  readonly title = HOME_TITLE;
  readonly hint = 'Up / down pick a game, fire plays it';
  readonly summary = `${HOME_GAME_IDS.length} GAMES · FREE PLAY · NO TICKETS`;
  readonly demoable = true;

  private readonly games: readonly ArcadeGame[];
  private current: ArcadeGame | null = null;
  private choice = 0;
  private run: RunContext = { best: 0, pointsPerTicket: 0 };
  private readonly keys = new KeyEdges({ fire: true });
  private menuClock = 0;
  private readonly sounds = new SoundQueue();
  private opponent: { name: string; skill: number } = { name: 'CPU', skill: 0.7 };

  constructor(private readonly bestOf: (gameId: string) => number) {
    this.games = HOME_GAME_IDS.map((id) => ARCADE_GAMES[id]({}));
  }

  /** The game being played's id (its table at home), the menu's while none is picked. */
  get id(): string {
    return this.current?.id ?? MENU_ID;
  }

  get score(): number {
    return this.current?.score ?? 0;
  }

  get over(): boolean {
    return this.current?.over ?? false;
  }

  /** The game the menu points at, for a games night that wants the two-player one ready. */
  pick(gameId: ArcadeGameId): void {
    const i = HOME_GAME_IDS.indexOf(gameId);
    if (i >= 0) this.choice = i;
  }

  reset(run: RunContext): void {
    this.run = run;
    this.current = null;
    this.menuClock = 0;
    this.keys.reset();
    this.sounds.clear();
  }

  update(dt: number, controls: ArcadeControls): void {
    if (this.current) return this.current.update(dt, controls);
    this.menuClock += dt;
    const n = this.games.length;
    if (this.keys.pressed(controls, 'up')) this.move(-1, n);
    if (this.keys.pressed(controls, 'down')) this.move(1, n);
    if (this.keys.pressed(controls, 'fire')) {
      const game = this.games[this.choice]!;
      game.setOpponent?.(this.opponent.name, this.opponent.skill);
      game.reset({ ...this.run, best: this.bestOf(game.id) });
      this.current = game;
      this.sounds.push('confirm');
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.current) return this.current.draw(ctx);
    ctx.fillStyle = '#07070c';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawText(ctx, this.title, SCREEN_W / 2, 22, 14, '#fff2a8');
    drawText(ctx, 'PICK A GAME', SCREEN_W / 2, 40, 7, '#9ad6ff');
    const top = 58;
    const row = 21;
    this.games.forEach((game, i) => {
      const y = top + i * row;
      const on = i === this.choice;
      if (on) {
        ctx.fillStyle = 'rgba(255,210,58,0.16)';
        ctx.fillRect(18, y - 9, SCREEN_W - 36, 18);
      }
      drawText(ctx, `${on ? '>' : ' '} ${game.title}`, 26, y, 9, on ? '#ffd23a' : '#c9c4ff', 'left');
      const best = this.bestOf(game.id);
      drawText(ctx, best > 0 ? formatNumber(best) : '-', SCREEN_W - 26, y, 8, on ? '#ffffff' : '#7a7a90', 'right');
    });
    const picked = this.games[this.choice];
    if (picked) drawText(ctx, picked.summary, SCREEN_W / 2, SCREEN_H - 14, 6, '#7a7a90');
  }

  takeSounds(): SfxEvent[] {
    if (this.current) return this.current.takeSounds();
    return this.sounds.take();
  }

  /** On the menu a demo runs down the list a little and picks; then the game plays itself. */
  autopilot(skill: number): ArcadeControls {
    if (this.current) return this.current.autopilot(skill);
    const beat = Math.floor(this.menuClock * 4);
    return { ...NO_CONTROLS, down: this.menuClock < DEMO_PICK_S && beat % 2 === 0, fire: this.menuClock >= DEMO_PICK_S, firePressed: false };
  }

  setOpponent(name: string, skill: number): void {
    this.opponent = { name, skill };
    this.current?.setOpponent?.(name, skill);
  }

  opponentControls(): ArcadeControls {
    return this.current?.opponentControls?.() ?? NO_CONTROLS;
  }

  private move(step: number, n: number): void {
    this.choice = (this.choice + step + n) % n;
    this.sounds.push('blip');
  }
}
