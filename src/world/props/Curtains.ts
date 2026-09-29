import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { part } from './Prop';
import { standard } from '../materials/palette';
import { fabric } from '@/world/materials/finishes';
import { Backlight } from '../materials/backlight';
import { playCurtainRings } from '@/audio/furnitureSounds';

export interface CurtainsOptions {
  /** Size of the opening the curtains flank, in metres. */
  width: number;
  height: number;
  /** Thickness of the frame rails around the opening; the rod sits above them. Default 0.06. */
  frame?: number;
  /** Local y where the panels end (their hem). Default 0.25 m below the opening. */
  hemY?: number;
}

const PANEL_WIDTH = 0.28;
/** Gap between the opening and a panel's inner edge: the panels never cover the pane. */
const PANEL_GAP = 0.01;
/** Distance of the rod axis (and the panels) from the wall; clears the sill (0.12 m deep). */
const STANDOFF = 0.15;
const ROD_RADIUS = 0.012;
const ROD_ABOVE_FRAME = 0.1;
/** How far the rod overhangs the opening on each side (panels plus a little spare). */
const ROD_OVERHANG = 0.3;
const FINIAL_RADIUS = 0.025;
const FABRIC = 0xd8c9b0;
/** Draw speed, in "fraction of the remaining travel per second". */
const DRAW_SPEED = 4;
/** How long the rings are heard running along the rod after a pull (about the ease's settling time). */
const RUSTLE_SECONDS = 0.9;
/** Folds across one panel, and how much more fabric it has than the widest span it covers (so drawn, it still folds). */
const PLEATS = 7;
const FULLNESS = 1.25;
/** Columns of vertices per fold, and rows down the panel (the hem sways). */
const COLUMNS_PER_PLEAT = 6;
const ROWS = 8;
/** One tile of the weave texture, in metres of fabric. */
const WEAVE_TILE = 0.25;
/** The hem, once the panels have moved: a lazy pendulum (natural frequency, Hz; damping ratio) set swinging by the pull. */
const SWAY_HZ = 0.8;
const SWAY_DAMPING = 0.22;
/** How far into the room the hem is kicked per unit of openness change per second (m). */
const SWAY_KICK = 0.012;

/**
 * Simple curtains for a window: a dark metal rod with finials and wall brackets above the
 * opening, and one fabric panel hanging on each side of it. Same local frame as `RoomWindow`
 * (origin at the middle of the opening, +z into the room). Each panel is a sheet folded in real
 * pleats: gathered, its folds run deep; drawn across, they open out (the fabric's length is kept),
 * so nothing painted stretches; its weave is mapped in metres. The hem swings a little after a
 * pull, and the rings are heard along the rod. They cast shadows.
 * They draw: `openness` goes from 1 (panels gathered beside the opening) to 0 (panels meeting in
 * the middle, covering the pane); the owner ticks `update()` every frame for the easing and the sway.
 */
export class Curtains extends THREE.Group {
  /** Local y of the rod axis. */
  readonly rodY: number;
  /** Where the panels are heading: 1 open, 0 drawn. */
  target = 1;

  private openness = 1;
  private readonly panels: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly halfOpening: number;
  private readonly top: number;
  private readonly hemY: number;
  /** Length of fabric in each panel (m), whatever span it covers. */
  private readonly fabricLength: number;
  /** The hem's swing into the room (m) and its speed. */
  private sway = 0;
  private swayVelocity = 0;
  /** The glow of the fabric drawn across the glass, lit by the sky behind it. */
  private readonly backlight: Backlight;

