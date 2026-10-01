import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import type { Interactable, LabelPlacement } from '@/interaction/Interactable';
import type { ArcadeBonus, ArcadeMachineLike, ArcadeResult, SessionActions } from '@/game/SessionActions';
import { ChipSpeaker } from '@/audio/ChipSpeaker';
import { actionKeyLabel } from '@/ui/keys';
import type { Furniture } from '../Furniture';
import { eyePoseAt } from '../meshUtils';
import { drawText } from './games/ArcadeGame';
import type { Occupant, Station, StationEvents } from './Station';
import { MachineRun } from './MachineRun';
import { BASE_H, CASE_H, ClawSim, DEPTH, TOTAL_H, WIDTH } from './claw/ClawSim';
import { type ClawModel, buildClawModel } from './claw/clawModel';

export interface ClawMachineOptions {
  /** Paint of the base and the top. Default a fairground pink. */
  color?: number;
  seed?: number;
}

export interface ClawWiring {
  input: Input;
  listener: THREE.Object3D;
  /** What a play costs (never free: the claw pays prizes, not tickets). */
  playCost: () => number;
  /** The prize id a plush of this colour is (`economy/Prizes`), or undefined. */
  prizeFor: (color: number) => string | undefined;
  /** Whether it is out of order today. */
  outOfOrder?: () => boolean;
  /** Where the misses in a row are kept across visits (the pity grip's count: `economy/ArcadeHabits`). */
  luck?: { clawMisses: number };
}

/** Where a regular's feet go (close enough to reach the stick), and where the player's eye goes. */
const STAND_Z = DEPTH / 2 + 0.22;
const EYE_Z = DEPTH / 2 + 0.33;

/**
 * A crane game: a lit case full of plush on a bright base, a joystick and a button, a prize chute
 * in the corner, and a claw on a gantry (`claw/clawModel`). Paid for like a cabinet (`playArcade`,
 * one coin, never free): the player steers the claw with WASD for fifteen seconds (a display
 * counts them down), Space drops it; it closes, lifts, goes back over the chute and opens. The
 * rules are the `ClawSim`'s (where it came down, the slips, the pity grip); this class feeds it the
 * keys and moves the model, the sounds and the display to match. A plush that makes it down the
 * chute is a prize to take home. A regular playing it (`occupy`) roams, drops and comes up empty,
 * as ever. The coin, the end and out-of-order days go through its `MachineRun` (no table, no
 * tickets). Origin on the floor under its centre, +z faces the room. Collides.
 */
export class ClawMachine extends THREE.Group implements Furniture, Interactable, Updatable, ArcadeMachineLike, Station {
  readonly hitboxes: THREE.Object3D[];
  readonly standAt = new THREE.Vector3(0, 0, STAND_Z);
  readonly lean = 0.15;
  readonly focus = new THREE.Vector3(0, BASE_H + CASE_H * 0.55, 0);
  readonly stationEvents: StationEvents = {};
  readonly freeWhenBroke = false;
  readonly game = { id: 'claw', title: 'GRAB A PRIZE', hint: 'WASD or arrows move the claw · Space drops it' };

  private readonly run: MachineRun;
  private readonly sim: ClawSim;
  private readonly model: ClawModel;
  /** The colour each plush's fur is painted, to repaint it when the sim restocks one. */
  private readonly furColors: number[];
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly speaker: ChipSpeaker;

