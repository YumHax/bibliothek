import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import { TvChatter } from '@/audio/grandmaSounds';
import { canvasTexture, createCanvas } from '@/covers/generated/canvasUtils';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { Prop, part } from '../props/Prop';
import { METAL, paint, timber } from '../materials/palette';
import { faceOn } from '../props/joinery';
import { WALL } from '../surface/layers';
import { HoverGlint } from '../props/hoverGlint';
import { PooledLight } from '../lighting/LightPool';
import { random } from '@/random';

/** The set's case (m): a 1980s colour set in a walnut-effect box, the screen left, the speaker grille right. */
const CASE = { w: 0.56, h: 0.42, d: 0.4 };
const SCREEN = { w: 0.34, h: 0.26 };
const BEZEL = 0.012;
/** The front panel's thickness, a knob's length. */
const FRONT_T = 0.01;
const KNOB = 0.018;
/** The picture's canvas, how often it is redrawn while on (s), and how long a programme's scene lasts. */
const PICTURE = { w: 128, h: 96 };
const FRAME_SECONDS = 1 / 8;
const SCENE_SECONDS = [6, 14] as const;
/** The glow on the room in front of it, at full brightness. */
const GLOW = 0.35;

type Scene = 'gameShow' | 'soap' | 'news' | 'weather';
const SCENES: readonly Scene[] = ['gameShow', 'soap', 'news', 'weather'];

/**
 * Mémé's old set on her sideboard (`furnishGrandmaDecor`): a walnut-effect case, the curved screen showing her
 * programmes (a game show's lights and podiums, a soap's sitting room, the news, the weather map), the picture's
 * colour thrown faintly on the room (`PooledLight`), the voices from its little speaker (`sound`, on a `PointSound`
 * by the builder). On or off with `setOn` (her hours, `furnishGrandmaDecor`), or with a click. Origin on the surface
 * under its middle, front towards +z. Never collides (the sideboard does).
 */
