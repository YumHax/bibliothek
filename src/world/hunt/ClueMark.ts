import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { HUNT, type ClueId } from '@/building/hunt/huntPlan';
import { NEW_LEAD, findClue, huntFound, huntOpen } from '@/building/hunt/BuildingHunt';
import { invisibleHitbox } from '../meshUtils';
import { Prop } from '../props/Prop';
import { WALL, onSurface } from '../surface/layers';

/** What a clue looks like where it lies. */
export interface ClueMarkLook {
  /** The face's size (m). */
  width: number;
  height: number;
  /** Paints the face onto a canvas of `w` x `h` pixels. */
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Transparent where nothing is painted (chalk on brick, a carving): otherwise a card. */
  transparent?: boolean;
  /** The hover caption ("A card in a nameless mailbox"). */
  caption: string;
}

/** Pixels a metre of the face is painted at. */
const PX_PER_M = 1400;
/** How often (s) it asks whether it should show (a clue found elsewhere opens it). */
const CHECK_S = 1;

/**
 * One clue of the building's hunt lying in the world (`HUNT.clues`): a face painted on a canvas
 * (a card, chalk, a carving, a tag), shown once the clues it needs are found (unseen and not
 * clickable before), read on a click (`read`, the clue's card), which finds it. Read again later,
 * the card comes back. Its origin is the face's middle, its front +z; lifted off its wall (`WALL.flyer`).
 */
export class ClueMark extends Prop implements Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly face: THREE.Mesh;
  private checkIn = 0;

  constructor(
    private readonly clue: ClueId,
    private readonly look: ClueMarkLook,
  ) {
    super();
    this.name = `Clue:${clue}`;
    const [canvas, ctx] = createCanvas(Math.round(look.width * PX_PER_M), Math.round(look.height * PX_PER_M));
    look.paint(ctx, canvas.width, canvas.height);
    const material = onSurface(new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.9, transparent: look.transparent ?? false, alphaTest: look.transparent ? 0.05 : 0, depthWrite: !look.transparent }), WALL.flyer);
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(look.width, look.height), material);
    this.face.position.z = WALL.flyer.lift;
    this.face.castShadow = false;
    this.face.receiveShadow = true;
    this.add(this.face);
    const hit = invisibleHitbox(Math.max(0.12, look.width), Math.max(0.12, look.height), 0.06, { z: 0.02 });
    this.add(hit);
    this.hitboxes = [hit];
    this.refresh();
  }

  /** Shown once the clue is open or found. */
  private get shown(): boolean {
    return huntFound(this.clue) || huntOpen(this.clue);
  }

  update(dt: number): void {
    this.checkIn -= dt;
    if (this.checkIn > 0) return;
    this.checkIn = CHECK_S;
    this.refresh();
  }

  setHovered(): void {}

  label(): string | null {
    if (!this.shown) return null;
    return `${this.look.caption} · read`;
  }

  activate(session: SessionActions): void {
    if (!this.shown) return;
    const { title, text } = HUNT.clues[this.clue];
    const fresh = findClue(this.clue, 'never');
    session.read({ title, text, ...(fresh ? { effect: `${NEW_LEAD}.` } : {}), look: 'note' });
  }

  private refresh(): void {
    this.face.visible = this.shown;
  }
}

/** Writes `lines` centred down a canvas in `font`, `colour`, from `top` (share of the height), `step` apart (share). */
export function writeLines(ctx: CanvasRenderingContext2D, w: number, h: number, lines: readonly string[], { font, colour, top, step }: { font: string; colour: string; top: number; step: number }): void {
  ctx.fillStyle = colour;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h * (top + i * step), w * 0.92));
}
