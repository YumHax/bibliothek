import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import type { Interactable, LabelPlacement } from '@/interaction/Interactable';
import type { ArcadeMachineLike, ArcadeResult, PlayerState, SessionActions } from '@/game/SessionActions';
import { ChipSpeaker } from '@/audio/ChipSpeaker';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox, type MeshPosition } from '../meshUtils';
import { matte } from '../props/Prop';
import { type ArcadeControls, type ArcadeGame, NO_CONTROLS, SCREEN_H, SCREEN_W, drawText } from './games/ArcadeGame';
import { crtScreenMaterial } from './crtScreen';
import { InitialsEntry, ordinal } from './InitialsEntry';
import { TicketStrip } from './TicketStrip';
import { TAKEN_LINE, type Occupant, type PartnerSpot, type Station, type StationEvents } from './Station';
import type { MedalBook, ScoreTable, TodaysChallenge } from './scoreTable';
import type { CabinetAttachment } from './CabinetAttachment';
import { MedalRow } from './MedalRow';
import { InstructionCard, hintLines } from './InstructionCard';
import { GlowPool } from './GlowPool';
import { REPLAY_STEP, ReplayPlayer, ReplayRecorder } from './replay/Replay';
import type { ReplayShelf } from './replay/ReplayStore';

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

type CabinetState = 'attract' | 'playing' | 'initials' | 'over' | 'demo';
/** What an idle cabinet shows: its title card, the game playing itself, or the player's best run. */
type AttractMode = 'title' | 'autoplay' | 'replay';

const WIDTH = 0.66;
const DEPTH = 0.78;
const BASE_H = 0.86;
const TOTAL_H = 1.92;
const SCREEN_WIDTH = 0.58;
const SCREEN_HEIGHT = (SCREEN_WIDTH * 3) / 4;
const SCREEN_Y = 1.36;
const SCREEN_TILT = THREE.MathUtils.degToRad(10);
const BEZEL_BORDER = 0.06;
const BEZEL_THICKNESS = 0.03;
/** The upper body's front face, cabinet-local. */
const UPPER_DEPTH = DEPTH - 0.18;
const FRONT_Z = -0.11 + UPPER_DEPTH / 2;
/**
 * Where the glass sits: tilted back, its top edge recedes, so it (and the bezel around it) stands
 * far enough forward that nothing of it ends up inside the body; the bezel reads as a monitor hood.
 */
const SCREEN_Z = FRONT_Z + (SCREEN_HEIGHT / 2 + BEZEL_BORDER) * Math.sin(SCREEN_TILT) + BEZEL_THICKNESS / 2 + 0.004;
/** Where the player's eye goes while playing: standing at the control panel. */
const PLAY_EYE_HEIGHT = 1.55;
const PLAY_DISTANCE = 0.72;
/** Where a regular's feet go, in front of the panel. */
const STAND_DISTANCE = 0.6;
/**
 * Redraw rates: the title card, a game somebody else is running (a regular, a demo, a replay: at
 * most this often, and not at all while the cabinet is behind the camera). The player's own game
 * redraws every frame. Each redraw uploads the 320 x 240 canvas, so a hall of demos adds up.
 */
const ATTRACT_FPS = 6;
const SHOW_FPS = 15;
/** How long the end card takes to count the tickets up. */
const COUNT_UP_SECONDS = 1.2;
/** A cabinet nobody plays sings its jingle every so often (seconds, random in the range). */
const JINGLE_EVERY: [number, number] = [35, 90];
/** How well a regular plays, and how long they wait between two games. */
const REGULAR_SKILL = 0.65;
const REGULAR_PAUSE = 2.5;
/** The attract loop: the title card this long, then a demo (cut short at `DEMO_MAX`) or the best run, held at its end card `DEMO_HOLD`. */
const TITLE_SECONDS = 7;
const DEMO_MAX = 32;
const REPLAY_MAX = 150;
const DEMO_HOLD = 1.6;
const DEMO_SKILL = 0.55;
/** An idle cabinet farther than this from the camera only shows its title card (nobody would see the demo). */
const DEMO_RANGE = 9;
/** At most this much time is simulated in one frame (a tab that slept does not fast-forward). */
const MAX_CATCHUP = 0.1;
/** The ticket slot on the base's front, and the joystick's travel. */
const SLOT = new THREE.Vector3(0.2, 0.45, -0.02 + DEPTH / 2);
const STICK_TILT = 0.35;
const OUT_OF_ORDER_LINE = 'OUT OF ORDER. Sorry. — the management';

const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
const UP_KEYS = ['KeyW', 'ArrowUp'];
const DOWN_KEYS = ['KeyS', 'ArrowDown'];
const FIRE_KEYS = ['Space', 'Enter', 'NumpadEnter'];

const BLACK = matte(0x16161a, 0.5);
const CHROME = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.6, roughness: 0.35 });

/** One set of controls on the panel: a joystick on a pivot, its knob, two buttons. */
interface ControlSet {
  stick: THREE.Group;
  knob: THREE.Mesh;
  buttons: THREE.Mesh[];
}

