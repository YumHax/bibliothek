import * as THREE from 'three';
import { ChipSpeaker } from '@/audio/ChipSpeaker';
import { eyePoseAt } from '../meshUtils';
import { actionKeyLabel } from '@/ui/keys';
import { type ArcadeControls, NO_CONTROLS, drawText } from './games/ArcadeGame';
import { TicketMachine, type TicketMachineWiring } from './TicketMachine';
import type { TicketStrip } from './TicketStrip';
import { BACK_Z, CAGE_H, FINAL_SECONDS, FRONT_Z, HOOP, HoopSim, RELEASE, STREAK_MAX, WIDTH } from './hoop/HoopSim';
import { type HoopModel, buildHoopModel } from './hoop/hoopModel';
import { HoopThrower } from './hoop/HoopThrower';

export interface HoopShotOptions {
  title?: string;
  color?: number;
}

const STAND_Z = 1.3;

/**
 * HOOP FEVER: the basketball cage every arcade has. Three balls roll back down the ramp to the
 * front; aim where you look, hold Space and the power meter on the scoreboard swings, let go to
 * throw (the ball leaves with a lift above the line of sight). Thirty seconds; a basket pays 20
 * (30 in the last ten seconds), baskets in a row multiply up to three times, a miss breaks the
 * run. After ten baskets the hoop starts to slide; after twenty it slides faster. The rules and
 * the balls' physics are the `HoopSim`'s (so a ball can rattle round the rim and out), the cage
 * `hoop/hoopModel`'s; this class hands the sim the player's look, moves the balls and the hoop,
 * plays the sounds and paints the scoreboard. A regular's body is the machine's to direct
 * (`HoopThrower`: every ball picked up from the gutter, set, shot from the hands and followed
 * through; well aimed, with a little error); a regular without one throws from a fixed point.
 * Pays tickets from a slot at the front; keeps a table. Origin on the floor under the
 * middle of the cage, +z the player's end. Collides.
 */
export class HoopShot extends TicketMachine {
  readonly hitboxes: THREE.Object3D[];
  readonly game: { readonly id: string; readonly title: string; readonly hint: string };
  readonly standAt = new THREE.Vector3(0, 0, STAND_Z - 0.15);
  readonly focus = new THREE.Vector3(HOOP.x, HOOP.y, HOOP.z);
  readonly lean = 0.05;
  readonly directs = true;
  protected readonly speaker: ChipSpeaker;
  protected readonly strip: TicketStrip;

  private readonly sim = new HoopSim();
  private readonly model: HoopModel;
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly look = new THREE.Vector3();
  private readonly camQuat = new THREE.Quaternion();
  private thrower: HoopThrower | null = null;
  private flashClock = 0;
  private flashText = '';
  private displayClock = 0;

