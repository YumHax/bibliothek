import * as THREE from 'three';
import type { ArcadeResult } from '@/game/SessionActions';
import { ChipSpeaker } from '@/audio/ChipSpeaker';
import { eyePoseAt } from '../meshUtils';
import { type ArcadeControls, drawText } from './games/ArcadeGame';
import type { TicketStrip } from './TicketStrip';
import { TicketMachine, type TicketMachineWiring } from './TicketMachine';
import type { MachineRunOptions } from './MachineRun';
import type { ScoreTable } from './scoreTable';
import { AlleySim, BALL_R, LANE_NEAR } from './alley/AlleySim';
import { type AlleyModel, BACK_H, BACK_Z, POCKET_LAMP_OFF, POCKET_LAMP_ON, WIDTH, buildAlleyModel } from './alley/alleyModel';
import { arcadeHint } from './arcadeHint';
import { actionKeyLabel } from '@/ui/keys';

export interface AlleyRollerOptions {
  /** Paint of the cabinet. Default a racing red. */
  color?: number;
  /** The title on the backboard. Default ALLEY ROLL. */
  title?: string;
}

/** The alley keeps a table: its backboard shows the top score. */
type AlleyWiring = TicketMachineWiring & { scores: ScoreTable };

const STAND_Z = 1.45;
/** How long a regular's hand goes on with the ball as it leaves (s). */
const FOLLOW_THROUGH = 0.18;
/** Where a regular's feet go: close enough to reach the ball in hand, bending over the lane's end. */
const PERSON_Z = 1.3;

/**
 * The ticket alley every funfair has: roll a wooden ball up an inclined lane, over the hump and
 * onto the ring board, where it rolls down into its ring's hole (10 to 50, 100 in the corner
 * pockets, 200 in the one lit for this ball; a hot streak pays more, the last ball double). Nine
 * balls a play. A / D move the ball in hand across the lane; hold fire and the power meter on the
 * backboard swings up and down (a mark where the last one was let go), let go to roll at that
 * strength (too soft and it rolls back: nothing). The rules and the ball's path
 * are the `AlleySim`'s, the body `alley/alleyModel`'s; this class moves the ball to match, plays
 * the sounds and paints the backboard. A `TicketMachine`: paid for like a cabinet (`playArcade`),
 * pays tickets from a slot at the front, asks for initials on the backboard for a score that
 * makes the table; a regular can take it (`occupy`). Origin on the floor under the middle of the
 * lane; +z is the player's end. Collides.
 */
export class AlleyRoller extends TicketMachine {
  readonly hitboxes: THREE.Object3D[];
  readonly standAt = new THREE.Vector3(0, 0, PERSON_Z);
  readonly lean = 0.35;
  readonly focus = new THREE.Vector3(0, 1.15, -0.8);
  readonly game: { readonly id: string; readonly title: string; readonly hint: string };
  protected readonly speaker: ChipSpeaker;
  protected readonly strip: TicketStrip;

  private readonly scores: ScoreTable;
  private readonly sim = new AlleySim();
  private readonly model: AlleyModel;
  private readonly title: string;
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private displayClock = 0;

