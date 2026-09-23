import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import type { Interactable, LabelPlacement } from '@/interaction/Interactable';
import type { PlayerState, SessionActions } from '@/game/SessionActions';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox, type MeshPosition } from '../meshUtils';
import { matte } from '../props/Prop';
import { type ArcadeControls, type ArcadeGame, SCREEN_H, SCREEN_W, drawText } from './games/ArcadeGame';

export interface ArcadeCabinetOptions {
  /** Colour of the side panels. */
  color?: number;
  /** Colour of the marquee's glow and the light thrown on the player. */
  glow?: number;
  /** Where the best score comes from, for the attract screen. */
  scores?: { bestOf(gameId: string): number };
  /** Coins one play costs, for the caption. */
  playCost?: number;
  /** Score points per ticket, shown live by the game and on the attract screen. */
  pointsPerTicket?: number;
  /** What a score pays, for the end card's ticket count. */
  ticketsFor?: (score: number) => number;
}

/** What the cabinet tells whoever started the play, once the game is over. */
export type GameOverHandler = (score: number) => void;

type CabinetState = 'attract' | 'playing' | 'over';

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
/** Attract screen redraw rate; the game redraws every frame while playing. */
const ATTRACT_FPS = 6;
/** How long the end card takes to count the tickets up. */
const COUNT_UP_SECONDS = 1.2;

const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
const UP_KEYS = ['KeyW', 'ArrowUp'];
const DOWN_KEYS = ['KeyS', 'ArrowDown'];
const FIRE_KEYS = ['Space', 'Enter', 'NumpadEnter'];

const BLACK = matte(0x16161a, 0.5);
const PANEL = matte(0x2a2a30, 0.6);
const CHROME = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.6, roughness: 0.35 });

/**
 * An upright arcade cabinet running one `ArcadeGame` on a canvas painted onto its glass. Idle it
 * loops an attract screen (title, best score, INSERT COIN); clicked, it asks the Session to start a
 * play (`playArcade`), which parks the player in front of it and pays the coin; the game then reads
 * the keys straight from `Input` until it is over, and the cabinet reports the score. The end card
 * counts the tickets up and stays until the player replays or walks away. Local +z faces the
 * player; origin on the floor at the centre of the base.
 */
