import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { actionKeyLabel } from '@/ui/keys';
import { type ArcadeControls, type ArcadeGame, SAFE_X, SCREEN_H, SCREEN_W, drawText } from './games/ArcadeGame';
import { crtScreenMaterial } from './crtScreen';
import type { InitialsEntry } from './InitialsEntry';
import { formatNumber } from '@/text/count';
import type { MachineRun } from './MachineRun';
import { endCardNote, playAgainLine, ticketsWord, walkAwayLine } from './EndCard';
import type { MedalBook, ScoreTable, TodaysChallenge } from './scoreTable';
import type { Replay } from './replay/Replay';
import { outOfOrderNote } from './machineParts';
import { SCREEN_HEIGHT, SCREEN_TILT, SCREEN_WIDTH, SCREEN_Y, SCREEN_Z } from './cabinetModel';
import { random } from '@/random';

/**
 * Redraws of a game somebody else is running (a regular, a demo, a replay): at most this often, and
 * not at all while the glass is behind the camera. The player's own game redraws every frame. Each
 * redraw uploads the 320 x 240 canvas, so a hall of demos adds up.
 */
const SHOW_FPS = 15;
/** Farther than this from the camera, an idle cabinet only shows its title card (nobody would see the demo). */
const DEMO_RANGE = 9;

/** What the title card tells about the game. */
interface TitleInfo {
  scores: ScoreTable;
  pointsPerTicket: number;
  medals?: MedalBook;
  challenge?: () => TodaysChallenge | null;
  /** What a play costs right now, for the card's foot: "1 COIN PER PLAY", "FREE PLAY". */
  price?: () => { free: boolean; text: string };
  /** A cabinet at home: no coin asked, no tickets on the cards. */
  home?: boolean;
  /** The cabinet's glow colour: the band the title's logo sits on. */
  accent?: number;
}

/** The hall-of-fame page's rank colours, cycled down the lines as the page blinks. */
const RANK_COLORS = ['#ffd23a', '#ff8a80', '#7ee787', '#9ad6ff', '#c9c4ff'];

/**
 * A blurb's clauses ("15 SEC · CHAIN STARS · CLOCKS +2S") packed onto as few lines of at most
 * `columns` glyphs as they take (the face is square: one glyph, one column); a clause is never split.
 */