  constructor({ width, height, frame = 0.06, hemY = -height / 2 - 0.25 }: CurtainsOptions) {
    super();
    this.name = 'Curtains';
    const rodY = height / 2 + frame + ROD_ABOVE_FRAME;
    this.rodY = rodY;
    const halfRod = width / 2 + ROD_OVERHANG;

    // Blackened iron: a dark finish over the metal, so a dielectric (metalness 0).
    const metal = standard({ color: 0x3a3430, roughness: 0.45, metalness: 0 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(ROD_RADIUS, ROD_RADIUS, halfRod * 2, 12), metal);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, rodY, STANDOFF);
    rod.castShadow = true;
    this.add(rod);

    const finialGeometry = new THREE.SphereGeometry(FINIAL_RADIUS, 12, 8);
    for (const side of [-1, 1]) {
      const finial = new THREE.Mesh(finialGeometry, metal);
      finial.position.set(side * (halfRod + FINIAL_RADIUS * 0.6), rodY, STANDOFF);
      finial.castShadow = true;
      this.add(finial);
      // Bracket from the wall to the rod, hidden behind the panel.
      part(this, 0.02, 0.02, STANDOFF, metal, { x: side * (width / 2 + PANEL_GAP + PANEL_WIDTH * 0.6), y: rodY, z: STANDOFF / 2 });
    }

    const material = wovenFabric();
    this.backlight = new Backlight(material, width / 2, height / 2);
    this.top = rodY - ROD_RADIUS - 0.01;
    this.hemY = hemY;
    this.halfOpening = width / 2 + PANEL_GAP;
    this.fabricLength = FULLNESS * (this.halfOpening + PANEL_WIDTH);
    const panelHeight = this.top - hemY;
    for (let i = 0; i < 2; i++) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, PLEATS * COLUMNS_PER_PLEAT, ROWS), material);
      // Wherever the folds go, they stay inside this.
      panel.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (this.top + hemY) / 2, STANDOFF), Math.hypot(this.halfOpening + PANEL_WIDTH, panelHeight / 2) + 0.2);
      panel.castShadow = true;
      panel.receiveShadow = true;
      this.panels.push(panel);
      this.add(panel);
    }
    this.setOpenness(1);
  }

  /** 1 = gathered beside the opening, 0 = drawn across it. */
  get currentOpenness(): number {
    return this.openness;
  }

  get isDrawn(): boolean {
    return this.target < 0.5;
  }

  /** Starts drawing or opening; the panels ease there over the next frames, rings running along the rod. */
  setDrawn(drawn: boolean): void {
    const target = drawn ? 0 : 1;
    if (target !== this.target) playCurtainRings(RUSTLE_SECONDS);
    this.target = target;
  }

  toggle(): void {
    this.setDrawn(!this.isDrawn);
  }

  /** The sky behind the glass (its colour, the daylight 0..1): the panels glow with it where they cover the pane. */
  setBacklight(sky: THREE.Color, daylight: number): void {
    this.backlight.set(sky, daylight);
  }

  /** Eases the panels towards `target` and swings the hem; returns true when the panels moved along the rod this frame. */
  update(dt: number): boolean {
    const gap = this.target - this.openness;
    let moved = false;
    let speed = 0;
    if (Math.abs(gap) < 0.002) {
      if (this.openness !== this.target) {
        this.openness = this.target;
        moved = true;
      }
    } else {
      const step = gap * (1 - Math.exp(-DRAW_SPEED * dt));
      this.openness += step;
      speed = dt > 0 ? step / dt : 0;
      moved = true;
    }
    const swaying = this.swing(dt, speed);
    if (moved || swaying) this.setOpenness(this.openness);
    return moved;
  }

  /** The hem's pendulum: kicked by the panels' speed, damped back to still. False once it rests. */
  private swing(dt: number, speed: number): boolean {
    if (speed === 0 && Math.abs(this.sway) < 1e-4 && Math.abs(this.swayVelocity) < 1e-4) {
      this.sway = this.swayVelocity = 0;
      return false;
    }
    const omega = 2 * Math.PI * SWAY_HZ;
    const h = Math.min(dt, 1 / 30);
    const accel = -omega * omega * this.sway - 2 * SWAY_DAMPING * omega * this.swayVelocity + Math.abs(speed) * SWAY_KICK * omega * omega * 0.25;
    this.swayVelocity += accel * h;
    this.sway += this.swayVelocity * h;
    return true;
  }

  /** Lays out the panels: each spans from the outer edge of its gathered spot towards the middle, its fabric folded to fit. */
  private setOpenness(value: number): void {
    this.openness = THREE.MathUtils.clamp(value, 0, 1);
    const outer = this.halfOpening + PANEL_WIDTH; // outer edge of a gathered panel
    const inner = THREE.MathUtils.lerp(0, this.halfOpening, this.openness); // inner edge: middle when drawn
    const span = outer - inner;
    // The fold's depth that keeps the fabric's length over this span (a zigzag of `PLEATS` folds).
    const amplitude = Math.sqrt(Math.max(0, this.fabricLength ** 2 - span ** 2)) / (4 * PLEATS);
    const height = this.top - this.hemY;
    this.panels.forEach((panel, i) => {
      const side = i === 0 ? -1 : 1;
      const position = panel.geometry.getAttribute('position');
      const normal = panel.geometry.getAttribute('normal');
      const uv = panel.geometry.getAttribute('uv');
      const columns = PLEATS * COLUMNS_PER_PLEAT;
      for (let row = 0; row <= ROWS; row++) {
        const down = row / ROWS; // 0 at the rod, 1 at the hem
        const y = this.top - down * height;
        const hang = down * down; // the sway grows towards the hem
        for (let col = 0; col <= columns; col++) {
          const along = col / columns;
          // Columns always run towards +x (the winding keeps the face towards the room); `d` is from the panel's inner edge.
          const x = side > 0 ? inner + along * span : -outer + along * span;
          const d = side > 0 ? along : 1 - along;
          const phase = 2 * Math.PI * PLEATS * d;
          const z = STANDOFF + amplitude * Math.sin(phase) + this.sway * hang;
          const slope = amplitude * Math.cos(phase) * ((2 * Math.PI * PLEATS) / span) * side;
          const lean = (this.sway * 2 * down) / height; // dz/d(-y)
          const k = row * (columns + 1) + col;
          position.setXYZ(k, x, y, z);
          const length = Math.hypot(slope, lean, 1);
          normal.setXYZ(k, -slope / length, lean / length, 1 / length);
          uv.setXY(k, (d * this.fabricLength) / WEAVE_TILE, (y - this.hemY) / WEAVE_TILE);
        }
      }
      position.needsUpdate = true;
      normal.needsUpdate = true;
      uv.needsUpdate = true;
    });
  }
}

/** Warm light fabric: a fine weave (colour and bump), tiled in metres over the folded sheet. */
function wovenFabric(): THREE.MeshStandardMaterial {
  const W = 128;
  const [canvas, ctx] = createCanvas(W, W);
  ctx.fillStyle = `#${new THREE.Color(FABRIC).getHexString()}`;
  ctx.fillRect(0, 0, W, W);
  // Warp and weft: faint threads both ways, a few slubs where the yarn thickens.
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < W; y += 3) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.035)';
  for (let x = 0; x < W; x += 3) ctx.fillRect(x, 0, 1, W);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 24; i++) ctx.fillRect((i * 53) % W, (i * 29) % W, 6 + (i % 5), 1);

  const map = toTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bump = new THREE.CanvasTexture(canvas);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return fabric({ map, bumpMap: bump, bumpScale: 0.004, roughness: 1, side: THREE.DoubleSide, sheenTint: 0x9a968e });
}
