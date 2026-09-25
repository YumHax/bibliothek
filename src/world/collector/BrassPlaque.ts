import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { wood } from '../materials/finishes';
import { invisibleHitbox } from '../meshUtils';
import { Prop, part } from '../props/Prop';

const BASE_W = 0.19;
const BASE_H = 0.028;
const BASE_D = 0.07;
const PLATE_W = 0.17;
const PLATE_H = 0.075;
/** How far the plate leans back from upright (radians). */
const LEAN = 0.35;
const PX_PER_M = 2400;

const WALNUT = wood(0x3b2416, 0.45);

/**
 * The brass plaque the collector's book brings home at 25 games: an engraved brass plate leaning
 * back on a walnut base, standing on the sideboard. `engrave(games, since)` cuts it again as the
 * collection grows (25, 50, 100, 250). Origin at the middle of the base's underside, the plate
 * facing +z. Clicking it reads it out. Decoration: never collides.
 */
export class BrassPlaque extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly face: THREE.MeshStandardMaterial;
  private readonly hitbox: THREE.Mesh;
  private text = '';

  constructor() {
    super();
    this.name = 'BrassPlaque';
    part(this, BASE_W, BASE_H, BASE_D, WALNUT, { y: BASE_H / 2 });
    this.face = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.85 });
    const edge = new THREE.MeshStandardMaterial({ color: 0xa87a22, roughness: 0.3, metalness: 0.9 });
    const plate = new THREE.Group();
    plate.position.set(0, BASE_H, 0.006);
    plate.rotation.x = -LEAN;
    this.add(plate);
    // BoxGeometry's faces: +x, -x, +y, -y, +z (the engraving), -z.
    part(plate, PLATE_W, PLATE_H, 0.003, edge, { y: PLATE_H / 2 }).material = [edge, edge, edge, edge, this.face, edge];
    this.hitbox = invisibleHitbox(BASE_W + 0.03, BASE_H + PLATE_H + 0.02, BASE_D + 0.03, { y: (BASE_H + PLATE_H) / 2 });
    this.add(this.hitbox);
    this.hitboxes = [this.hitbox];
  }

  /** Cuts the plate for a collection of `games` (0: not earned, the plaque is not there), kept since `since`. */
  engrave(games: number, since: string): void {
    this.visible = games > 0;
    this.hitbox.scale.setScalar(this.visible ? 1 : 1e-4);
    if (!this.visible) return;
    this.text = `A collection of ${games} games`;
    this.face.map?.dispose();
    this.face.map = paintPlate(games, since);
    this.face.needsUpdate = true;
  }

  setHovered(_hovered: boolean): void {}

  label(): string | null {
    return this.visible ? `A brass plaque: “Bibliothek · ${this.text}”` : null;
  }

  activate(session: SessionActions): void {
    if (this.visible) session.hint(`“Bibliothek · ${this.text}.” The next line on the plaque comes with the next milestone.`);
  }

  dispose(): void {
    this.face.map?.dispose();
    this.face.dispose();
  }
}

/** Brushed brass with the engraving: BIBLIOTHEK, the collection's size, the day it was first earned. */
function paintPlate(games: number, since: string): THREE.CanvasTexture {
  const w = Math.round(PLATE_W * PX_PER_M);
  const h = Math.round(PLATE_H * PX_PER_M);
  const [canvas, ctx] = createCanvas(w, h);
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#d9ae4a');
  gradient.addColorStop(0.5, '#c9982f');
  gradient.addColorStop(1, '#b7862a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  // Brushing: faint horizontal strokes.
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#fff4d0';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;
  // A bevelled border, then the engraving in dark, with a light lower lip for depth.
  ctx.strokeStyle = '#7a5616';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  const lines: [string, string, number][] = [
    ['BIBLIOTHEK', 'bold 48px Georgia, serif', h * 0.3],
    [`A COLLECTION OF ${games} GAMES`, 'bold 26px Georgia, serif', h * 0.56],
    [`since ${since}`, 'italic 22px Georgia, serif', h * 0.78],
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [text, font, y] of lines) {
    ctx.font = font;
    ctx.fillStyle = 'rgba(255, 240, 200, 0.55)';
    ctx.fillText(text, w / 2, y + 1.5);
    ctx.fillStyle = '#3d2a08';
    ctx.fillText(text, w / 2, y);
  }
  return toTexture(canvas, 4);
}