/**
 * An upright arcade cabinet running one `ArcadeGame` on a canvas painted onto a CRT's glass
 * (`crtScreenMaterial`: bulge, scan lines). Idle it loops an attract sequence: its title card (the
 * table's top score, the player's best, the next medal, today's challenge when it is on this game,
 * INSERT COIN), then the game playing itself (DEMO) or, once the player has one, their best run
 * replayed step for step; it sings its jingle now and then. Clicked, it asks the Session to start
 * a play (`playArcade`), which parks the player in front of it and pays the coin; the game then
 * reads the keys straight from `Input` (the joystick and buttons move with them), stepped at a
 * fixed rate so the play can be recorded, until it is over, and the cabinet reports the result. A
 * score that makes the hall of fame asks for initials first; a new best keeps the run for the
 * attract screen; the end card counts the tickets up (the strip feeds out of the slot) and says
 * what a replay costs. A regular can take it (`occupy`): the game plays itself, quieter, until
 * they `release` it, and their final score goes to the crowd (`onRegularResult`). Some days it is
 * out of order (a note taped on the glass). Two-player games get a second stick and a partner
 * spot; an attachment (light gun, dance pad) changes where the player stands and what they hold.
 * Medal lamps under the marquee, an instruction card on the panel, a glow pool on the carpet.
 * Every sound goes through the cabinet's `ChipSpeaker`. Local +z faces the player; origin on the
 * floor at the centre of the base.
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

  private state: CabinetState = 'attract';
  private mode: AttractMode = 'title';
  private modeClock = 0;
  private attractCycles = 0;
  private who: Occupant = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly screen: THREE.Mesh;
  private readonly glow: THREE.PointLight | null;
  private readonly pool: GlowPool;
  private readonly marquee: THREE.MeshBasicMaterial;
  /** The body's paint and the two side-art prints; all glow a little when hovered. */
  private readonly body: THREE.MeshStandardMaterial[];
  private readonly options: ArcadeCabinetOptions;
  private readonly speaker: ChipSpeaker;
  private readonly strip: TicketStrip;
  private readonly controlSets: ControlSet[];
  private readonly note: THREE.Mesh;
  private readonly medalRow: MedalRow | null;
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly forward = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly plane = new THREE.Plane();
  private readonly scratch = new THREE.Vector3();
  private readonly aimLocal = new THREE.Vector3();
  private attractClock = 0;
  private attractPhase = 0;
  private drawClock = 0;
  private overClock = 0;
  private countedTickets = 0;
  private jingleIn: number;
  private demoPause = 0;
  private demoReported = false;
  private accumulator = 0;
  /** The controls of the last step taken (a frame shorter than a step takes none: the stick and the gun hold still). */
  private lastStep: ArcadeControls = NO_CONTROLS;
  private last: ArcadeResult = { score: 0, best: false };
  private lastRank: number | null = null;
  private entry: InitialsEntry | null = null;
  private lastFire = false;
  private clickShot = false;
  private frameAim: { x: number; y: number } | null = null;
  private recorder: ReplayRecorder | null = null;
  private replay: ReplayPlayer | null = null;
  private onOver: ((result: ArcadeResult) => void) | null = null;
  private hovered = false;
  private partnerName: string | null = null;

  constructor(game: ArcadeGame, private readonly input: Input, options: ArcadeCabinetOptions) {
    super();
    this.name = `ArcadeCabinet:${game.id}`;
    this.game = game;
    this.options = options;
    const color = options.color ?? 0x2f4f8f;
    const glowColor = options.glow ?? 0x9ad6ff;
    const wear = options.wear ?? 0.5;
    const random = seededRandom(color ^ glowColor);
    this.jingleIn = JINGLE_EVERY[0] * random() + 5;
    this.standAt = options.attachment?.standAt?.clone() ?? new THREE.Vector3(0, 0, STAND_DISTANCE);
    this.lean = options.attachment?.lean ?? 0.12;
    const twoPlayer = typeof game.setOpponent === 'function';

    const paint = matte(color, 0.55);
    const baseArt = new THREE.MeshStandardMaterial({ map: paintSideArt(color, glowColor, 'base', wear), roughness: 0.55 });
    const upperArt = new THREE.MeshStandardMaterial({ map: paintSideArt(color, glowColor, 'upper', wear), roughness: 0.55 });
    this.body = [paint, baseArt, upperArt];
    // Base with the control panel, the upper body set back over it, the marquee on top. The side
    // art goes on the two side faces (BoxGeometry material order: +x, -x, +y, -y, +z, -z).
    this.add(bodyBox(WIDTH, BASE_H, DEPTH, baseArt, paint, { y: BASE_H / 2, z: -0.02 }));
    const panelMaterial = new THREE.MeshStandardMaterial({ map: paintPanel(color ^ glowColor, wear), roughness: 0.6 });
    const panel = boxMesh(WIDTH, 0.08, 0.3, panelMaterial, { y: BASE_H + 0.04, z: DEPTH / 2 - 0.12 });
    panel.rotation.x = -0.25;
    this.add(panel);
    // The instruction card lies on the panel, where the hands do not go.
    const card = new InstructionCard({ title: game.title, lines: hintLines(game.hint), accent: glowColor, width: 0.12, height: 0.075 });
    card.rotation.x = -Math.PI / 2;
    card.position.set(twoPlayer ? 0.02 : 0.235, 0.041, 0.03);
    panel.add(card);
    const upperD = UPPER_DEPTH;
    this.add(bodyBox(WIDTH, TOTAL_H - BASE_H, upperD, upperArt, paint, { y: (BASE_H + TOTAL_H) / 2, z: -0.11 }));
    // Bezel: a dark slab the screen is set into, tilted back like the glass, standing proud of the body.
    const bezel = boxMesh(WIDTH - 0.02, SCREEN_HEIGHT + BEZEL_BORDER * 2, BEZEL_THICKNESS, BLACK, { y: SCREEN_Y, z: SCREEN_Z - BEZEL_THICKNESS / 2 - 0.002 });
    bezel.rotation.x = -SCREEN_TILT;
    this.add(bezel);
    // Kick plate and a chrome trim on the panel.
    this.add(boxMesh(WIDTH, 0.06, DEPTH, BLACK, { y: 0.03, z: -0.02 }));
    this.add(boxMesh(WIDTH, 0.015, 0.015, CHROME, { y: BASE_H + 0.085, z: DEPTH / 2 + 0.02 }));
    // The controls: one joystick and two buttons, or a set for each player on a two-player game.
    this.controlSets = twoPlayer ? [this.addControls(-0.2, 0xd23a3a), this.addControls(0.12, 0x3a7ad2)] : [this.addControls(-0.14, 0xd23a3a)];

    // The glass: a canvas texture behind a CRT's bulge and scan lines, unlit so it reads as a lit screen whatever the room's light.
    this.canvas = createCanvas(SCREEN_W, SCREEN_H)[0];
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT), crtScreenMaterial(this.texture, { lines: SCREEN_H }));
    screen.position.set(0, SCREEN_Y, SCREEN_Z);
    screen.rotation.x = -SCREEN_TILT;
    this.screen = screen;
    this.add(screen);
    // The note taped over the glass on a day it is out of order.
    this.note = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), new THREE.MeshStandardMaterial({ map: paintNote(), roughness: 0.8 }));
    this.note.position.set(0.03, -0.03, 0.006);
    this.note.rotation.z = -0.06;
    this.note.visible = false;
    screen.add(this.note);

    // Marquee: the title on a glowing strip; brighter when hovered.
    this.marquee = new THREE.MeshBasicMaterial({ map: this.paintMarquee(color, glowColor), toneMapped: false, color: 0xcccccc });
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.04, 0.16), this.marquee);
    marquee.position.set(0, TOTAL_H - 0.1, -0.11 + upperD / 2 + 0.002);
    this.add(marquee);
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
      if (mesh.isMesh && mesh !== screen && mesh !== marquee && mesh !== this.pool) mesh.receiveShadow = true;
    });
    this.speaker = new ChipSpeaker(screen, options.listener);

    if (twoPlayer) {
      const partnerStand = new THREE.Vector3(0.36, 0, STAND_DISTANCE + 0.02);
      const p2 = this.controlSets[1]!;
      const hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
      this.partner = {
        standAt: partnerStand,
        handsAt: () => {
          p2.knob.getWorldPosition(hands[0]).y += 0.015;
          p2.buttons[0]!.getWorldPosition(hands[1]).y += 0.02;
          return hands;
        },
        setPartner: (name) => {
          this.partnerName = name;
          this.game.setOpponent?.(name ?? 'CPU', name ? 0.55 : 0.7);
        },
      };
      this.game.setOpponent?.('CPU', 0.7);
    }
    this.drawAttract();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, -DEPTH / 2), new THREE.Vector3(WIDTH / 2, TOTAL_H, DEPTH / 2));
  }

  /** From the coin to the last initial: a click or E walks away. */
  get isPlaying(): boolean {
    return this.state === 'playing' || this.state === 'initials';
  }

  get occupant(): Occupant {
    return this.who;
  }

  get outOfOrder(): boolean {
    return this.who === null && (this.options.outOfOrder?.() ?? false);
  }

  /** Starts a paid play; `onOver` is told the result once. */
  start(onOver: (result: ArcadeResult) => void): void {
    const seed = Math.floor(Math.random() * 0x100000000);
    this.game.reset({ best: this.options.scores.bestOf(this.game.id), pointsPerTicket: this.options.pointsPerTicket, seed });
    this.recorder = this.game.demoable === false ? null : new ReplayRecorder(seed, this.game.gun === true);
    this.replay = null;
    this.accumulator = 0;
    this.lastStep = NO_CONTROLS;
    this.onOver = onOver;
    this.state = 'playing';
    this.speaker.level = 1;
    this.speaker.play('coin');
    this.strip.tear();
    this.lastFire = true; // the click that started us must not count as a fire press
    this.clickShot = false;
    if (this.who !== 'player') {
      this.who = 'player';
      this.stationEvents.onPlayerStart?.();
    }
  }

  /** The player walked away: a running game is lost without payout; initials half-entered are signed as they stand. */
  abort(): void {
    if (this.state === 'initials' && this.entry) this.sign(this.entry.value);
    this.onOver = null;
    this.entry = null;
    this.recorder = null;
    this.who = null;
    this.strip.tear();
    this.enterAttract();
    this.stationEvents.onPlayerLeave?.();
  }

  occupy(): boolean {
    if (this.who || this.outOfOrder || this.game.demoable === false) return false;
    this.who = 'regular';
    this.state = 'demo';
    this.replay = null;
    this.speaker.level = 0.45;
    this.speaker.play('coin');
    this.resetDemo();
    return true;
  }

  release(): void {
    if (this.who !== 'regular') return;
    this.who = null;
    this.enterAttract();
  }

  /** A hand on the joystick's knob (it follows the stick as it leans), the other on the first button; or where the attachment says. */
  handsAt(): readonly [THREE.Vector3, THREE.Vector3] {
    if (this.options.attachment?.handsAt?.(this.hands)) return this.hands;
    const set = this.controlSets[0]!;
    set.knob.getWorldPosition(this.hands[0]).y += 0.015;
    set.buttons[0]!.getWorldPosition(this.hands[1]).y += 0.02;
    return this.hands;
  }

  /** World-space eye position and yaw for someone standing at the controls, facing the screen. */
  eyePose(): { position: THREE.Vector3; yaw: number } {
    const eye = this.options.attachment?.eye ?? new THREE.Vector3(0, PLAY_EYE_HEIGHT, PLAY_DISTANCE);
    const position = this.localToWorld(eye.clone());
    this.forward.set(0, 0, -1).applyQuaternion(this.getWorldQuaternion(new THREE.Quaternion()));
    return { position, yaw: Math.atan2(-this.forward.x, -this.forward.z) };
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
    if (this.who === 'regular') return TAKEN_LINE;
    if (this.outOfOrder) return OUT_OF_ORDER_LINE;
    if (this.state === 'playing') return this.game.gun ? 'Click or Space to shoot · E to walk away' : 'Press E or click to walk away (the play is lost)';
    if (this.state === 'initials') return 'Sign the hall of fame · E to walk away';
    if (this.state === 'over') return `Space or click to play again (${this.priceText()}) · E to walk away`;
    return `${this.game.title} — click to insert a coin (${this.priceText()})`;
  }

  labelPlacement(): LabelPlacement {
    return this.state === 'attract' || this.who === 'regular' ? 'crosshair' : 'edge';
  }

  activate(session: SessionActions): void {
    if (this.who === 'regular') session.hint(TAKEN_LINE);
    else if (this.outOfOrder) session.hint(OUT_OF_ORDER_LINE);
    // A light gun shoots where the player looks: a click on the glass is the trigger, not a walk away.
    else if (this.state === 'playing' && this.game.gun) this.clickShot = true;
    else session.playArcade(this);
  }

  // --- Updatable ------------------------------------------------------------------------------

  update(dt: number): void {
    this.speaker.follow();
    this.strip.update(dt);
    let controls: ArcadeControls = NO_CONTROLS;
    let poolLevel = 0.55;
    switch (this.state) {
      case 'playing': {
        this.frameAim = this.game.gun ? this.aimFromView() : null;
        controls = this.stepGame(dt, () => this.readControls(), this.recorder);
        this.paintGame(dt, true);
        this.speaker.playAll(this.game.takeSounds());
        poolLevel = 0.9 + Math.sin(performance.now() * 0.02) * 0.12;
        if (this.game.over) this.finish();
        break;
      }
      case 'initials': {
        controls = this.readControls();
        const sfx = this.entry?.update(dt, controls);
        if (sfx) this.speaker.play(sfx);
        this.game.draw(this.ctx);
        this.entry?.draw(this.ctx, SCREEN_W / 2, SCREEN_H / 2 + 6);
        this.texture.needsUpdate = true;
        poolLevel = 0.8;
        if (this.entry?.done) {
          this.sign(this.entry.value);
          this.entry = null;
          this.state = 'over';
          this.overClock = 0;
          this.countedTickets = 0;
        }
        break;
      }
      case 'over':
        this.overClock += dt;
        this.game.draw(this.ctx);
        this.drawGameOver();
        this.texture.needsUpdate = true;
        poolLevel = 0.75;
        break;
      case 'demo':
        controls = this.updateDemo(dt);
        poolLevel = 0.8 + Math.sin(performance.now() * 0.02) * 0.1;
        break;
      case 'attract':
        controls = this.updateAttract(dt);
        poolLevel = this.outOfOrder ? 0.15 + Math.random() * 0.15 : this.mode === 'title' ? (this.hovered ? 0.7 : 0.5) : 0.65;
        break;
    }
    this.moveControls(controls, dt);
    if (this.glow) this.glow.intensity = poolLevel * 0.95;
    this.pool.setLevel(poolLevel);
    this.options.attachment?.update(dt, { controls, who: this.who ?? null, aim: this.aimPoint(controls) });
  }

  dispose(): void {
    this.speaker.dispose();
    this.medalRow?.dispose();
    this.options.attachment?.dispose?.();
  }

  // --- Running the game -----------------------------------------------------------------------

  /**
   * Advances the game by `dt` in fixed steps (`REPLAY_STEP`), asking `source` for each step's
   * controls and recording them when asked; returns the last step's controls (for the stick and
   * buttons). Fixed steps are what makes a recorded run replay exactly.
   */
  private stepGame(dt: number, source: () => ArcadeControls, recorder: ReplayRecorder | null = null): ArcadeControls {
    this.accumulator = Math.min(this.accumulator + dt, MAX_CATCHUP);
    while (this.accumulator >= REPLAY_STEP && !this.game.over) {
      this.accumulator -= REPLAY_STEP;
      this.lastStep = source();
      this.game.update(REPLAY_STEP, this.lastStep);
      recorder?.push(this.lastStep);
    }
    return this.lastStep;
  }

  /** Redraws the running game onto the glass: every frame while the player plays, else at most `SHOW_FPS` and only in view. */
  private paintGame(dt: number, everyFrame = false): void {
    this.drawClock += dt;
    if (!everyFrame && (this.drawClock < 1 / SHOW_FPS || !this.inView())) return;
    this.drawClock = 0;
    this.game.draw(this.ctx);
    this.texture.needsUpdate = true;
  }

  /** A regular at the controls: the game on autopilot, a new game a moment after each one ends (their score goes to the crowd). */
  private updateDemo(dt: number): ArcadeControls {
    let controls: ArcadeControls = NO_CONTROLS;
    if (this.game.over) {
      if (!this.demoReported) {
        this.demoReported = true;
        this.stationEvents.onRegularResult?.(this.game.score);
      }
      this.demoPause += dt;
      if (this.demoPause >= REGULAR_PAUSE) {
        this.demoPause = 0;
        this.speaker.play('coin');
        this.resetDemo();
      }
    } else {
      controls = this.stepGame(dt, () => this.game.autopilot(REGULAR_SKILL));
      this.speaker.playAll(this.game.takeSounds());
    }
    this.paintGame(dt);
    return controls;
  }

  private resetDemo(): void {
    this.demoReported = false;
    this.accumulator = 0;
    this.lastStep = NO_CONTROLS;
    this.game.reset({ best: this.options.scores.topOf(this.game.id).score, pointsPerTicket: this.options.pointsPerTicket });
  }

  /** Nobody at it: the title card, then a demo or the player's best run, round and round (the title card only when far, dead or out of order). */
  private updateAttract(dt: number): ArcadeControls {
    const dead = this.outOfOrder;
    this.note.visible = dead;
    if (dead) {
      this.attractClock += dt;
      if (this.attractClock >= 1 / 12) {
        this.attractClock = 0;
        this.drawStatic();
      }
      return NO_CONTROLS;
    }
    this.modeClock += dt;
    if (this.mode === 'title') {
      this.jingleIn -= dt;
      if (this.jingleIn <= 0) {
        this.jingleIn = JINGLE_EVERY[0] + Math.random() * (JINGLE_EVERY[1] - JINGLE_EVERY[0]);
        this.speaker.level = 0.35;
        this.speaker.play('jingle');
      }
      this.attractClock += dt;
      if (this.attractClock >= 1 / ATTRACT_FPS) {
        this.attractClock = 0;
        this.attractPhase += 1;
        this.drawAttract();
      }
      if (this.modeClock >= TITLE_SECONDS && this.game.demoable !== false && this.near()) this.startShowing();
      return NO_CONTROLS;
    }
    // A demo or a replay: silent, the game drawn under a banner.
    let controls: ArcadeControls = NO_CONTROLS;
    const replay = this.replay;
    if (!this.game.over && this.modeClock < (replay ? REPLAY_MAX : DEMO_MAX)) {
      controls = this.stepGame(dt, () => (replay && !replay.done ? replay.next() : replay ? NO_CONTROLS : this.game.autopilot(DEMO_SKILL)));
      this.game.takeSounds();
    } else {
      // Recorded under older rules, it no longer ends where it did: nothing worth showing any more.
      if (this.demoPause === 0 && this.game.over && replay && this.game.score !== replay.replay.score) this.options.replays?.drop(this.game.id);
      this.demoPause += dt;
      if (this.demoPause >= DEMO_HOLD || !this.game.over) this.enterAttract();
    }
    this.drawClock += dt;
    if (this.drawClock >= 1 / SHOW_FPS && this.inView()) {
      this.drawClock = 0;
      this.game.draw(this.ctx);
      this.drawShowBanner();
      this.texture.needsUpdate = true;
    }
    return controls;
  }

  /** Off the title card: the player's best run every other time round (when there is one), else the game playing itself. */
  private startShowing(): void {
    const best = this.options.replays?.get(this.game.id) ?? null;
    this.attractCycles += 1;
    this.replay = best && this.attractCycles % 2 === 0 ? new ReplayPlayer(best) : null;
    this.mode = this.replay ? 'replay' : 'autoplay';
    this.modeClock = 0;
    this.demoPause = 0;
    this.drawClock = 1;
    this.accumulator = 0;
    this.lastStep = NO_CONTROLS;
    this.game.reset({ best: this.options.scores.bestOf(this.game.id), pointsPerTicket: this.options.pointsPerTicket, ...(this.replay ? { seed: best!.seed } : {}) });
    this.game.setOpponent?.('CPU', 0.7);
  }

  /** Back to the title card, from a play, a regular or a demo. */
  private enterAttract(): void {
    this.state = 'attract';
    this.mode = 'title';
    this.modeClock = 0;
    this.replay = null;
    this.demoPause = 0;
    if (this.partner) this.game.setOpponent?.(this.partnerName ?? 'CPU', this.partnerName ? 0.55 : 0.7);
    this.drawAttract();
  }

  /** Whether the camera is close enough for a demo to be worth running. */
  private near(): boolean {
    this.options.listener.getWorldPosition(this.scratch);
    return this.scratch.distanceTo(this.getWorldPosition(this.forward)) < DEMO_RANGE;
  }

  /** Whether the glass could be on screen: in front of the camera and within `DEMO_RANGE`. */
  private inView(): boolean {
    const { listener } = this.options;
    listener.getWorldPosition(this.scratch);
    const to = this.screenCentre(this.forward).sub(this.scratch);
    if (to.length() > DEMO_RANGE) return false;
    listener.getWorldDirection(this.aimLocal);
    return to.normalize().dot(this.aimLocal) > 0.2;
  }

  private finish(): void {
    const { scores } = this.options;
    const score = this.game.score;
    const best = score > 0 && score > scores.bestOf(this.game.id);
    this.last = { score, best };
    this.lastRank = null;
    this.countedTickets = 0;
    if (!best) this.recorder = null;
    if (scores.qualifies(this.game.id, score)) {
      const table = scores.table(this.game.id);
      const rank = Math.max(0, table.findIndex((e) => score > e.score));
      this.entry = new InitialsEntry(scores.initials, rank, score);
      this.state = 'initials';
    } else {
      this.sign(scores.initials);
      this.state = 'over';
      this.overClock = 0;
    }
    const handler = this.onOver;
    this.onOver = null;
    handler?.(this.last);
    this.stationEvents.onPlayerResult?.(this.last);
  }

  /** Records the play (the personal best, and the table if it makes it) under `initials`; a new best keeps its run for the attract screen. */
  private sign(initials: string): void {
    this.lastRank = this.options.scores.submit(this.game.id, this.last.score, initials).rank;
    const replay = this.recorder?.finish(this.last.score, initials);
    if (replay) this.options.replays?.save(this.game.id, replay);
    this.recorder = null;
  }

  private readControls(): ArcadeControls {
    const fire = this.input.isDown(...FIRE_KEYS) || this.clickShot;
    const controls: ArcadeControls = {
      left: this.input.isDown(...LEFT_KEYS),
      right: this.input.isDown(...RIGHT_KEYS),
      up: this.input.isDown(...UP_KEYS),
      down: this.input.isDown(...DOWN_KEYS),
      fire,
      firePressed: fire && !this.lastFire,
    };
    if (this.game.gun) controls.aim = this.frameAim;
    this.lastFire = fire;
    this.clickShot = false;
    return controls;
  }

  /** Where the camera's line of sight crosses the glass, in the game's pixels; null off the screen. */
  private aimFromView(): { x: number; y: number } | null {
    const { listener } = this.options;
    listener.getWorldPosition(this.ray.origin);
    listener.getWorldDirection(this.ray.direction);
    this.screen.getWorldDirection(this.scratch);
    this.plane.setFromNormalAndCoplanarPoint(this.scratch, this.screen.getWorldPosition(this.forward));
    const hit = this.ray.intersectPlane(this.plane, this.forward);
    if (!hit) return null;
    const local = this.screen.worldToLocal(hit);
    const u = local.x / SCREEN_WIDTH + 0.5;
    const v = 0.5 - local.y / SCREEN_HEIGHT;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    // Whole pixels, as the replay records them, so a recorded shot lands where it did.
    return { x: Math.round(u * SCREEN_W), y: Math.round(v * SCREEN_H) };
  }

  /** Cabinet-local point on the glass for a light gun's aim, or null. */
  private aimPoint(controls: ArcadeControls): THREE.Vector3 | null {
    if (!controls.aim) return null;
    this.aimLocal.set((controls.aim.x / SCREEN_W - 0.5) * SCREEN_WIDTH, (0.5 - controls.aim.y / SCREEN_H) * SCREEN_HEIGHT, 0);
    this.screen.localToWorld(this.aimLocal);
    return this.worldToLocal(this.aimLocal);
  }

  /** Adds a joystick (a pivot at its base, so it tilts with the keys) and two buttons that go down with fire, `x` along the panel. */
  private addControls(x: number, knobColor: number): ControlSet {
    const stick = new THREE.Group();
    stick.position.set(x, BASE_H + 0.07, DEPTH / 2 - 0.1);
    stick.add(cylinderMesh(0.008, 0.08, CHROME, { y: 0.04 }, { segments: 10 }));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), matte(knobColor, 0.4));
    knob.position.y = 0.09;
    knob.castShadow = true;
    stick.add(knob);
    const a = cylinderMesh(0.018, 0.015, matte(0xffd23a, 0.4), { x: x + 0.2, y: BASE_H + 0.085, z: DEPTH / 2 - 0.1 }, { segments: 14 });
    const b = cylinderMesh(0.018, 0.015, matte(0x3ad2a0, 0.4), { x: x + 0.27, y: BASE_H + 0.085, z: DEPTH / 2 - 0.13 }, { segments: 14 });
    // On a two-player panel the buttons sit closer to their stick.
    if (this.game.setOpponent) {
      a.position.x = x + 0.1;
      b.position.x = x + 0.16;
    }
    this.add(stick, a, b);
    return { stick, knob, buttons: [a, b] };
  }

  /** The sticks lean towards the held direction and the buttons go down with fire, eased; the second set follows the second player. */
  private moveControls(controls: ArcadeControls, dt: number): void {
    const ease = Math.min(1, dt * 18);
    const sets: [ControlSet, ArcadeControls][] = [[this.controlSets[0]!, controls]];
    const p2 = this.controlSets[1];
    if (p2) sets.push([p2, this.state === 'attract' && this.mode === 'title' ? NO_CONTROLS : (this.game.opponentControls?.() ?? NO_CONTROLS)]);
    for (const [set, c] of sets) {
      const tz = ((c.left ? 1 : 0) - (c.right ? 1 : 0)) * STICK_TILT;
      const tx = ((c.down ? 1 : 0) - (c.up ? 1 : 0)) * STICK_TILT;
      set.stick.rotation.z += (tz - set.stick.rotation.z) * ease;
      set.stick.rotation.x += (tx - set.stick.rotation.x) * ease;
      const pressed = c.fire || c.firePressed;
      for (const button of set.buttons) {
        const rest = BASE_H + 0.085;
        button.position.y += ((pressed ? rest - 0.006 : rest) - button.position.y) * ease;
      }
    }
  }

  private priceText(): string {
    const cost = this.options.nextPlayCost();
    return cost === 0 ? 'free play' : `${cost} coin${cost > 1 ? 's' : ''}`;
  }

  private tickets(score: number): number {
    return Math.floor(score / this.options.pointsPerTicket);
  }

  // --- Screens --------------------------------------------------------------------------------

  private drawAttract(): void {
    const ctx = this.ctx;
    const { scores } = this.options;
    ctx.fillStyle = '#07070c';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawText(ctx, this.game.title, SCREEN_W / 2, 40, 20, '#fff2a8');
    drawText(ctx, this.game.summary, SCREEN_W / 2, 64, 7, '#9ad6ff');
    const top = scores.topOf(this.game.id);
    drawText(ctx, `HI ${top.name}  ${top.score.toLocaleString('en-US')}`, SCREEN_W / 2, 88, 10, top.you ? '#7ee787' : '#c9c4ff');
    const best = scores.bestOf(this.game.id);
    drawText(ctx, best > 0 ? `YOUR BEST ${best.toLocaleString('en-US')}  (${this.tickets(best)} TIX)` : 'NO SCORE OF YOURS YET', SCREEN_W / 2, 106, 7, '#8a86b0');
    const medal = this.nextMedal();
    if (medal) drawText(ctx, medal, SCREEN_W / 2, 122, 7, '#e0995a');
    const challenge = this.options.challenge?.();
    if (challenge) {
      ctx.fillStyle = 'rgba(255,210,58,0.12)';
      ctx.fillRect(20, 134, SCREEN_W - 40, 30);
      drawText(ctx, "TODAY'S CHALLENGE", SCREEN_W / 2, 142, 7, '#ffd23a');
      drawText(ctx, challenge.done ? 'BEATEN! COME BACK TOMORROW' : `SCORE ${challenge.target.toLocaleString('en-US')} · +${challenge.reward} TIX`, SCREEN_W / 2, 156, 8, challenge.done ? '#7ee787' : '#fff2a8');
    }
    if (this.attractPhase % 2 === 0) drawText(ctx, 'INSERT COIN', SCREEN_W / 2, 186, 12, '#ff8a80');
    drawText(ctx, `1 COIN PER PLAY · ${this.options.pointsPerTicket} PTS = 1 TICKET`, SCREEN_W / 2, 218, 7, '#7a7a90');
    this.texture.needsUpdate = true;
  }

  /** "NEXT MEDAL SILVER AT 3,600", "ALL MEDALS WON", or '' without a medal book. */
  private nextMedal(): string {
    const book = this.options.medals;
    if (!book) return '';
    const earned = book.earned(this.game.id);
    const thresholds = book.thresholds(this.game.id);
    const next = (['bronze', 'silver', 'gold'] as const).find((tier) => !earned.includes(tier));
    return next ? `NEXT MEDAL ${next.toUpperCase()} AT ${thresholds[next].toLocaleString('en-US')}` : 'ALL THREE MEDALS WON';
  }

  /** Over a demo or a replay: what it is, and INSERT COIN blinking. */
  private drawShowBanner(): void {
    const ctx = this.ctx;
    const blink = Math.floor(this.modeClock * 2) % 2 === 0;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, SCREEN_H - 26, SCREEN_W, 26);
    if (this.mode === 'replay' && this.replay) {
      const r = this.replay.replay;
      drawText(ctx, `YOUR BEST RUN · ${r.initials} ${r.score.toLocaleString('en-US')}`, SCREEN_W / 2, SCREEN_H - 17, 7, '#7ee787');
    } else {
      drawText(ctx, 'DEMO PLAY', SCREEN_W / 2, SCREEN_H - 17, 7, '#9ad6ff');
    }
    if (blink) drawText(ctx, 'INSERT COIN', SCREEN_W / 2, SCREEN_H - 7, 7, '#ff8a80');
  }

  /** A dead tube: snow and a rolling bar (the note on the glass says the rest). */
  private drawStatic(): void {
    const ctx = this.ctx;
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

  /** Over the game's frozen last frame: the score, the tickets counting up, the table place, and what going again costs. */
  private drawGameOver(): void {
    const ctx = this.ctx;
    const tickets = this.tickets(this.last.score);
    const progress = Math.min(1, this.overClock / COUNT_UP_SECONDS);
    const shown = Math.floor(tickets * progress);
    const done = progress >= 1;
    // One tick per ticket paid out, as many as the ear can take.
    if (shown > this.countedTickets) {
      if (shown - this.countedTickets >= Math.max(1, tickets / 30)) {
        this.countedTickets = shown;
        this.speaker.play('ticket');
      }
      this.strip.setTickets(shown);
    }
    if (done) this.strip.setTickets(tickets);
    ctx.fillStyle = 'rgba(5,5,10,0.88)';
    ctx.fillRect(16, 40, SCREEN_W - 32, 166);
    drawText(ctx, `SCORE ${this.last.score.toLocaleString('en-US')}`, SCREEN_W / 2, 62, 12, '#fff2a8');
    drawText(ctx, `${shown}`, SCREEN_W / 2, 100, done ? 30 : 26, done ? '#ffd23a' : '#ffe9a0');
    drawText(ctx, tickets === 1 ? 'TICKET' : 'TICKETS', SCREEN_W / 2, 126, 9, '#ffd23a');
    const blink = Math.floor(this.overClock * 4) % 2 === 0;
    if (done && this.lastRank !== null) drawText(ctx, `${ordinal(this.lastRank + 1)} ON THE BOARD!`, SCREEN_W / 2, 148, 10, blink ? '#7ee787' : '#ffffff');
    else if (done && this.last.best) drawText(ctx, 'NEW BEST!', SCREEN_W / 2, 148, 11, blink ? '#7ee787' : '#ffffff');
    if (done && Math.floor(this.overClock * 2) % 2 === 0) drawText(ctx, 'SPACE · PLAY AGAIN', SCREEN_W / 2, 174, 8, '#ff8a80');
    if (done) drawText(ctx, this.options.nextPlayCost() === 0 ? 'FREE PLAY: ON THE HOUSE' : `${this.priceText().toUpperCase()} · E TO WALK AWAY`, SCREEN_W / 2, 192, 7, '#9a96c0');
  }

  private paintMarquee(color: number, glow: number): THREE.CanvasTexture {
    const [canvas, ctx] = createCanvas(512, 128);
    const base = `#${new THREE.Color(color).getHexString()}`;
    const bright = `#${new THREE.Color(glow).getHexString()}`;
    const gradient = ctx.createLinearGradient(0, 0, 512, 128);
    gradient.addColorStop(0, base);
    gradient.addColorStop(1, bright);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, 512, 10);
    ctx.fillRect(0, 118, 512, 10);
    drawText(ctx, this.game.title, 256, 66, this.game.title.length > 11 ? 36 : 44, '#fffbe6');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
}

