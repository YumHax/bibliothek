import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import { createCanvas, fitFontSize, seededRandom, toTexture, MONO } from '@/covers/generated/canvasUtils';
import type { Furniture, OccupancyAware } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { matte } from '../props/Prop';
import { crtScreenMaterial } from '../arcade/crtScreen';

export interface DemoTellyOptions {
  /** The game whose attract loop it shows (e.g. "SUPER GAME"). */
  title: string;
  /** Case colour: a beige or a black plastic. Default beige. */
  color?: number;
}

const W = 0.3;
const H = 0.26;
const D = 0.3;
/** The picture: a 10-inch tube, offset left of the control strip. */
const SCREEN_W = 0.19;
const SCREEN_H = 0.145;
const SCREEN_X = -0.035;
/** The canvas is a low-resolution frame, repainted at a low rate like an old console's attract mode. */
const PX_W = 160;
const PX_H = 120;
const FPS = 12;
/** The loop: the title screen, then the high-score table. */
const TITLE_S = 7;
const SCORES_S = 3.5;
const STARS = 40;
const SCORES = [['AAA', 50000], ['KEN', 42300], ['MAX', 31850], ['JOE', 20400], ['CAT', 9990]] as const;
const PALETTE = ['#ff4a4a', '#ffb84a', '#fff04a', '#4aff8a', '#4ad8ff', '#b84aff'];

/**
 * A 10-inch portable CRT on a stall, running a game's attract loop: a starfield scrolling behind
 * the title (painted in `options.title`) bouncing sprite-like, a blinking PRESS START, then a
 * high-score table, repainted at a low frame rate on a canvas under the arcade's CRT glass
 * (`crtScreenMaterial`). A power LED, knobs down the side, a handle and a telescopic aerial.
 * Clicking it switches it off (black glass) and on. Paints only while the player is in its zone.
 * Origin under the middle of its base, +z the screen. Decoration: never collides.
 */
export class DemoTelly extends THREE.Group implements Furniture, Updatable, Interactable, OccupancyAware {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly title: string;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly led: THREE.MeshStandardMaterial;
  private readonly stars: { x: number; y: number; speed: number }[] = [];
  private on = true;
  private occupied = false;
  private time = 0;
  private sinceFrame = Infinity;

