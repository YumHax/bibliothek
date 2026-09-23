import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { drawText } from './games/ArcadeGame';

export interface PinballOptions {
  /** The table's name, on the backglass. Default METEOR ALLEY. */
  title?: string;
  /** Paint of the cabinet. Default a deep purple. */
  color?: number;
  /** Accent of the art (the backglass, the playfield). Default orange. */
  accent?: number;
  /** What clicking it gets the player told, one line at a time. */
  lines?: readonly string[];
  seed?: number;
}

const BODY_W = 0.56;
const BODY_L = 1.3;
const BODY_H = 0.22;
/** Height of the top of the cabinet at the front edge; the back is `RISE` higher. */
const FRONT_TOP = 0.78;
const RISE = 0.16;
const TILT = Math.atan2(RISE, BODY_L);
const BACKBOX_H = 0.72;
const BACKBOX_D = 0.24;
/** Where the player stands: `standAt` is stall-local, in front of the flipper buttons. */
const STAND_Z = BODY_L / 2 + 0.38;
/** The backglass repaints its score display this often. */
const DISPLAY_FPS = 3;

const DEFAULT_LINES = ["It's taken. Watch the multiball.", 'Tilts if you so much as breathe on it.', 'The left flipper is soft. Everyone knows the left flipper is soft.'];
const CHROME = new THREE.MeshStandardMaterial({ color: 0xc4c7cc, metalness: 0.75, roughness: 0.25 });
const BLACK = matte(0x111116, 0.5);

/**
 * A pinball table on four chrome legs: the sloping cabinet under glass with a painted
 * playfield, pop bumpers and blinking inserts, flipper buttons on the sides, the plunger, and a
 * backbox whose backglass shows a live score that climbs (someone is playing) and now and then
 * TILTs. Clicking it gets a line (`SessionActions.hint`). Origin on the floor under the middle of
 * the cabinet, +z towards the player's end. Collides.
 */