/** A shadowed box with `sides` on its two side faces and `paint` everywhere else. */
function bodyBox(width: number, height: number, depth: number, sides: THREE.Material, paint: THREE.Material, position: MeshPosition): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [sides, sides, paint, paint, paint, paint]);
  mesh.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The stickers people slap on cabinets: a smiley, a star, a band's name, a 1UP, a heart. */
const STICKERS = ['smiley', 'star', 'band', '1up', 'heart', 'skate'] as const;

/**
 * The printed side panel: the cabinet's colour with the game's glow swept across it as a pair of
 * curved bands, a scatter of stars, a darker band at the bottom. The `upper` body's swoosh rises
 * towards the front top; the `base` gets the tail of it and the kick band. Mirrored on the other
 * side, as printed side art is. `wear` adds the life it has had: stickers (some half peeled) and
 * scuffs where shoes and hips go.
 */
function paintSideArt(color: number, glow: number, part: 'base' | 'upper', wear: number): THREE.CanvasTexture {
  const W = 256;
  const H = part === 'base' ? 288 : 352;
  const [canvas, ctx] = createCanvas(W, H);
  const base = new THREE.Color(color);
  const bright = new THREE.Color(glow);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, W, H);
  // A vertical shade: darker at the bottom, so the tall side does not read as one flat plane.
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255,255,255,0.06)');
  shade.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';
  const band = (offset: number, width: number, alpha: number): void => {
    ctx.strokeStyle = `rgba(${Math.round(bright.r * 255)},${Math.round(bright.g * 255)},${Math.round(bright.b * 255)},${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    if (part === 'upper') {
      ctx.moveTo(-20, H * 0.95 + offset);
      ctx.bezierCurveTo(W * 0.3, H * 0.9 + offset, W * 0.55, H * 0.35 + offset, W + 20, H * 0.05 + offset);
    } else {
      ctx.moveTo(-20, H * 0.4 + offset);
      ctx.bezierCurveTo(W * 0.4, H * 0.5 + offset, W * 0.7, H * 0.2 + offset, W + 20, -H * 0.3 + offset);
    }
    ctx.stroke();
  };
  band(0, 26, 0.9);
  band(38, 10, 0.55);
  band(-30, 6, 0.35);
  // Stars.
  const random = seededRandom(color ^ glow ^ (part === 'base' ? 0x55 : 0xaa));
  for (let i = 0; i < (part === 'upper' ? 26 : 12); i++) {
    const x = random() * W;
    const y = random() * H;
    const r = 1 + random() * 2.5;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + random() * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (part === 'base') {
    // The kick band and a thin glow line above it.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, H - 28, W, 28);
    ctx.fillStyle = `#${bright.getHexString()}`;
    ctx.fillRect(0, H - 32, W, 3);
    // Scuffs from shoes along the bottom.
    for (let i = 0; i < Math.round(wear * 14); i++) {
      ctx.strokeStyle = `rgba(20,16,14,${0.2 + random() * 0.3})`;
      ctx.lineWidth = 1 + random() * 2;
      const x = random() * W;
      const y = H - 40 - random() * 50;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 10 + random() * 30, y + (random() - 0.5) * 6);
      ctx.stroke();
    }
  }
  // Stickers, at hand height on the base and anywhere on the upper body.
  const stickers = Math.round(wear * (part === 'upper' ? 3 : 2) + random() * 1.2);
  for (let i = 0; i < stickers; i++) {
    const kind = STICKERS[Math.floor(random() * STICKERS.length)]!;
    const x = W * (0.15 + random() * 0.7);
    const y = part === 'base' ? H * (0.15 + random() * 0.4) : H * (0.2 + random() * 0.6);
    drawSticker(ctx, kind, x, y, 18 + random() * 12, (random() - 0.5) * 0.6, random() < wear * 0.5);
  }
  // A worn edge: the print rubbed at the front corner, where hands and hips go.
  const rub = ctx.createRadialGradient(0, H * 0.6, 0, 0, H * 0.6, W * 0.5);
  rub.addColorStop(0, `rgba(255,255,255,${0.06 + wear * 0.1})`);
  rub.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rub;
  ctx.fillRect(0, 0, W, H);
  return toTexture(canvas, 4);
}

