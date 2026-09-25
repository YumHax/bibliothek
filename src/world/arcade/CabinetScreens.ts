import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { actionKeyLabel } from '@/ui/keys';
import { type ArcadeControls, type ArcadeGame, SCREEN_H, SCREEN_W, drawText } from './games/ArcadeGame';
import { crtScreenMaterial } from './crtScreen';
import { type InitialsEntry, ordinal } from './InitialsEntry';
import type { MachineRun } from './MachineRun';
import type { MedalBook, ScoreTable, TodaysChallenge } from './scoreTable';
import type { Replay } from './replay/Replay';
import { outOfOrderNote } from './machineParts';
import { SCREEN_HEIGHT, SCREEN_TILT, SCREEN_WIDTH, SCREEN_Y, SCREEN_Z } from './cabinetModel';

/**
 * Redraws of a game somebody else is running (a regular, a demo, a replay): at most this often, and
 * not at all while the glass is behind the camera. The player's own game redraws every frame. Each
 * redraw uploads the 320 x 240 canvas, so a hall of demos adds up.
 */
const SHOW_FPS = 15;
/** Farther than this from the camera, an idle cabinet only shows its title card (nobody would see the demo). */
const DEMO_RANGE = 9;

/** What the title card tells about the game. */
export interface TitleInfo {
  scores: ScoreTable;
  pointsPerTicket: number;
  medals?: MedalBook;
  challenge?: () => TodaysChallenge | null;
}

/**
 * A cabinet's glass: a 320 x 240 canvas under a CRT's bulge and scan lines (unlit, so it reads as
 * a lit screen whatever the room's light), with the out-of-order note taped over it, and what goes
 * on it besides the game: the title card, the DEMO / best-run banner, a dead tube's snow, the
 * initials over the frozen game, the end card counting the tickets up. It also knows where the
 * camera looks on it (a light gun's aim) and whether the camera could see it at all.
 */
export class CabinetScreens {
  readonly screen: THREE.Mesh;
  /** The note taped over the glass on a day the cabinet is out of order. */
  readonly note: THREE.Mesh;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly ray = new THREE.Ray();
  private readonly plane = new THREE.Plane();
  private readonly scratch = new THREE.Vector3();
  private readonly other = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private drawClock = 0;