  constructor(options: HoopShotOptions, wiring: TicketMachineWiring) {
    super(wiring);
    this.name = 'HoopShot';
    const title = options.title ?? 'HOOP FEVER';
    this.game = { id: 'hoops', title, hint: 'Look to aim · hold Space, let go to throw' };
    this.model = buildHoopModel(this, options.color ?? 0x1f4fa8, title);
    this.note = this.model.note;
    this.strip = this.model.strip;
    this.hitboxes = [this.model.hitbox];
    this.speaker = new ChipSpeaker(this.model.display.mesh, wiring.listener);
    this.newGame();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, BACK_Z - 0.05), new THREE.Vector3(WIDTH / 2, CAGE_H, FRONT_Z));
  }

  eyePose(): { position: THREE.Vector3; yaw: number } {
    return eyePoseAt(this, new THREE.Vector3(0, 1.62, STAND_Z));
  }

  /** Both hands on the ball about to be thrown (or on the gutter's edge). */
  handsAt(): readonly [THREE.Vector3, THREE.Vector3] {
    this.localToWorld(this.hands[0].set(RELEASE.x - 0.08, RELEASE.y - 0.02, RELEASE.z));
    this.localToWorld(this.hands[1].set(RELEASE.x + 0.08, RELEASE.y - 0.02, RELEASE.z));
    return this.hands;
  }

  setHovered(hovered: boolean): void {
    this.model.marquee.color.setHex(hovered ? 0xffffff : 0xdddddd);
  }

  protected get score(): number {
    return this.sim.points;
  }

  protected newGame(): void {
    this.sim.newGame();
    this.thrower?.reset();
    this.placeBalls();
  }

  protected override performerChanged(): void {
    this.thrower?.stop();
    this.thrower = this.performer && this.who === 'regular' ? new HoopThrower(this.sim, this, this.performer) : null;
  }

  protected override betweenGames(dt: number): void {
    this.thrower?.update(dt, false);
    this.sim.takeOutcomes();
  }

  protected attractLabel(price: string): string {
    return `${this.game.title} · insert a coin (${price}, thirty seconds)`;
  }

  protected override playingLabel(): string {
    return `${this.game.title} · hold ${actionKeyLabel('fire')}, let go to throw · ${actionKeyLabel('walkAway')} walks away`;
  }

  protected play(dt: number, controls: ArcadeControls): boolean {
    const over = this.sim.play(dt, { ...controls, look: this.lookDirection() }, this.who === 'player');
    if (this.thrower) this.thrower.update(dt, this.sim.timeLeft > 0);
    else this.sim.takeOutcomes();
    this.model.hoop.position.x = this.sim.hoopX;
    for (const { sfx, pitch } of this.sim.takeSounds()) this.speaker.play(sfx, pitch);
    const flash = this.sim.takeFlash();
    if (flash !== null) {
      this.flashText = flash;
      this.flashClock = 0.8;
    }
    return over;
  }

  protected demoControls(dt: number): ArcadeControls {
    // A regular with a body throws with it; without one, the machine throws for them.
    return this.thrower ? NO_CONTROLS : this.sim.autopilot(dt);
  }

  protected paint(dt: number): void {
    this.flashClock = Math.max(0, this.flashClock - dt);
    this.placeBalls();
    this.displayClock += dt;
    if (this.displayClock < 1 / 20) return;
    this.displayClock = 0;
    const { ctx, texture } = this.model.display;
    const { sim } = this;
    ctx.fillStyle = '#07060c';
    ctx.fillRect(0, 0, 256, 96);
    if (this.state === 'initials' && this.entry) {
      this.entry.draw(ctx, 128, 50);
    } else if (this.state === 'over') {
      drawText(ctx, `${this.last.score}`, 128, 30, 24, '#ffd23a');
      drawText(ctx, `${this.shownTotal} TICKETS`, 128, 68, 14, '#ffe066');
    } else if (this.state === 'attract') {
      drawText(ctx, this.game.title, 128, 30, 18, '#ff8a3a');
      drawText(ctx, Math.floor(this.clock * 2) % 2 ? 'INSERT COIN' : '30 SECONDS', 128, 66, 14, '#ff8a80');
    } else {
      drawText(ctx, `${sim.points}`, 56, 34, 22, '#ffffff');
      const final = sim.timeLeft <= FINAL_SECONDS && sim.timeLeft > 0;
      drawText(ctx, `${Math.ceil(sim.timeLeft)}`, 200, 34, 22, final && Math.floor(this.clock * 4) % 2 ? '#ff5f5f' : '#ffd23a');
      if (this.flashClock > 0) drawText(ctx, this.flashText, 128, 72, 12, '#7ee787');
      else if (final) drawText(ctx, 'FINAL SECONDS x1.5', 128, 72, 10, '#ff8a3a');
      else if (sim.streak > 1) drawText(ctx, `STREAK x${Math.min(STREAK_MAX, sim.streak)}`, 128, 72, 10, '#7ee787');
      // The power meter along the bottom while charging.
      if (sim.charging) {
        ctx.fillStyle = '#222233';
        ctx.fillRect(16, 86, 224, 6);
        ctx.fillStyle = sim.power > 0.8 ? '#ff5f5f' : sim.power > 0.45 ? '#ffe066' : '#7ee787';
        ctx.fillRect(16, 86, 224 * sim.power, 6);
      }
    }
    texture.needsUpdate = true;
  }

  /** Where the player looks, in the machine's frame (unit length). */
  private lookDirection(): THREE.Vector3 {
    this.wiring.listener.getWorldDirection(this.look);
    this.getWorldQuaternion(this.camQuat).invert();
    return this.look.applyQuaternion(this.camQuat).normalize();
  }

  private placeBalls(): void {
    this.sim.balls.forEach((b, i) => this.model.balls[i]!.position.copy(b.pos));
  }
}