/** One sticker at (x, y), `r` its half size, turned by `angle`; `peeled` folds a corner back. */
function drawSticker(ctx: CanvasRenderingContext2D, kind: (typeof STICKERS)[number], x: number, y: number, r: number, angle: number, peeled: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 2;
  switch (kind) {
    case 'smiley':
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-r * 0.4, -r * 0.35, r * 0.18, r * 0.3);
      ctx.fillRect(r * 0.22, -r * 0.35, r * 0.18, r * 0.3);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.arc(0, r * 0.05, r * 0.55, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      break;
    case 'star':
      ctx.fillStyle = '#ff2fa0';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const d = i % 2 ? r * 0.45 : r;
        ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      ctx.fill();
      break;
    case 'band':
      ctx.fillStyle = '#111';
      ctx.fillRect(-r * 1.4, -r * 0.5, r * 2.8, r);
      ctx.shadowBlur = 0;
      drawText(ctx, 'RIOT', 0, 0, Math.round(r * 0.7), '#e8e8e8');
      break;
    case '1up':
      ctx.fillStyle = '#33e0ff';
      ctx.fillRect(-r, -r * 0.6, r * 2, r * 1.2);
      ctx.shadowBlur = 0;
      drawText(ctx, '1UP', 0, 0, Math.round(r * 0.7), '#10263a');
      break;
    case 'heart':
      ctx.fillStyle = '#e8303a';
      ctx.beginPath();
      ctx.moveTo(0, r * 0.8);
      ctx.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.3, -r * 0.1, 0, r * 0.8);
      ctx.fill();
      break;
    case 'skate':
      ctx.fillStyle = '#7ee787';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.3, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      drawText(ctx, 'SK8', 0, 0, Math.round(r * 0.6), '#12301a');
      break;
  }
  if (peeled) {
    // The corner lifting: its paper back shows, a shadow under it.
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f2efe6';
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -r * 0.9);
    ctx.lineTo(r * 1.0, -r * 0.9);
    ctx.lineTo(r * 1.0, -r * 0.4);
    ctx.fill();
  }
  ctx.restore();
}

