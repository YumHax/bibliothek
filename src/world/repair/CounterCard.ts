import * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { paint } from '../materials/palette';
import { part } from '../props/Prop';
import { UsableProp } from '../props/UsableProp';

/** The card (m) and its canvas (px); how far its two faces lean apart. */
const CARD = { w: 0.16, h: 0.1, lean: 0.32 };
const PX: [number, number] = [320, 200];

/**
 * A folded tent card standing on a counter, written on both faces ("WE BUY / working consoles"), that opens a desk
 * when clicked (TV REPAIR's, `ConsoleDeskPanel`). Origin on the counter under its fold, faces towards ±z.
 */
export class CounterCard extends UsableProp {
  private readonly material: THREE.MeshStandardMaterial;

  constructor(options: { lines: readonly string[]; open: (session: SessionActions) => void }) {
    super({ label: () => `${options.lines.join(' ')} · see`, use: options.open });
    this.name = 'CounterCard';
    const [canvas, ctx] = createCanvas(...PX);
    ctx.fillStyle = '#f4ecd6';
    ctx.fillRect(0, 0, PX[0], PX[1]);
    ctx.strokeStyle = '#2e5a8a';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, PX[0] - 20, PX[1] - 20);
    ctx.fillStyle = '#1e2a3a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    options.lines.forEach((line, i) => {
      ctx.font = `bold ${i === 0 ? 64 : 34}px ${FONT}`;
      ctx.fillText(line.toUpperCase(), PX[0] / 2, 70 + i * 70);
    });
    this.material = new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.85 });
    const back = paint(0xe8dfc6, 0.85);
    for (const side of [1, -1]) {
      const leaf = new THREE.Group();
      leaf.rotation.x = side * -CARD.lean;
      leaf.position.y = CARD.h * Math.cos(CARD.lean);
      leaf.userData.live = true;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(CARD.w, CARD.h), this.material);
      face.position.set(0, -CARD.h / 2, side * 0.0012);
      if (side < 0) face.rotation.y = Math.PI;
      leaf.add(face);
      part(leaf, CARD.w, CARD.h, 0.0015, back, { y: -CARD.h / 2 });
      this.add(leaf);
    }
    this.target(CARD.w + 0.03, CARD.h + 0.03, 0.12, { y: CARD.h / 2 });
  }

  dispose(): void {
    this.material.map?.dispose();
    this.material.dispose();
  }
}