export class Pinball extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  /** Local spot for whoever plays it, facing -z (the machine). */
  readonly standAt = new THREE.Vector3(0, 0, STAND_Z);
  /** Local point where a player's eyes go: the middle of the playfield. */
  readonly focus = new THREE.Vector3(0, FRONT_TOP + RISE / 2, 0);
  private readonly lines: readonly string[];
  private nextLine = 0;
  private readonly inserts: THREE.MeshStandardMaterial[] = [];
  private readonly bumpers: THREE.MeshStandardMaterial[] = [];
  private readonly backglass: THREE.MeshBasicMaterial;
  private readonly glassCanvas: HTMLCanvasElement;
  private readonly glassCtx: CanvasRenderingContext2D;
  private readonly glassTexture: THREE.CanvasTexture;
  private readonly title: string;
  private readonly accent: string;
  private readonly random: () => number;
  private clock = 0;
  private displayClock = 0;
  private score = 0;
  private best: number;
  private tiltLeft = 0;
  private ball = 1;

  constructor(options: PinballOptions = {}) {
    super();
    this.name = 'Pinball';
    this.title = options.title ?? 'METEOR ALLEY';
    this.lines = options.lines ?? DEFAULT_LINES;
    this.random = seededRandom((options.seed ?? 1) * 6151);
    this.best = 1_250_000 + Math.floor(this.random() * 3_000_000);
    const paint = matte(options.color ?? 0x3a1f5c, 0.5);
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
    this.add(deck);
    deck.add(boxMesh(BODY_W, BODY_H, BODY_L, paint));
    // Side art: a stripe in the accent along each side.
    const stripe = matte(accent, 0.5);
    for (const sx of [-1, 1]) deck.add(boxMesh(0.004, 0.05, BODY_L - 0.1, stripe, { x: sx * (BODY_W / 2 + 0.002), y: 0.02 }));
    // Playfield under glass, sunk a little below the rails.
    const fieldW = BODY_W - 0.06;
    const fieldL = BODY_L - 0.08;
    const field = new THREE.Mesh(new THREE.PlaneGeometry(fieldW, fieldL), new THREE.MeshBasicMaterial({ map: paintPlayfield(fieldW, fieldL, options.color ?? 0x3a1f5c, accent, this.random), toneMapped: false, color: 0x9a9a9a }));
    field.rotation.x = -Math.PI / 2;
    field.position.set(0, BODY_H / 2 - 0.04, 0.01);
    deck.add(field);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(fieldW, fieldL), new THREE.MeshStandardMaterial({ color: 0xdde8ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16 }));
    glass.rotation.x = -Math.PI / 2;
    glass.position.set(0, BODY_H / 2 + 0.002, 0.01);
    glass.castShadow = false;
    deck.add(glass);
    // Side rails and the lockdown bar across the front.
    for (const sx of [-1, 1]) deck.add(boxMesh(0.03, 0.012, BODY_L, CHROME, { x: sx * (BODY_W / 2 - 0.015), y: BODY_H / 2 + 0.006 }));
    deck.add(boxMesh(BODY_W, 0.03, 0.06, CHROME, { y: BODY_H / 2 + 0.015, z: BODY_L / 2 - 0.03 }));
    // Bumpers (a cylinder with a lit cap) and inserts (small lit domes) on the playfield.
    for (const [x, z] of [[-0.1, -0.35], [0.1, -0.35], [0, -0.2]] as const) {
      const cap = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: accent, emissiveIntensity: 0.6, roughness: 0.4 });
      this.bumpers.push(cap);
      deck.add(cylinderMesh(0.035, 0.03, matte(0xeeeeee, 0.4), { x, y: BODY_H / 2 - 0.025, z }, { segments: 14 }));
      const top = cylinderMesh(0.03, 0.012, cap, { x, y: BODY_H / 2 - 0.004, z }, { segments: 14 });
      top.castShadow = false;
      deck.add(top);
    }
    const insertColors = [0xff2fa0, 0x33e0ff, 0xffe23a, 0x4dff7a, 0xff8a2a, 0xb05cff];
    insertColors.forEach((c, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0, roughness: 0.3 });
      this.inserts.push(mat);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dome.position.set(-0.18 + (i % 3) * 0.18, BODY_H / 2 - 0.038, 0.05 + Math.floor(i / 3) * 0.2);
      dome.castShadow = false;
      deck.add(dome);
    });
    // Flipper buttons on both sides, the plunger on the right of the front, the coin door on the front face.
    for (const sx of [-1, 1]) {
      const button = cylinderMesh(0.018, 0.02, matte(0xd23a3a, 0.4), { x: sx * (BODY_W / 2 + 0.01), y: 0, z: BODY_L / 2 - 0.16 }, { segments: 12 });
      button.rotation.z = Math.PI / 2;
      deck.add(button);
    }
    const plunger = cylinderMesh(0.008, 0.12, CHROME, { x: BODY_W / 2 - 0.06, y: 0.03, z: BODY_L / 2 + 0.06 }, { segments: 8 });
    plunger.rotation.x = Math.PI / 2;
    deck.add(plunger);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), matte(0xd23a3a, 0.4));
    knob.position.set(BODY_W / 2 - 0.06, 0.03, BODY_L / 2 + 0.13);
    knob.castShadow = true;
    deck.add(knob);
    deck.add(boxMesh(0.18, 0.14, 0.01, CHROME, { y: -0.02, z: BODY_L / 2 + 0.005 }));
    deck.add(boxMesh(0.04, 0.004, 0.012, BLACK, { x: -0.04, y: -0.02, z: BODY_L / 2 + 0.011 }));

    // The backbox standing on the back end, its lit backglass facing the player.
    const backTop = FRONT_TOP + RISE;
    const backbox = boxMesh(BODY_W, BACKBOX_H, BACKBOX_D, paint, { y: backTop + BACKBOX_H / 2, z: -BODY_L / 2 + BACKBOX_D / 2 });
    this.add(backbox);
    this.glassCanvas = createCanvas(448, 512)[0];
    this.glassCtx = this.glassCanvas.getContext('2d')!;
    this.glassTexture = new THREE.CanvasTexture(this.glassCanvas);
    this.glassTexture.colorSpace = THREE.SRGBColorSpace;
    this.glassTexture.anisotropy = 4;
    this.backglass = new THREE.MeshBasicMaterial({ map: this.glassTexture, toneMapped: false, color: 0xcccccc });
    const backglass = new THREE.Mesh(new THREE.PlaneGeometry(BODY_W - 0.06, BACKBOX_H - 0.08), this.backglass);
    backglass.position.set(0, backTop + BACKBOX_H / 2, -BODY_L / 2 + BACKBOX_D + 0.002);
    this.add(backglass);
    this.paintBackglass();

    const hitbox = invisibleHitbox(BODY_W + 0.06, backTop + BACKBOX_H, BODY_L + 0.2, { y: (backTop + BACKBOX_H) / 2, z: 0.05 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-BODY_W / 2 - 0.03, 0, -BODY_L / 2 - 0.02), new THREE.Vector3(BODY_W / 2 + 0.03, FRONT_TOP + RISE + BACKBOX_H, BODY_L / 2 + 0.16));
  }

  setHovered(hovered: boolean): void {
    this.backglass.color.setHex(hovered ? 0xffffff : 0xcccccc);
  }

  label(): string {
    return `Pinball · ${this.title} — click`;
  }

  activate(session: SessionActions): void {
    if (!this.lines.length) return;
    session.hint(this.lines[this.nextLine]!);
    this.nextLine = (this.nextLine + 1) % this.lines.length;
  }

  update(dt: number): void {
    this.clock += dt;
    // Inserts chase round; bumpers pulse, and flare when the score jumps.
    this.inserts.forEach((mat, i) => {
      mat.emissiveIntensity = Math.max(0, Math.sin(this.clock * 4 - i * 1.05)) * 1.8;
    });
    for (const [i, cap] of this.bumpers.entries()) cap.emissiveIntensity = 0.5 + Math.max(0, Math.sin(this.clock * 6 + i * 2.1)) * 1.2;

    this.displayClock += dt;
    if (this.displayClock < 1 / DISPLAY_FPS) return;
    this.displayClock = 0;
    if (this.tiltLeft > 0) {
      this.tiltLeft -= 1 / DISPLAY_FPS;
      if (this.tiltLeft <= 0) {
        this.ball = this.ball % 3 + 1;
        if (this.ball === 1) this.score = 0;
      }
    } else {
      // Someone is playing: the score climbs in lumps, and now and then they tilt it.
      this.score += Math.floor(this.random() * 6) * 1500 + (this.random() < 0.15 ? 25_000 : 0);
      if (this.score > this.best) this.best = this.score;
      if (this.random() < 0.04) this.tiltLeft = 1.6;
    }
    this.paintBackglass();
  }

  /** Title art at the top, the score display below, TILT or the ball in play at the bottom. */
  private paintBackglass(): void {
    const ctx = this.glassCtx;
    const W = this.glassCanvas.width;
    const H = this.glassCanvas.height;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#120a24');
    sky.addColorStop(1, '#2a1140');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // Art: a starfield with a few streaking meteors, the same every repaint (seeded by position).
    for (let i = 0; i < 90; i++) {
      const x = ((i * 7919) % W);
      const y = ((i * 104729) % (H * 0.55));
      ctx.fillStyle = i % 5 ? 'rgba(255,255,255,0.7)' : this.accent;
      ctx.fillRect(x, y, 2, 2);
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
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(30, H * 0.5, W - 60, 120);
    ctx.strokeStyle = '#6a5a9a';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, H * 0.5, W - 60, 120);
    drawText(ctx, 'PLAYER 1', 60, H * 0.5 + 24, 12, '#c9c4ff', 'left');
    drawText(ctx, `HI ${format(this.best)}`, W - 60, H * 0.5 + 24, 12, '#c9c4ff', 'right');
    drawText(ctx, format(this.score), W / 2, H * 0.5 + 76, 34, '#ff8a3a');
    if (this.tiltLeft > 0) drawText(ctx, 'TILT', W / 2, H * 0.84, 40, Math.floor(this.tiltLeft * 6) % 2 ? '#ff4a4a' : '#ffffff');
    else drawText(ctx, `BALL ${this.ball}   CREDITS 2`, W / 2, H * 0.84, 14, '#ffd6a0');
    this.glassTexture.needsUpdate = true;
  }
}

