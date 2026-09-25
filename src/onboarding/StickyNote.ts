import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import type { FirstDayLike } from './FirstDay';
import type { FirstDayStepId } from './firstDaySteps';

const SIZE = 0.076;

/** A yellow square in felt pen: `lines` centred, the first one big. */
function paint(lines: readonly string[]): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(160, 160);
  ctx.fillStyle = '#f7e36b';
  ctx.fillRect(0, 0, 160, 160);
  // The glued strip at the top is a shade darker.
  ctx.fillStyle = 'rgba(160,130,20,0.18)';
  ctx.fillRect(0, 0, 160, 22);
  ctx.fillStyle = '#23324a';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    ctx.font = i === 0 ? 'bold 40px "Comic Sans MS", "Bradley Hand", cursive' : '22px "Comic Sans MS", "Bradley Hand", cursive';
    ctx.fillText(line, 80, i === 0 ? 72 : 72 + i * 30);
  });
  return toTexture(canvas, 4);
}

/**
 * A sticky note (the front door's "KEYS!"): a yellow square that stays up until the first day's
 * `until` step is done, then is gone. A plain mesh facing +z, to hang on something (a door leaf:
 * `Door.attachToLeaf`); it is not clickable, the door under it is.
 */
export class StickyNote extends THREE.Mesh {
  private readonly unsubscribe: () => void;

  constructor(lines: readonly string[], private readonly firstDay: FirstDayLike, private readonly until: FirstDayStepId) {
    super(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: paint(lines), roughness: 0.85 }));
    this.name = 'StickyNote';
    this.rotation.z = 0.06;
    this.castShadow = false;
    this.receiveShadow = true;
    this.unsubscribe = firstDay.subscribe(() => this.refresh());
    this.refresh();
  }

  dispose(): void {
    this.unsubscribe();
  }

  private refresh(): void {
    this.visible = this.firstDay.active && !this.firstDay.isDone(this.until);
  }
}
