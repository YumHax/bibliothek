import * as THREE from 'three';
import type { Furniture } from '../../Furniture';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint, METAL } from '../../materials/palette';
import { seededRandom } from '@/graphics/canvas';
import { PortableTv } from '../shopModels';
import { labelSheet, ticket, type Label } from './labels';

export interface RepairsShelfOptions {
  width?: number;
  /** Shelves over the floor, bottom first. Default 3. */
  shelves?: number;
  seed?: number;
}

const DEPTH = 0.4;
const SPACING = 0.46;
const BOTTOM = 0.12;
/** The WAITING FOR COLLECTION card's height over the top board (over what stands on it). */
const CARD_ABOVE = 0.4;
const BOARD = paint(0x4a4e52, 0.55);
const BLACK = paint(0x1e1e20, 0.5);
const SILVER = paint(0xb8bcc0, 0.35);
const WOOD = paint(0x6a4a30, 0.5);
const CASES: readonly number[] = [0x5a5a5e, 0xd8d2c4, 0x2a2a2c, 0x8a3a2a];
/** Whose, and what is wrong with it. */
const JOBS: readonly (readonly string[])[] = [
  ['KOWALSKI', 'no sound'], ['DR. ASHE', 'picture rolls'], ['M. PETIT', 'eats tapes'], ['BRENNAN', 'dead'], ['OKAFOR', 'crackles'],
  ['Mrs LIND', 'no colour'], ['FOX', 'READY'], ['TANAKA', 'hums'], ['SILVA', 'won’t eject'], ['GRAY', 'READY'],
];

type Kind = 'tv' | 'vcr' | 'deck' | 'radio';

/**
 * The shelf of repairs waiting to be collected (or to be looked at): a grey steel rack, each board holding what
 * people brought in (portable sets, a video recorder, a cassette deck, a wooden radio), every one with its brown
 * ticket tied on, the owner's name and the fault in biro (a few say READY), a card across the top saying so.
 * Floor-standing against a wall (`y: 0`): origin on the floor at the wall, +z into the room. Collides as its box.
 */
export class RepairsShelf extends Prop implements Furniture {
  private readonly box: THREE.Box3;

