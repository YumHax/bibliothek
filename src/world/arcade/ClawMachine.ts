import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, seededRandom, toTexture, FONT } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { drawText } from './games/ArcadeGame';

export interface ClawMachineOptions {
  /** Paint of the base and the top. Default a fairground pink. */
  color?: number;
  /** What clicking it gets the player told, one line at a time. */
  lines?: readonly string[];
  seed?: number;
}

const WIDTH = 0.8;
const DEPTH = 0.75;
const BASE_H = 0.8;
const CASE_H = 0.9;
const TOP_H = 0.22;
const TOTAL_H = BASE_H + CASE_H + TOP_H;
/** Where the gantry rails run, and how far the carriage may travel. */
const RAIL_Y = BASE_H + CASE_H - 0.06;
const TRAVEL_X = WIDTH / 2 - 0.14;
const TRAVEL_Z = DEPTH / 2 - 0.14;
/** The chute: the corner the claw returns to and lets go over. */
const CHUTE = new THREE.Vector3(-TRAVEL_X, 0, TRAVEL_Z);
const CLAW_UP = 0.1;
const CLAW_DOWN = CASE_H - 0.3;
const STAND_Z = DEPTH / 2 + 0.38;

const DEFAULT_LINES = ["It's rigged. It only grips on the tenth go.", 'The bear at the back has been there since the place opened.', 'Somebody won a keyring once. Once.'];
const CHROME = new THREE.MeshStandardMaterial({ color: 0xc4c7cc, metalness: 0.75, roughness: 0.25 });
const BLACK = matte(0x111116, 0.5);
const PASTELS = [0xffb3c6, 0xa8d8ff, 0xfff1a8, 0xc8f7c5, 0xe0c3ff, 0xffd6a8, 0xffffff];

type Phase = 'roam' | 'drop' | 'lift' | 'return' | 'release';

/**
 * A crane game: a lit case full of plush toys on a bright base, a joystick and a button at the
 * front, a prize chute in the corner, and a claw on a gantry that roams, drops, closes on nothing,
 * lifts and goes back over the chute to open, as they do. Clicking it gets a line
 * (`SessionActions.hint`). Origin on the floor under its centre, +z faces the room. Collides.
 */
