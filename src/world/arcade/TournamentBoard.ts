import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { markShared, matte, Prop } from '../props/Prop';
import { drawText } from './games/ArcadeGame';

/** One match as the board draws it (the concrete bracket is `economy/ArcadeTournament`'s). */
interface BoardMatch {
  a: string;
  b: string;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null;
}

/** The tournament as the board reads it. */
export interface TournamentSource {
  view(): {
    on: boolean;
    gameId: string;
    entrants: readonly string[];
    rounds: readonly (readonly BoardMatch[])[];
    entered: boolean;
    wins: number;
    out: boolean;
    next: { round: number; name: string; score: number } | null;
  };
  /** Signs today's sheet; false when it cannot be signed. */
  enter(): boolean;
  subscribe(cb: () => void): () => void;
}

export interface TournamentBoardOptions {
  tournament: TournamentSource;
  /** Coins to sign the sheet. */
  entry: number;
  /** A machine's title by its game id. */
  titleOf: (gameId: string) => string;
  /** The player signed (after paying): the builder keeps the session to announce the rounds. */
  onSigned?: (session: SessionActions) => void;
  /** Clicked on a tournament day after signing: the same, so a reload still hears the rounds. */
  onClicked?: (session: SessionActions) => void;
  width?: number;
  height?: number;
}

const PX_PER_M = 640;
/** The day can turn Saturday (or stop being) while the player stands there: look again this often. */
const POLL_SECONDS = 5;
const FRAME = markShared(matte(0x14100a, 0.45));
const CLIPBOARD = markShared(matte(0x8a5a2e, 0.7));
const CLIP = markShared(new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.7, roughness: 0.3 }));
const ROUND_TITLES = ['QUARTERS', 'SEMIS', 'FINAL'];

/**
 * THE SATURDAY TOURNAMENT on the wall: the eight-entrant bracket (the player's run in green, each
 * match's scores once known, the champion's box on the right), today's cabinet and the entry fee,
 * and the sign-up sheet on a clipboard beside it, the regulars' initials already on it. Clicking
 * it on a Saturday signs the sheet (the Session takes the coins, `pay`); signed, it says who is
 * next and the score to beat; any other day, when the next one is. Wall-hung, +z into the room.
 */
