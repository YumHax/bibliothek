import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { repaintWhenFontLoads } from '@/graphics/fontReady';
import { mulberry32 } from '@/random';
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

/** The board's canvas (px) and the chalk's two hands: the marker for the name, the scrawl for the rest. */
const PAGE = { w: 512, h: 768 } as const;
const MARKER = '"Permanent Marker", "Comic Sans MS", cursive';
const SCRAWL = '"Caveat", "Segoe Print", cursive';
const CHALK = '#f2ead6';
const CHALK_YELLOW = '#f6d25a';
const CHALK_PINK = '#f48aa8';

/**
 * The chalked face: CONTINUE? in big marker letters, what it sells in a looser hand on lines that wander a little, the
 * hours in yellow, a cartridge and an arrow doodled towards the door, the smudges of chalk rubbed out before. Painted
 * again once the shipped faces land (a canvas never re-lays its text out).
 */
function paintBoard(hours: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(PAGE.w, PAGE.h);
  const texture = toTexture(canvas, 'facing');
  const paint = (): void => {
    const rng = mulberry32(4407);
    // The slate: green-black, the ghost of old chalk wiped across it.
    ctx.fillStyle = '#1f2b26';
    ctx.fillRect(0, 0, PAGE.w, PAGE.h);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(242,234,214,${0.025 + rng() * 0.03})`;
      ctx.beginPath();
      ctx.ellipse(rng() * PAGE.w, rng() * PAGE.h, 60 + rng() * 140, 14 + rng() * 30, rng() * 0.6 - 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    const line = (text: string, font: string, size: number, y: number, colour: string, tilt: number): void => {
      ctx.save();
      ctx.translate(PAGE.w / 2, y);
      ctx.rotate(tilt);
      ctx.font = `${font === SCRAWL ? '700 ' : ''}${size}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = colour;
      ctx.globalAlpha = 0.92;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    line('CONTINUE?', MARKER, 82, 128, CHALK, -0.035);
    // A chalk underline, drawn twice for its rough edge.
    ctx.strokeStyle = CHALK_PINK;
    ctx.lineCap = 'round';
    for (const dy of [0, 5]) {
      ctx.lineWidth = 6 - dy * 0.6;
      ctx.beginPath();
      ctx.moveTo(70, 158 + dy);
      ctx.quadraticCurveTo(PAGE.w / 2, 146 + dy, PAGE.w - 64, 162 + dy);
      ctx.stroke();
    }
    line('collector-grade copies', SCRAWL, 58, 252, CHALK, 0.02);
    line('complete in box', SCRAWL, 58, 322, CHALK, -0.025);
    line('some first prints!', SCRAWL, 50, 388, CHALK_PINK, 0.03);
    line(hours, MARKER, 52, 520, CHALK_YELLOW, -0.02);
    line('not Mondays', SCRAWL, 50, 580, CHALK_YELLOW, 0.025);
    // The doodles: a cartridge with a heart on its label, and an arrow round to the door.
    ctx.save();
    ctx.translate(112, 676);
    ctx.rotate(-0.12);
    ctx.strokeStyle = CHALK;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeRect(-40, -46, 80, 74);
    ctx.strokeRect(-26, -34, 52, 30);
    ctx.fillStyle = CHALK_PINK;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.bezierCurveTo(-12, -24, -16, -32, -6, -30);
    ctx.bezierCurveTo(-2, -29, 0, -26, 0, -24);
    ctx.bezierCurveTo(0, -26, 2, -29, 6, -30);
    ctx.bezierCurveTo(16, -32, 12, -24, 0, -12);
    ctx.fill();
    for (let x = -30; x <= 30; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 28);
      ctx.lineTo(x, 40);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = CHALK_YELLOW;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(220, 690);
    ctx.quadraticCurveTo(330, 735, 430, 660);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(398, 655);
    ctx.lineTo(434, 656);
    ctx.lineTo(424, 690);
    ctx.stroke();
    // The chalk's grain: specks of slate showing through every stroke, and dust settled along the bottom.
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.25 + rng() * 0.45})`;
      ctx.fillRect(rng() * PAGE.w, rng() * PAGE.h, 1 + rng() * 2.2, 1 + rng() * 1.4);
    }
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#1f2b26';
    ctx.fillRect(0, 0, PAGE.w, PAGE.h);
    ctx.globalCompositeOperation = 'source-over';
    const dust = ctx.createLinearGradient(0, PAGE.h - 60, 0, PAGE.h);
    dust.addColorStop(0, 'rgba(242,234,214,0)');
    dust.addColorStop(1, 'rgba(242,234,214,0.16)');
    ctx.fillStyle = dust;
    ctx.fillRect(0, PAGE.h - 60, PAGE.w, 60);
    texture.needsUpdate = true;
  };
  paint();
  repaintWhenFontLoads(`82px ${MARKER}`, paint);
  repaintWhenFontLoads(`700 58px ${SCRAWL}`, paint);
  return texture;
}
