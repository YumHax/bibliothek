import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { Prop, part } from './Prop';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface NoticeboardOptions {
  /** Outer size of the frame. Default 0.34 x 0.44. */
  width?: number;
  height?: number;
  /** Hand-written notes pinned up (short lines). Default a few reminders. */
  notes?: string[];
  seed?: number;
}

const FRAME = 0.02;
const PX_PER_M = 1400;
const NOTES = ['feed Miso!', 'market sat. 9am', 'beat SKY STACK', 'bin day: tue'];
const NOTE_COLOURS = ['#fff3a6', '#ffd1dc', '#c8f0d0', '#cfe3ff'];
const PINS = ['#c83a3a', '#2f6b8f', '#e6a83a', '#3a9a5a'];

/**
 * A cork pinboard in a pine frame: sticky notes, a strip of arcade tickets, a photo of the cat,
 * all painted on the cork with a pin each. Wall-hung: origin at the centre, on the wall, +z into
 * the room. Decoration: never collides.
 */
export class Noticeboard extends Prop {
  constructor(options: NoticeboardOptions = {}) {
    super();
    this.name = 'Noticeboard';
    const width = options.width ?? 0.34;
    const height = options.height ?? 0.44;
    const pine = woodMaterial(0xc9a473, 0.6);
    part(this, width, FRAME, 0.02, pine, { y: height / 2 - FRAME / 2, z: 0.01 });
    part(this, width, FRAME, 0.02, pine, { y: -height / 2 + FRAME / 2, z: 0.01 });
    for (const sx of [-1, 1]) part(this, FRAME, height - 2 * FRAME, 0.02, pine, { x: (sx * (width - FRAME)) / 2, z: 0.01 });
    const cork = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 2 * FRAME, height - 2 * FRAME),
      new THREE.MeshStandardMaterial({ map: paintBoard(width - 2 * FRAME, height - 2 * FRAME, options.notes ?? NOTES, seededRandom((options.seed ?? 5) * 2654435)), roughness: 0.95 }),
    );
    cork.position.z = 0.012;
    cork.receiveShadow = true;
    this.add(cork);
    this.traverse((o) => (o.castShadow = false));
  }
}

/** Cork speckle, then the pinned things, each a little askew. */
function paintBoard(wM: number, hM: number, notes: string[], random: () => number): THREE.Texture {
  const W = Math.round(wM * PX_PER_M);
  const H = Math.round(hM * PX_PER_M);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#b98a58';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < W * H * 0.02; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(90,55,25,0.35)' : 'rgba(230,190,140,0.3)';
    ctx.fillRect(random() * W, random() * H, 1 + random() * 2, 1 + random() * 2);
  }
  const pinned = (x: number, y: number, w: number, h: number, draw: () => void, pin: number): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((random() - 0.5) * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    ctx.translate(-w / 2, -h / 2);
    draw();
    ctx.fillStyle = PINS[pin % PINS.length]!;
    ctx.beginPath();
    ctx.arc(w / 2, 6, W * 0.022, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // A strip of arcade tickets hanging down the right side, perforations between them.
  const tw = W * 0.2;
  const th = H * 0.075;
  pinned(W * 0.8, H * 0.36, tw, th * 5, () => {
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#f08a3a' : '#f4a24e';
      ctx.fillRect(0, i * th, tw, th - 1);
      ctx.fillStyle = '#7a2e10';
      ctx.font = `bold ${Math.round(th * 0.4)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ADMIT ONE', tw / 2, i * th + th / 2);
    }
  }, 0);
  // A photo: a blue sky, a grey shape of a cat.
  const pw = W * 0.34;
  pinned(W * 0.3, H * 0.2, pw, pw * 0.8, () => {
    ctx.fillStyle = '#f6f3ea';
    ctx.fillRect(0, 0, pw, pw * 0.8);
    ctx.fillStyle = '#7fa8cc';
    ctx.fillRect(pw * 0.07, pw * 0.07, pw * 0.86, pw * 0.56);
    ctx.fillStyle = '#4a4a50';
    ctx.beginPath();
    ctx.ellipse(pw * 0.5, pw * 0.52, pw * 0.2, pw * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pw * 0.33, pw * 0.42, pw * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }, 1);
  // Sticky notes, two by two, overlapping as they do.
  const nw = W * 0.34;
  notes.slice(0, 4).forEach((text, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    pinned(W * (0.26 + col * 0.3), H * (0.5 + row * 0.24), nw, nw, () => {
      ctx.fillStyle = NOTE_COLOURS[i % NOTE_COLOURS.length]!;
      ctx.fillRect(0, 0, nw, nw);
      ctx.fillStyle = '#2a2a3a';
      ctx.font = `italic ${Math.round(nw * 0.16)}px "Comic Sans MS", "Marker Felt", ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const words = text.split(' ');
      const half = Math.ceil(words.length / 2);
      ctx.fillText(words.slice(0, half).join(' '), nw / 2, nw * 0.42);
      ctx.fillText(words.slice(half).join(' '), nw / 2, nw * 0.64);
    }, i + 2);
  });
  return toTexture(canvas, 4);
}
