import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable, LabelPlacement } from '@/interaction/Interactable';
import type { ArcadeMachineLike, ArcadeResult, SessionActions } from '@/game/SessionActions';
import { actionKeyLabel } from '@/ui/keys';
import { ChipSpeaker, type Sfx } from '@/audio/ChipSpeaker';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, eyePoseAt, invisibleHitbox } from '../meshUtils';
import { markShared, matte } from '../props/Prop';
import { drawText } from './games/ArcadeGame';
import { ordinal } from './InitialsEntry';
import { BALL_R, type PinballEvent, PinballSim } from './pinball/PinballSim';
import type { Occupant, Station, StationEvents } from './Station';
import type { ScoreTable } from './scoreTable';
import type { TicketMachineWiring } from './TicketMachine';
import { MachineRun, type MachineState } from './MachineRun';
import { CHROME, type MachineDisplay, displayScreen, outOfOrderNote } from './machineParts';

export interface PinballOptions {
  /** The table's name, on the backglass. Default METEOR ALLEY. */
  title?: string;
  /** Paint of the cabinet. Default a deep purple. */
  color?: number;
  /** Accent of the art (the backglass, the playfield). Default orange. */
  accent?: number;
  seed?: number;
}

/** The pinball keeps a table: its backglass shows the top score. */
export type PinballWiring = TicketMachineWiring & { scores: ScoreTable };

const BODY_W = 0.56;
const BODY_L = 1.3;
const BODY_H = 0.22;
/** Height of the top of the cabinet at the front edge; the back is `RISE` higher. */
const FRONT_TOP = 0.9;
const RISE = 0.16;
const TILT = Math.atan2(RISE, BODY_L);
const BACKBOX_H = 0.72;
const BACKBOX_D = 0.24;
const FIELD_W = BODY_W - 0.06;
const FIELD_L = BODY_L - 0.08;
/** The playfield's surface in the deck's frame. */
const FIELD_Y = BODY_H / 2 - 0.04;
/** Where the player stands: `standAt` is machine-local, in front of the flipper buttons. */
const STAND_Z = BODY_L / 2 + 0.25;
const EYE = new THREE.Vector3(0, 1.55, BODY_L / 2 + 0.3);
/** The flipper buttons on the cabinet's sides, near the front: deck-local z, and how far out of the side a hand rests on one. */
const BUTTON_Z = BODY_L / 2 - 0.08;
const HAND_OUT = 0.03;
/** Playfield canvas: pixels per table unit across. */
const FIELD_PX = 256;
/** The backglass repaints this often while nobody plays (the game repaints it every frame). */
const IDLE_FPS = 4;
const REGULAR_SKILL = 0.7;
const REGULAR_PAUSE = 3;

const STEEL_BALL = markShared(new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1, roughness: 0.12 }));
const BLACK = markShared(matte(0x111116, 0.5));

const SOUNDS: Partial<Record<PinballEvent, Sfx>> = {
  bumper: 'bumper',
  sling: 'hit',
  rollover: 'blip',
  lanes: 'bonus',
  target: 'score',
  bank: 'win',
  flipper: 'flipper',
  launch: 'launch',
  drain: 'drain',
  saved: 'time',
  over: 'over',
};

/**
 * A pinball table you can play: a `PinballSim` (three balls, flippers, bumpers, slingshots, top
 * lanes, a target bank) drawn on the sloping playfield under glass, with a real steel ball and
 * flippers moving over it, the plunger pulling back as Space is held, the pop bumpers flashing
 * when hit and the backglass showing the score, the ball in play and the multiplier. A paid play
 * works like a cabinet's (`playArcade`, through its `MachineRun`): A / D flip, Space launches; the
 * result pays tickets and a score good enough asks for initials on the backglass. A regular can
 * take it (`occupy`) and play it themselves; some days it is out of order. Origin on the floor under the middle of the cabinet, +z towards the player's end. Collides.
 */
export class Pinball extends THREE.Group implements Furniture, Interactable, Updatable, ArcadeMachineLike, Station {
  readonly hitboxes: THREE.Object3D[];
  readonly standAt = new THREE.Vector3(0, 0, STAND_Z);
  /** A pinball is played bent well over the glass. */
  readonly lean = 0.5;
  readonly focus = new THREE.Vector3(0, FRONT_TOP + RISE / 2, 0);
  readonly stationEvents: StationEvents = {};
  readonly freeWhenBroke = true;
  readonly game: { readonly id: string; readonly title: string; readonly hint: string };

