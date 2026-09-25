import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import type { Interactable, LabelPlacement } from '@/interaction/Interactable';
import type { ArcadeMachineLike, ArcadeResult, PlayerState, SessionActions } from '@/game/SessionActions';
import { ChipSpeaker } from '@/audio/ChipSpeaker';
import { actionKeyLabel } from '@/ui/keys';
import type { Furniture } from '../Furniture';
import { eyePoseAt, invisibleHitbox } from '../meshUtils';
import { type ArcadeControls, type ArcadeGame, NO_CONTROLS } from './games/ArcadeGame';
import { TicketStrip } from './TicketStrip';
import type { Occupant, PartnerSpot, Station, StationEvents } from './Station';
import type { MedalBook, ScoreTable, TodaysChallenge } from './scoreTable';
import type { CabinetAttachment } from './CabinetAttachment';
import { MedalRow } from './MedalRow';
import { GlowPool } from './GlowPool';
import type { ReplayShelf } from './replay/ReplayStore';
import { MachineRun } from './MachineRun';
import { GameRunner } from './GameRunner';
import { CabinetScreens } from './CabinetScreens';
import { AttractLoop } from './AttractLoop';
import { CabinetControls } from './CabinetControls';
import { BEZEL_BORDER, DEPTH, FRONT_Z, SCREEN_HEIGHT, SCREEN_Y, SCREEN_Z, TOTAL_H, WIDTH, buildCabinetBody } from './cabinetModel';

export interface ArcadeCabinetOptions {
  /** Colour of the side panels. */
  color?: number;
  /** Colour of the marquee's glow, the light thrown on the player and the pool on the carpet. */
  glow?: number;
  /** The hall of fame: the best to beat, the table the initials go on. */
  scores: ScoreTable;
  /** What the next play costs right now (0: on the house), for the end card and the label. */
  nextPlayCost: () => number;
  /** Score points per ticket on this game, shown live by the game and on the attract screen. */
  pointsPerTicket: number;
  /** Today's challenge, when it is set on this cabinet's game. */
  challenge?: () => TodaysChallenge | null;
  /** The camera: the speaker's level and pan follow it, and a light gun aims where it looks. */
  listener: THREE.Object3D;
  /** The player's best run per game: recorded when a play sets a new best, replayed on the attract screen. */
  replays?: ReplayShelf;
  /** The medals earned per game: lamps under the marquee, the next one on the attract screen. */
  medals?: MedalBook;
  /** Whether it is out of order today (a note on the glass, nobody plays it). */
  outOfOrder?: () => boolean;
  /** Something bolted on that changes how it is played: a light gun, a dance pad. */
  attachment?: CabinetAttachment;
  /** Whether the screen also lights the room with a real light. Default true; the glow pool on the carpet shows either way. */
  glowLight?: boolean;
  /** Stickers, burns and scuffs: 0 a cabinet fresh from the factory, 1 a veteran. Default 0.5. */
  wear?: number;
}

/** Where the player's eye goes while playing: standing at the control panel. */
const PLAY_EYE_HEIGHT = 1.55;
const PLAY_DISTANCE = 0.72;
/** Where a regular's feet go, in front of the panel. */
const STAND_DISTANCE = 0.6;
/** How well a regular plays, and how long they wait between two games. */
const REGULAR_SKILL = 0.65;
const REGULAR_PAUSE = 2.5;
/** The ticket slot on the base's front. */
const SLOT = new THREE.Vector3(0.2, 0.45, -0.02 + DEPTH / 2);

/**
 * An upright arcade cabinet running one `ArcadeGame` on a canvas painted onto a CRT's glass
 * (`CabinetScreens`). Idle it loops an attract sequence (`AttractLoop`: its title card, then the
 * game playing itself or the player's best run replayed step for step) and sings its jingle now
 * and then. Clicked, it asks the Session to start a play (`playArcade`, through its `MachineRun`),
 * which parks the player in front of it and pays the coin; the game then reads the keys straight
 * from `Input` (the joystick and buttons move with them, `CabinetControls`), stepped at a fixed
 * rate so the play can be recorded (`GameRunner`), until it is over, and the cabinet reports the
 * result. A score that makes the hall of fame asks for initials first; a new best keeps the run
 * for the attract screen; the end card counts the tickets up (the strip feeds out of the slot) and
 * says what a replay costs. A regular can take it (`occupy`): the game plays itself, quieter,
 * until they `release` it, and their final score goes to the crowd (`onRegularResult`). Some days
 * it is out of order (a note taped on the glass). Two-player games get a second stick and a
 * partner spot; an attachment (light gun, dance pad) changes where the player stands and what they
 * hold. Medal lamps under the marquee, an instruction card on the panel, a glow pool on the
 * carpet. Every sound goes through the cabinet's `ChipSpeaker`. Local +z faces the player; origin
 * on the floor at the centre of the base (the body is `cabinetModel`).
 */
