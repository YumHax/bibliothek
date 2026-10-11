import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { faceOn } from '../props/joinery';
import { WALL } from '../surface/layers';
import { paint } from '../materials/palette';
import { drawText } from './games/ArcadeGame';
import { ARCADE_CARD } from '@/economy/pricing';
import { formatNumber, ordinal } from '@/text/count';

/** The league as the board reads it (the concrete `ArcadeLeague` lives in `economy/`). */
interface LeagueSource {
  standings(): readonly { name: string; tickets: number; you?: boolean }[];
  readonly week: { label: string; daysLeft: number };
  readonly playedToday: boolean;
  /** Pennants won per division (bronze, silver, gold). */
  readonly pennantsWon: readonly number[];
  readonly division: { level: number; name: string };
  /** The regular's card: its punches and colour; the gold tokens in the pocket. */
  readonly card: { punches: number; tier: string | null };
  readonly tokens: number;
  /** Last week's result, until a ticket play settles it (a won week's pennant goes home then). */
  readonly lastWeek?: { rank: number; tickets: number; won: boolean } | null;
  subscribe(cb: () => void): () => void;
}

interface LeagueBoardOptions {
  league: LeagueSource;
  width?: number;
  height?: number;
}

const PX_PER_M = 640;

/** The regulars' totals creep up with the week: the board looks again this often. */
const REFRESH_SECONDS = 20;
const FRAME = paint(0x0d0c12, 0.4);

/** The pennants' colours by division, and the card's by its colour's name. */
const DIVISION_COLOURS = ['#d08a4a', '#d8dde6', '#ffd23a'];
const CARD_COLOURS: Readonly<Record<string, string>> = { REGULAR: '#c9c4ff', 'SILVER CARD': '#d8dde6', 'GOLD CARD': '#ffd23a', 'HALL LEGEND': '#ff7ad9' };

/**
 * The weekly league on the wall: this week's table in the player's division (the regulars' ticket totals as far as
 * they have got, YOU in green), the days left, a pennant per week won in its division's colour, and the player's
 * regular's card (its colour, the punches towards the next gold token, the tokens in the pocket). Things, not rules.
 * Follows the league live. Wall-hung: origin at the centre, on the wall, +z into the room. Decoration: never collides.
 */
export class LeagueBoard extends Prop implements Updatable {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly league: LeagueSource;
  private readonly W: number;
  private readonly H: number;
  private readonly unsubscribe: () => void;
  private clock = 0;
  private dirty = true;