export class ArcadeCabinet extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  readonly game: ArcadeGame;

  private state: CabinetState = 'attract';
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly glow: THREE.PointLight;
  private readonly marquee: THREE.MeshBasicMaterial;
  /** The body's paint and the two side-art prints; all glow a little when hovered. */
  private readonly body: THREE.MeshStandardMaterial[];
  private readonly scores?: { bestOf(gameId: string): number };
  private readonly playCost: number;
  private readonly pointsPerTicket: number;
  private readonly ticketsFor: (score: number) => number;
  private readonly forward = new THREE.Vector3();
  private attractClock = 0;
  private attractPhase = 0;
  private overClock = 0;
  private lastScore = 0;
  private lastBest = false;
  private lastFire = false;
  private onOver: GameOverHandler | null = null;
  private hovered = false;

  constructor(game: ArcadeGame, private readonly input: Input, options: ArcadeCabinetOptions = {}) {
    super();
    this.name = `ArcadeCabinet:${game.id}`;
    this.game = game;
    this.scores = options.scores;
    this.playCost = options.playCost ?? 1;
    this.pointsPerTicket = options.pointsPerTicket ?? 50;
    this.ticketsFor = options.ticketsFor ?? ((score) => Math.floor(score / this.pointsPerTicket));
    const color = options.color ?? 0x2f4f8f;
    const glowColor = options.glow ?? 0x9ad6ff;

    const paint = matte(color, 0.55);
    const baseArt = new THREE.MeshStandardMaterial({ map: paintSideArt(color, glowColor, 'base'), roughness: 0.55 });
    const upperArt = new THREE.MeshStandardMaterial({ map: paintSideArt(color, glowColor, 'upper'), roughness: 0.55 });
    this.body = [paint, baseArt, upperArt];
    // Base with the control panel, the upper body set back over it, the marquee on top. The side
    // art goes on the two side faces (BoxGeometry material order: +x, -x, +y, -y, +z, -z).
    this.add(bodyBox(WIDTH, BASE_H, DEPTH, baseArt, paint, { y: BASE_H / 2, z: -0.02 }));
    const panel = boxMesh(WIDTH, 0.08, 0.3, PANEL, { y: BASE_H + 0.04, z: DEPTH / 2 - 0.12 });
    panel.rotation.x = -0.25;
    this.add(panel);
    const upperD = UPPER_DEPTH;
    this.add(bodyBox(WIDTH, TOTAL_H - BASE_H, upperD, upperArt, paint, { y: (BASE_H + TOTAL_H) / 2, z: -0.11 }));
    // Bezel: a dark slab the screen is set into, tilted back like the glass, standing proud of the body.
    const bezel = boxMesh(WIDTH - 0.02, SCREEN_HEIGHT + BEZEL_BORDER * 2, BEZEL_THICKNESS, BLACK, { y: SCREEN_Y, z: SCREEN_Z - BEZEL_THICKNESS / 2 - 0.002 });
    bezel.rotation.x = -SCREEN_TILT;
    this.add(bezel);
    // Kick plate and a chrome trim on the panel.
    this.add(boxMesh(WIDTH, 0.06, DEPTH, BLACK, { y: 0.03, z: -0.02 }));
    this.add(boxMesh(WIDTH, 0.015, 0.015, CHROME, { y: BASE_H + 0.085, z: DEPTH / 2 + 0.02 }));
    // Joystick and two buttons on the panel.
    const stick = cylinderMesh(0.008, 0.08, CHROME, { x: -0.14, y: BASE_H + 0.11, z: DEPTH / 2 - 0.1 }, { segments: 10 });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), matte(0xd23a3a, 0.4));
    knob.position.set(-0.14, BASE_H + 0.16, DEPTH / 2 - 0.1);
    const buttonA = cylinderMesh(0.018, 0.015, matte(0xffd23a, 0.4), { x: 0.06, y: BASE_H + 0.085, z: DEPTH / 2 - 0.1 }, { segments: 14 });
    const buttonB = cylinderMesh(0.018, 0.015, matte(0x3ad2a0, 0.4), { x: 0.13, y: BASE_H + 0.085, z: DEPTH / 2 - 0.13 }, { segments: 14 });
    this.add(stick, knob, buttonA, buttonB);

    // The glass: a canvas texture, unlit so it reads as a lit screen whatever the room's light.
    this.canvas = createCanvas(SCREEN_W, SCREEN_H)[0];
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    screen.position.set(0, SCREEN_Y, SCREEN_Z);
    screen.rotation.x = -SCREEN_TILT;
    this.add(screen);

    // Marquee: the title on a glowing strip.
    this.marquee = new THREE.MeshBasicMaterial({ map: this.paintMarquee(color, glowColor), toneMapped: false });
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.04, 0.16), this.marquee);
    marquee.position.set(0, TOTAL_H - 0.1, -0.11 + upperD / 2 + 0.002);
    this.add(marquee);

    // Screen light thrown at the player; no shadows (six passes for a soft glow is not worth it).
    this.glow = new THREE.PointLight(glowColor, 0.6, 2.5, 2);
    this.glow.position.set(0, SCREEN_Y, 0.5);
    this.add(this.glow);

    const hitbox = invisibleHitbox(WIDTH + 0.04, TOTAL_H, DEPTH + 0.04, { y: TOTAL_H / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);

    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh !== screen && mesh !== marquee) mesh.receiveShadow = true;
    });
    this.drawAttract();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, -DEPTH / 2), new THREE.Vector3(WIDTH / 2, TOTAL_H, DEPTH / 2));
  }

  get isPlaying(): boolean {
    return this.state === 'playing';
  }

  /** Starts a play (the coin has been paid); `onOver` is told the final score once. */
  start(onOver: GameOverHandler): void {
    this.game.reset({ best: this.scores?.bestOf(this.game.id) ?? 0, pointsPerTicket: this.pointsPerTicket });
    this.onOver = onOver;
    this.state = 'playing';
    this.lastFire = true; // the click that started us must not count as a fire press
  }

  /** The player walked away: a running game is lost without payout; a game-over card goes straight back to attract. */
  abort(): void {
    this.onOver = null;
    this.state = 'attract';
    this.drawAttract();
  }

  /** World-space eye position and yaw for someone standing at the controls, facing the screen. */
  eyePose(): { position: THREE.Vector3; yaw: number } {
    const position = this.localToWorld(new THREE.Vector3(0, PLAY_EYE_HEIGHT, PLAY_DISTANCE));
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
  }

  label(_player: PlayerState): string {
    const coin = `${this.playCost} coin${this.playCost > 1 ? 's' : ''}`;
    if (this.state === 'playing') return 'Press E or click to walk away (the play is lost)';
    if (this.state === 'over') return `Space or click to play again (${coin}) · E to walk away`;
    return `${this.game.title} — click to insert a coin (${coin})`;
  }

  labelPlacement(): LabelPlacement {
    return this.state === 'attract' ? 'crosshair' : 'edge';
  }

  activate(session: SessionActions): void {
    session.playArcade(this);
  }

  // --- Updatable ------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.state === 'playing') {
      this.game.update(dt, this.readControls());
      this.game.draw(this.ctx);
      this.texture.needsUpdate = true;
      this.glow.intensity = 0.9 + Math.sin(performance.now() * 0.02) * 0.15;
      if (this.game.over) this.finish();
      return;
    }
    this.glow.intensity = this.hovered ? 0.8 : 0.5;
    if (this.state === 'over') {
      this.overClock += dt;
      this.game.draw(this.ctx);
      this.drawGameOver();
      this.texture.needsUpdate = true;
      return;
    }
    this.attractClock += dt;
    if (this.attractClock >= 1 / ATTRACT_FPS) {
      this.attractClock = 0;
      this.attractPhase += 1;
      this.drawAttract();
    }
  }

  private finish(): void {
    this.lastScore = this.game.score;
    this.lastBest = this.lastScore > 0 && this.lastScore >= (this.scores?.bestOf(this.game.id) ?? 0);
    this.state = 'over';
    this.overClock = 0;
    const handler = this.onOver;
    this.onOver = null;
    handler?.(this.lastScore); // records the best before the card reads it
  }

  private readControls(): ArcadeControls {
    const fire = this.input.isDown(...FIRE_KEYS);
    const controls: ArcadeControls = {
      left: this.input.isDown(...LEFT_KEYS),
      right: this.input.isDown(...RIGHT_KEYS),
      up: this.input.isDown(...UP_KEYS),
      down: this.input.isDown(...DOWN_KEYS),
      fire,
      firePressed: fire && !this.lastFire,
    };
    this.lastFire = fire;
    return controls;
  }

  // --- Screens --------------------------------------------------------------------------------

  private drawAttract(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#07070c';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // Scanlines.
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 0; y < SCREEN_H; y += 4) ctx.fillRect(0, y, SCREEN_W, 1);
    drawText(ctx, this.game.title, SCREEN_W / 2, 60, 20, '#fff2a8');
    drawText(ctx, this.game.summary, SCREEN_W / 2, 90, 7, '#9ad6ff');
    const best = this.scores?.bestOf(this.game.id) ?? 0;
    drawText(ctx, best > 0 ? `BEST ${best}  (${this.ticketsFor(best)} TIX)` : 'NO SCORE YET', SCREEN_W / 2, 125, 10, '#c9c4ff');
    if (this.attractPhase % 2 === 0) drawText(ctx, 'INSERT COIN', SCREEN_W / 2, 170, 12, '#ff8a80');
    drawText(ctx, `${this.playCost} COIN PER PLAY · ${this.pointsPerTicket} PTS = 1 TICKET`, SCREEN_W / 2, 215, 7, '#7a7a90');
    this.texture.needsUpdate = true;
  }

  /** Over the game's frozen last frame: the score, the tickets counting up, and how to go again. */
  private drawGameOver(): void {
    const ctx = this.ctx;
    const tickets = this.ticketsFor(this.lastScore);
    const progress = Math.min(1, this.overClock / COUNT_UP_SECONDS);
    const shown = Math.floor(tickets * progress);
    const done = progress >= 1;
    ctx.fillStyle = 'rgba(5,5,10,0.88)';
    ctx.fillRect(16, 48, SCREEN_W - 32, 150);
    drawText(ctx, `SCORE ${this.lastScore}`, SCREEN_W / 2, 72, 12, '#fff2a8');
    drawText(ctx, `${shown}`, SCREEN_W / 2, 112, done ? 30 : 26, done ? '#ffd23a' : '#ffe9a0');
    drawText(ctx, tickets === 1 ? 'TICKET' : 'TICKETS', SCREEN_W / 2, 138, 9, '#ffd23a');
    if (this.lastBest && done) drawText(ctx, 'NEW BEST!', SCREEN_W / 2, 160, 11, Math.floor(this.overClock * 4) % 2 === 0 ? '#7ee787' : '#ffffff');
    if (done && Math.floor(this.overClock * 2) % 2 === 0) drawText(ctx, 'SPACE · PLAY AGAIN', SCREEN_W / 2, 186, 8, '#ff8a80');
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
    drawText(ctx, this.game.title, 256, 66, 44, '#fffbe6');
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

/**
 * The printed side panel: the cabinet's colour with the game's glow swept across it as a pair of
 * curved bands, a scatter of stars, a darker band at the bottom. The `upper` body's swoosh rises
 * towards the front top; the `base` gets the tail of it and the kick band. Mirrored on the other
 * side, as printed side art is.
 */
function paintSideArt(color: number, glow: number, part: 'base' | 'upper'): THREE.CanvasTexture {
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
  const random = seededRandom(color ^ glow);
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
  }
  // A worn edge: the print rubbed at the front corner, where hands and hips go.
  const wear = ctx.createRadialGradient(0, H * 0.6, 0, 0, H * 0.6, W * 0.5);
  wear.addColorStop(0, 'rgba(255,255,255,0.10)');
  wear.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = wear;
  ctx.fillRect(0, 0, W, H);
  return toTexture(canvas, 4);
}