  constructor(options: AlleyRollerOptions, wiring: AlleyWiring) {
    super(wiring);
    this.name = 'AlleyRoller';
    this.scores = wiring.scores;
    this.title = options.title ?? 'ALLEY ROLL';
    this.game = { id: 'alley', title: this.title, get hint() {
        return arcadeHint('{leftRight} aim · hold {fire}, let go at the power you want');
      } };
    this.model = buildAlleyModel(this, options.color ?? 0xb8202a, this.title);
    this.note = this.model.note;
    this.strip = this.model.strip;
    this.hitboxes = [this.model.hitbox];
    this.speaker = new ChipSpeaker(this.model.display.mesh, wiring.listener);
    this.placeBall();
    this.paintDisplay();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, BACK_Z - 0.03), new THREE.Vector3(WIDTH / 2, BACK_H, LANE_NEAR.z + 0.18));
  }

  /**
   * The left hand on the rail, the right on the ball in hand while aiming, pushing it on up the lane
   * for the first moment of its roll (the follow-through), else resting on the lane's end.
   */
  handsAt(): readonly [THREE.Vector3, THREE.Vector3] {
    const { ball } = this.model;
    this.localToWorld(this.hands[0].set(-(WIDTH / 2 - 0.1), LANE_NEAR.y + 0.13, LANE_NEAR.z + 0.04));
    const pushing = this.sim.phase === 'roll' && this.sim.phaseTime < FOLLOW_THROUGH;
    if ((this.sim.phase === 'aim' || pushing) && ball.visible) this.localToWorld(this.hands[1].copy(ball.position).setY(ball.position.y + BALL_R * 0.8));
    else this.localToWorld(this.hands[1].set(0.12, LANE_NEAR.y + 0.06, LANE_NEAR.z + 0.12));
    return this.hands;
  }

  eyePose(): { position: THREE.Vector3; yaw: number } {
    return eyePoseAt(this, new THREE.Vector3(0, 1.5, STAND_Z - 0.05));
  }

  setHovered(hovered: boolean): void {
    this.model.marquee.color.setHex(hovered ? 0xffffff : 0xdddddd);
  }

  protected get score(): number {
    return this.sim.points;
  }

  protected attractLabel(price: string): string {
    return `${this.title} · insert a coin (${price}, nine balls)`;
  }

  /** The Space (or click) that started the play counts only once it has been let go. */
  protected override runOptions(): Pick<MachineRunOptions, 'fireAfterRelease'> {
    return { fireAfterRelease: true };
  }

  /** The NEW BEST sting already played the moment the score passed it (`MachineRun.noteScore`): a cheer, not the sting again. */
  protected override finished(result: ArcadeResult): void {
    this.speaker.play(result.best ? 'win' : 'over');
  }

  protected paint(dt: number): void {
    this.placeBall();
    // The pocket lit for this ball glows (blinking while it waits to be rolled); idle, they take turns.
    const live = this.state === 'playing' || this.state === 'demo';
    const blink = Math.floor(this.clock * 4) % 2 === 0;
    this.model.pocketLamps.forEach((lamp, i) => {
      const on = live ? i === this.sim.litPocket && (this.sim.phase !== 'aim' || blink) : Math.floor(this.clock) % 2 === i;
      lamp.color.setHex(on ? POCKET_LAMP_ON : POCKET_LAMP_OFF);
    });
    this.displayClock += dt;
    if (this.state !== 'attract' || this.displayClock > 0.25) {
      this.displayClock = 0;
      this.paintDisplay();
    }
  }

  protected newGame(): void {
    this.sim.newGame(this.state === 'attract');
    this.placeBall();
  }

  /** One frame of the play; over once the last ball is back and none is in hand. */
  protected play(dt: number, controls: ArcadeControls): boolean {
    const over = this.sim.play(dt, controls);
    for (const { sfx, pitch } of this.sim.takeSounds()) this.speaker.play(sfx, pitch);
    return over;
  }

  protected demoControls(dt: number): ArcadeControls {
    return this.regularSkill === null ? this.sim.autopilot(dt) : this.sim.autopilot(dt, this.regularSkill);
  }

  /** The ball and the trough follow the sim. */
  private placeBall(): void {
    const { ball, trough } = this.model;
    ball.position.copy(this.sim.ball);
    ball.rotation.x = this.sim.spin;
    ball.visible = this.sim.ballShown;
    trough.forEach((b, i) => (b.visible = i < this.sim.waiting));
  }

  /** The backboard's display: the score and balls left, the power meter while charging, the initials or the end card. */
  private paintDisplay(): void {
    const { ctx, canvas, texture } = this.model.display;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    if (this.state === 'initials' && this.entry) {
      this.entry.draw(ctx, W / 2, H / 2, 0.75);
      texture.needsUpdate = true;
      return;
    }
    const blink = Math.floor(this.clock * 3) % 2 === 0;
    if (this.state === 'attract') {
      const top = this.scores.topOf(this.game.id);
      const best = this.scores.bestOf(this.game.id);
      drawText(ctx, this.title, W / 2, 40, 22, '#ffe680');
      drawText(ctx, `HI ${top.name} ${top.score}`, W / 2, 80, 14, top.you ? '#7ee787' : '#c9c4ff');
      drawText(ctx, best > 0 && !top.you ? `YOUR BEST ${best}` : 'ROLL THEM IN!', W / 2, 112, 10, '#9a96c0');
      if (blink) drawText(ctx, 'INSERT COIN', W / 2, 152, 18, '#ff8a80');
      texture.needsUpdate = true;
      return;
    }
    if (this.state === 'over') {
      drawText(ctx, `SCORE ${this.last.score}`, W / 2, 36, 18, '#fff2a8');
      drawText(ctx, `${this.shownTotal} TICKETS`, W / 2, 80, 24, '#ffd23a');
      const note = this.endCardNote();
      if (note) drawText(ctx, note, W / 2, 118, 14, blink ? '#7ee787' : '#ffffff');
      if (this.canReplay) drawText(ctx, this.playAgainLine(), W / 2, 160, 11, '#ff8a80');
      texture.needsUpdate = true;
      return;
    }
    const { sim } = this;
    const aiming = sim.phase === 'aim';
    drawText(ctx, `${sim.points}`, W / 2, 46, 40, '#ff8a3a');
    drawText(ctx, `BALLS ${sim.ballsLeft}`, 20, 92, 12, '#c9c4ff', 'left');
    if (sim.lastPoints !== null && aiming) drawText(ctx, sim.lastPoints > 0 ? `+${sim.lastPoints}` : 'MISS', W - 20, 92, 14, sim.lastPoints >= 100 ? '#ffd23a' : sim.lastPoints > 0 ? '#7ee787' : '#ff8a80', 'right');
    // What made the last ball special, else what this one has going for it.
    const line = aiming && sim.lastNote ? sim.lastNote : aiming && sim.lastBall ? 'LAST BALL x2' : aiming && sim.hot >= 2 ? 'ON A ROLL!' : '';
    if (line) drawText(ctx, line, W / 2, 114, 12, blink ? '#ffd23a' : '#fff2a8');
    // The power meter, with a mark where the last ball was let go.
    ctx.fillStyle = '#222233';
    ctx.fillRect(20, 130, W - 40, 26);
    const grad = ctx.createLinearGradient(20, 0, W - 20, 0);
    grad.addColorStop(0, '#4dff7a');
    grad.addColorStop(0.6, '#ffe23a');
    grad.addColorStop(1, '#ff4a3a');
    ctx.fillStyle = grad;
    ctx.fillRect(20, 130, (W - 40) * (aiming ? sim.power : 0), 26);
    if (sim.lastPower !== null) {
      const x = Math.round(20 + (W - 40) * sim.lastPower);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1, 124, 3, 38);
    }
    drawText(ctx, aiming ? `HOLD ${actionKeyLabel('fire').toUpperCase()} · LET GO` : 'ROLLING...', W / 2, 176, 10, '#9a96c0');
    texture.needsUpdate = true;
  }
}