  constructor(options: LeagueBoardOptions) {
    super();
    this.name = 'LeagueBoard';
    this.league = options.league;
    const width = options.width ?? 1.1;
    const height = options.height ?? 0.9;
    const frame = boxMesh(width + 0.06, height + 0.06, 0.04, FRAME, { z: 0.02 });
    this.add(frame);
    const [canvas, ctx] = createCanvas(Math.round(width * PX_PER_M), Math.round(height * PX_PER_M));
    this.ctx = ctx;
    this.W = canvas.width;
    this.H = canvas.height;
    this.texture = toTexture(canvas);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.texture, color: 0xd0d0d0 }));
    this.add(faceOn(face, frame, WALL.notice));
    this.unsubscribe = options.league.subscribe(() => (this.dirty = true));
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock >= REFRESH_SECONDS) {
      this.clock = 0;
      this.dirty = true;
    }
    if (this.dirty) this.repaint();
  }

  dispose(): void {
    this.unsubscribe();
  }

  /** A little pennant per week won, in its division's colour (up to a row's worth; the rest is a count beside). */
  private paintPennants(y: number, under: boolean): void {
    const { ctx, W, H, league } = this;
    const flags = league.pennantsWon.flatMap((n, d) => Array.from({ length: n }, () => DIVISION_COLOURS[d] ?? '#ffd23a'));
    if (!flags.length) return;
    const row = under ? y + H * 0.05 : y;
    const shown = flags.slice(-14);
    const step = H * 0.045;
    const x0 = W / 2 - ((shown.length - 1) * step) / 2;
    shown.forEach((color, i) => {
      const x = x0 + i * step;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - step * 0.3, row - H * 0.022);
      ctx.lineTo(x + step * 0.35, row);
      ctx.lineTo(x - step * 0.3, row + H * 0.022);
      ctx.closePath();
      ctx.fill();
    });
    if (flags.length > shown.length) drawText(ctx, `+${flags.length - shown.length}`, x0 + shown.length * step, row, Math.round(H * 0.026), '#ffd23a', 'left');
  }

  /** The regular's card: a stub in its colour, the holes towards the next gold token, the tokens beside it. */
  private paintCard(y: number): void {
    const { ctx, W, H, league } = this;
    const { tier, punches } = league.card;
    const colour = (tier && CARD_COLOURS[tier]) ?? '#6a6690';
    const cardW = W * 0.42;
    const cardH = H * 0.1;
    const x = W * 0.08;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y - cardH / 2, cardW, cardH);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y - cardH / 2, cardW, cardH);
    drawText(ctx, tier ?? 'ARCADE CARD', x + 12, y - cardH * 0.18, Math.round(H * 0.026), colour, 'left');
    // The holes punched towards the next token: one per game day played.
    const every = ARCADE_CARD.tokenEvery;
    const done = punches % every || (punches > 0 && league.playedToday ? every : 0);
    for (let i = 0; i < every; i++) {
      ctx.fillStyle = i < done ? '#10081c' : colour;
      ctx.beginPath();
      ctx.arc(x + 20 + i * H * 0.045, y + cardH * 0.2, H * 0.014, 0, Math.PI * 2);
      ctx.fill();
    }
    // The gold tokens in the pocket, as coins.
    const tokens = Math.min(league.tokens, 8);
    for (let i = 0; i < tokens; i++) {
      const cx = W * 0.6 + i * H * 0.05;
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.arc(cx, y, H * 0.022, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a07a10';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (league.tokens > tokens) drawText(ctx, `+${league.tokens - tokens}`, W * 0.6 + tokens * H * 0.05, y, Math.round(H * 0.026), '#ffd23a', 'left');
    if (league.tokens > 0) drawText(ctx, league.tokens === 1 ? 'GOLD TOKEN' : 'GOLD TOKENS', W * 0.6 - H * 0.02, y + H * 0.045, Math.round(H * 0.022), '#c9a640', 'left');
  }

  private repaint(): void {
    this.dirty = false;
    const { ctx, W, H, league } = this;
    ctx.fillStyle = '#10081c';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#33e0ff';
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    const week = league.week;
    const division = league.division;
    drawText(ctx, 'WEEKLY LEAGUE', W / 2, H * 0.08, Math.round(H * 0.065), '#33e0ff');
    drawText(ctx, `${division.name} DIVISION · WEEK ${week.label} · ${week.daysLeft === 0 ? 'ENDS TONIGHT' : `${week.daysLeft} DAY${week.daysLeft > 1 ? 'S' : ''} LEFT`}`, W / 2, H * 0.155, Math.round(H * 0.03), DIVISION_COLOURS[division.level] ?? '#8a86b0');
    const rows = league.standings();
    const rowH = (H * 0.48) / rows.length;
    rows.forEach((row, i) => {
      const y = H * 0.22 + rowH * (i + 0.5);
      const color = row.you ? '#7ee787' : '#ffffff';
      if (row.you) {
        ctx.fillStyle = 'rgba(126,231,135,0.12)';
        ctx.fillRect(28, y - rowH / 2 + 2, W - 56, rowH - 4);
      }
      drawText(ctx, `${i + 1}`, 50, y, Math.round(rowH * 0.5), i === 0 ? '#ffd23a' : '#9a96c0', 'left');
      drawText(ctx, row.name, 100, y, Math.round(rowH * 0.5), color, 'left');
      drawText(ctx, formatNumber(row.tickets), W - 50, y, Math.round(rowH * 0.5), color, 'right');
    });
    const last = league.lastWeek;
    if (last) drawText(ctx, last.won ? 'LAST WEEK: YOU WON THE PENNANT!' : `LAST WEEK: YOU CAME ${ordinal(last.rank + 1).toUpperCase()}`, W / 2, H * 0.745, Math.round(H * 0.03), last.won ? '#ffd23a' : '#ff8a80');
    this.paintPennants(H * 0.745, Boolean(last));
    this.paintCard(H * 0.87);
    this.texture.needsUpdate = true;
  }
}