  constructor(
    private readonly game: ArcadeGame,
    private readonly info: TitleInfo,
    /** The camera, and the cabinet the glass is on (to tell how far it is). */
    private readonly listener: THREE.Object3D,
    private readonly cabinet: THREE.Object3D,
  ) {
    const canvas = createCanvas(SCREEN_W, SCREEN_H)[0];
    this.ctx = canvas.getContext('2d')!;
    this.texture = toTexture(canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT), crtScreenMaterial(this.texture, { lines: SCREEN_H }));
    this.screen.position.set(0, SCREEN_Y, SCREEN_Z);
    this.screen.rotation.x = -SCREEN_TILT;
    this.note = outOfOrderNote();
    this.note.position.set(0.03, -0.03, 0.006);
    this.screen.add(this.note);
  }

  /** The running game: every frame (`everyFrame`: the player's own), else at most `SHOW_FPS` and only in view; `overlay` over it. */
  paintGame(dt: number, everyFrame = false, overlay?: () => void): void {
    this.drawClock += dt;
    if (!everyFrame && (this.drawClock < 1 / SHOW_FPS || !this.inView())) return;
    this.drawClock = 0;
    this.game.draw(this.ctx);
    overlay?.();
    this.texture.needsUpdate = true;
  }

  /** The next `paintGame` draws whatever the throttle says (a show just started). */
  drawSoon(): void {
    this.drawClock = 1;
  }

  /** The title card: the table's top score, the player's best, the next medal, today's challenge, INSERT COIN blinking on `phase`. */
  drawTitle(phase: number): void {
    const { ctx, game } = this;
    const { scores, pointsPerTicket } = this.info;
    ctx.fillStyle = '#07070c';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawText(ctx, game.title, SCREEN_W / 2, 40, 20, '#fff2a8');
    drawText(ctx, game.summary, SCREEN_W / 2, 64, 7, '#9ad6ff');
    const top = scores.topOf(game.id);
    drawText(ctx, `HI ${top.name}  ${top.score.toLocaleString('en-US')}`, SCREEN_W / 2, 88, 10, top.you ? '#7ee787' : '#c9c4ff');
    const best = scores.bestOf(game.id);
    drawText(ctx, best > 0 ? `YOUR BEST ${best.toLocaleString('en-US')}  (${Math.floor(best / pointsPerTicket)} TIX)` : 'NO SCORE OF YOURS YET', SCREEN_W / 2, 106, 7, '#8a86b0');
    const medal = this.nextMedal();
    if (medal) drawText(ctx, medal, SCREEN_W / 2, 122, 7, '#e0995a');
    const challenge = this.info.challenge?.();
    if (challenge) {
      ctx.fillStyle = 'rgba(255,210,58,0.12)';
      ctx.fillRect(20, 134, SCREEN_W - 40, 30);
      drawText(ctx, "TODAY'S CHALLENGE", SCREEN_W / 2, 142, 7, '#ffd23a');
      drawText(ctx, challenge.done ? 'BEATEN! COME BACK TOMORROW' : `SCORE ${challenge.target.toLocaleString('en-US')} · +${challenge.reward} TIX`, SCREEN_W / 2, 156, 8, challenge.done ? '#7ee787' : '#fff2a8');
    }
    if (phase % 2 === 0) drawText(ctx, 'INSERT COIN', SCREEN_W / 2, 186, 12, '#ff8a80');
    drawText(ctx, `1 COIN PER PLAY · ${pointsPerTicket} PTS = 1 TICKET`, SCREEN_W / 2, 218, 7, '#7a7a90');
    this.texture.needsUpdate = true;
  }

  /** Over a demo or a replay: what it is, and INSERT COIN blinking. */
  drawShowBanner(clock: number, replay: Replay | null): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, SCREEN_H - 26, SCREEN_W, 26);
    if (replay) drawText(ctx, `YOUR BEST RUN · ${replay.initials} ${replay.score.toLocaleString('en-US')}`, SCREEN_W / 2, SCREEN_H - 17, 7, '#7ee787');
    else drawText(ctx, 'DEMO PLAY', SCREEN_W / 2, SCREEN_H - 17, 7, '#9ad6ff');
    if (Math.floor(clock * 2) % 2 === 0) drawText(ctx, 'INSERT COIN', SCREEN_W / 2, SCREEN_H - 7, 7, '#ff8a80');
  }

  /** A dead tube: snow and a rolling bar (the note on the glass says the rest). */
  drawStatic(): void {
    const { ctx } = this;
    ctx.fillStyle = '#101014';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    for (let i = 0; i < 900; i++) {
      const v = Math.floor(Math.random() * 140);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * SCREEN_W, Math.random() * SCREEN_H, 2, 1);
    }
    const bar = ((performance.now() / 12) % (SCREEN_H + 40)) - 20;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, bar, SCREEN_W, 14);
    this.texture.needsUpdate = true;
  }

  /** The initials asked over the game's frozen last frame. */
  drawInitials(entry: InitialsEntry | null): void {
    this.game.draw(this.ctx);
    entry?.draw(this.ctx, SCREEN_W / 2, SCREEN_H / 2 + 6);
    this.texture.needsUpdate = true;
  }

  /** Over the game's frozen last frame: the score, the tickets counting up, the table place, and what going again costs. */
  drawGameOver(run: MachineRun): void {
    const { ctx } = this;
    const { last, lastRank, overClock } = run;
    this.game.draw(ctx);
    const tickets = run.tickets(last.score);
    const shown = run.shownTickets;
    const done = run.countUp >= 1;
    ctx.fillStyle = 'rgba(5,5,10,0.88)';
    ctx.fillRect(16, 40, SCREEN_W - 32, 166);
    drawText(ctx, `SCORE ${last.score.toLocaleString('en-US')}`, SCREEN_W / 2, 62, 12, '#fff2a8');
    drawText(ctx, `${shown}`, SCREEN_W / 2, 100, done ? 30 : 26, done ? '#ffd23a' : '#ffe9a0');
    drawText(ctx, tickets === 1 ? 'TICKET' : 'TICKETS', SCREEN_W / 2, 126, 9, '#ffd23a');
    const blink = Math.floor(overClock * 4) % 2 === 0;
    if (done && lastRank !== null) drawText(ctx, `${ordinal(lastRank + 1)} ON THE BOARD!`, SCREEN_W / 2, 148, 10, blink ? '#7ee787' : '#ffffff');
    else if (done && last.best) drawText(ctx, 'NEW BEST!', SCREEN_W / 2, 148, 11, blink ? '#7ee787' : '#ffffff');
    if (done && Math.floor(overClock * 2) % 2 === 0) drawText(ctx, `${actionKeyLabel('fire').toUpperCase()} · PLAY AGAIN`, SCREEN_W / 2, 174, 8, '#ff8a80');
    if (done) drawText(ctx, run.free ? 'FREE PLAY: ON THE HOUSE' : `${run.priceText().toUpperCase()} · ${actionKeyLabel('walkAway').toUpperCase()} TO WALK AWAY`, SCREEN_W / 2, 192, 7, '#9a96c0');
    this.texture.needsUpdate = true;
  }

  /** Whether the camera is close enough for a demo to be worth running. */
  near(): boolean {
    this.listener.getWorldPosition(this.scratch);
    return this.scratch.distanceTo(this.cabinet.getWorldPosition(this.other)) < DEMO_RANGE;
  }

  /** Whether the glass could be on screen: in front of the camera and within `DEMO_RANGE`. */
  inView(): boolean {
    this.listener.getWorldPosition(this.scratch);
    const to = this.screen.getWorldPosition(this.other).sub(this.scratch);
    if (to.length() > DEMO_RANGE) return false;
    this.listener.getWorldDirection(this.look);
    return to.normalize().dot(this.look) > 0.2;
  }

  /** Where the camera's line of sight crosses the glass, in the game's pixels; null off the screen. */
  aimFromView(): { x: number; y: number } | null {
    this.listener.getWorldPosition(this.ray.origin);
    this.listener.getWorldDirection(this.ray.direction);
    this.screen.getWorldDirection(this.scratch);
    this.plane.setFromNormalAndCoplanarPoint(this.scratch, this.screen.getWorldPosition(this.other));
    const hit = this.ray.intersectPlane(this.plane, this.other);
    if (!hit) return null;
    const local = this.screen.worldToLocal(hit);
    const u = local.x / SCREEN_WIDTH + 0.5;
    const v = 0.5 - local.y / SCREEN_HEIGHT;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    // Whole pixels, as the replay records them, so a recorded shot lands where it did.
    return { x: Math.round(u * SCREEN_W), y: Math.round(v * SCREEN_H) };
  }

  /** Cabinet-local point on the glass for a light gun's aim, or null. */
  aimPoint(controls: ArcadeControls): THREE.Vector3 | null {
    if (!controls.aim) return null;
    this.aim.set((controls.aim.x / SCREEN_W - 0.5) * SCREEN_WIDTH, (0.5 - controls.aim.y / SCREEN_H) * SCREEN_HEIGHT, 0);
    this.screen.localToWorld(this.aim);
    return this.cabinet.worldToLocal(this.aim);
  }

  /** "NEXT MEDAL SILVER AT 3,600", "ALL MEDALS WON", or '' without a medal book. */
  private nextMedal(): string {
    const book = this.info.medals;
    if (!book) return '';
    const earned = book.earned(this.game.id);
    const thresholds = book.thresholds(this.game.id);
    const next = (['bronze', 'silver', 'gold'] as const).find((tier) => !earned.includes(tier));
    return next ? `NEXT MEDAL ${next.toUpperCase()} AT ${thresholds[next].toLocaleString('en-US')}` : 'ALL THREE MEDALS WON';
  }
}