  constructor(options: RepairsShelfOptions = {}) {
    super();
    this.name = 'RepairsShelf';
    const W = options.width ?? 1.1;
    const shelves = options.shelves ?? 3;
    const random = seededRandom(options.seed ?? 13);
    const steel = METAL.satinSteel();
    const top = BOTTOM + (shelves - 1) * SPACING + 0.02;
    // The uprights run on past the top board to carry the card over what stands on it.
    const posts = top + CARD_ABOVE + 0.06;
    for (const x of [-W / 2 + 0.015, W / 2 - 0.015]) for (const z of [0.015, DEPTH - 0.015]) part(this, 0.03, posts, 0.03, steel, { x, y: posts / 2, z });
    const tickets: { at: THREE.Vector3; tilt: number }[] = [];
    for (let s = 0; s < shelves; s++) {
      const y = BOTTOM + s * SPACING;
      part(this, W - 0.04, 0.02, DEPTH - 0.02, BOARD, { y: y - 0.01, z: DEPTH / 2 });
      let x = -W / 2 + 0.05;
      for (let n = 0; n < 4; n++) {
        const kind: Kind = (['tv', 'vcr', 'tv', 'deck', 'radio', 'tv'] as const)[Math.floor(random() * 6)]!;
        const w = kind === 'tv' ? 0.26 + random() * 0.08 : kind === 'radio' ? 0.3 : 0.36;
        if (x + w > W / 2 - 0.04) break;
        const [up, front] = this.item(kind, w, new THREE.Vector3(x + w / 2, y, DEPTH / 2), random);
        tickets.push({ at: new THREE.Vector3(x + w * 0.2, y + up, DEPTH / 2 + front + 0.006), tilt: (random() - 0.5) * 0.4 });
        x += w + 0.03 + random() * 0.03;
      }
    }
    const labels: Label[] = tickets.map((_, i) => ({ width: 0.07, height: 0.042, paint: ticket(2201 + i * 3, JOBS[i % JOBS.length]!) }));
    labels.push({ width: Math.min(0.8, W * 0.8), height: 0.08, paint: header });
    const meshes = labelSheet(labels, 1500);
    tickets.forEach((t, i) => {
      const mesh = meshes[i]!;
      mesh.position.copy(t.at);
      mesh.rotation.z = t.tilt;
      this.add(mesh);
      // The string it hangs by.
      part(this, 0.002, 0.03, 0.002, paint(0xe8e0c8, 0.9), { x: t.at.x + 0.03, y: t.at.y + 0.03, z: t.at.z - 0.002 });
    });
    const card = meshes[meshes.length - 1]!;
    // The card on a batten between the front uprights.
    part(this, W - 0.03, 0.03, 0.012, steel, { y: top + CARD_ABOVE, z: DEPTH - 0.015 });
    part(this, Math.min(0.8, W * 0.8) + 0.01, 0.09, 0.004, paint(0xf0ece0, 0.9), { y: top + CARD_ABOVE, z: DEPTH - 0.007 });
    card.position.set(0, top + CARD_ABOVE, DEPTH - 0.005 + card.position.z);
    this.add(card);
    this.box = new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, posts, DEPTH));
  }

  override get footprint(): THREE.Box3 {
    return this.box;
  }

  /** One thing brought in for repair, standing at `at` (its middle, on the board); returns where its ticket hangs: how high, how far forward of `at`. */
  private item(kind: Kind, w: number, at: THREE.Vector3, random: () => number): [up: number, front: number] {
    if (kind === 'tv') {
      // Its aerial pushed down: the board over it is too close.
      const tv = new PortableTv({ width: w, case: CASES[Math.floor(random() * CASES.length)]!, aerial: false });
      tv.position.copy(at);
      this.add(tv);
      // Taped over the case's top left corner, clear of the knobs.
      return [w * 0.7, w * 0.45];
    }
    if (kind === 'vcr') {
      part(this, w, 0.09, 0.3, BLACK, { x: at.x, y: at.y + 0.045, z: at.z });
      part(this, w * 0.5, 0.015, 0.004, paint(0x0a0a0a, 0.3), { x: at.x - w * 0.15, y: at.y + 0.06, z: at.z + 0.151 });
      part(this, 0.06, 0.018, 0.004, paint(0x3a5a3a, 0.2), { x: at.x + w * 0.3, y: at.y + 0.055, z: at.z + 0.151 });
      return [0.07, 0.15];
    }
    if (kind === 'deck') {
      part(this, w, 0.11, 0.26, SILVER, { x: at.x, y: at.y + 0.055, z: at.z });
      part(this, w * 0.36, 0.07, 0.004, BLACK, { x: at.x - w * 0.2, y: at.y + 0.058, z: at.z + 0.131 });
      for (let i = 0; i < 4; i++) part(this, 0.02, 0.012, 0.01, BLACK, { x: at.x + w * 0.05 + i * 0.03, y: at.y + 0.03, z: at.z + 0.132 });
      return [0.09, 0.13];
    }
    // A wooden valve radio, its cloth grille and dial.
    part(this, w, 0.2, 0.16, WOOD, { x: at.x, y: at.y + 0.1, z: at.z - 0.05 });
    part(this, w * 0.55, 0.12, 0.004, paint(0xc8b48a, 1), { x: at.x - w * 0.12, y: at.y + 0.11, z: at.z + 0.031 });
    const knob = cylinderMesh(0.018, 0.015, BLACK, { x: at.x + w * 0.32, y: at.y + 0.07, z: at.z + 0.037 }, { segments: 12 });
    knob.rotation.x = Math.PI / 2;
    this.add(knob);
    return [0.17, 0.03];
  }
}

/** The card across the top. */
function header(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#f0ece0';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#b0302a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = Math.round(h * 0.6);
  const family = '"Segoe Print", "Bradley Hand", "Comic Sans MS", sans-serif';
  const text = 'WAITING FOR COLLECTION';
  ctx.font = `700 ${size}px ${family}`;
  while (ctx.measureText(text).width > w * 0.92 && size > 6) ctx.font = `700 ${--size}px ${family}`;
  ctx.fillText(text, w / 2, h / 2);
}