export class ClawMachine extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  /** Local spot for whoever plays it, facing -z (the case). */
  readonly standAt = new THREE.Vector3(0, 0, STAND_Z);
  /** Local point where a player's eyes go: the claw's height, middle of the case. */
  readonly focus = new THREE.Vector3(0, BASE_H + CASE_H * 0.55, 0);
  private readonly lines: readonly string[];
  private nextLine = 0;
  private readonly marquee: THREE.MeshBasicMaterial;
  private readonly chaser: THREE.Texture;
  private readonly beam: THREE.Mesh;
  private readonly carriage: THREE.Group;
  private readonly cable: THREE.Mesh;
  private readonly prongs: THREE.Group[] = [];
  private readonly random: () => number;
  private phase: Phase = 'roam';
  private clock = 0;
  private phaseLeft: number;
  private drop = CLAW_UP;
  private grip = 0;
  private readonly from = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  constructor(options: ClawMachineOptions = {}) {
    super();
    this.name = 'ClawMachine';
    this.lines = options.lines ?? DEFAULT_LINES;
    this.random = seededRandom((options.seed ?? 1) * 4099);
    this.phaseLeft = 4 + this.random() * 4;
    const paint = matte(options.color ?? 0xd23a6a, 0.5);

    // Base: the box, a kick plate, the chute door with its chrome frame, the control panel.
    this.add(boxMesh(WIDTH, 0.06, DEPTH, BLACK, { y: 0.03 }));
    this.add(boxMesh(WIDTH, BASE_H - 0.06, DEPTH, paint, { y: 0.06 + (BASE_H - 0.06) / 2 }));
    this.add(boxMesh(0.3, 0.3, 0.02, CHROME, { x: -WIDTH / 2 + 0.22, y: 0.3, z: DEPTH / 2 + 0.006 }));
    this.add(boxMesh(0.25, 0.25, 0.02, new THREE.MeshStandardMaterial({ color: 0x8fb8d8, roughness: 0.1, transparent: true, opacity: 0.5 }), { x: -WIDTH / 2 + 0.22, y: 0.3, z: DEPTH / 2 + 0.012 }));
    const front = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.04, 0.26), new THREE.MeshStandardMaterial({ map: paintFront(options.color ?? 0xd23a6a), roughness: 0.6 }));
    front.position.set(0, BASE_H - 0.2, DEPTH / 2 + 0.002);
    this.add(front);
    const panel = boxMesh(0.4, 0.05, 0.16, BLACK, { x: 0.1, y: BASE_H + 0.02, z: DEPTH / 2 - 0.06 });
    panel.rotation.x = -0.2;
    this.add(panel);
    this.add(cylinderMesh(0.008, 0.1, CHROME, { x: 0, y: BASE_H + 0.09, z: DEPTH / 2 - 0.07 }, { segments: 8 }));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), matte(0xd23a3a, 0.4));
    ball.position.set(0, BASE_H + 0.15, DEPTH / 2 - 0.07);
    this.add(ball);
    this.add(cylinderMesh(0.02, 0.015, matte(0xffd23a, 0.4), { x: 0.16, y: BASE_H + 0.05, z: DEPTH / 2 - 0.08 }, { segments: 14 }));

    // The case: chrome posts at the corners, glass all round, a lit top with the marquee.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.add(boxMesh(0.03, CASE_H, 0.03, CHROME, { x: sx * (WIDTH / 2 - 0.015), y: BASE_H + CASE_H / 2, z: sz * (DEPTH / 2 - 0.015) }));
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xdde8ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
    const pane = (w: number, x: number, z: number, ry: number): void => {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, CASE_H), glassMat);
      glass.position.set(x, BASE_H + CASE_H / 2, z);
      glass.rotation.y = ry;
      glass.castShadow = false;
      this.add(glass);
    };
    pane(WIDTH - 0.06, 0, DEPTH / 2 - 0.005, 0);
    pane(WIDTH - 0.06, 0, -DEPTH / 2 + 0.005, Math.PI);
    pane(DEPTH - 0.06, -WIDTH / 2 + 0.005, 0, Math.PI / 2);
    pane(DEPTH - 0.06, WIDTH / 2 - 0.005, 0, -Math.PI / 2);
    this.add(boxMesh(WIDTH, TOP_H, DEPTH, paint, { y: BASE_H + CASE_H + TOP_H / 2 }));
    this.marquee = new THREE.MeshBasicMaterial({ map: paintMarquee(), toneMapped: false, color: 0xdddddd });
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.06, TOP_H - 0.1), this.marquee);
    marquee.position.set(0, BASE_H + CASE_H + TOP_H / 2, DEPTH / 2 + 0.002);
    this.add(marquee);
    // Chaser bulbs along the top and bottom edges of the marquee: a repeating strip whose texture slides.
    this.chaser = paintChaser();
    this.chaser.wrapS = THREE.RepeatWrapping;
    this.chaser.repeat.set(12, 1);
    const chaserMat = new THREE.MeshBasicMaterial({ map: this.chaser, toneMapped: false });
    for (const y of [BASE_H + CASE_H + 0.025, BASE_H + CASE_H + TOP_H - 0.025]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.06, 0.04), chaserMat);
      strip.position.set(0, y, DEPTH / 2 + 0.002);
      this.add(strip);
    }
    // The case is lit from the top: a strip and a small light so the plush reads through the glass.
    const strip = boxMesh(WIDTH - 0.1, 0.015, 0.03, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 2 }), { y: BASE_H + CASE_H - 0.01, z: -DEPTH / 2 + 0.06 });
    strip.castShadow = false;
    this.add(strip);
    const light = new THREE.PointLight(0xfff0dc, 1.4, 1.8, 2);
    light.position.set(0, BASE_H + CASE_H - 0.1, 0);
    light.castShadow = false;
    this.add(light);

    // The plush: heaps of soft blobs with heads and ears, in pastels, on the floor of the case.
    for (let i = 0; i < 11; i++) {
      const r = 0.06 + this.random() * 0.04;
      const x = (this.random() - 0.5) * (WIDTH - 0.3);
      const z = (this.random() - 0.5) * (DEPTH - 0.3);
      const y = BASE_H + r + (i > 7 ? r * 1.4 : 0);
      this.add(plush(r, PASTELS[Math.floor(this.random() * PASTELS.length)]!, x, y, z, this.random() * Math.PI * 2));
    }

    // The gantry: two rails along z, a beam across them carrying the carriage, the cable and the claw.
    for (const sx of [-1, 1]) this.add(boxMesh(0.02, 0.02, DEPTH - 0.1, CHROME, { x: sx * (WIDTH / 2 - 0.06), y: RAIL_Y }));
    this.beam = boxMesh(WIDTH - 0.12, 0.02, 0.02, CHROME, { y: RAIL_Y - 0.02 });
    this.add(this.beam);
    this.carriage = new THREE.Group();
    this.carriage.position.y = RAIL_Y - 0.05;
    this.carriage.add(boxMesh(0.08, 0.05, 0.08, BLACK));
    this.cable = cylinderMesh(0.003, 1, BLACK, {}, { segments: 6 });
    this.carriage.add(this.cable);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), CHROME);
    hub.name = 'hub';
    this.carriage.add(hub);
    for (let i = 0; i < 3; i++) {
      const prong = new THREE.Group();
      prong.rotation.y = (i / 3) * Math.PI * 2;
      const finger = boxMesh(0.012, 0.11, 0.02, CHROME, { y: -0.055, z: 0.02 });
      finger.rotation.x = 0.35;
      const tip = boxMesh(0.012, 0.05, 0.02, CHROME, { y: -0.12, z: 0.045 });
      tip.rotation.x = -0.3;
      prong.add(finger, tip);
      this.prongs.push(prong);
      this.carriage.add(prong);
    }
    this.add(this.carriage);
    this.placeClaw();

    const hitbox = invisibleHitbox(WIDTH + 0.04, TOTAL_H, DEPTH + 0.04, { y: TOTAL_H / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2 - 0.02, 0, -DEPTH / 2 - 0.02), new THREE.Vector3(WIDTH / 2 + 0.02, TOTAL_H, DEPTH / 2 + 0.04));
  }

  setHovered(hovered: boolean): void {
    this.marquee.color.setHex(hovered ? 0xffffff : 0xdddddd);
  }

  label(): string {
    return 'Claw machine — click';
  }

  activate(session: SessionActions): void {
    if (!this.lines.length) return;
    session.hint(this.lines[this.nextLine]!);
    this.nextLine = (this.nextLine + 1) % this.lines.length;
  }

  update(dt: number): void {
    this.clock += dt;
    this.chaser.offset.x -= dt * 0.6;
    this.phaseLeft -= dt;
    const c = this.carriage.position;
    switch (this.phase) {
      case 'roam': {
        // Wandering over the heap, joystick in someone's hand: eased towards a drifting target, so coming off the chute is smooth.
        const ease = Math.min(1, dt * 1.5);
        c.x += (Math.sin(this.clock * 0.6) * TRAVEL_X - c.x) * ease;
        c.z += (Math.cos(this.clock * 0.41) * TRAVEL_Z - c.z) * ease;
        this.grip += (0 - this.grip) * Math.min(1, dt * 3);
        if (this.phaseLeft <= 0) this.enter('drop', 1.4);
        break;
      }
      case 'drop':
        this.drop += ((CLAW_DOWN - this.drop) * dt) / Math.max(0.05, this.phaseLeft);
        if (this.phaseLeft <= 0.3) this.grip += (1 - this.grip) * Math.min(1, dt * 6);
        if (this.phaseLeft <= 0) this.enter('lift', 1.4);
        break;
      case 'lift':
        this.drop += ((CLAW_UP - this.drop) * dt) / Math.max(0.05, this.phaseLeft);
        if (this.phaseLeft <= 0) {
          this.from.copy(c);
          this.enter('return', 1.8);
        }
        break;
      case 'return': {
        const t = 1 - Math.max(0, this.phaseLeft / 1.8);
        this.target.copy(CHUTE);
        c.x = THREE.MathUtils.lerp(this.from.x, this.target.x, t);
        c.z = THREE.MathUtils.lerp(this.from.z, this.target.z, t);
        if (this.phaseLeft <= 0) this.enter('release', 1.2);
        break;
      }
      case 'release':
        // Opens over the chute: empty, as ever.
        this.grip += (0 - this.grip) * Math.min(1, dt * 4);
        if (this.phaseLeft <= 0) this.enter('roam', 4 + this.random() * 5);
        break;
    }
    this.placeClaw();
  }

  private enter(phase: Phase, seconds: number): void {
    this.phase = phase;
    this.phaseLeft = seconds;
  }

  /** The beam follows the carriage along the rails, the cable stretches to the claw, the prongs open or close. */
  private placeClaw(): void {
    this.beam.position.z = this.carriage.position.z;
    this.cable.scale.y = this.drop;
    this.cable.position.y = -this.drop / 2;
    const hub = this.carriage.getObjectByName('hub');
    if (hub) hub.position.y = -this.drop;
    for (const prong of this.prongs) {
      prong.position.y = -this.drop;
      prong.rotation.x = THREE.MathUtils.lerp(0.55, 0.05, this.grip);
    }
  }
}