/** The control panel's surface: black laminate, rubbed shiny where the hands go, with cigarette burns and scratches from a life in the hall. */
function paintPanel(seed: number, wear: number): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(0, 0, W, H);
  const random = seededRandom(seed ^ 0x3c3c);
  for (let i = 0; i < 2 + Math.round(wear * 3); i++) {
    const x = random() * W;
    const y = random() * H;
    const r = 3 + random() * 5;
    const burn = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
    burn.addColorStop(0, 'rgba(10,6,4,0.95)');
    burn.addColorStop(0.45, 'rgba(70,40,20,0.7)');
    burn.addColorStop(1, 'rgba(70,40,20,0)');
    ctx.fillStyle = burn;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.8, r * 1.2, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < Math.round(wear * 25); i++) {
    ctx.strokeStyle = `rgba(200,200,210,${0.05 + random() * 0.12})`;
    ctx.lineWidth = 1;
    const x = random() * W;
    const y = random() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 40, y + (random() - 0.5) * 12);
    ctx.stroke();
  }
  return toTexture(canvas, 4);
}

/** "OUT OF ORDER" in marker on a sheet of paper, taped at the corners. */
function paintNote(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(300, 160);
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(0, 0, 300, 160);
  ctx.fillStyle = 'rgba(200,190,160,0.7)';
  for (const [x, y] of [[0, 0], [270, 0], [0, 138], [270, 138]] as const) ctx.fillRect(x, y, 30, 22);
  ctx.save();
  ctx.translate(150, 70);
  ctx.rotate(-0.04);
  ctx.fillStyle = '#c8261e';
  ctx.font = 'bold 42px "Comic Sans MS", "Marker Felt", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OUT OF', 0, -18);
  ctx.fillText('ORDER', 0, 24);
  ctx.restore();
  ctx.fillStyle = '#333';
  ctx.font = '16px "Comic Sans MS", "Marker Felt", cursive';
  ctx.textAlign = 'center';
  ctx.fillText('sorry — the mgmt', 150, 140);
  return toTexture(canvas, 4);
}