export class TournamentBoard extends Prop implements Updatable, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly sheetCtx: CanvasRenderingContext2D;
  private readonly sheetTexture: THREE.CanvasTexture;
  private readonly options: TournamentBoardOptions;
  private readonly W: number;
  private readonly H: number;
  private readonly unsubscribe: () => void;
  private dirty = true;
  private clock = 0;
  private shownOn: boolean | null = null;

  constructor(options: TournamentBoardOptions) {
    super();
    this.name = 'TournamentBoard';
    this.options = options;
    const width = options.width ?? 1.1;
    const height = options.height ?? 0.85;
    const frame = boxMesh(width + 0.06, height + 0.06, 0.04, FRAME, { z: 0.02 });
    frame.castShadow = false;
    this.add(frame);
    const [canvas, ctx] = createCanvas(Math.round(width * PX_PER_M), Math.round(height * PX_PER_M));
    this.ctx = ctx;
    this.W = canvas.width;
    this.H = canvas.height;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, color: 0xd8d8d8 }));
    face.position.z = 0.042;
    this.add(face);

    // The sign-up sheet on its clipboard, hung on a nail right of the board.
    const clipW = 0.23;
    const clipH = 0.31;
    const clipX = width / 2 + 0.05 + clipW / 2;
    const clipY = -height / 2 + clipH / 2 + 0.02;
    const board = boxMesh(clipW, clipH, 0.008, CLIPBOARD, { x: clipX, y: clipY, z: 0.004 });
    board.castShadow = false;
    const clip = boxMesh(0.08, 0.025, 0.015, CLIP, { x: clipX, y: clipY + clipH / 2 - 0.01, z: 0.014 });
    clip.castShadow = false;
    const [sheetCanvas, sheetCtx] = createCanvas(200, 256);
    this.sheetCtx = sheetCtx;
    this.sheetTexture = new THREE.CanvasTexture(sheetCanvas);
    this.sheetTexture.colorSpace = THREE.SRGBColorSpace;
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(clipW - 0.03, clipH - 0.05), new THREE.MeshStandardMaterial({ map: this.sheetTexture, roughness: 0.9 }));
    paper.position.set(clipX, clipY - 0.012, 0.0086);
    this.add(board, paper, clip);

    this.hitboxes = [
      invisibleHitbox(width + 0.06, height + 0.06, 0.06, { z: 0.03 }),
      invisibleHitbox(clipW, clipH, 0.05, { x: clipX, y: clipY, z: 0.025 }),
    ];
    this.add(...this.hitboxes);
    this.unsubscribe = options.tournament.subscribe(() => (this.dirty = true));
  }

  setHovered(): void {}

  label(): string | null {
    const v = this.options.tournament.view();
    if (!v.on) return 'SATURDAY TOURNAMENT · every Saturday';
    if (!v.entered) return `Click to sign up for today's tournament (${this.options.entry} coin${this.options.entry === 1 ? '' : 's'})`;
    if (v.next) return `Next: ${v.next.name} on ${this.options.titleOf(v.gameId)} · beat ${v.next.score.toLocaleString('en-US')}`;
    return v.out ? 'Knocked out. Next Saturday, then.' : 'Champion! The cup is on the prize shelf at home.';
  }

  activate(session: SessionActions): void {
    const { tournament, entry, titleOf } = this.options;
    const v = tournament.view();
    const game = titleOf(v.gameId);
    if (!v.on) {
      session.hint('Every Saturday: three rounds on one cabinet against the regulars. Sign the sheet, beat their scores.');
      return;
    }
    if (v.entered) {
      this.options.onClicked?.(session);
      if (v.next) session.hint(`${ROUND_TITLES[v.next.round]}: play ${game} and beat ${v.next.name}'s ${v.next.score.toLocaleString('en-US')}.`);
      else session.hint(v.out ? 'You are out for today. The bracket plays on without you.' : 'You won the tournament. Frame the bracket.');
      return;
    }
    session.pay({
      price: entry,
      paid: () => {
        if (!tournament.enter()) return 'The sheet is full.';
        this.options.onSigned?.(session);
        const next = tournament.view().next;
        return next
          ? `You are in! Quarter-final on ${game}: beat ${next.name}'s ${next.score.toLocaleString('en-US')}. Each round is a normal play.`
          : `You are in! Play ${game}.`;
      },
    });
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock >= POLL_SECONDS) {
      this.clock = 0;
      const on = this.options.tournament.view().on;
      if (on !== this.shownOn) this.dirty = true;
    }
    if (this.dirty) this.repaint();
  }

  dispose(): void {
    this.unsubscribe();
  }

  private repaint(): void {
    this.dirty = false;
    const { ctx, W, H } = this;
    const v = this.options.tournament.view();
    this.shownOn = v.on;
    ctx.fillStyle = '#0d0a16';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    drawText(ctx, 'SATURDAY TOURNAMENT', W / 2, H * 0.08, Math.round(H * 0.065), '#ffd23a');
    const game = this.options.titleOf(v.gameId);
    const sub = v.on ? `TODAY ON ${game.toUpperCase()} · ENTRY ${this.options.entry} COINS · BEAT YOUR OPPONENT'S SCORE` : 'EVERY SATURDAY · THREE ROUNDS · ONE CABINET · THE CUP';
    drawText(ctx, sub, W / 2, H * 0.155, Math.round(H * 0.028), '#c9c4ff');
    if (v.on) this.paintBracket(v);
    else {
      drawText(ctx, 'NEXT ONE ON SATURDAY', W / 2, H * 0.48, Math.round(H * 0.07), '#ff8a80');
      drawText(ctx, 'SIGN THE SHEET · THREE COINS', W / 2, H * 0.6, Math.round(H * 0.04), '#8a86b0');
      drawText(ctx, 'WIN THREE ROUNDS · TAKE THE CUP HOME', W / 2, H * 0.68, Math.round(H * 0.04), '#8a86b0');
    }
    this.texture.needsUpdate = true;
    this.paintSheet(v.on ? v.entrants : [], v.entered);
  }

  private paintBracket(v: ReturnType<TournamentSource['view']>): void {
    const { ctx, W, H } = this;
    const top = H * 0.24;
    const bottom = H * 0.9;
    const colX = [W * 0.04, W * 0.3, W * 0.56, W * 0.8];
    const colW = W * 0.19;
    const slotH = Math.round(H * 0.058);
    const size = Math.round(slotH * 0.55);
    ROUND_TITLES.forEach((t, r) => drawText(ctx, t, colX[r]! + colW / 2, top - H * 0.035, Math.round(H * 0.026), '#8a86b0'));
    drawText(ctx, 'CHAMPION', colX[3]! + colW / 2, top - H * 0.035, Math.round(H * 0.026), '#ffd23a');
    // Slot centres: the quarter-finals' eight names spread down the board, each later slot between its two feeders.
    const centres: number[][] = [[]];
    for (let i = 0; i < 8; i++) centres[0]!.push(top + ((bottom - top) * (i + 0.5)) / 8);
    for (let r = 1; r <= 3; r++) centres.push(centres[r - 1]!.reduce<number[]>((acc, y, i, all) => (i % 2 ? [...acc, (all[i - 1]! + y) / 2] : acc), []));
    const slot = (x: number, y: number, name: string, score: number | null, state: 'won' | 'lost' | 'open', you: boolean) => {
      ctx.fillStyle = you ? 'rgba(126,231,135,0.16)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, y - slotH / 2, colW, slotH);
      ctx.strokeStyle = state === 'won' ? '#ffd23a' : '#3a3552';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y - slotH / 2, colW, slotH);
      const color = you ? '#7ee787' : state === 'lost' ? '#6a6690' : '#ffffff';
      drawText(ctx, name, x + 8, y, size, color, 'left');
      if (score !== null) drawText(ctx, score.toLocaleString('en-US'), x + colW - 8, y, Math.round(size * 0.8), state === 'won' ? '#ffd23a' : '#8a86b0', 'right');
    };
    v.rounds.forEach((matches, r) => {
      matches.forEach((m, i) => {
        const ya = centres[r]![i * 2]!;
        const yb = centres[r]![i * 2 + 1]!;
        const stateOf = (name: string): 'won' | 'lost' | 'open' => (m.winner === null ? 'open' : m.winner === name ? 'won' : 'lost');
        const shownName = (name: string) => (name === 'YOU' && !v.entered ? 'YOU?' : name);
        slot(colX[r]!, ya, shownName(m.a), m.scoreA, stateOf(m.a), m.a === 'YOU' && v.entered);
        slot(colX[r]!, yb, shownName(m.b), m.scoreB, stateOf(m.b), m.b === 'YOU' && v.entered);
        // The bracket's lines to the next round.
        const x0 = colX[r]! + colW;
        const x1 = colX[r + 1]!;
        const xm = (x0 + x1) / 2;
        const yn = centres[r + 1]![i]!;
        ctx.strokeStyle = '#4a4466';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, ya);
        ctx.lineTo(xm, ya);
        ctx.lineTo(xm, yb);
        ctx.lineTo(x0, yb);
        ctx.moveTo(xm, yn);
        ctx.lineTo(x1, yn);
        ctx.stroke();
      });
    });
    const final = v.rounds[2]?.[0];
    const champion = final?.winner ?? null;
    slot(colX[3]!, centres[3]![0]!, champion ?? '???', null, champion ? 'won' : 'open', champion === 'YOU');
    const foot = !v.entered
      ? 'CLICK TO SIGN UP · EACH ROUND IS ONE PLAY ON THE CABINET'
      : v.next
        ? `YOUR ${ROUND_TITLES[v.next.round]}: BEAT ${v.next.name} · ${v.next.score.toLocaleString('en-US')}`
        : v.out
          ? 'KNOCKED OUT · SEE YOU NEXT SATURDAY'
          : 'CHAMPION! THE CUP GOES HOME WITH YOU';
    drawText(ctx, foot, W / 2, H * 0.95, Math.round(H * 0.03), v.entered && !v.out ? '#7ee787' : '#ff8a80');
  }

  /** The clipboard: the regulars' initials in their own hands, and the player's line (signed, or waiting). */
  private paintSheet(entrants: readonly string[], signed: boolean): void {
    const ctx = this.sheetCtx;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = '#f4f1e6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2a2a3a';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SIGN UP', w / 2, 20);
    ctx.font = '13px sans-serif';
    ctx.fillText('Saturday · 3 coins', w / 2, 40);
    ctx.strokeStyle = '#9ab0d0';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const y = 70 + i * 23;
      ctx.beginPath();
      ctx.moveTo(18, y + 8);
      ctx.lineTo(w - 18, y + 8);
      ctx.stroke();
      ctx.fillStyle = '#6a6a7a';
      ctx.textAlign = 'left';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${i + 1}.`, 20, y);
    }
    // Regulars sign first (from the second line on); the player's line is the first.
    entrants.slice(1).forEach((name, i) => {
      const y = 70 + (i + 1) * 23;
      ctx.save();
      ctx.translate(48 + ((i * 17) % 23), y);
      ctx.rotate(((i % 3) - 1) * 0.06);
      ctx.fillStyle = ['#1a2a6a', '#3a1a1a', '#1a3a2a'][i % 3]!;
      ctx.font = `italic bold ${18 + (i % 2) * 2}px cursive, sans-serif`;
      ctx.fillText(name, 0, 0);
      ctx.restore();
    });
    if (signed) {
      ctx.save();
      ctx.translate(52, 70);
      ctx.rotate(-0.04);
      ctx.fillStyle = '#1f6a2a';
      ctx.font = 'italic bold 20px cursive, sans-serif';
      ctx.fillText('ME!', 0, 0);
      ctx.restore();
    }
    this.sheetTexture.needsUpdate = true;
  }
}
