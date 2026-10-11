import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import type { Furniture } from '../../Furniture';
import { snowPaint } from '../snowCover';

/** The board's leaves: how wide, how tall, how far apart their feet stand, the frame's lath. */
const BOARD = { width: 0.6, height: 0.9, splay: 0.42, lath: 0.03 };

/**
 * The pop-up's A-board out on the pavement by the empty shop's door once CONTINUE? has opened (`streetShops/popUp`,
 * `counters.ts`): two chalked leaves on a wooden frame, CONTINUE? and what it sells, the hours. Placed by the street's
 * builder in front of the door; origin on the pavement, the leaves facing ±z.
 */
export class PopUpBoard extends THREE.Group implements Furniture {
  constructor(hours: string) {
    super();
    this.name = 'PopUpBoard';
    const face = new THREE.MeshStandardMaterial({ map: paintBoard(hours), roughness: 0.9 });
    const frame = snowPaint(0x6a4a32, 0.8);
    const lean = Math.atan2(BOARD.splay / 2, BOARD.height);
    for (const side of [1, -1]) {
      const leaf = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD.width, BOARD.height, BOARD.lath), [frame, frame, frame, frame, face, frame]);
      board.position.y = BOARD.height / 2;
      board.castShadow = true;
      board.receiveShadow = true;
      leaf.add(board);
      // Each leaf leans in to meet the other at the top, its chalked face outwards.
      leaf.position.z = (side * BOARD.splay) / 2;
      leaf.rotation.x = -side * lean;
      if (side < 0) leaf.rotation.y = Math.PI;
      this.add(leaf);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-BOARD.width / 2, 0, -BOARD.splay / 2 - BOARD.lath), new THREE.Vector3(BOARD.width / 2, BOARD.height, BOARD.splay / 2 + BOARD.lath));
  }
}

/** The chalked face: the name, what it sells, the hours. */
function paintBoard(hours: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 384);
  ctx.fillStyle = '#23302a';
  ctx.fillRect(0, 0, 256, 384);
  ctx.fillStyle = '#f2ead6';
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText('CONTINUE?', 128, 80);
  ctx.font = '26px Georgia, serif';
  ctx.fillText('collector-grade', 128, 150);
  ctx.fillText('copies', 128, 182);
  ctx.fillText('complete in box', 128, 230);
  ctx.fillStyle = '#f0c040';
  ctx.fillText(hours, 128, 300);
  ctx.fillText('not Mondays', 128, 334);
  return toTexture(canvas, 'facing');
}