  private readonly sim = new PinballSim(FIELD_L / FIELD_W);
  private readonly wiring: PinballWiring;
  private readonly run: MachineRun;
  private readonly deck: THREE.Group;
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly ball: THREE.Mesh;
  private readonly flippers: THREE.Group[];
  private readonly plunger: THREE.Group;
  private readonly inserts: THREE.MeshStandardMaterial[] = [];
  private readonly bumperCaps: THREE.MeshStandardMaterial[] = [];
  private readonly backglass: MachineDisplay;
  private readonly speaker: ChipSpeaker;
  private readonly title: string;
  private readonly accent: string;
  private clock = 0;
  private displayClock = 0;
  private demoHold = 0;
  private bestBeaten = false;
  private readonly local = new THREE.Vector3();

  constructor(options: PinballOptions, wiring: PinballWiring) {
    super();
    this.name = 'Pinball';
    this.wiring = wiring;
    this.title = options.title ?? 'METEOR ALLEY';
    this.game = { id: 'pinball', title: this.title, hint: 'A / D flip · hold Space to pull the plunger, let go to launch' };
    const random = seededRandom((options.seed ?? 1) * 6151);
    const color = options.color ?? 0x3a1f5c;
    const paint = matte(color, 0.5);
    const accent = new THREE.Color(options.accent ?? 0xff8a2a);
    this.accent = `#${accent.getHexString()}`;

    // Legs: front pair shorter, so the top slopes towards the player.
    for (const sx of [-1, 1]) {
      for (const [sz, extra] of [[1, 0], [-1, RISE]] as const) {
        const h = FRONT_TOP - BODY_H + extra;
        this.add(cylinderMesh(0.018, h, CHROME, { x: sx * (BODY_W / 2 - 0.05), y: h / 2, z: sz * (BODY_L / 2 - 0.1) }, { segments: 10 }));
        this.add(boxMesh(0.06, 0.02, 0.06, BLACK, { x: sx * (BODY_W / 2 - 0.05), y: 0.01, z: sz * (BODY_L / 2 - 0.1) }));
      }
    }

    // The deck: the cabinet box, tilted so its back end is higher; everything on the playfield lives in its frame.
    const deck = new THREE.Group();
    deck.position.y = FRONT_TOP + RISE / 2 - BODY_H / 2;
    deck.rotation.x = TILT;
    this.deck = deck;
    this.add(deck);
    // The cabinet is a tub: a solid bottom up to the playfield, and a rim round it up to the glass
    // (a solid box would bury the playfield, the ball and the flippers under its lid).
    // Its top stops a hair under the playfield plane (level with it, the two would z-fight).
    const bottomH = FIELD_Y + BODY_H / 2 - 0.003;
    deck.add(boxMesh(BODY_W, bottomH, BODY_L, paint, { y: -BODY_H / 2 + bottomH / 2 }));
    const rimH = BODY_H / 2 - FIELD_Y;
    const rimY = FIELD_Y + rimH / 2;
    const side = (BODY_W - FIELD_W) / 2;
    const fieldFront = FIELD_L / 2 + 0.01;
    const fieldBack = -FIELD_L / 2 + 0.01;
    for (const sx of [-1, 1]) deck.add(boxMesh(side, rimH, BODY_L, paint, { x: sx * (BODY_W / 2 - side / 2), y: rimY }));
    deck.add(boxMesh(FIELD_W, rimH, BODY_L / 2 - fieldFront, paint, { y: rimY, z: (BODY_L / 2 + fieldFront) / 2 }));
    deck.add(boxMesh(FIELD_W, rimH, fieldBack + BODY_L / 2, paint, { y: rimY, z: (fieldBack - BODY_L / 2) / 2 }));
    const stripe = matte(accent, 0.5);
    for (const sx of [-1, 1]) deck.add(boxMesh(0.004, 0.05, BODY_L - 0.1, stripe, { x: sx * (BODY_W / 2 + 0.002), y: 0.02 }));
    // Playfield under glass: the sim's walls, lanes and targets painted once on the table's art.
    const field = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, FIELD_L), new THREE.MeshBasicMaterial({ map: this.paintPlayfield(color, accent, random), toneMapped: false, color: 0x9a9a9a }));
    field.rotation.x = -Math.PI / 2;
    field.position.set(0, FIELD_Y, 0.01);
    deck.add(field);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, FIELD_L), new THREE.MeshStandardMaterial({ color: 0xdde8ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false }));
    glass.rotation.x = -Math.PI / 2;
    glass.position.set(0, BODY_H / 2 + 0.002, 0.01);
    glass.castShadow = false;
    deck.add(glass);
    for (const sx of [-1, 1]) deck.add(boxMesh(0.03, 0.012, BODY_L, CHROME, { x: sx * (BODY_W / 2 - 0.015), y: BODY_H / 2 + 0.006 }));
    deck.add(boxMesh(BODY_W, 0.03, 0.06, CHROME, { y: BODY_H / 2 + 0.015, z: BODY_L / 2 - 0.03 }));

    // Pop bumpers where the sim has them: a skirt and a lit cap that flashes on a hit.
    for (const bumper of this.sim.bumpers) {
      const at = this.toDeck(bumper.at.x, bumper.at.y);
      const r = bumper.r * FIELD_W;
      const cap = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: accent, emissiveIntensity: 0.6, roughness: 0.4 });
      this.bumperCaps.push(cap);
      deck.add(cylinderMesh(r, 0.028, matte(0xeeeeee, 0.4), { x: at.x, y: FIELD_Y + 0.014, z: at.z }, { segments: 16 }));
      const top = cylinderMesh(r * 0.85, 0.01, cap, { x: at.x, y: FIELD_Y + 0.033, z: at.z }, { segments: 16 });
      top.castShadow = false;
      deck.add(top);
    }
    // Inserts: a lit dome at each top lane and each target, on when that one is lit.
    const insertAt = [...this.sim.lanes.map((x) => [x, 0.33] as const), ...this.sim.targets.map((y) => [0.09, y] as const)];
    const insertColors = [0xff2fa0, 0x33e0ff, 0xffe23a, 0x4dff7a, 0xff8a2a, 0xb05cff];
    insertAt.forEach(([x, y], i) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: insertColors[i]!, emissiveIntensity: 0, roughness: 0.3 });
      this.inserts.push(mat);
      const at = this.toDeck(x, y);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dome.position.set(at.x, FIELD_Y + 0.001, at.z);
      dome.castShadow = false;
      deck.add(dome);
    });
    // The flippers: bats turning about their pivots, and the steel ball.
    this.flippers = this.sim.flippers.map((f) => {
      const pivot = new THREE.Group();
      const at = this.toDeck(f.pivot.x, f.pivot.y);
      pivot.position.set(at.x, FIELD_Y + 0.009, at.z);
      const length = f.length * FIELD_W;
      const bat = boxMesh(length, 0.016, 0.012, matte(0xf4f1ea, 0.4), { x: length / 2 });
      pivot.add(bat, cylinderMesh(0.007, 0.02, matte(0xd23a3a, 0.4), {}, { segments: 10 }));
      deck.add(pivot);
      return pivot;
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * FIELD_W, 16, 12), STEEL_BALL);
    this.ball.castShadow = true;
    deck.add(this.ball);

    // Flipper buttons on both sides, the plunger on the right of the front, the coin door on the front face.
    for (const sx of [-1, 1]) {
      const button = cylinderMesh(0.018, 0.02, matte(0xd23a3a, 0.4), { x: sx * (BODY_W / 2 + 0.01), y: 0, z: BUTTON_Z }, { segments: 12 });
      button.rotation.z = Math.PI / 2;
      deck.add(button);
    }
    this.plunger = new THREE.Group();
    this.plunger.position.set(BODY_W / 2 - 0.06, 0.03, BODY_L / 2 + 0.06);
    const rod = cylinderMesh(0.008, 0.12, CHROME, {}, { segments: 8 });
    rod.rotation.x = Math.PI / 2;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), matte(0xd23a3a, 0.4));
    knob.position.z = 0.07;
    knob.castShadow = true;
    this.plunger.add(rod, knob);
    deck.add(this.plunger);
    deck.add(boxMesh(0.18, 0.14, 0.01, CHROME, { y: -0.02, z: BODY_L / 2 + 0.005 }));
    deck.add(boxMesh(0.04, 0.004, 0.012, BLACK, { x: -0.04, y: -0.02, z: BODY_L / 2 + 0.011 }));

    // The backbox standing on the back end, its lit backglass facing the player.
    const backTop = FRONT_TOP + RISE;
    this.add(boxMesh(BODY_W, BACKBOX_H, BACKBOX_D, paint, { y: backTop + BACKBOX_H / 2, z: -BODY_L / 2 + BACKBOX_D / 2 }));
    this.backglass = displayScreen([448, 512], [BODY_W - 0.06, BACKBOX_H - 0.08], { anisotropy: 4, color: 0xcccccc });
    const backglass = this.backglass.mesh;
    backglass.position.set(0, backTop + BACKBOX_H / 2, -BODY_L / 2 + BACKBOX_D + 0.002);
    this.add(backglass);
    // Out of order: a note over the score display.
    const note = outOfOrderNote();
    note.position.set(0.02, -0.06, 0.004);
    backglass.add(note);

    const hitbox = invisibleHitbox(BODY_W + 0.06, backTop + BACKBOX_H, BODY_L + 0.2, { y: (backTop + BACKBOX_H) / 2, z: 0.05 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh !== this.ball) mesh.receiveShadow = true;
    });
    this.speaker = new ChipSpeaker(backglass, wiring.listener);
    this.run = new MachineRun({
      game: this.game,
      input: wiring.input,
      speaker: this.speaker,
      stationEvents: this.stationEvents,
      nextPlayCost: wiring.nextPlayCost,
      pointsPerTicket: wiring.pointsPerTicket,
      scores: wiring.scores,
      note,
      ...(wiring.outOfOrder ? { outOfOrder: wiring.outOfOrder } : {}),
    });
    this.placeMovingParts();
    this.paintBackglass();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-BODY_W / 2 - 0.03, 0, -BODY_L / 2 - 0.02), new THREE.Vector3(BODY_W / 2 + 0.03, FRONT_TOP + RISE + BACKBOX_H, BODY_L / 2 + 0.16));
  }

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
    this.sim.reset();
    this.bestBeaten = false;
  }

  abort(): void {
    this.run.abort();
    this.sim.over = true;
    this.paintBackglass();
  }

  occupy(): boolean {
    if (!this.run.occupy()) return false;
    this.sim.reset();
    return true;
  }

  release(): void {
    if (this.run.release()) this.sim.over = true;
  }

  /** A hand on each flipper button, pushed in while that flipper is up. */
  handsAt(): readonly [THREE.Vector3, THREE.Vector3] {
    this.sim.flippers.forEach((f, i) => {
      const sx = i === 0 ? -1 : 1;
      const pressed = f.angle !== f.rest ? 0.012 : 0;
      this.deck.localToWorld(this.hands[i]!.set(sx * (BODY_W / 2 + HAND_OUT - pressed), 0.01, BUTTON_Z));
    });
    return this.hands;
  }

  eyePose(): { position: THREE.Vector3; yaw: number } {
    return eyePoseAt(this, EYE);
  }

  /** The middle of the lower playfield, where the eyes go while playing. */
  screenCentre(): THREE.Vector3 {
    return this.deck.localToWorld(this.toDeck(0.45, this.sim.length * 0.62));
  }

  // --- Interactable ---------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.backglass.material.color.setHex(hovered ? 0xffffff : 0xcccccc);
  }

  label(): string {
    return this.run.label({ attract: `Pinball · ${this.title} — click to insert a coin (${this.run.priceText()})`, playing: `Press ${actionKeyLabel('walkAway')} or click to walk away (the game is lost)` });
  }

  labelPlacement(): LabelPlacement {
    return this.run.labelPlacement();
  }

  activate(session: SessionActions): void {
    this.run.activate(session, this);
  }

  // --- Updatable ------------------------------------------------------------------------------

  update(dt: number): void {
    this.clock += dt;
    this.speaker.follow();
    this.run.update(dt);
    switch (this.state) {
      case 'playing': {
        const controls = this.run.readControls();
        this.sim.update(dt, { left: controls.left, right: controls.right, launch: controls.fire });
        this.playEvents();
        const best = this.wiring.scores.bestOf(this.game.id);
        if (!this.bestBeaten && this.sim.score > best && best > 0) {
          this.bestBeaten = true;
          this.speaker.play('best');
        }
        if (this.sim.over) this.run.finish(this.sim.score);
        break;
      }
      case 'demo':
        this.updateDemo(dt);
        break;
      case 'over':
      case 'attract':
        this.sim.update(dt, { left: false, right: false, launch: false });
        break;
      case 'initials':
        break;
    }
    this.placeMovingParts();
    this.lightUp();
    // The backglass: every frame while a game is on, a few times a second otherwise.
    this.displayClock += dt;
    if (this.state === 'playing' || this.state === 'initials' || this.state === 'over' || this.displayClock >= 1 / IDLE_FPS) {
      this.displayClock = 0;
      this.paintBackglass();
    }
  }

  dispose(): void {
    this.speaker.dispose();
  }

  private get state(): MachineState {
    return this.run.state;
  }

  private updateDemo(dt: number): void {
    if (this.sim.over) {
      this.run.regularResult(this.sim.score);
      if (this.run.regularPause(dt, REGULAR_PAUSE)) this.sim.reset();
      this.sim.update(dt, { left: false, right: false, launch: false });
      return;
    }
    // Pull the plunger for a moment, then let go.
    let launching = false;
    if (this.sim.waitingToLaunch) {
      this.demoHold += dt;
      launching = this.demoHold < 0.5 + (Math.sin(this.clock * 3.1) + 1) * 0.2;
      if (!launching) this.demoHold = 0;
    }
    this.sim.update(dt, this.sim.autopilot(REGULAR_SKILL, launching));
    this.playEvents();
  }

  private playEvents(): void {
    for (const event of this.sim.takeEvents()) {
      const sfx = SOUNDS[event];
      if (sfx) this.speaker.play(sfx);
    }
  }

  /** A point of the table (sim units) in the deck's frame, on the playfield's surface. */
  private toDeck(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set((x - 0.5) * FIELD_W, FIELD_Y, -FIELD_L / 2 + (y / this.sim.length) * FIELD_L + 0.01);
  }

  /** Ball, flippers and plunger follow the sim. */
  private placeMovingParts(): void {
    const { ball, flippers } = this.sim;
    this.toDeck(ball.x, ball.y, this.local);
    this.ball.position.set(this.local.x, FIELD_Y + BALL_R * FIELD_W, this.local.z);
    this.ball.visible = this.state !== 'attract' || this.sim.waitingToLaunch;
    flippers.forEach((f, i) => (this.flippers[i]!.rotation.y = -f.angle));
    this.plunger.position.z = BODY_L / 2 + 0.06 + this.sim.plunger * 0.05;
  }

  /** Inserts show what is lit (chasing round while nobody plays); bumper caps flash on a hit. */
  private lightUp(): void {
    const lit = [...this.sim.lanesLit, ...this.sim.targetsLit];
    const idle = this.state === 'attract';
    this.inserts.forEach((mat, i) => {
      mat.emissiveIntensity = idle ? Math.max(0, Math.sin(this.clock * 4 - i * 1.05)) * 1.8 : lit[i] ? 1.8 : 0.08;
    });
    this.sim.bumpers.forEach((b, i) => {
      const cap = this.bumperCaps[i]!;
      cap.emissiveIntensity = b.flash > 0 ? 3 : idle ? 0.5 + Math.max(0, Math.sin(this.clock * 6 + i * 2.1)) * 1.2 : 0.6;
    });
  }

  /** Title art at the top, the score display below (or the initials, or the end card), the ball in play at the bottom. */
  private paintBackglass(): void {
    const { ctx, canvas, texture } = this.backglass;
    const W = canvas.width;
    const H = canvas.height;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#120a24');
    sky.addColorStop(1, '#2a1140');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = i % 5 ? 'rgba(255,255,255,0.7)' : this.accent;
      ctx.fillRect((i * 7919) % W, (i * 104729) % (H * 0.55), 2, 2);
    }
    ctx.strokeStyle = this.accent;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (const [x, y] of [[60, 90], [300, 60], [380, 160]] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 70, y + 40);
      ctx.stroke();
      ctx.fillStyle = '#ffd6a0';
      ctx.beginPath();
      ctx.arc(x + 74, y + 42, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    drawText(ctx, this.title, W / 2, H * 0.3, 36, '#ffe680');

    const { entry, last, lastRank } = this.run;
    if (this.state === 'initials' && entry) {
      entry.draw(ctx, W / 2, H * 0.66, 1.5);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(30, H * 0.5, W - 60, 120);
      ctx.strokeStyle = '#6a5a9a';
      ctx.lineWidth = 3;
      ctx.strokeRect(30, H * 0.5, W - 60, 120);
      const top = this.wiring.scores.topOf(this.game.id);
      const live = this.state === 'playing' || this.state === 'demo';
      drawText(ctx, live && this.sim.multiplier > 1 ? `x${this.sim.multiplier}` : 'PLAYER 1', 60, H * 0.5 + 24, 12, '#c9c4ff', 'left');
      drawText(ctx, `HI ${top.name} ${format(top.score)}`, W - 60, H * 0.5 + 24, 12, '#c9c4ff', 'right');
      const score = this.state === 'attract' ? 0 : this.state === 'over' ? last.score : this.sim.score;
      drawText(ctx, format(score), W / 2, H * 0.5 + 76, 34, '#ff8a3a');
      const blink = Math.floor(this.clock * 3) % 2 === 0;
      if (this.state === 'over') {
        drawText(ctx, `${this.run.shownTickets} TICKETS`, W / 2, H * 0.8, 22, '#ffd23a');
        const note = lastRank !== null ? `${ordinal(lastRank + 1)} ON THE BOARD!` : last.best ? 'NEW BEST!' : 'GAME OVER';
        drawText(ctx, note, W / 2, H * 0.87, 16, blink ? '#7ee787' : '#ffffff');
        drawText(ctx, `SPACE: AGAIN (${this.run.priceText().toUpperCase()})`, W / 2, H * 0.94, 12, '#ffd6a0');
      } else if (this.state === 'attract') {
        drawText(ctx, 'GAME OVER', W / 2, H * 0.82, 20, '#ff4a4a');
        if (blink) drawText(ctx, 'INSERT COIN', W / 2, H * 0.9, 16, '#ffd6a0');
      } else if (this.sim.message) {
        drawText(ctx, this.sim.message.text, W / 2, H * 0.84, 22, blink ? '#ffffff' : '#ffe680');
      } else {
        const hint = this.sim.waitingToLaunch && this.state === 'playing' ? 'HOLD SPACE · LET GO' : `CREDITS ${this.state === 'demo' ? 1 : 0}`;
        drawText(ctx, `BALL ${this.sim.ballNumber}   ${hint}`, W / 2, H * 0.84, 14, '#ffd6a0');
      }
    }
    texture.needsUpdate = true;
  }

  /** The playfield: the table's art, then the sim's own walls, lanes, slingshots, targets and bumper rings over it. */
  private paintPlayfield(color: number, accent: THREE.Color, random: () => number): THREE.Texture {
    const L = this.sim.length;
    const W = FIELD_PX;
    const H = Math.round(W * L);
    const [canvas, ctx] = createCanvas(W, H);
    const base = new THREE.Color(color);
    ctx.fillStyle = `#${base.clone().multiplyScalar(1.6).getHexString()}`;
    ctx.fillRect(0, 0, W, H);
    const hex = `#${accent.getHexString()}`;
    // A ring of lit dots round the bumpers' area, and scattered stars.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      ctx.fillStyle = i % 2 ? hex : '#ffe680';
      ctx.beginPath();
      ctx.arc(0.45 * W + Math.cos(a) * 70, 0.82 * W + Math.sin(a) * 60, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + random() * 0.5})`;
      ctx.fillRect(random() * W, random() * H * 0.9, 2, 2);
    }
    // The shooter lane, darker.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0.88 * W, 0.62 * W, 0.1 * W, H);
    // Walls: white rails; slingshots in the accent.
    ctx.lineCap = 'round';
    for (const wall of this.sim.walls) {
      ctx.strokeStyle = wall.kick ? hex : '#eeeeee';
      ctx.lineWidth = wall.kick ? 7 : 5;
      ctx.beginPath();
      ctx.moveTo(wall.a.x * W, wall.a.y * W);
      ctx.lineTo(wall.b.x * W, wall.b.y * W);
      ctx.stroke();
    }
    // Lane arrows, target plates, bumper rings.
    ctx.fillStyle = '#ffe680';
    for (const x of this.sim.lanes) {
      ctx.beginPath();
      ctx.moveTo(x * W - 8, 0.3 * W);
      ctx.lineTo(x * W + 8, 0.3 * W);
      ctx.lineTo(x * W, 0.36 * W);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = hex;
    for (const y of this.sim.targets) ctx.fillRect(0.02 * W, y * W - 10, 8, 20);
    for (const b of this.sim.bumpers) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.at.x * W, b.at.y * W, b.r * W + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawText(ctx, this.title, 0.45 * W, 0.47 * W, 16, '#ffe680');
    return toTexture(canvas, 8);
  }
}

function format(n: number): string {
  return n.toLocaleString('en-US');
}
