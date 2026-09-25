import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { markShared, matte, Prop } from '../props/Prop';
import { drawText } from './games/ArcadeGame';

/** The league as the board reads it (the concrete `ArcadeLeague` lives in `economy/`). */
export interface LeagueSource {
  standings(): readonly { name: string; tickets: number; you?: boolean }[];
  readonly week: { label: string; daysLeft: number };
  readonly streakDays: number;
  readonly playedToday: boolean;
  readonly nextStreakBonus: number;
  readonly pennants: number;
  subscribe(cb: () => void): () => void;
}

export interface LeagueBoardOptions {
  league: LeagueSource;
  width?: number;
  height?: number;
}

const PX_PER_M = 640;
/** The regulars' totals creep up with the week: the board looks again this often. */
const REFRESH_SECONDS = 20;
const FRAME = markShared(matte(0x0d0c12, 0.4));

/**
 * The weekly league on the wall: this week's table (the regulars' ticket totals as far as they
 * have got, the player's in green), the days left, the pennants won, and the player's streak with
 * what tomorrow's first play will pay. Follows the league live. Wall-hung: origin at the centre,
 * on the wall, +z into the room. Decoration: never collides.
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
    this.add(boxMesh(width + 0.06, height + 0.06, 0.04, FRAME, { z: 0.02 }));
    const [canvas, ctx] = createCanvas(Math.round(width * PX_PER_M), Math.round(height * PX_PER_M));
    this.ctx = ctx;
    this.W = canvas.width;
    this.H = canvas.height;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, color: 0xd0d0d0 }));
    face.position.z = 0.042;
    this.add(face);
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

  private repaint(): void {
    this.dirty = false;
    const { ctx, W, H, league } = this;
    ctx.fillStyle = '#10081c';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#33e0ff';
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    const week = league.week;
    drawText(ctx, 'WEEKLY LEAGUE', W / 2, H * 0.09, Math.round(H * 0.07), '#33e0ff');
    drawText(ctx, `WEEK ${week.label.replace('W', '')} · ${week.daysLeft === 0 ? 'ENDS TONIGHT' : `${week.daysLeft} DAY${week.daysLeft > 1 ? 'S' : ''} LEFT`} · TICKETS WON`, W / 2, H * 0.17, Math.round(H * 0.03), '#8a86b0');
    const rows = league.standings();
    const rowH = (H * 0.5) / rows.length;
    rows.forEach((row, i) => {
      const y = H * 0.24 + rowH * (i + 0.5);
      const color = row.you ? '#7ee787' : '#ffffff';
      if (row.you) {
        ctx.fillStyle = 'rgba(126,231,135,0.12)';
        ctx.fillRect(28, y - rowH / 2 + 2, W - 56, rowH - 4);
      }
      drawText(ctx, `${i + 1}`, 50, y, Math.round(rowH * 0.5), i === 0 ? '#ffd23a' : '#9a96c0', 'left');
      drawText(ctx, row.name, 100, y, Math.round(rowH * 0.5), color, 'left');
      drawText(ctx, row.tickets.toLocaleString('en-US'), W - 50, y, Math.round(rowH * 0.5), color, 'right');
    });
    drawText(ctx, 'FIRST ON SUNDAY NIGHT TAKES THE PENNANT HOME', W / 2, H * 0.79, Math.round(H * 0.028), '#ff8a80');
    const streak = league.streakDays;
    const streakLine = streak >= 2 ? `STREAK: ${streak} DAYS` : streak === 1 ? 'STREAK: 1 DAY' : 'NO STREAK YET';
    const bonusLine = league.playedToday ? `COME BACK TOMORROW: +${league.nextStreakBonus} TIX` : `PLAY TODAY: +${league.nextStreakBonus} TIX ON YOUR FIRST GO`;
    drawText(ctx, streakLine, W / 2, H * 0.86, Math.round(H * 0.04), '#ffd23a');
    drawText(ctx, league.nextStreakBonus > 0 ? bonusLine : 'PLAY TWO DAYS IN A ROW FOR A BONUS', W / 2, H * 0.92, Math.round(H * 0.028), '#c9c4ff');
    if (league.pennants > 0) drawText(ctx, `PENNANTS WON: ${league.pennants}`, W - 40, H * 0.09, Math.round(H * 0.028), '#ffd23a', 'right');
    this.texture.needsUpdate = true;
  }
}