function format(n: number): string {
  return n.toLocaleString('en-US');
}

/** The playfield: lanes, arches, the outhole, target banks and dots of light, all in the table's colours. */
function paintPlayfield(wM: number, lM: number, color: number, accent: THREE.Color, random: () => number): THREE.Texture {
  const W = 256;
  const H = Math.round((W * lM) / wM);
  const [canvas, ctx] = createCanvas(W, H);
  const base = new THREE.Color(color);
  ctx.fillStyle = `#${base.clone().multiplyScalar(1.6).getHexString()}`;
  ctx.fillRect(0, 0, W, H);
  const hex = `#${accent.getHexString()}`;
  // Lanes down both sides and the arch across the top.
  ctx.strokeStyle = '#eeeeee';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(18, H);
  ctx.lineTo(18, 60);
  ctx.quadraticCurveTo(W / 2, -30, W - 18, 60);
  ctx.lineTo(W - 18, H);
  ctx.stroke();
  // A ring of lit dots round the bumpers' area and target banks either side.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ctx.fillStyle = i % 2 ? hex : '#ffe680';
    ctx.beginPath();
    ctx.arc(W / 2 + Math.cos(a) * 60, H * 0.3 + Math.sin(a) * 50, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = hex;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(34, H * 0.42 + i * 16, 14, 10);
    ctx.fillRect(W - 48, H * 0.42 + i * 16, 14, 10);
  }
  // Slingshots and the flipper gap at the bottom.
  ctx.fillStyle = '#eeeeee';
  ctx.beginPath();
  ctx.moveTo(40, H - 120);
  ctx.lineTo(70, H - 60);
  ctx.lineTo(40, H - 60);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W - 40, H - 120);
  ctx.lineTo(W - 70, H - 60);
  ctx.lineTo(W - 40, H - 60);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hex;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(72, H - 38);
  ctx.lineTo(W / 2 - 16, H - 22);
  ctx.moveTo(W - 72, H - 38);
  ctx.lineTo(W / 2 + 16, H - 22);
  ctx.stroke();
  // Scattered small stars.
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + random() * 0.5})`;
    ctx.fillRect(random() * W, random() * H * 0.9, 2, 2);
  }
  return toTexture(canvas, 4);
}