  constructor(options: DemoTellyOptions) {
    super();
    this.name = 'DemoTelly';
    this.title = options.title;
    const plastic = matte(options.color ?? 0xd8ccb0, 0.55);
    const dark = matte(0x1a1a1a, 0.6);
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.25, metalness: 0.9 });

    // The case: the front box, and a tapered back (the tube's neck) as a smaller box behind.
    this.add(boxMesh(W, H, D * 0.62, plastic, { y: H / 2, z: D / 2 - (D * 0.62) / 2 }));
    this.add(boxMesh(W * 0.72, H * 0.78, D * 0.4, plastic, { y: H * 0.42, z: -D / 2 + (D * 0.4) / 2 }));
    // A dark bezel round the glass, the glass itself, a control strip at the right.
    const front = D / 2;
    this.add(boxMesh(SCREEN_W + 0.03, SCREEN_H + 0.03, 0.006, dark, { x: SCREEN_X, y: H * 0.54, z: front + 0.003 }));
    [this.canvas, this.ctx] = createCanvas(PX_W, PX_H);
    this.texture = toTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), crtScreenMaterial(this.texture, { lines: PX_H, bend: 0.08 }));
    screen.position.set(SCREEN_X, H * 0.54, front + 0.0065);
    screen.castShadow = false;
    this.add(screen);
    const stripX = W / 2 - 0.035;
    for (const [i, y] of [H * 0.72, H * 0.54].entries()) {
      const knob = cylinderMesh(0.012, 0.014, i ? chrome : dark, { x: stripX, y, z: front + 0.007 }, { segments: 12 });
      knob.rotation.x = Math.PI / 2;
      this.add(knob);
    }
    // The speaker grille and the power LED.
    for (let r = 0; r < 4; r++) this.add(boxMesh(0.03, 0.003, 0.002, dark, { x: stripX, y: H * 0.3 - r * 0.01, z: front + 0.001 }));
    this.led = new THREE.MeshStandardMaterial({ color: 0x401010, emissive: 0xff3020, emissiveIntensity: 1.5 });
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.004, 10), this.led);
    led.position.set(stripX, H * 0.12, front + 0.001);
    this.add(led);
    // The carrying handle and the aerial.
    this.add(boxMesh(W * 0.6, 0.012, 0.02, dark, { y: H + 0.03, z: 0.03 }));
    for (const x of [-W * 0.3, W * 0.3]) this.add(boxMesh(0.015, 0.03, 0.02, dark, { x, y: H + 0.015, z: 0.03 }));
    const mast = new THREE.Group();
    mast.position.set(W / 2 - 0.04, H, -0.05);
    mast.rotation.set(-0.2, 0, -0.45);
    mast.add(cylinderMesh(0.0025, 0.34, chrome, { y: 0.17 }, { segments: 6 }));
    mast.add(new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), chrome).translateY(0.34));
    this.add(mast);

    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh !== screen) mesh.castShadow = true;
    });

    const random = seededRandom(31337);
    for (let i = 0; i < STARS; i++) this.stars.push({ x: random() * PX_W, y: random() * PX_H, speed: 10 + random() * 40 });
    this.paint();
    const hitbox = invisibleHitbox(W + 0.04, H + 0.06, D + 0.04, { y: (H + 0.06) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
  }

  update(dt: number): void {
    if (!this.on || !this.occupied) return;
    this.time += dt;
    this.sinceFrame += dt;
    if (this.sinceFrame < 1 / FPS) return;
    this.sinceFrame = 0;
    this.paint();
  }

  setHovered(_hovered: boolean): void {}

  label(): string {
    return this.on ? 'Click to switch the telly off' : 'Click to switch the telly on';
  }

  activate(): void {
    this.on = !this.on;
    this.led.emissiveIntensity = this.on ? 1.5 : 0;
    this.sinceFrame = Infinity;
    this.paint();
  }

  /** One frame of the loop (or black glass when off). */
  private paint(): void {
    const { ctx } = this;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, PX_W, PX_H);
    if (this.on) {
      const t = this.time % (TITLE_S + SCORES_S);
      if (t < TITLE_S) this.paintTitle(t);
      else this.paintScores();
    }
    this.texture.needsUpdate = true;
  }

  /** Stars streaming down, the title bouncing and cycling colours, a blinking PRESS START, a copyright line. */
  private paintTitle(t: number): void {
    const { ctx } = this;
    for (const star of this.stars) {
      const y = (star.y + this.time * star.speed) % PX_H;
      ctx.fillStyle = star.speed > 35 ? '#ffffff' : star.speed > 22 ? '#a0a0c0' : '#505070';
      ctx.fillRect(Math.floor(star.x), Math.floor(y), star.speed > 35 ? 2 : 1, star.speed > 35 ? 2 : 1);
    }
    const bounce = Math.abs(Math.sin(t * 2.4)) * 10;
    const y = 40 - bounce;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFontSize(ctx, this.title, PX_W - 16, 22, 8, MONO, 'bold');
    // A chunky drop shadow, then the letters, each its own colour cycling along.
    ctx.fillStyle = '#301060';
    ctx.fillText(this.title, PX_W / 2 + 2, y + 2);
    const letters = [...this.title];
    const full = ctx.measureText(this.title).width;
    let x = PX_W / 2 - full / 2;
    ctx.textAlign = 'left';
    letters.forEach((ch, i) => {
      ctx.fillStyle = PALETTE[(i + Math.floor(t * 6)) % PALETTE.length]!;
      ctx.fillText(ch, x, y + Math.sin(t * 5 + i * 0.6) * 1.5);
      x += ctx.measureText(ch).width;
    });
    ctx.textAlign = 'center';
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 11px ${MONO}`;
      ctx.fillText('PRESS START', PX_W / 2, 82);
    }
    ctx.fillStyle = '#8080a0';
    ctx.font = `8px ${MONO}`;
    ctx.fillText('© 1991  LICENSED BY NOBODY', PX_W / 2, 108);
  }

  /** The high-score table, ranks in colour. */
  private paintScores(): void {
    const { ctx } = this;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb84a';
    ctx.font = `bold 12px ${MONO}`;
    ctx.fillText('HIGH SCORES', PX_W / 2, 16);
    ctx.font = `10px ${MONO}`;
    SCORES.forEach(([name, score], i) => {
      const y = 38 + i * 15;
      ctx.fillStyle = PALETTE[i % PALETTE.length]!;
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${name}`, 26, y);
      ctx.textAlign = 'right';
      ctx.fillText(String(score).padStart(6, '0'), PX_W - 26, y);
    });
  }
}