/** A plush: a body sphere, a head on top, two ears; the plush's eyes as two dark dots facing `yaw`. */
function plush(r: number, color: number, x: number, y: number, z: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  const fur = matte(color, 1);
  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), fur);
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 14, 10), fur);
  head.position.set(0, r * 1.15, r * 0.2);
  head.castShadow = true;
  const dark = matte(0x222222, 0.4);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 8, 6), fur);
    ear.position.set(sx * r * 0.55, r * 1.75, r * 0.1);
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.09, 6, 5), dark);
    eye.position.set(sx * r * 0.28, r * 1.25, r * 0.85);
    g.add(eye);
  }
  g.add(body, head);
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  return g;
}

/** GRAB A PRIZE on a starburst. */
function paintMarquee(): THREE.Texture {
  const [canvas, ctx] = createCanvas(768, 128);
  const g = ctx.createLinearGradient(0, 0, 768, 0);
  g.addColorStop(0, '#ff2fa0');
  g.addColorStop(0.5, '#ffe23a');
  g.addColorStop(1, '#33e0ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 768, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(384, 64);
    ctx.lineTo(384 + Math.cos((i / 12) * Math.PI * 2) * 500, 64 + Math.sin((i / 12) * Math.PI * 2) * 500);
    ctx.lineTo(384 + Math.cos(((i + 0.5) / 12) * Math.PI * 2) * 500, 64 + Math.sin(((i + 0.5) / 12) * Math.PI * 2) * 500);
    ctx.closePath();
    ctx.fill();
  }
  drawText(ctx, 'GRAB A PRIZE!', 384, 66, 48, '#2a0f3a');
  return toTexture(canvas, 4);
}

/** One bulb per tile, lit at the left and fading right, so sliding the texture chases the lit one along. */
function paintChaser(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(64, 32);
  ctx.fillStyle = '#2a0f1a';
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = '#ffe680';
  ctx.beginPath();
  ctx.arc(16, 16, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6a4a2a';
  ctx.beginPath();
  ctx.arc(48, 16, 9, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The base's front print: the rules and the price. */
function paintFront(color: number): THREE.Texture {
  const [canvas, ctx] = createCanvas(760, 260);
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillRect(0, 0, 760, 260);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(40, 40, 680, 180);
  ctx.fillStyle = '#2a0f3a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 54px ${FONT}`;
  ctx.fillText('1 COIN = 1 TRY', 380, 100);
  ctx.font = `28px ${FONT}`;
  ctx.fillText('move the claw · press to drop · every play wins*', 380, 160);
  ctx.font = `18px ${FONT}`;
  ctx.fillText('*not every play wins', 380, 200);
  return toTexture(canvas, 4);
}