export class ArcadeCabinet extends THREE.Group implements Furniture, Interactable, Updatable, ArcadeMachineLike, Station {
  readonly hitboxes: THREE.Object3D[];
  readonly game: ArcadeGame;
  readonly freeWhenBroke = true;
  /** Where a regular stands: closer than the player's eye (`PLAY_DISTANCE`), so their hands reach the panel. */
  readonly standAt: THREE.Vector3;
  readonly lean: number;
  readonly focus = new THREE.Vector3(0, SCREEN_Y, SCREEN_Z);
  readonly stationEvents: StationEvents = {};
  readonly partner?: PartnerSpot;

  private readonly options: ArcadeCabinetOptions;
  private readonly run: MachineRun;
  private readonly runner: GameRunner;
  private readonly screens: CabinetScreens;
  private readonly attract: AttractLoop;
  private readonly controls: CabinetControls;
  private readonly glow: THREE.PointLight | null;
  private readonly pool: GlowPool;
  private readonly marquee: THREE.MeshBasicMaterial;
  /** The body's paint and the two side-art prints; all glow a little when hovered. */
  private readonly body: THREE.MeshStandardMaterial[];
  private readonly speaker: ChipSpeaker;
  private readonly strip: TicketStrip;
  private readonly medalRow: MedalRow | null;
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private frameAim: { x: number; y: number } | null = null;
  private hovered = false;
  private partnerName: string | null = null;

  constructor(game: ArcadeGame, input: Input, options: ArcadeCabinetOptions) {
    super();
    this.name = `ArcadeCabinet:${game.id}`;
    this.game = game;
    this.options = options;
    const color = options.color ?? 0x2f4f8f;
    const glowColor = options.glow ?? 0x9ad6ff;
    this.standAt = options.attachment?.standAt?.clone() ?? new THREE.Vector3(0, 0, STAND_DISTANCE);
    this.lean = options.attachment?.lean ?? 0.12;
    const twoPlayer = typeof game.setOpponent === 'function';

    const { body, marquee, marqueeMesh } = buildCabinetBody(this, { color, glow: glowColor, wear: options.wear ?? 0.5, title: game.title, hint: game.hint, twoPlayer });
    this.body = body;
    this.marquee = marquee;
    // The controls: one joystick and two buttons, or a set for each player on a two-player game.
    this.controls = new CabinetControls(this, twoPlayer);
    const info = { scores: options.scores, pointsPerTicket: options.pointsPerTicket, ...(options.medals ? { medals: options.medals } : {}), ...(options.challenge ? { challenge: options.challenge } : {}) };
    this.screens = new CabinetScreens(game, info, options.listener, this);
    const { screen } = this.screens;
    this.add(screen);
    // The medal lamps on the speaker board between the marquee and the screen.
    this.medalRow = options.medals ? new MedalRow(options.medals, game.id) : null;
    if (this.medalRow) {
      this.medalRow.position.set(0, (SCREEN_Y + SCREEN_HEIGHT / 2 + BEZEL_BORDER + TOTAL_H - 0.18) / 2 + 0.01, FRONT_Z + 0.002);
      this.add(this.medalRow);
    }
    // The ticket slot on the base, the strip hanging down to the floor.
    this.strip = new TicketStrip(SLOT.y);
    this.strip.position.copy(SLOT);
    this.add(this.strip);
    // Screen light thrown at the player (no shadows: six passes for a soft glow is not worth it), and its pool on the carpet.
    this.glow = options.glowLight === false ? null : new THREE.PointLight(glowColor, 0.6, 2.5, 2);
    if (this.glow) {
      this.glow.position.set(0, SCREEN_Y, 0.5);
      this.add(this.glow);
    }
    this.pool = new GlowPool(glowColor, 1.1, 1.3);
    this.pool.position.z = DEPTH / 2 + 0.55;
    this.add(this.pool);
    if (options.attachment) this.add(options.attachment.object);
    const hitbox = invisibleHitbox(WIDTH + 0.04, TOTAL_H, DEPTH + 0.04, { y: TOTAL_H / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh !== screen && mesh !== marqueeMesh && mesh !== this.pool) mesh.receiveShadow = true;
    });