function packClauses(summary: string, columns: number): string[] {
  const lines: string[] = [];
  for (const clause of summary.split(' · ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} · ${clause}`.length <= columns) lines[lines.length - 1] = `${last} · ${clause}`;
    else lines.push(clause);
  }
  return lines;
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
    // Crisp pixels up close; mipmapped from across the hall, so the glass does not shimmer.
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
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

  /**
   * The title card, laid out on a grid down the glass: the logo in its band, a clear gap, then the
   * blurb, the table's top score, the player's best, the next medal, today's challenge in its box,
   * INSERT COIN blinking on `phase`, and the price at the foot. Every line is centred and shrinks
   * to the safe width (`drawText`), so none runs under the tube's curved edge.
   */
  drawTitle(phase: number): void {
    const { ctx, game } = this;
    const { scores, pointsPerTicket } = this.info;
    ctx.fillStyle = '#07070c';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    this.drawLogo(phase, 14, 16);
    const home = this.info.home === true;
    // The blurb, a clear gap under the logo's band: its clauses packed on one line or two (never shrunk to a squint).
    const blurb = packClauses(game.summary, Math.floor((SCREEN_W - 2 * SAFE_X) / 7));
    blurb.forEach((line, i) => drawText(ctx, line, SCREEN_W / 2, (blurb.length === 1 ? 68 : 64) + i * 11, 7, '#9ad6ff'));
    const top = scores.topOf(game.id);
    if (!home || top.score > 0) drawText(ctx, `HI ${top.name}  ${formatNumber(top.score)}`, SCREEN_W / 2, 94, 10, top.you ? '#7ee787' : '#c9c4ff');
    const best = scores.bestOf(game.id);
    const bestLine = home ? `YOUR BEST ${formatNumber(best)}` : `YOUR BEST ${formatNumber(best)}  (${Math.floor(best / pointsPerTicket)} TIX)`;
    if (!home || best > 0) drawText(ctx, best > 0 ? bestLine : 'NO SCORE OF YOURS YET', SCREEN_W / 2, 112, 7, '#8a86b0');
    const medal = this.nextMedal();
    if (medal) drawText(ctx, medal, SCREEN_W / 2, 126, 7, '#e0995a');
    const challenge = this.info.challenge?.();
    if (challenge) {
      // The challenge's box: 30 px tall, two lines in it, between the medal line and INSERT COIN.
      const boxTop = 138;
      ctx.fillStyle = 'rgba(255,210,58,0.12)';
      ctx.fillRect(SAFE_X, boxTop, SCREEN_W - 2 * SAFE_X, 30);
      drawText(ctx, "TODAY'S CHALLENGE", SCREEN_W / 2, boxTop + 8, 7, '#ffd23a');
      drawText(ctx, challenge.done ? 'BEATEN! COME BACK TOMORROW' : `SCORE ${formatNumber(challenge.target)} · +${challenge.reward} TIX`, SCREEN_W / 2, boxTop + 21, 8, challenge.done ? '#7ee787' : '#fff2a8');
    }
    if (phase % 2 === 0) drawText(ctx, home ? 'PRESS FIRE' : 'INSERT COIN', SCREEN_W / 2, 190, 12, '#ff8a80');
    const price = this.info.price?.();
    const cost = !price ? '1 COIN PER PLAY' : price.free ? 'FREE PLAY' : `${price.text.toUpperCase()} PER PLAY`;
    drawText(ctx, home ? 'FREE PLAY · FOR FUN' : `${cost} · ${pointsPerTicket} PTS = 1 TICKET`, SCREEN_W / 2, 216, 7, '#7a7a90');
    this.texture.needsUpdate = true;
  }

  /** The attract loop's hall-of-fame page: the table's top five, each line in its rank's colour, the colours walking down as it blinks. */
  drawScores(phase: number): void {
    const { ctx, game } = this;
    ctx.fillStyle = '#07070c';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    this.drawLogo(phase, 12, 12);
    drawText(ctx, 'HALL OF FAME', SCREEN_W / 2, 56, 10, '#ffffff');
    const table = this.info.scores.table(game.id).slice(0, 5);
    if (!table.length) drawText(ctx, 'NO SCORES YET · BE THE FIRST', SCREEN_W / 2, 124, 7, '#8a86b0');
    table.forEach((entry, i) => {
      const y = 92 + i * 22;
      const color = entry.you ? '#7ee787' : RANK_COLORS[(i + phase) % RANK_COLORS.length]!;
      drawText(ctx, `${i + 1}${['ST', 'ND', 'RD'][i] ?? 'TH'}`, 60, y, 9, color, 'left');
      drawText(ctx, entry.name, 124, y, 9, color, 'left');
      drawText(ctx, formatNumber(entry.score), SCREEN_W - 60, y, 9, color, 'right');
    });
    if (phase % 2 === 0) drawText(ctx, this.info.home ? 'PRESS FIRE' : 'INSERT COIN', SCREEN_W / 2, 214, 10, '#ff8a80');
    this.texture.needsUpdate = true;
  }

  /**
   * The game's logo: its title in pixel type with a hard drop shadow, on a band of the cabinet's
   * glow that fades out before the glass's edges, two scan bars sliding across it with `phase`.
   * The band starts at `top`; the title is `size` px, or smaller when the name would not fit the
   * safe width (the face is square: a glyph is `size` wide), the shadow at the same size so it
   * stays in register. Dim enough not to bloom over the lines under it.
   */
  private drawLogo(phase: number, top: number, size: number): void {
    const { ctx, game } = this;
    const px = Math.min(size, Math.floor((SCREEN_W - 2 * SAFE_X - 16) / Math.max(1, game.title.length)));
    const pad = Math.round(px * 0.6);
    const height = px + 2 * pad;
    const y = top + height / 2;
    const accent = `#${new THREE.Color(this.info.accent ?? 0x9ad6ff).getHexString()}`;
    const band = ctx.createLinearGradient(SAFE_X, 0, SCREEN_W - SAFE_X, 0);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.25, accent);
    band.addColorStop(0.75, accent);
    band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = band;
    ctx.fillRect(SAFE_X, top, SCREEN_W - 2 * SAFE_X, height);
    ctx.globalAlpha = 1;
    // The scan bars, clipped to the band.
    ctx.save();
    ctx.beginPath();
    ctx.rect(SAFE_X, top, SCREEN_W - 2 * SAFE_X, height);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    const slide = SAFE_X + ((phase * 9) % (SCREEN_W - 2 * SAFE_X + 40));
    ctx.fillRect(slide - 40, top, 5, height);
    ctx.fillRect(slide - 30, top, 2, height);
    ctx.restore();
    ctx.fillStyle = accent;
    ctx.fillRect(SAFE_X, top - 2, SCREEN_W - 2 * SAFE_X, 1);
    ctx.fillRect(SAFE_X, top + height + 1, SCREEN_W - 2 * SAFE_X, 1);
    drawText(ctx, game.title, SCREEN_W / 2 + 1, y + 1, px, '#000000');
    drawText(ctx, game.title, SCREEN_W / 2, y, px, '#fff2a8');
  }

  /** Over a demo or a replay: what it is, and INSERT COIN blinking. */
  drawShowBanner(clock: number, replay: Replay | null): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, SCREEN_H - 26, SCREEN_W, 26);
    if (replay) drawText(ctx, `YOUR BEST RUN · ${replay.initials} ${formatNumber(replay.score)}`, SCREEN_W / 2, SCREEN_H - 17, 7, '#7ee787');
    else drawText(ctx, 'DEMO PLAY', SCREEN_W / 2, SCREEN_H - 17, 7, '#9ad6ff');
    if (Math.floor(clock * 2) % 2 === 0) drawText(ctx, this.info.home ? 'PRESS FIRE' : 'INSERT COIN', SCREEN_W / 2, SCREEN_H - 7, 7, '#ff8a80');
  }

  /** A dead tube: snow and a rolling bar (the note on the glass says the rest); `seconds` is the machine's time, for the bar. */
  drawStatic(seconds: number): void {
    const { ctx } = this;
    ctx.fillStyle = '#101014';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    for (let i = 0; i < 900; i++) {
      const v = Math.floor(random() * 140);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(random() * SCREEN_W, random() * SCREEN_H, 2, 1);
    }
    // The bar rolls the height in about 2.5 s (1000 / 12 pixels a second, as it always did).
    const bar = (((seconds * 1000) / 12) % (SCREEN_H + 40)) - 20;
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

  /**
   * Over the game's frozen last frame: the score, the tickets counting up, then each bonus
   * ("+60 CHALLENGE") landing under it, the table place, and what going again costs (once it is
   * all counted and fire can replay).
   */
  drawGameOver(run: MachineRun): void {
    const { ctx } = this;
    const { last, lastRank, overClock, bonuses } = run;
    this.game.draw(ctx);
    const total = run.scoreTickets + bonuses.reduce((sum, b) => sum + b.tickets, 0);
    const shown = run.shownTotal;
    const done = run.countUp >= 1;
    const counted = run.countDone;
    ctx.fillStyle = 'rgba(5,5,10,0.88)';
    ctx.fillRect(16, 40, SCREEN_W - 32, 166);
    if (this.info.home) {
      // At home: the score is the whole card.
      drawText(ctx, 'SCORE', SCREEN_W / 2, 62, 9, '#fff2a8');
      drawText(ctx, formatNumber(last.score), SCREEN_W / 2, 92, 24, '#ffd23a');
    } else {
      drawText(ctx, `SCORE ${formatNumber(last.score)}`, SCREEN_W / 2, 58, 12, '#fff2a8');
      drawText(ctx, `${shown}`, SCREEN_W / 2, 90, counted ? 28 : 24, counted ? '#ffd23a' : '#ffe9a0');
      drawText(ctx, ticketsWord(total), SCREEN_W / 2, 112, 9, '#ffd23a');
    }
    // The bonuses, a line each as it lands (at most three fit; the rest add up on the last).
    const lines = bonuses.length > 3 ? [...bonuses.slice(0, 2), { label: 'MORE BONUSES', tickets: bonuses.slice(2).reduce((sum, b) => sum + b.tickets, 0) }] : bonuses;
    lines.forEach((bonus, i) => {
      const t = run.bonusCountUp(lines === bonuses || i < 2 ? i : bonuses.length - 1);
      if (t <= 0) return;
      drawText(ctx, `+${Math.floor(bonus.tickets * t)} ${bonus.label}`, SCREEN_W / 2, 128 + i * 11, 7, t >= 1 ? '#7ee787' : '#c9f5d0');
    });
    const blink = Math.floor(overClock * 4) % 2 === 0;
    const markY = 128 + lines.length * 11 + 6;
    // The verdict (one wording on every machine, `EndCard`): a place on the board or a new best blinks, a first score is quiet.
    const note = done ? endCardNote(run) : '';
    const loud = lastRank !== null || last.best;
    if (note) drawText(ctx, note, SCREEN_W / 2, markY, lastRank !== null ? 10 : last.best ? 11 : 8, loud ? (blink ? '#7ee787' : '#ffffff') : '#c9c4ff');
    if (run.canReplay && Math.floor(overClock * 2) % 2 === 0) drawText(ctx, this.info.home ? `${actionKeyLabel('fire').toUpperCase()} · PLAY AGAIN` : playAgainLine(run), SCREEN_W / 2, 180, 8, '#ff8a80');
    if (counted && this.info.home) drawText(ctx, walkAwayLine(), SCREEN_W / 2, 196, 7, '#9a96c0');
    else if (counted) drawText(ctx, run.free ? 'FREE PLAY: ON THE HOUSE' : walkAwayLine(), SCREEN_W / 2, 196, 7, '#9a96c0');
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
    return next ? `NEXT MEDAL ${next.toUpperCase()} AT ${formatNumber(thresholds[next])}` : 'ALL THREE MEDALS WON';
  }
}