  constructor(options: ClawMachineOptions, wiring: ClawWiring) {
    super();
    this.name = 'ClawMachine';
    this.sim = new ClawSim(options.seed ?? 1, wiring.prizeFor, wiring.luck);
    this.model = buildClawModel(this, options.color ?? 0xd23a6a, this.sim.plush);
    this.furColors = this.sim.plush.map((p) => p.color);
    this.hitboxes = [this.model.hitbox];
    this.placeClaw();
    this.speaker = new ChipSpeaker(this.model.carriage, wiring.listener, { volume: 0.18 });
    // Every sound it makes is news to whoever plays or watches it.
    this.speaker.onPlay = (sfx) => this.stationEvents.onSound?.(sfx);
    this.run = new MachineRun({
      game: this.game,
      input: wiring.input,
      speaker: this.speaker,
      stationEvents: this.stationEvents,
      nextPlayCost: wiring.playCost,
      note: this.model.note,
      ...(wiring.outOfOrder ? { outOfOrder: wiring.outOfOrder } : {}),
    });
    this.paintDisplay('INSERT COIN');
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.02, 0, -DEPTH / 2 - 0.02), new THREE.Vector3(WIDTH / 2 + 0.02, TOTAL_H, DEPTH / 2 + 0.04));
  }

  /** From the coin until the claw has opened over the chute. */
  get isPlaying(): boolean {
    return this.run.isPlaying;
  }

  get occupant(): Occupant {
    return this.run.occupant;
  }

  get outOfOrder(): boolean {
    return this.run.outOfOrder;
  }

  start(onOver: (result: ArcadeResult) => void): void {
    this.run.start(onOver);
    this.sim.start();
  }

  /** Walked away: the coin is lost; the claw goes home on its own. */
  abort(): void {
    this.run.abort();
    this.sim.abandon();
    this.playSounds();
  }

  occupy(): boolean {
    if (!this.run.occupy()) return false;
    this.sim.occupied();
    return true;
  }

  release(): void {
    if (!this.run.release()) return;
    this.sim.home();
  }

  /** A hand on the joystick's ball (it follows the stick), the other over the drop button. */
  handsAt(): readonly [THREE.Vector3, THREE.Vector3] {
    this.model.stickBall.getWorldPosition(this.hands[0]).y += 0.015;
    this.model.button.getWorldPosition(this.hands[1]).y += 0.02;
    return this.hands;
  }

  eyePose(): { position: THREE.Vector3; yaw: number } {
    return eyePoseAt(this, new THREE.Vector3(0, 1.55, EYE_Z));
  }

  screenCentre(): THREE.Vector3 {
    return this.localToWorld(this.focus.clone());
  }

  setHovered(hovered: boolean): void {
    this.model.marquee.color.setHex(hovered ? 0xffffff : 0xdddddd);
  }

  label(): string {
    const price = this.run.priceText();
    return this.run.label({
      attract: `Claw machine · insert a coin (${price}, prizes go home)`,
      playing: `Claw machine · ${actionKeyLabel('walkAway')} or a click walks away (the coin is lost)`,
      over: `Claw machine · ${actionKeyLabel('fire')} or a click tries again (${price}) · ${actionKeyLabel('walkAway')} walks away`,
    });
  }

  labelPlacement(): LabelPlacement {
    return this.run.labelPlacement();
  }

  activate(session: SessionActions): void {
    this.run.activate(session, this);
  }

  get canReplay(): boolean {
    return this.run.canReplay;
  }

  pause(paused: boolean): void {
    this.run.setPaused(paused);
  }

  showBonus(bonuses: readonly ArcadeBonus[]): void {
    this.run.showBonus(bonuses);
  }

  update(dt: number): void {
    // The pointer went free mid-play: the claw hangs where it is until it is locked again.
    if (this.run.paused) return;
    this.model.chaser.offset.x -= dt * (this.run.state === 'playing' ? 1.6 : 0.6);
    this.speaker.follow();
    this.run.update(dt);
    const mode = this.run.state;
    // The keys are read only while the player steers (reading them takes fire's press edge).
    const keys = mode === 'playing' && this.sim.phase === 'aim' ? this.run.readControls() : null;
    this.sim.update(dt, mode, keys);
    const text = this.sim.takeDisplay();
    if (text !== null) this.paintDisplay(text);
    this.playSounds();
    const outcome = this.sim.takeOutcome();
    if (outcome) this.run.finish(0, outcome.prize);
    this.placeClaw();
  }

  dispose(): void {
    this.speaker.dispose();
  }

  private playSounds(): void {
    for (const sound of this.sim.takeSounds()) this.speaker.play(sound);
  }

  /** The model follows the sim: the carriage and its beam, the cable stretched to the claw, the prongs, the stick, the plush. */
  private placeClaw(): void {
    const { sim, model } = this;
    model.carriage.position.copy(sim.carriage);
    model.beam.position.z = sim.carriage.z;
    model.cable.scale.y = sim.drop;
    model.cable.position.y = -sim.drop / 2;
    model.hub.position.y = -sim.drop;
    for (const prong of model.prongs) {
      prong.position.y = -sim.drop;
      prong.rotation.x = THREE.MathUtils.lerp(0.55, 0.05, sim.grip);
    }
    model.stick.rotation.z = sim.stick.z;
    model.stick.rotation.x = sim.stick.x;
    sim.plush.forEach((p, i) => {
      const toy = model.plush[i]!;
      toy.group.position.copy(p.pos);
      if (this.furColors[i] !== p.color) {
        this.furColors[i] = p.color;
        toy.fur.color.setHex(p.color);
      }
    });
  }

  private paintDisplay(text: string): void {
    const { ctx, canvas, texture } = this.model.display;
    ctx.fillStyle = '#140608';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawText(ctx, text, canvas.width / 2, canvas.height / 2 + 1, text.length > 3 ? 14 : 28, '#ff4a3a');
    texture.needsUpdate = true;
  }
}
