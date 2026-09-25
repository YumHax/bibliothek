import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { ModalLike } from '@/game/SessionParts';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { invisibleHitbox } from '@/world/meshUtils';
import { Prop, markShared } from '@/world/props/Prop';
import type { FirstDayLike } from './FirstDay';

const WIDTH = 0.13;
const LEAN_H = 0.09;
/** Half the angle between the two leaves of the folded card. */
const FOLD = 0.32;

let faceTexture: THREE.CanvasTexture | null = null;

/** "TO DO" in felt pen, with a few scribbled lines, on squared paper. */
function face(): THREE.CanvasTexture {
  if (faceTexture) return faceTexture;
  const [canvas, ctx] = createCanvas(256, 176);
  ctx.fillStyle = '#fbf9f1';
  ctx.fillRect(0, 0, 256, 176);
  ctx.strokeStyle = 'rgba(80,120,170,0.25)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 256; x += 16) ctx.strokeRect(x, 0, 0, 176);
  for (let y = 0; y <= 176; y += 16) ctx.strokeRect(0, y, 256, 0);
  ctx.fillStyle = '#1d3557';
  ctx.font = 'bold 44px "Comic Sans MS", "Bradley Hand", cursive';
  ctx.textAlign = 'center';
  ctx.fillText('TO DO', 128, 58);
  ctx.strokeStyle = '#1d3557';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const y = 90 + i * 22;
    ctx.strokeRect(34, y - 8, 10, 10);
    ctx.beginPath();
    ctx.moveTo(56, y);
    for (let x = 56; x < 200 - i * 18; x += 12) ctx.lineTo(x + 6, y + (x % 24 ? -3 : 2));
    ctx.stroke();
  }
  faceTexture = markShared(toTexture(canvas, 4));
  return faceTexture;
}

/**
 * The first day's to-do list: a folded card standing on the hall console, "TO DO" on its face.
 * Clicking it holds up the note (`ToDoNotePanel`). There while the first day is on
 * (`FirstDayLike.active`), gone once it is done or skipped. Origin on the surface under the fold's
 * middle, the face towards +z. Decoration: it never blocks the player.
 */
export class ToDoNote extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly unsubscribe: () => void;

  constructor(private readonly firstDay: FirstDayLike, private readonly panel: ModalLike) {
    super();
    this.name = 'ToDoNote';
    const leaf = LEAN_H / Math.cos(FOLD);
    const paper = new THREE.MeshStandardMaterial({ color: 0xfbf9f1, roughness: 0.9, side: THREE.DoubleSide });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, leaf), new THREE.MeshStandardMaterial({ map: face(), roughness: 0.9 }));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, leaf), paper);
    const off = Math.sin(FOLD) * leaf / 2;
    front.position.set(0, LEAN_H / 2, off);
    front.rotation.x = -FOLD;
    back.position.set(0, LEAN_H / 2, -off);
    back.rotation.x = FOLD;
    for (const m of [front, back]) {
      m.castShadow = true;
      this.add(m);
    }
    const hitbox = invisibleHitbox(WIDTH + 0.03, LEAN_H + 0.03, 0.09, { y: LEAN_H / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.unsubscribe = firstDay.subscribe(() => this.refresh());
    this.refresh();
  }

  dispose(): void {
    this.unsubscribe();
  }

  setHovered(_hovered: boolean): void {}

  label(): string | null {
    return this.firstDay.active ? 'A note for you: click to read it' : null;
  }

  activate(session: SessionActions): void {
    if (this.firstDay.active) session.openPanel(this.panel);
  }

  /** There only while the first day is on; the hitbox shrinks away with it (the ray does not care about `visible`). */
  private refresh(): void {
    const on = this.firstDay.active;
    this.visible = on;
    this.hitboxes[0]?.scale.setScalar(on ? 1 : 1e-4);
  }
}
