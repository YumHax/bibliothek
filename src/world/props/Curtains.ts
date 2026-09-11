import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { part } from './Prop';

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
const PANEL_THICKNESS = 0.04;
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
/** Pleats across one panel; the fabric texture draws one soft ridge per pleat. */
const PLEATS = 5;

/**
 * Simple curtains for a window: a dark metal rod with finials and wall brackets above the
 * opening, and one fabric panel hanging on each side of it. Same local frame as `RoomWindow`
 * (origin at the middle of the opening, +z into the room). The panels are slim boxes with a
 * painted pleat texture (colour + bump) and cast shadows.
 * They draw: `openness` goes from 1 (panels gathered beside the opening) to 0 (panels meeting in
 * the middle, covering the pane); the owner ticks `update()` for the easing.
 */
export class Curtains extends THREE.Group {
  /** Local y of the rod axis. */
  readonly rodY: number;
  /** Where the panels are heading: 1 open, 0 drawn. */
  target = 1;

  private openness = 1;
  private readonly panels: THREE.Mesh[] = [];
  private readonly halfOpening: number;

  constructor({ width, height, frame = 0.06, hemY = -height / 2 - 0.25 }: CurtainsOptions) {
    super();
    this.name = 'Curtains';
    const rodY = height / 2 + frame + ROD_ABOVE_FRAME;
    this.rodY = rodY;
    const halfRod = width / 2 + ROD_OVERHANG;

    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.45, metalness: 0.6 });
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

    const fabric = pleatedFabric();
    const top = rodY - ROD_RADIUS - 0.01;
    const panelHeight = top - hemY;
    this.halfOpening = width / 2 + PANEL_GAP;
    for (let i = 0; i < 2; i++) {
      this.panels.push(part(this, PANEL_WIDTH, panelHeight, PANEL_THICKNESS, fabric, { y: (top + hemY) / 2, z: STANDOFF }));
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

  /** Starts drawing or opening; the panels ease there over the next frames. */
  setDrawn(drawn: boolean): void {
    this.target = drawn ? 0 : 1;
  }

  toggle(): void {
    this.setDrawn(!this.isDrawn);
  }

  /** Eases the panels towards `target`; returns true when they moved this frame. */
  update(dt: number): boolean {
    const gap = this.target - this.openness;
    if (Math.abs(gap) < 0.002) {
      if (this.openness === this.target) return false;
      this.setOpenness(this.target);
      return true;
    }
    this.setOpenness(this.openness + gap * (1 - Math.exp(-DRAW_SPEED * dt)));
    return true;
  }

  /** Positions the panels: each stretches from the outer edge of its gathered spot towards the middle. */
  private setOpenness(value: number): void {
    this.openness = THREE.MathUtils.clamp(value, 0, 1);
    const outer = this.halfOpening + PANEL_WIDTH; // outer edge of a gathered panel
    const inner = THREE.MathUtils.lerp(0, this.halfOpening, this.openness); // inner edge: middle when drawn
    const span = outer - inner;
    this.panels.forEach((panel, i) => {
      const side = i === 0 ? -1 : 1;
      panel.scale.x = span / PANEL_WIDTH;
      panel.position.x = side * (inner + span / 2);
    });
  }
}

/** Warm light fabric with soft vertical pleats: one canvas used both as colour map and bump map. */
function pleatedFabric(): THREE.MeshStandardMaterial {
  const W = 128;
  const H = 512;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = `#${new THREE.Color(FABRIC).getHexString()}`;
  ctx.fillRect(0, 0, W, H);

  // Each pleat: a shaded fold, a bright ridge, then a gentle fall back into the next fold.
  const pleatW = W / PLEATS;
  for (let i = 0; i < PLEATS; i++) {
    const x0 = i * pleatW;
    const shade = ctx.createLinearGradient(x0, 0, x0 + pleatW, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.2)');
    shade.addColorStop(0.35, 'rgba(255,255,255,0.12)');
    shade.addColorStop(0.7, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = shade;
    ctx.fillRect(x0, 0, pleatW, H);
  }
  // A faint weave so the fabric is not perfectly flat in colour.
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

  const map = toTexture(canvas);
  const bump = new THREE.CanvasTexture(canvas);
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.01, roughness: 1 });
}