export class OldTelevision extends Prop implements Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  readonly sound = new TvChatter();
  /** Where the screen's middle is, in the set's frame (her eyes rest there). */
  readonly screenAt: THREE.Vector3;
  private readonly picture: THREE.CanvasTexture;
  private readonly context: CanvasRenderingContext2D;
  private readonly screen: THREE.MeshStandardMaterial;
  private readonly glow = new PooledLight(0xa8c0ff, 0, 3, 2);
  private readonly glint: HoverGlint;
  private on = false;
  private scene: Scene = 'gameShow';
  private sceneLeft = 0;
  private frameIn = 0;
  private time = 0;
  /** The brightness of the picture now (0..1), for the glow. */
  private brightness = 0.6;
  private readonly tint = new THREE.Color();
  /** Called when a click switches it (the builder keeps the player's choice until her next hour). */
  onSwitch: ((on: boolean) => void) | null = null;

  constructor() {
    super();
    this.name = 'OldTelevision';
    const veneer = timber(0x5a3a22, 0.45);
    const plastic = paint(0x2a2622, 0.5);
    part(this, CASE.w, CASE.h, CASE.d, veneer, { y: CASE.h / 2 });
    // The front: a dark panel, the screen in its bezel on the left, the grille and the knobs on the right.
    const front = part(this, CASE.w - 0.03, CASE.h - 0.03, FRONT_T, plastic, { y: CASE.h / 2, z: CASE.d / 2 + FRONT_T / 2 });
    const sx = -CASE.w / 2 + 0.03 + SCREEN.w / 2 + BEZEL;
    const sy = CASE.h / 2 + 0.01;
    const [canvas, context] = createCanvas(PICTURE.w, PICTURE.h);
    this.context = context;
    this.picture = canvasTexture(canvas, { anisotropy: 'facing', mipmaps: false });
    this.screen = new THREE.MeshStandardMaterial({ color: 0x0c0e10, roughness: 0.15, emissive: 0xffffff, emissiveMap: this.picture, emissiveIntensity: 0 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), this.screen);
    screen.position.set(sx, sy, 0);
    faceOn(screen, front, WALL.framed);
    this.add(screen);
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.2), paint(0x4a3a2a, 0.95));
    grille.position.set(CASE.w / 2 - 0.085, sy + 0.04, 0);
    faceOn(grille, front, WALL.print);
    this.add(grille);
    const knobs: THREE.Mesh[] = [];
    for (const [ky, r] of [
      [0.1, 0.016],
      [0.05, 0.012],
    ] as const) {
      const knob = cylinderMesh(r, KNOB, METAL.chrome(), { x: CASE.w / 2 - 0.085, y: ky, z: CASE.d / 2 + FRONT_T + KNOB / 2 }, { segments: 14 });
      knob.rotation.x = Math.PI / 2;
      knobs.push(knob);
      this.add(knob);
    }
    this.glint = HoverGlint.of(knobs[0]!, knobs[1]!);
    // The rabbit ears on top.
    const ears = new THREE.Group();
    ears.position.set(CASE.w * 0.2, CASE.h, -0.04);
    ears.add(cylinderMesh(0.03, 0.02, plastic, { y: 0.01 }, { segments: 14 }));
    for (const s of [-1, 1]) {
      const rod = cylinderMesh(0.0025, 0.42, METAL.chrome(), { y: 0.21 }, { segments: 6 });
      const arm = new THREE.Group();
      arm.position.y = 0.02;
      arm.rotation.z = s * 0.45;
      arm.rotation.x = -0.15;
      rod.castShadow = false;
      arm.add(rod);
      ears.add(arm);
    }
    this.add(ears);
    // A glow just in front of the screen, lent a light by the zone's pool while on.
    this.screenAt = new THREE.Vector3(sx, sy, CASE.d / 2);
    this.glow.position.set(sx, sy, CASE.d / 2 + 0.25);
    this.add(this.glow);
    const hitbox = invisibleHitbox(CASE.w + 0.04, CASE.h + 0.04, CASE.d + 0.04, { y: CASE.h / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.draw();
  }

  get isOn(): boolean {
    return this.on;
  }

  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.sound.setOn(on);
    this.sceneLeft = 0;
    if (!on) {
      this.screen.emissiveIntensity = 0;
      this.glow.intensity = 0;
    }
  }

  update(dt: number): void {
    if (!this.on) return;
    this.time += dt;
    this.sceneLeft -= dt;
    if (this.sceneLeft <= 0) {
      this.sceneLeft = SCENE_SECONDS[0] + random() * (SCENE_SECONDS[1] - SCENE_SECONDS[0]);
      this.scene = SCENES[Math.floor(random() * SCENES.length)]!;
    }
    this.frameIn -= dt;
    if (this.frameIn <= 0) {
      this.frameIn = FRAME_SECONDS;
      this.draw();
    }
    // A tube's flicker over the picture's own brightness.
    const flicker = 0.92 + 0.08 * Math.sin(this.time * 47) * Math.sin(this.time * 13);
    this.screen.emissiveIntensity = 1.1 * flicker;
    this.glow.intensity = GLOW * this.brightness * flicker;
  }

  /** Paints the programme's frame now: its scene, a little movement, the scanlines. */
  private draw(): void {
    const ctx = this.context;
    const { w, h } = PICTURE;
    const t = this.time;
    switch (this.scene) {
      case 'gameShow':
        this.fill('#1a2a8a', '#3a4ad0');
        // Lights round the set chasing each other, two podiums, the host between.
        for (let i = 0; i < 16; i++) {
          ctx.fillStyle = (i + Math.floor(t * 6)) % 3 === 0 ? '#ffe070' : '#8a7a3a';
          ctx.fillRect(4 + i * 7.6, 8, 4, 4);
        }
        ctx.fillStyle = '#e0a020';
        ctx.fillRect(10, 58, 30, 32);
        ctx.fillRect(88, 58, 30, 32);
        this.person(64 + Math.sin(t * 0.8) * 6, 86, 40, '#2a2a3a');
        this.person(25, 60, 22, '#c84a4a');
        this.person(103, 60, 22, '#4a8a4a');
        this.tint.setRGB(0.4, 0.45, 1);
        this.brightness = 0.7;
        break;
      case 'soap':
        this.fill('#c8a070', '#8a6a4a');
        ctx.fillStyle = '#6a8ab0';
        ctx.fillRect(80, 14, 34, 30);
        ctx.fillStyle = '#7a3a3a';
        ctx.fillRect(10, 62, 60, 26);
        this.person(36 + Math.sin(t * 0.5) * 3, 80, 46, '#d8d0c0');
        this.person(84, 82, 50, '#3a4a6a');
        this.tint.setRGB(1, 0.8, 0.55);
        this.brightness = 0.6;
        break;
      case 'news':
        this.fill('#20304a', '#304a6a');
        ctx.fillStyle = '#d0d8e0';
        ctx.fillRect(74, 14, 44, 30);
        ctx.fillStyle = '#c03a2a';
        ctx.fillRect(0, 80, w, 12);
        this.person(40, 92, 50, '#2a2a30');
        this.tint.setRGB(0.6, 0.7, 1);
        this.brightness = 0.5;
        break;
      case 'weather':
        this.fill('#4a8ad0', '#2a6ab0');
        ctx.fillStyle = '#5aa05a';
        ctx.beginPath();
        ctx.moveTo(30, 20);
        ctx.lineTo(96, 16);
        ctx.lineTo(104, 70);
        ctx.lineTo(60, 86);
        ctx.lineTo(24, 64);
        ctx.fill();
        ctx.fillStyle = '#ffd040';
        ctx.beginPath();
        ctx.arc(50, 40, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8eef4';
        ctx.beginPath();
        ctx.arc(80 + Math.sin(t * 0.6) * 4, 56, 9, 0, Math.PI * 2);
        ctx.fill();
        this.tint.setRGB(0.55, 0.75, 1);
        this.brightness = 0.8;
        break;
    }
    // Scanlines and the tube's vignette.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    this.picture.needsUpdate = true;
    this.glow.color.copy(this.tint);
  }

  private fill(top: string, bottom: string): void {
    const g = this.context.createLinearGradient(0, 0, 0, PICTURE.h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    this.context.fillStyle = g;
    this.context.fillRect(0, 0, PICTURE.w, PICTURE.h);
  }

  /** Someone on screen from the waist up: shoulders and a head, `height` px. */
  private person(x: number, base: number, height: number, clothes: string): void {
    const ctx = this.context;
    ctx.fillStyle = clothes;
    ctx.fillRect(x - height * 0.3, base - height * 0.55, height * 0.6, height * 0.55);
    ctx.fillStyle = '#e0b090';
    ctx.beginPath();
    ctx.arc(x, base - height * 0.72, height * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return this.on ? 'Mémé’s television · switch off' : 'Mémé’s television · switch on';
  }

  activate(): void {
    this.setOn(!this.on);
    this.onSwitch?.(this.on);
  }
}