    this.speaker = new ChipSpeaker(screen, options.listener);
    this.run = new MachineRun({
      game,
      input,
      speaker: this.speaker,
      stationEvents: this.stationEvents,
      nextPlayCost: options.nextPlayCost,
      pointsPerTicket: options.pointsPerTicket,
      scores: options.scores,
      strip: this.strip,
      note: this.screens.note,
      ...(options.outOfOrder ? { outOfOrder: options.outOfOrder } : {}),
      // A new best keeps its run for the attract screen.
      onSign: (initials, result) => {
        const replay = result.best ? this.runner.finishRecording(result.score, initials) : null;
        this.runner.dropRecording();
        if (replay) options.replays?.save(game.id, replay);
      },
    });
    this.runner = new GameRunner(game);
    this.attract = new AttractLoop({
      game,
      runner: this.runner,
      screens: this.screens,
      speaker: this.speaker,
      scores: options.scores,
      pointsPerTicket: options.pointsPerTicket,
      ...(options.replays ? { replays: options.replays } : {}),
      seed: color ^ glowColor,
      onTitle: () => {
        if (this.partner) this.game.setOpponent?.(this.partnerName ?? 'CPU', this.partnerName ? 0.55 : 0.7);
      },
    });

    if (twoPlayer) {
      const hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
      this.partner = {
        standAt: new THREE.Vector3(0.36, 0, STAND_DISTANCE + 0.02),
        handsAt: () => this.controls.handsAt(1, hands),
        setPartner: (name) => {
          this.partnerName = name;
          this.game.setOpponent?.(name ?? 'CPU', name ? 0.55 : 0.7);
        },
      };
      this.game.setOpponent?.('CPU', 0.7);
    }
    this.screens.drawTitle(0);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, -DEPTH / 2), new THREE.Vector3(WIDTH / 2, TOTAL_H, DEPTH / 2));
  }

  /** From the coin to the last initial: a click or E walks away. */
  get isPlaying(): boolean {
    return this.run.isPlaying;
  }

  get occupant(): Occupant {
    return this.run.occupant;
  }

  get outOfOrder(): boolean {
    return this.run.outOfOrder;
  }

  /** Starts a paid play (recorded, when the game can replay); `onOver` is told the result once. */
  start(onOver: (result: ArcadeResult) => void): void {
    this.run.start(onOver);
    const seed = Math.floor(Math.random() * 0x100000000);
    this.runner.reset({ best: this.options.scores.bestOf(this.game.id), pointsPerTicket: this.options.pointsPerTicket, seed }, this.game.demoable !== false);
  }

  /** The player walked away: a running game is lost without payout; initials half-entered are signed as they stand. */
  abort(): void {
    this.run.abort();
    this.runner.dropRecording();
    this.attract.enter();
  }

  occupy(): boolean {
    if (this.game.demoable === false || !this.run.occupy()) return false;
    this.speaker.play('coin');
    this.resetDemo();
    return true;
  }

  release(): void {
    if (this.run.release()) this.attract.enter();
  }

  /** A hand on the joystick's knob (it follows the stick as it leans), the other on the first button; or where the attachment says. */
  handsAt(): readonly [THREE.Vector3, THREE.Vector3] {
    if (this.options.attachment?.handsAt?.(this.hands)) return this.hands;
    return this.controls.handsAt(0, this.hands);
  }

  /** World-space eye position and yaw for someone standing at the controls, facing the screen. */
  eyePose(): { position: THREE.Vector3; yaw: number } {
    return eyePoseAt(this, this.options.attachment?.eye ?? new THREE.Vector3(0, PLAY_EYE_HEIGHT, PLAY_DISTANCE));
  }

  /** World-space centre of the glass, to aim the camera at. */
  screenCentre(out = new THREE.Vector3()): THREE.Vector3 {
    return this.localToWorld(out.set(0, SCREEN_Y, SCREEN_Z));
  }

  // --- Interactable ---------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    for (const m of this.body) m.emissive.setHex(hovered ? 0x101018 : 0x000000);
    this.marquee.color.setHex(hovered ? 0xffffff : 0xcccccc);
  }

  label(_player: PlayerState): string {
    const attract = `${this.game.title} — click to insert a coin (${this.run.priceText()})`;
    return this.run.label(this.game.gun ? { attract, playing: `Click or ${actionKeyLabel('fire')} to shoot · ${actionKeyLabel('walkAway')} to walk away` } : { attract });
  }

  labelPlacement(): LabelPlacement {
    return this.run.labelPlacement();
  }

  activate(session: SessionActions): void {
    // A light gun shoots where the player looks: a click on the glass is the trigger, not a walk away.
    this.run.activate(session, this, () => {
      if (this.game.gun) this.run.click();
      return this.game.gun === true;
    });
  }

  // --- Updatable ------------------------------------------------------------------------------

  update(dt: number): void {
    this.speaker.follow();
    this.strip.update(dt);
    let controls = this.run.update(dt);
    let poolLevel = 0.55;
    switch (this.run.state) {
      case 'playing': {
        this.frameAim = this.game.gun ? this.screens.aimFromView() : null;
        controls = this.runner.step(dt, () => this.readControls());
        this.screens.paintGame(dt, true);
        this.speaker.playAll(this.game.takeSounds());
        poolLevel = 0.9 + Math.sin(performance.now() * 0.02) * 0.12;
        if (this.game.over) this.run.finish(this.game.score);
        break;
      }
      case 'initials':
        // The gun stays where it pointed last.
        if (this.game.gun) controls = { ...controls, aim: this.frameAim };
        this.screens.drawInitials(this.run.entry);
        poolLevel = 0.8;
        break;
      case 'over':
        this.screens.drawGameOver(this.run);
        poolLevel = 0.75;
        break;
      case 'demo':
        controls = this.updateDemo(dt);
        poolLevel = 0.8 + Math.sin(performance.now() * 0.02) * 0.1;
        break;
      case 'attract': {
        const dead = this.outOfOrder;
        controls = this.attract.update(dt, dead);
        poolLevel = dead ? 0.15 + Math.random() * 0.15 : this.attract.showingTitle ? (this.hovered ? 0.7 : 0.5) : 0.65;
        break;
      }
    }
    const idle = this.run.state === 'attract' && this.attract.showingTitle;
    this.controls.move(dt, controls, idle ? NO_CONTROLS : (this.game.opponentControls?.() ?? NO_CONTROLS));
    if (this.glow) this.glow.intensity = poolLevel * 0.95;
    this.pool.setLevel(poolLevel);
    this.options.attachment?.update(dt, { controls, who: this.run.occupant, aim: this.screens.aimPoint(controls) });
  }

  dispose(): void {
    this.speaker.dispose();
    this.medalRow?.dispose();
    this.options.attachment?.dispose?.();
  }

  /** A regular at the controls: the game on autopilot, a new game a moment after each one ends (their score goes to the crowd). */
  private updateDemo(dt: number): ArcadeControls {
    let controls: ArcadeControls = NO_CONTROLS;
    if (this.game.over) {
      this.run.regularResult(this.game.score);
      if (this.run.regularPause(dt, REGULAR_PAUSE)) this.resetDemo();
    } else {
      controls = this.runner.step(dt, () => this.game.autopilot(REGULAR_SKILL));
      this.speaker.playAll(this.game.takeSounds());
    }
    this.screens.paintGame(dt);
    return controls;
  }

  private resetDemo(): void {
    this.runner.reset({ best: this.options.scores.topOf(this.game.id).score, pointsPerTicket: this.options.pointsPerTicket });
  }

  /** The player's keys (a click on the glass pulls a light gun's trigger), and where the gun points. */
  private readControls(): ArcadeControls {
    const controls = this.run.readControls();
    if (this.game.gun) controls.aim = this.frameAim;
    return controls;
  }
}
